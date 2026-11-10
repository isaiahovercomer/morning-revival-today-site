// 中英晨興聖言 TODAY 前端：hash 路由
//   #/ 首頁、#/today 今日、#/day/N 本週第 N 天、#/outline 本週完整綱要、#/settings 設定
// 所有來源文字一律用 textContent／createTextNode 放進 DOM，不用 innerHTML。
// 繁簡：代理輸出一律繁體；選「簡中」時，介面與內容的每段文字都經 t2s 轉簡（el() 統一處理）。
import { makeConv } from './zhconv.js';
import { maybeStartTour, replayTour, initTour, tourActive } from './tour.js';
import { isFresh, sameContent, getLocal, putLocal, pruneLocal } from './store.js';
import { rcvLink } from './rcv.js';
import { applyWordBreaks, LEXICON } from './wrap.js';
import { isIOS, isStandalone, installKind, installCopy } from './install.js';
import { icon } from './icons.js';

const $app = document.getElementById('app');
const $back = document.getElementById('back');
const API_BASE = (window.MRT_CONFIG && window.MRT_CONFIG.apiBase) || '';
export const BIBLE_URL = 'https://isaiahovercomer.github.io/interlinear-bible/';

// ---------- 設定（localStorage） ----------
const SKEY = { lang: 'mrt.lang', script: 'mrt.script', theme: 'mrt.theme' };
const LANGS = [['zh', '中文'], ['en', 'English'], ['both', '中英']];
const SCRIPTS = [['tw', '繁體'], ['cn', '简体']];
// 版面配色：html[data-theme]（js/boot.js 在首屏前先套用，免得閃色）；預設暖白，與原文對照聖經一樣不跟系統深色（舊存的 system 讀成暖白）
const THEMES = [['warm', '暖白', 'Warm'], ['light', '白天', 'Day'], ['eye', '護眼', 'Eye-care'], ['dark', '黑夜', 'Night']];
function readSetting(k, ok, dflt) {
  try { const v = localStorage.getItem(SKEY[k]) ?? (k === 'lang' ? localStorage.getItem('mrv.lang') : null); return ok.some(([x]) => x === v) ? v : dflt; } catch { return dflt; }
}
export const settings = { lang: readSetting('lang', LANGS, 'both'), script: readSetting('script', SCRIPTS, 'tw'), theme: readSetting('theme', THEMES, 'warm') };
function saveSetting(k, v) { settings[k] = v; try { localStorage.setItem(SKEY[k], v); } catch {} }

// ---------- 繁簡 ----------
let t2s = null;
async function ensureScript() {
  if (settings.script === 'cn' && !t2s) {
    const r = await fetch(new URL('./zh/t2s.json', import.meta.url));
    if (!r.ok) throw new Error(`zh/t2s.json: HTTP ${r.status}`);
    t2s = makeConv(await r.json());
  }
  document.documentElement.lang = settings.script === 'cn' ? 'zh-Hans' : 'zh-Hant';
}
/** 介面與內容的中文：簡中模式轉簡體；其他原樣 */
export const Z = (s) => (settings.script === 'cn' && t2s ? t2s(s) : String(s ?? ''));
/** 按鈕、標題只在詞與詞之間換行（js/wrap.js）；簡中模式詞庫也轉簡體 */
let lexCn = null;
export function wb(root) {
  const cn = settings.script === 'cn' && t2s;
  if (cn && !lexCn) lexCn = [...LEXICON, ...LEXICON.map(t2s)];
  applyWordBreaks(root, cn ? lexCn : LEXICON, cn ? 'zh-Hans' : 'zh-Hant');
}

export function el(tag, attrs = {}, ...kids) {
  const n = document.createElement(tag);
  const z = attrs.raw ? (s) => String(s ?? '') : Z; // raw：不轉（例「繁體／简体」選項各用自己的字形）
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false || k === 'raw') continue;
    if (k === 'class') n.className = v;
    else if (k === 'text') n.textContent = z(v);
    else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
    else n.setAttribute(k, v === true ? '' : ['title', 'aria-label', 'placeholder'].includes(k) ? Z(v) : v);
  }
  for (const k of kids.flat(Infinity)) if (k != null && k !== false && k !== '') n.append(k instanceof Node ? k : document.createTextNode(z(String(k))));
  return n;
}

// ---------- API ----------
// 只切換語言時（redraw）沿用上次同一網址的資料重畫，不重打網路、不閃「載入中」。
// 顯示過的回應存 IndexedDB（js/store.js）：再開時先用本地（同一天／同一週才算數）立刻畫出，背景向代理更新；內容有變才安靜重畫。
const memo = new Map();
let reuse = false, quiet = false, viewUrl = '';
const REVALIDATE_MS = 60_000; // 一分鐘內剛存的不再背景重抓（例：首頁預先抓好今日，馬上點進去）
const apiUrl = (route, d) => API_BASE ? `${API_BASE}?api=${route}${d ? `&d=${d}` : ''}` : `api/${route}${d ? `/${d}` : ''}`;
async function api(route, d) {
  const url = viewUrl = apiUrl(route, d);
  if (reuse && memo.has(url)) return memo.get(url);
  const hit = await getLocal(url);
  if (hit && isFresh(route, hit.data)) {
    memo.set(url, hit.data);
    $app.dataset.from = 'local';
    if (!(Date.now() - hit.savedAt < REVALIDATE_MS)) revalidate(route, url, hit.data);
    return hit.data;
  }
  $app.dataset.from = 'network';
  return remember(route, url, await apiFetch(url));
}
function remember(route, url, j) {
  memo.set(url, j);
  if (isFresh(route, j)) putLocal(url, j);
  return j;
}
const inflight = new Set();
async function revalidate(route, url, old) {
  if (inflight.has(url)) return;
  inflight.add(url);
  try {
    const j = remember(route, url, await apiFetch(url));
    // 還停在同一頁、內容真的變了才重畫（保留捲動位置與收合狀態）；教學進行中不動畫面，下次開啟就是新的
    if (viewUrl === url && !sameContent(j, old) && !tourActive()) { quiet = true; await redraw(); }
  } catch {} finally { inflight.delete(url); quiet = false; }
}
/** 首頁畫好後，閒置時先把今日抓好存起來，點「今日」就不用等 */
async function prefetch(route) {
  const url = apiUrl(route);
  const hit = await getLocal(url);
  if ((hit && isFresh(route, hit.data)) || inflight.has(url)) return;
  inflight.add(url);
  try { remember(route, url, await apiFetch(url)); } catch {} finally { inflight.delete(url); }
}
const idle = (fn) => (window.requestIdleCallback ? requestIdleCallback(fn, { timeout: 3000 }) : setTimeout(fn, 1200));
async function apiFetch(url) {
  let r;
  try { r = await fetch(url, { headers: { accept: 'application/json' } }); } catch (e) {
    throw new Error(API_BASE ? `連不上代理（Apps Script）。可能是網路中斷，或代理剛部署、擁有者尚未在 Apps Script 編輯器執行 setup 授權一次（${e.message}）` : `連不上資料來源（${e.message}）`);
  }
  const text = await r.text();
  let j = null;
  try { j = JSON.parse(text); } catch {}
  if (!j) {
    // Apps Script 尚未授權／停用時回 HTML（403 Access Denied 等）
    throw new Error(API_BASE ? `代理（Apps Script）沒有回應資料（HTTP ${r.status}）。若剛部署，需要擁有者在 Apps Script 編輯器執行 setup 授權一次。` : `HTTP ${r.status}`);
  }
  if (!r.ok || j.error) throw new Error(j.error ? `${j.error}${j.detail ? `：${j.detail}` : ''}` : `HTTP ${r.status}`);
  return j;
}

// 當週禱研背進度：中文／English／中英各自的說法（中文仍稱「禱背」，英文一律 pray-reading, reciting）
const WEEK_ZH = '當週禱研背進度', WEEK_EN = 'This week’s pray-reading, reciting progress';
// 首頁三張內容卡標題前加「台中」（t112u；英文 t113u 加冒號「Taichung: 」）；每日頁標頭與 daynav 仍用不加前綴的 WEEK_ZH／WEEK_EN
const HOME_ZH = '台中', HOME_EN = 'Taichung: ';
const homeTitle = (zh, en) => byLang(HOME_ZH + zh, HOME_EN + en);
/** 只在 English 介面換英文（設定頁各標題維持中文；中英並列太長） */
const enOr = (zh, en) => settings.lang === 'en' ? en : zh;
const byLang = (zh, en) => settings.lang === 'zh' ? zh : settings.lang === 'en' ? en : `${zh}　${en}`;

const md = (date) => { const [, m, d] = date.split('-'); return `${+m}/${+d}`; };
const weekZh = (n) => '〇一二三四五六七八九十'[n] ?? n;

function show(...nodes) {
  $app.replaceChildren(...nodes.flat(Infinity).filter(n => n != null && n !== '' && n !== false));
  wb($app);
  if (!quiet) window.scrollTo(0, 0);
  if (!$app.querySelector('.loading') && !performance.getEntriesByName('mrt-content').length) performance.mark('mrt-content'); // 首次內容出現時間（test:live 量測用）
}
// 骨架：先畫出版面輪廓（大按鈕＋卡片），內容到了再換上；index.html 裡有同樣的靜態骨架，JS 還沒跑完就看得到
function loading(msg) {
  if (reuse) return;
  const line = () => el('i', { class: 'skel-line' }); // 寬度用 CSS nth-child（CSP 不允許 style 屬性）
  show(el('div', { class: 'loading', role: 'status' },
    el('p', { class: 'skel-msg', text: msg }),
    API_BASE ? el('p', { class: 'loading-sub', text: '第一次讀取本週資料時，代理要即時抓取來源，約需 10～30 秒；之後再開會先顯示本機存好的內容。' }) : '',
    el('div', { class: 'skel-btn', 'aria-hidden': 'true' }),
    [4, 3].map(n => el('div', { class: 'skel-card', 'aria-hidden': 'true' }, Array.from({ length: n }, line)))));
}
function fail(e) {
  show(el('p', { class: 'error', role: 'alert', 'data-testid': 'error', text: `取不到資料：${e.message}` }),
    el('p', { class: 'center' }, el('button', { type: 'button', class: 'btn press', onclick: () => route() }, '重新載入')));
}

// ---------- 版面：上方標題、頁尾、底部選單 ----------
const FOOT = '晨興聖言屬出版內容：本站不存放全文，於瀏覽時經代理即時取得，僅供個人追求。'; // 與 index.html 靜態頁尾同字
function chrome(view) {
  document.getElementById('topbar-title').textContent = Z('中英晨興聖言 TODAY');
  $back.textContent = Z('‹ 首頁');
  $back.hidden = view === 'home';
  document.getElementById('foot').replaceChildren(el('p', { text: FOOT }));
  // 圖示是自繪 inline SVG（js/icons.js，aria-hidden）；可見文字標籤照舊
  const tab = (key, href, label) => el('a', { href, class: `tab press${view === key ? ' on' : ''}`, 'data-tab': key, ...(view === key ? { 'aria-current': 'page' } : {}) },
    icon(key, 'tab-ic'), el('span', { class: 'tab-t', text: label }));
  document.getElementById('tabbar').replaceChildren(
    tab('home', '#/', '首頁'),
    tab('today', '#/today', '今日'),
    tab('outline', '#/outline', '本週綱要'),
    tab('settings', '#/settings', '設定'),
    // 書形圖示右上已有外連箭頭，標籤不再加 ↗
    el('a', { href: BIBLE_URL, target: '_blank', rel: 'noopener noreferrer', class: 'tab tab-ext press', 'data-tab': 'bible', 'data-testid': 'bible-link', 'aria-label': '原文聖經（另開新分頁）' },
      icon('bible', 'tab-ic'), el('span', { class: 'tab-t', text: '原文聖經' })));
  wb(document.querySelector('.topbar')); wb(document.getElementById('tabbar'));
}

// ---------- 首頁 ----------
async function home() {
  chrome('home');
  document.title = Z('中英晨興聖言 TODAY');
  loading('載入本週進度…');
  const { week, today, days, psrp, segments } = await api('week');
  const todayDay = days.find(d => d.day === today.day);
  const wk = `第${weekZh(week.weekNo)}週`;
  const head = el('header', { class: 'home-head' },
    el('h1', { text: '中英晨興聖言' }),
    el('p', { text: `${today.date.replace(/-/g, '/')}　${today.weekday}　·　${week.training}` }));

  const btn = el('a', { class: 'today-btn press', href: '#/today', id: 'today-btn', 'data-testid': 'today-btn' },
    el('span', { class: 'tb-kicker', text: 'TODAY' }),
    el('span', { class: 'tb-main', text: '今日晨興聖言' }),
    el('span', { class: 'tb-sub', text: `${wk}・${today.sunday ? '主日：本週完整綱要' : todayDay?.weekday || ''}　${week.message?.title || ''}` }),
    el('span', { class: 'tb-go', 'aria-hidden': 'true', text: '›' }));

  const list = el('ul', { class: 'daylist', id: 'daylist' }, days.map(d => el('li', {},
    el('a', { href: `#/day/${d.day}`, class: `press${!today.sunday && d.day === today.day ? ' is-today' : ''}`, 'data-day': d.day },
      el('span', { class: 'd-name' }, d.weekday, !today.sunday && d.day === today.day ? el('span', { class: 'd-today', text: '今天' }) : ''),
      el('span', { class: 'd-date', text: md(d.date) }),
      el('span', { class: 'd-ref', text: [d.outlineRef, d.verseRef].filter(Boolean).join('｜') || '—' }),
      el('span', { class: 'd-go', 'aria-hidden': 'true', text: '›' })))),
  el('li', {}, el('a', { href: '#/outline', class: `press outline-link${today.sunday ? ' is-today' : ''}`, 'data-testid': 'outline-link' },
    el('span', { class: 'd-name' }, '主日', today.sunday ? el('span', { class: 'd-today', text: '今天' }) : ''),
    el('span', { class: 'd-date', text: md(week.weekEnd) }),
    el('span', { class: 'd-ref', text: '本週完整綱要（中英）' }),
    el('span', { class: 'd-go', 'aria-hidden': 'true', text: '›' }))));

  const card = collapsible(el('section', { class: 'hcard week-card', id: 'week-card', 'data-testid': 'week', 'aria-labelledby': 'wk-h' }), 'week',
    el('div', { class: 'blk-title' },
      el('span', { class: 'hc-label', text: homeTitle(WEEK_ZH, WEEK_EN) }),
      el('h2', { id: 'wk-h', text: week.message?.title || wk })),
    el('div', { class: 'blk-body', id: 'week-body' },
      el('p', { class: 'wk-meta', text: `${week.range}　${week.training}${week.englishTitle ? `　·　${week.englishTitle}` : ''}` }),
      list));

  // 頁面最下面不放「來源」「對應訓練」兩行（t106u）；來源失敗時各卡片自己標「暫缺（原因）」，暫用快取在上方提示
  const notes = week.stale ? [el('p', { class: 'notice', text: `來源暫時取不到，顯示先前快取（${week.stale}）。` })] : [];
  // 今日大按鈕是主要動作（不是內容卡），不做收合；其餘首頁卡片都可收合、預設展開
  show(head, ...notes, btn, card, segCard(segments, week, today), psrpCard(psrp, week), installCard());
  idle(() => prefetch('today'));
}

// 本週分段・段落要點：每週PSRP 表格 D1～D6 左側「分段」「段落要點」兩欄＋中欄（啟示／應用／結果）。
// 手機一張卡：每段一列＝日子｜中欄小標｜段落要點（粗體）｜分段（內文）；三欄全空的天併入上一段（例「週一～週二」）。
const SEG_ZH = '本週分段・段落要點', SEG_EN = 'This week’s segments & key points';
const DAY_EN = ['', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MID_EN = { 啟示: 'Revelation', 應用: 'Application', 結果: 'Result', 目標: 'Goal', 經歷: 'Experience', 原則: 'Principle', 背景: 'Background', 引言: 'Introduction' };
function segGroups(items) {
  const out = [];
  for (const it of items || []) {
    const prev = out[out.length - 1];
    if (prev && !it.seg && !it.point && !it.mid) prev.to = it.day;
    else out.push({ ...it, from: it.day, to: it.day });
  }
  return out;
}
function segCard(segments, week, today) {
  const groups = segGroups(segments?.items);
  const dayName = (d) => settings.lang === 'en' ? DAY_EN[d] : `週${'一二三四五六'[d - 1]}`;
  const span = (g) => g.from === g.to ? dayName(g.from) : `${dayName(g.from)}～${settings.lang === 'en' ? DAY_EN[g.to] : '一二三四五六'[g.to - 1]}`;
  const midText = (m) => m.split('／').map(x => settings.lang === 'en' ? MID_EN[x] || x : settings.lang === 'both' && MID_EN[x] ? `${x} ${MID_EN[x]}` : x).join('／');
  const isToday = (g) => !today.sunday && today.day >= g.from && today.day <= g.to;
  const body = el('div', { class: 'blk-body', id: 'seg-body' },
    groups.length
      ? el('ol', { class: 'seg-list', 'data-testid': 'seg-list' }, groups.map(g => el('li', { class: `seg-i${isToday(g) ? ' is-today' : ''}`, 'data-from': g.from, 'data-to': g.to },
        el('div', { class: 'seg-meta' },
          el('span', { class: 'seg-day', text: span(g) }),
          el('span', { class: 'seg-d', text: g.from === g.to ? `D${g.from}` : `D${g.from}–D${g.to}` }),
          isToday(g) ? el('span', { class: 'd-today', text: settings.lang === 'en' ? 'Today' : '今天' }) : '',
          g.mid ? el('span', { class: 'seg-mid', 'data-testid': 'seg-mid', text: midText(g.mid) }) : ''),
        g.point ? el('strong', { class: 'seg-point', lang: 'zh-Hant', text: g.point }) : '',
        g.seg ? el('p', { class: 'seg-text', lang: 'zh-Hant', text: g.seg }) : '')))
      : missing(`分段・段落要點暫缺${week.sources.sheet?.ok ? '（試算表分頁的 D1～D6 左側還沒有填）' : srcErr(week, 'sheet')}`));
  return collapsible(el('section', { class: 'hcard blk seg-card', id: 'seg-card', 'data-testid': 'seg', 'aria-labelledby': 'seg-h' }),
    'seg', el('h2', { id: 'seg-h', text: homeTitle(SEG_ZH, SEG_EN) }), body);
}

// 禱研背講要點：每週PSRP 表格 D1～D6 下面的文字，代理分成指引／綱目／經文三類（tools/lib.mjs classifyPsrp）
const PSRP_ZH = '禱研背講要點', PSRP_EN = 'Pray-reading, reciting & speaking points';
const PSRP_TYPES = [['guide', '指引', 'Guide'], ['outline', '綱目', 'Outline'], ['verse', '經文', 'Verse']];
function psrpCard(psrp, week) {
  const label = Object.fromEntries(PSRP_TYPES.map(([k, zh, en]) => [k, byLang(zh, en)]));
  const tag = Object.fromEntries(PSRP_TYPES.map(([k, zh, en]) => [k, settings.lang === 'en' ? en : zh])); // 每行小標：中英並列時只標中文，免得太長
  const body = el('div', { class: 'blk-body', id: 'psrp-body' },
    el('ul', { class: 'psrp-legend', 'data-testid': 'psrp-legend', 'aria-label': byLang('顏色說明', 'Colour key') },
      PSRP_TYPES.map(([k]) => el('li', { class: `psrp-${k}` }, el('i', { 'aria-hidden': 'true' }), label[k]))),
    psrp?.items?.length
      ? el('ul', { class: 'psrp-list', lang: 'zh-Hant' }, psrp.items.map(it => el('li', { class: `psrp-i psrp-${it.type}`, 'data-type': it.type },
        el('span', { class: 'psrp-tag', text: tag[it.type] }), it.text)))
      : missing(`禱研背講要點暫缺${week.sources.sheet?.ok ? '（試算表分頁的表格下面還沒有文字）' : srcErr(week, 'sheet')}`));
  return collapsible(el('section', { class: 'hcard blk psrp', id: 'psrp-card', 'data-testid': 'psrp', 'aria-labelledby': 'psrp-h' }),
    'psrp', el('h2', { id: 'psrp-h', text: homeTitle(PSRP_ZH, PSRP_EN) }), body);
}

// ---------- 加到主畫面（t117u；文案與偵測在 js/install.js） ----------
// 首頁最下面一張卡（可收合、預設展開；已以 App 開啟時整張不顯示）＋設定頁同一份內容（不再包一層卡）。
// Android／Chromium：攔 beforeinstallprompt → 顯示「安裝到主畫面」按鈕；還沒有事件時顯示瀏覽器選單步驟，不留白。
// iPhone／iPad：永遠顯示 Safari「分享 › 加入主畫面」步驟（iOS 沒有 beforeinstallprompt）。
let installEvt = null, installedNow = false;
const installNow = () => installKind({
  standalone: isStandalone(window), installed: installedNow,
  ios: isIOS({ userAgent: navigator.userAgent, platform: navigator.platform, maxTouchPoints: navigator.maxTouchPoints }), prompt: !!installEvt,
});
const installText = (kind) => installCopy(kind, settings, settings.script === 'cn' && t2s ? t2s : undefined);
function refreshInstall() {
  for (const n of document.querySelectorAll('[data-install-body]')) { const m = installBody(); n.replaceWith(m); wb(m); }
}
addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); installEvt = e; refreshInstall(); });
addEventListener('appinstalled', () => { installEvt = null; installedNow = true; refreshInstall(); });
async function promptInstall() {
  const e = installEvt;
  if (!e) return;
  installEvt = null; // 一個事件只能 prompt 一次；沒裝就回到選單步驟
  e.prompt();
  const choice = await e.userChoice.catch(() => null);
  if (choice?.outcome === 'accepted') installedNow = true;
  refreshInstall();
}
function installBody() {
  const kind = installNow(), c = installText(kind);
  const p = (cls, text) => el('p', { class: cls, raw: true, text });
  return el('div', { class: 'install-box', 'data-install-body': '', 'data-kind': kind, 'data-testid': 'install-box' },
    c.note ? p('install-note', c.note) : '',
    c.lead ? p('install-lead', c.lead) : '',
    c.button ? el('button', { type: 'button', class: 'btn press', 'data-install': '', 'data-testid': 'install-btn', raw: true, onclick: promptInstall }, c.button) : '',
    c.hint ? p('set-hint', c.hint) : '',
    c.stepsLead ? p('install-steps-lead', c.stepsLead) : '',
    c.steps.length ? el('ol', { class: 'install-steps', 'data-testid': 'install-steps' }, c.steps.map(t => el('li', { raw: true }, t))) : '');
}
function installCard() {
  if (installNow() === 'installed') return '';
  const t = installText('menu').title;
  return collapsible(el('section', { class: 'hcard install', id: 'install-card', 'data-testid': 'install' }), 'install',
    el('h2', { id: 'install-h', raw: true, text: byLang(t, 'Add to Home Screen') }), el('div', { class: 'blk-body', id: 'install-body' }, installBody()));
}

// ---------- 可收合的內容區塊（預設展開） ----------
let cardSeq = 0;
function block(key, titleZh, titleEn, zhNodes, enNodes, extra = {}) {
  const id = `blk-${key}-${++cardSeq}`;
  const title = settings.lang === 'zh' ? titleZh : settings.lang === 'en' ? titleEn : `${titleZh}　${titleEn}`;
  const body = el('div', { class: 'blk-body', id });
  if (settings.lang !== 'en') body.append(el('div', { class: 'part part-zh', lang: 'zh-Hant', 'data-part': 'zh' }, zhNodes));
  if (settings.lang !== 'zh') body.append(el('div', { class: 'part part-en', lang: 'en', 'data-part': 'en' }, settings.lang === 'both' ? el('span', { class: 'part-tag', text: 'ENGLISH' }) : '', enNodes));
  return collapsible(el('section', { class: `hcard blk blk-${key}`, 'data-block': key, 'data-testid': `blk-${key}`, ...extra }), key, el('h2', { text: title }), body);
}
/**
 * 卡片加上「收合／展開」按鈕（預設展開）。只切換語言的重畫（redraw）沿用收合狀態；換頁或重新載入一律回到展開。
 * 按鈕字：中文「收合／展開」，English「Collapse／Expand」，中英只用中文（標題已並列）。
 */
const openState = new Map();
function collapsible(sec, key, h2, body) {
  const btn = el('button', { type: 'button', class: 'blk-toggle press', 'aria-expanded': String(openState.get(key) ?? true), 'aria-controls': body.id, 'data-testid': `toggle-${key}` });
  const paint = () => {
    const open = btn.getAttribute('aria-expanded') === 'true';
    btn.textContent = settings.lang === 'en' ? (open ? 'Collapse' : 'Expand') : Z(open ? '收合' : '展開');
    body.hidden = !open; sec.classList.toggle('closed', !open); openState.set(key, open);
    wb(btn);
  };
  btn.addEventListener('click', () => { btn.setAttribute('aria-expanded', String(btn.getAttribute('aria-expanded') !== 'true')); paint(); });
  sec.append(el('header', { class: 'blk-head' }, h2, btn), body);
  paint();
  return sec;
}
const missing = (msg) => el('p', { class: 'missing', text: msg });

function zhItems(items, outline) {
  return items.map(it => it.type === 'verses'
    ? el('details', {}, el('summary', { text: `${it.text || '經文'}（${it.items.length}）` }), it.items.map(t => el('p', { text: t })))
    : el('p', { class: it.type === 'h' ? 'h' : outline ? 'ol' : '', text: it.text }));
}
const REF_RE = /^(?:[1-3] )?[A-Z][a-z]+\.? \d+:\d/;
const enParas = (paras) => paras.map(p => el('p', { class: REF_RE.test(p) ? 'ref' : /^Further Reading/.test(p) ? 'ol' : '', text: p }));
const enOutlineLines = (lines) => lines.map(t => el('p', { class: /^[IVXL]+\. /.test(t) ? 'h' : 'ol', text: t }));
const srcErr = (week, k) => week.sources[k]?.error ? `（${week.sources[k].error}）` : '';

// 英文經文：LSM 禁止下載／快取 Recovery Version 電子版（_research/RCV_TOS.md），只放外連，不抓不存
function rcvAnchor(ref) {
  const r = rcvLink(ref);
  return r ? el('p', { class: 'rcv' }, el('a', { href: r.url, target: '_blank', rel: 'noopener noreferrer', 'data-testid': 'rcv-link', lang: 'en', 'aria-label': `Open ${r.book} ${r.chapter} in the Recovery Version (opens in a new tab)` }, `Open ${r.book} ${r.chapter} in the Recovery Version`, icon('ext', 'ext-ic'))) : '';
}
// 禱背經文英文（t110u）：代理依出處從附經文英文綱目逐節取，對不齊用當天 Morning Nourishment；都沒有才放 RcV 外連。
// 內容下方不放來源／說明灰色小字（t111u）
function enVerses(p) {
  const v = p?.verseEn;
  if (!v?.verses?.length) return [missing(p?.verseRef ? '暫缺：附經文英文綱目與當天 Morning Nourishment 都對不到這處經文。' : '暫缺'), rcvAnchor(p?.verseRef)];
  return v.verses.map(x => el('strong', { class: 'p-text pray-verse pray-verse-en', 'data-testid': 'pray-verse-en', 'data-ref': x.ref },
    v.verses.length > 1 ? el('span', { class: 'p-vno', text: `${x.ref.replace(/^.*:/, '')} ` }) : '', x.text));
}
function prayerBlock(p, week) {
  let zh;
  if (!p || (!p.outline && !p.verse)) zh = missing(`禱背暫缺${srcErr(week, 'sheet')}`);
  else zh = [
    p.outline ? [el('span', { class: 'p-ref', text: `禱背綱要　${p.outlineRef}` }), el('strong', { class: 'p-text pray-outline', text: p.outline })] : '',
    p.verse ? [el('span', { class: 'p-ref', text: `禱背經文　${p.verseRef}` }), el('strong', { class: 'p-text pray-verse', text: p.verse })] : ''];
  const en = [
    el('span', { class: 'p-ref', text: 'Pray-reading, reciting outline' }),
    p?.en ? el('strong', { class: 'p-text pray-outline-en', text: p.en.text })
      : missing(p ? '暫缺：英文綱目對不上這個出處，或英文綱目取不到。' : '暫缺'),
    el('span', { class: 'p-ref', text: `Pray-reading, reciting verses${p?.verseEn ? `　${p.verseEn.ref}` : ''}` }),
    enVerses(p)];
  return block('pray', '禱背', 'Pray-reading, reciting', zh, en, { 'aria-label': '今日禱背' });
}

// ---------- 每日頁 ----------
async function day(which) {
  chrome(which === 'today' ? 'today' : 'day');
  loading('載入晨興聖言…');
  const j = await api(which === 'today' ? 'today' : 'day', which === 'today' ? 0 : which);
  if (j.today?.sunday && which === 'today') return outlineView(j, true);
  const { week, day: d } = j;
  document.title = Z(`${d.weekday} ${md(d.date)}｜中英晨興聖言 TODAY`);
  const head = el('header', { class: 'day-head' },
    el('span', { class: 'hc-label', text: which === 'today' ? '今日晨興聖言' : byLang(WEEK_ZH, WEEK_EN) }),
    el('h1', { 'data-testid': 'day-title', text: `第${weekZh(week.weekNo)}週・${d.weekday}　${md(d.date)}` }),
    settings.lang !== 'en' ? el('p', { class: 'msg-zh', text: week.message?.title || week.sheetTitle || '' }) : '',
    settings.lang !== 'zh' && week.englishTitle ? el('p', { class: 'msg-en', lang: 'en', text: `Week ${week.weekNo}: ${week.englishTitle}` }) : '');
  const notes = [];
  if (week.stale) notes.push(el('p', { class: 'notice', text: `來源暫時取不到，顯示先前快取（${week.stale}）。` }));

  const zsec = (k) => d.zh?.sections.find(s => s.key === k);
  const esec = (title) => d.en?.sections.find(s => s.title === title);
  const zhOrMissing = (k, label) => zsec(k) ? zhItems(zsec(k).items, k === 'outline') : missing(`${label}暫缺${d.zh ? '' : srcErr(week, 'notion')}`);
  const enOrMissing = (s) => s ? enParas(s.paras) : missing(`暫缺${d.en ? '（本日英文沒有這一段）' : srcErr(week, 'english')}`);

  const blocks = [
    prayerBlock(d.prayer, week),
    block('outline', '綱目', 'Outline', zhOrMissing('outline', '綱目'),
      d.enOutline?.length ? enOutlineLines(d.enOutline) : missing(`暫缺${week.sources.outlineEn?.ok ? '：英文綱目對不上今天的中文綱目' : srcErr(week, 'outlineEn')}`)),
    block('feed', '晨興餵養', 'Morning Nourishment', zhOrMissing('feed', '晨興餵養'), enOrMissing(esec('Morning Nourishment'))),
    block('reading', '信息選讀', "Today's Reading", zhOrMissing('reading', '信息選讀'), enOrMissing(esec("Today's Reading"))),
  ];
  const prev = d.day > 1 ? `#/day/${d.day - 1}` : '#/';
  const next = d.day < 6 ? `#/day/${d.day + 1}` : '#/outline';
  const nav = el('nav', { class: 'daynav', 'aria-label': '本週其他天' },
    el('a', { href: prev, class: 'press', 'aria-disabled': String(d.day <= 1) }, '‹ 前一天'),
    el('a', { href: '#/', class: 'press' }, WEEK_ZH),
    el('a', { href: next, class: 'press' }, d.day < 6 ? '後一天 ›' : '主日綱要 ›'));
  show(head, ...notes, langSeg(), blocks, nav);
}

/** 語言切換（中文／English／中英），存成設定後重畫 */
function langSeg() {
  return el('div', { class: 'seg', role: 'group', 'aria-label': '顯示語言', id: 'lang-seg' },
    LANGS.map(([v, label]) => el('button', { type: 'button', 'data-v': v, 'aria-pressed': String(settings.lang === v), onclick: () => { saveSetting('lang', v); redraw(); } }, label)));
}

// ---------- 主日／本週完整綱要 ----------
async function outline() {
  chrome('outline');
  loading('載入本週完整綱要…');
  outlineView(await api('outline'), false);
}
function outlineView(j, sundayToday) {
  const { week, outline: ol } = j;
  document.title = Z(`本週完整綱要｜中英晨興聖言 TODAY`);
  const head = el('header', { class: 'day-head' },
    el('span', { class: 'hc-label', text: sundayToday ? '今日晨興聖言・主日' : '本週完整綱要' }),
    el('h1', { 'data-testid': 'day-title', text: `第${weekZh(week.weekNo)}週・${sundayToday ? '主日　' + md(j.today.date) : '完整綱要'}` }),
    settings.lang !== 'en' ? el('p', { class: 'msg-zh', text: week.message?.title || '' }) : '',
    settings.lang !== 'zh' && week.englishTitle ? el('p', { class: 'msg-en', lang: 'en', text: `Week ${week.weekNo}: ${week.englishTitle}` }) : '');
  const notes = sundayToday ? [el('p', { class: 'notice', 'data-testid': 'sunday-note', text: '今天是主日：顯示本週完整綱要（週一～週六每天的晨興聖言可從下方或首頁點進去）；明天（週一）起進入下一週。' })] : [];
  const zh = ol?.zh ? zhItems(ol.zh.items, true) : missing(`中文綱目暫缺${srcErr(week, 'notion')}`);
  const en = ol?.en ? [ol.en.scripture ? el('p', { class: 'ref', text: `Scripture Reading: ${ol.en.scripture}` }) : '', enOutlineLines(ol.en.items.map(x => x.text))]
    : missing(`暫缺${srcErr(week, 'outlineEn')}`);
  const blocks = [block('full-outline', '本週完整綱要', 'Full Outline', zh, en)];
  if (j.prayers) {
    blocks.push(block('week-pray', '本週禱背', 'Pray-reading, reciting (this week)',
      j.prayers.map(x => el('div', { class: 'wp' }, el('a', { href: `#/day/${x.day}`, class: 'wp-day', text: `${x.weekday} ${md(x.date)}` }),
        x.prayer ? [el('span', { class: 'p-ref', text: `${x.prayer.outlineRef}｜${x.prayer.verseRef}` }), el('strong', { class: 'p-text', text: x.prayer.verse || x.prayer.outline })] : missing('暫缺'))),
      j.prayers.map(x => el('div', { class: 'wp', lang: 'en' }, el('a', { href: `#/day/${x.day}`, class: 'wp-day', text: `${DAY_EN[x.day]} ${md(x.date)}` }),
        x.prayer?.verseEn ? [el('span', { class: 'p-ref', text: x.prayer.verseEn.ref }), x.prayer.verseEn.verses.map(v => el('strong', { class: 'p-text pray-verse-en', text: v.text }))]
          : [missing('暫缺'), rcvAnchor(x.prayer?.verseRef)]))));
  }
  const nav = el('nav', { class: 'daynav', 'aria-label': '本週每一天' }, [1, 2, 3, 4, 5, 6].map(n => el('a', { href: `#/day/${n}`, class: 'press' }, '一二三四五六'[n - 1])));
  show(head, ...notes, langSeg(), blocks, nav);
}

// ---------- 設定 ----------
function settingsView() {
  chrome('settings');
  document.title = Z('設定｜中英晨興聖言 TODAY');
  const seg = (key, opts, label, cls) => el('div', { class: `seg ${cls}`, role: 'group', 'aria-label': label },
    opts.map(([v, t, en]) => el('button', { type: 'button', raw: key === 'script', 'data-v': v, 'aria-pressed': String(settings[key] === v), onclick: async () => { saveSetting(key, v); applyTheme(); await ensureScript(); route(); } },
      key === 'theme' ? [el('i', { class: 'sw', 'aria-hidden': 'true' }), settings.lang === 'en' ? en : t] : t)));
  show(
    el('header', { class: 'day-head' }, el('h1', { text: '設定' })),
    el('section', { class: 'hcard set-card' },
      el('h2', { text: '顯示語言' }), el('p', { class: 'set-hint', text: '中文、English 或中英對照；各區塊（綱目、晨興餵養、信息選讀、禱背）中英一一對應，來源沒有英文的會標明。' }),
      seg('lang', LANGS, '顯示語言', 'lang-set'),
      el('h2', { text: '繁體／簡體' }), el('p', { class: 'set-hint', text: '選簡體時，整個介面與內容都用簡體字顯示。' }),
      seg('script', SCRIPTS, '繁體或簡體', 'zh-set'),
      el('h2', { text: enOr('版面配色', 'Colour theme') }),
      el('p', { class: 'set-hint', text: enOr('預設暖白（與原文對照聖經相同，不隨手機深色模式變黑）；也可改白天、護眼（淡綠）或黑夜。',
        'Warm by default (same as the Interlinear Bible; it does not turn dark with your phone). Or pick Day, Eye-care (soft green) or Night.') }),
      seg('theme', THEMES, enOr('版面配色', 'Colour theme'), 'theme-set'),
      el('h2', { text: '使用教學' }),
      el('button', { type: 'button', class: 'btn press', id: 'tour-replay', onclick: () => { location.hash = '#/'; setTimeout(() => replayTour(), 50); } }, '重新觀看使用教學'),
      el('h2', { id: 'install-set', raw: true, text: installText('menu').title }), installBody(),
      el('h2', { text: '其他' }),
      el('p', {}, el('a', { href: BIBLE_URL, target: '_blank', rel: 'noopener noreferrer', 'aria-label': '原文對照聖經（另開新分頁）' }, '原文對照聖經', icon('ext', 'ext-ic')))));
}

function applyTheme() { document.documentElement.dataset.theme = settings.theme; }

// ---------- 路由 ----------
let current = '';
/** 同一頁只換顯示方式：用記住的資料重畫 */
function redraw() { reuse = true; return route(); }
export async function route() {
  const h = location.hash || '#/';
  current = h;
  if (!reuse) openState.clear();
  try {
    await ensureScript();
    const m = /^#\/day\/([1-6])$/.exec(h);
    if (h === '#/today') await day('today');
    else if (m) await day(+m[1]);
    else if (h === '#/outline') await outline();
    else if (h === '#/settings') settingsView();
    else { await home(); if (current === h) maybeStartTour(); }
  } catch (e) { fail(e); if (h === '#/' || h === '') maybeStartTour(); }
  finally { reuse = false; }
}
applyTheme();
initTour({ Z, el, wb });
idle(() => pruneLocal());
addEventListener('hashchange', route);
route();

if ('serviceWorker' in navigator && !/[?&]nosw\b/.test(location.search)) {
  addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}
