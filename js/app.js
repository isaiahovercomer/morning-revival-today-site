// 中英晨興聖言 TODAY 前端：hash 路由
//   #/ 首頁、#/today 今日、#/day/N 本週第 N 天、#/outline 本週完整綱要、#/settings 設定
// 所有來源文字一律用 textContent／createTextNode 放進 DOM，不用 innerHTML。
// 繁簡：代理輸出一律繁體；選「簡中」時，介面與內容的每段文字都經 t2s 轉簡（el() 統一處理）。
import { makeConv } from './zhconv.js';
import { maybeStartTour, replayTour, initTour } from './tour.js';

const $app = document.getElementById('app');
const $back = document.getElementById('back');
const API_BASE = (window.MRT_CONFIG && window.MRT_CONFIG.apiBase) || '';
export const BIBLE_URL = 'https://isaiahovercomer.github.io/interlinear-bible/';

// ---------- 設定（localStorage） ----------
const SKEY = { lang: 'mrt.lang', script: 'mrt.script' };
const LANGS = [['zh', '中文'], ['en', 'English'], ['both', '中英']];
const SCRIPTS = [['tw', '繁體'], ['cn', '简体']];
function readSetting(k, ok, dflt) {
  try { const v = localStorage.getItem(SKEY[k]) ?? (k === 'lang' ? localStorage.getItem('mrv.lang') : null); return ok.some(([x]) => x === v) ? v : dflt; } catch { return dflt; }
}
export const settings = { lang: readSetting('lang', LANGS, 'both'), script: readSetting('script', SCRIPTS, 'tw') };
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
const memo = new Map();
let reuse = false;
async function api(route, d) {
  const url = API_BASE ? `${API_BASE}?api=${route}${d ? `&d=${d}` : ''}` : `api/${route}${d ? `/${d}` : ''}`;
  if (reuse && memo.has(url)) return memo.get(url);
  const j = await apiFetch(url);
  memo.set(url, j);
  return j;
}
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
const byLang = (zh, en) => settings.lang === 'zh' ? zh : settings.lang === 'en' ? en : `${zh}　${en}`;

const md = (date) => { const [, m, d] = date.split('-'); return `${+m}/${+d}`; };
const weekZh = (n) => '〇一二三四五六七八九十'[n] ?? n;

function show(...nodes) { $app.replaceChildren(...nodes.flat(Infinity).filter(n => n != null && n !== '' && n !== false)); window.scrollTo(0, 0); }
function loading(msg) { if (reuse) return; show(el('p', { class: 'loading', text: msg }), API_BASE ? el('p', { class: 'loading-sub', text: '第一次讀取本週資料時，代理要即時抓取來源，約需 10～30 秒。' }) : ''); }
function fail(e) {
  show(el('p', { class: 'error', role: 'alert', 'data-testid': 'error', text: `取不到資料：${e.message}` }),
    el('p', { class: 'center' }, el('button', { type: 'button', class: 'btn press', onclick: () => route() }, '重新載入')));
}

// ---------- 版面：上方標題、頁尾、底部選單 ----------
function chrome(view) {
  document.getElementById('topbar-title').textContent = Z('中英晨興聖言 TODAY');
  $back.textContent = Z('‹ 首頁');
  $back.hidden = view === 'home';
  document.getElementById('foot').replaceChildren(
    el('p', {}, '進度：', el('a', { href: 'https://www.churchintaipei.org/pursuit', rel: 'noopener noreferrer', target: '_blank' }, '臺北市召會共同追求進度'), ' · 內容：',
      el('a', { href: 'https://mygoodland.notion.site/', rel: 'noopener noreferrer', target: '_blank' }, '一年七次（Notion）'), ' · 禱背：每週PSRP表格'),
    el('p', { text: '晨興聖言屬出版內容：本站不存放全文，於瀏覽時經代理即時取得，僅供個人追求。' }));
  const tab = (key, href, icon, label) => el('a', { href, class: `tab press${view === key ? ' on' : ''}`, 'data-tab': key, ...(view === key ? { 'aria-current': 'page' } : {}) },
    el('span', { class: 'tab-ic', 'aria-hidden': 'true', text: icon }), el('span', { class: 'tab-t', text: label }));
  document.getElementById('tabbar').replaceChildren(
    tab('home', '#/', '⌂', '首頁'),
    tab('today', '#/today', '☀', '今日'),
    tab('outline', '#/outline', '☰', '本週綱要'),
    tab('settings', '#/settings', '⚙', '設定'),
    el('a', { href: BIBLE_URL, target: '_blank', rel: 'noopener noreferrer', class: 'tab tab-ext press', 'data-tab': 'bible', 'data-testid': 'bible-link', 'aria-label': '原文聖經（另開新分頁）' },
      el('span', { class: 'tab-ic', 'aria-hidden': 'true', text: '✝' }), el('span', { class: 'tab-t', text: '原文聖經 ↗' })));
}

// ---------- 首頁 ----------
async function home() {
  chrome('home');
  document.title = Z('中英晨興聖言 TODAY');
  loading('載入本週進度…');
  const { week, today, days, psrp } = await api('week');
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

  const card = el('section', { class: 'hcard week-card', id: 'week-card', 'aria-labelledby': 'wk-h' },
    el('span', { class: 'hc-label', text: byLang(WEEK_ZH, WEEK_EN) }),
    el('h2', { id: 'wk-h', text: week.message?.title || wk }),
    el('p', { class: 'wk-meta', text: `${week.range}　${week.training}${week.englishTitle ? `　·　${week.englishTitle}` : ''}` }),
    list);

  show(head, btn, card, psrpCard(psrp, week), installCard(), statusLine(week));
}

// 本週PSRP要點：每週PSRP 表格 D1～D6 下面的文字，代理分成指引／綱目／經文三類（tools/lib.mjs classifyPsrp）
const PSRP_ZH = '本週PSRP要點', PSRP_EN = 'This week’s PSRP points';
const PSRP_TYPES = [['guide', '指引', 'Guide'], ['outline', '綱目', 'Outline'], ['verse', '經文', 'Verse']];
function psrpCard(psrp, week) {
  const label = Object.fromEntries(PSRP_TYPES.map(([k, zh, en]) => [k, byLang(zh, en)]));
  const tag = Object.fromEntries(PSRP_TYPES.map(([k, zh, en]) => [k, settings.lang === 'en' ? en : zh])); // 每行小標：中英並列時只標中文，免得太長
  const body = el('div', { class: 'blk-body', id: 'psrp-body' },
    el('ul', { class: 'psrp-legend', 'data-testid': 'psrp-legend', 'aria-label': byLang('顏色說明', 'Colour key') },
      PSRP_TYPES.map(([k]) => el('li', { class: `psrp-${k}` }, el('i', { 'aria-hidden': 'true' }), label[k]))),
    el('p', { class: 'psrp-hint', text: byLang('依每週PSRP 表格下方的文字自動分類：指引＝帶領步驟（兩兩對說、禱讀…）；綱目＝綱目思路與各點要點；經文＝經文引用。',
      'Auto-sorted from the text under the weekly PSRP table: Guide = leading steps; Outline = outline flow and points; Verse = scripture quoted. The source is in Chinese only.') }),
    psrp?.items?.length
      ? el('ul', { class: 'psrp-list', lang: 'zh-Hant' }, psrp.items.map(it => el('li', { class: `psrp-i psrp-${it.type}`, 'data-type': it.type },
        el('span', { class: 'psrp-tag', text: tag[it.type] }), it.text)))
      : missing(`本週PSRP要點暫缺${week.sources.sheet?.ok ? '（試算表分頁的表格下面還沒有文字）' : srcErr(week, 'sheet')}`),
    week.sources.sheet?.url ? el('p', { class: 'psrp-src' }, '來源：', el('a', { href: week.sources.sheet.url, target: '_blank', rel: 'noopener noreferrer', text: `每週PSRP 表格（${psrp?.tab || week.sources.sheet.tab || ''}）` })) : '');
  return collapsible(el('section', { class: 'hcard blk psrp', id: 'psrp-card', 'data-testid': 'psrp', 'aria-labelledby': 'psrp-h' }),
    'psrp', el('h2', { id: 'psrp-h', text: byLang(PSRP_ZH, PSRP_EN) }), body);
}

function statusLine(week) {
  const name = { taipei: '台北進度', training: '訓練對應', notion: '中文（Notion）', english: 'English（中英 PDF）', outlineEn: '英文綱目', sheet: '禱背（試算表）' };
  const parts = Object.entries(week.sources).map(([k, v]) => el('span', { class: v.ok ? '' : 'bad', title: v.error || '' }, `${v.ok ? '✓' : '✗'} ${name[k] || k}　`));
  const errs = Object.entries(week.sources).filter(([, v]) => !v.ok && v.error).map(([k, v]) => el('li', { text: `${name[k] || k}：${v.error}` }));
  return el('div', { class: 'status', 'data-testid': 'status' },
    el('p', {}, '來源：', parts),
    week.notionTraining ? el('p', { 'data-testid': 'training' }, '本週對應訓練：', el('a', { href: week.notionTraining.url, target: '_blank', rel: 'noopener noreferrer', text: week.notionTraining.title }),
      week.notionTraining.pinned ? '（手動指定）' : '（依台北進度自動對應）') : '',
    errs.length ? el('ul', { class: 'errs' }, errs) : '',
    week.stale ? el('p', { class: 'bad', text: `（暫用快取：${week.stale}）` }) : '');
}

// ---------- 加到主畫面 ----------
let installEvt = null;
addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); installEvt = e; document.querySelectorAll('[data-install]').forEach(b => { b.hidden = false; }); });
const standalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
function installCard() {
  if (standalone()) return '';
  const ios = /iPhone|iPad|iPod/.test(navigator.userAgent);
  return el('section', { class: 'hcard install', id: 'install-card' },
    el('span', { class: 'hc-label', text: '加到主畫面' }),
    el('p', { text: ios ? '用 Safari 開啟 → 點「分享」→「加入主畫面」，之後就像 App 一樣一點就開。' : '加到主畫面後就像 App 一樣，一點就開今日晨興聖言。' }),
    el('button', { type: 'button', class: 'btn press', 'data-install': '', hidden: !installEvt, onclick: async () => { if (!installEvt) return; installEvt.prompt(); await installEvt.userChoice.catch(() => {}); installEvt = null; } }, '安裝到主畫面'));
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
/** 卡片加上「收合／展開」按鈕（預設展開） */
function collapsible(sec, key, h2, body) {
  const btn = el('button', { type: 'button', class: 'blk-toggle press', 'aria-expanded': 'true', 'aria-controls': body.id, 'data-testid': `toggle-${key}` });
  const paint = () => { const open = btn.getAttribute('aria-expanded') === 'true'; btn.textContent = Z(open ? '收合' : '展開'); body.hidden = !open; sec.classList.toggle('closed', !open); };
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

function prayerBlock(p, week) {
  let zh;
  if (!p || (!p.outline && !p.verse)) zh = missing(`禱背暫缺${srcErr(week, 'sheet')}`);
  else zh = [
    p.outline ? [el('span', { class: 'p-ref', text: `禱背綱要　${p.outlineRef}` }), el('strong', { class: 'p-text pray-outline', text: p.outline })] : '',
    p.verse ? [el('span', { class: 'p-ref', text: `禱背經文　${p.verseRef}` }), el('strong', { class: 'p-text pray-verse', text: p.verse })] : ''];
  const en = [
    el('span', { class: 'p-ref', text: 'Pray-reading, reciting outline' }),
    p?.en ? [el('strong', { class: 'p-text pray-outline-en', text: p.en.text }), el('span', { class: 'p-note', text: `對應官方英文綱目第 ${p.en.path} 點（禱背表格本身只有中文）` })]
      : missing(p ? '暫缺：英文綱目對不上這個出處，或英文綱目取不到。' : '暫缺'),
    el('span', { class: 'p-ref', text: 'Pray-reading, reciting verses' }),
    missing('來源無英文（每週PSRP 表格只有中文禱背經文）。')];
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
  show(head, ...notes, langSeg(), blocks, nav, sourcesLine(week, d));
}

function sourcesLine(week, d) {
  return el('p', { class: 'srcs' }, '原始頁面：',
    d?.zh?.url ? [el('a', { href: d.zh.url, target: '_blank', rel: 'noopener noreferrer', text: 'Notion 本日頁' }), '　'] : '',
    week.sources.sheet?.url ? [el('a', { href: week.sources.sheet.url, target: '_blank', rel: 'noopener noreferrer', text: `試算表（${week.sources.sheet.tab || '每週PSRP'}）` }), '　'] : '',
    week.sources.english?.file ? `English：${week.sources.english.file}　` : '',
    week.sources.outlineEn?.file ? `英文綱目：${week.sources.outlineEn.file}` : '');
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
      missing('來源無英文（每週PSRP 表格只有中文）。')));
  }
  const nav = el('nav', { class: 'daynav', 'aria-label': '本週每一天' }, [1, 2, 3, 4, 5, 6].map(n => el('a', { href: `#/day/${n}`, class: 'press' }, '一二三四五六'[n - 1])));
  show(head, ...notes, langSeg(), blocks, nav, sourcesLine(week, null));
}

// ---------- 設定 ----------
function settingsView() {
  chrome('settings');
  document.title = Z('設定｜中英晨興聖言 TODAY');
  const seg = (key, opts, label, cls) => el('div', { class: `seg ${cls}`, role: 'group', 'aria-label': label },
    opts.map(([v, t]) => el('button', { type: 'button', raw: key === 'script', 'data-v': v, 'aria-pressed': String(settings[key] === v), onclick: async () => { saveSetting(key, v); await ensureScript(); route(); } }, t)));
  show(
    el('header', { class: 'day-head' }, el('h1', { text: '設定' })),
    el('section', { class: 'hcard set-card' },
      el('h2', { text: '顯示語言' }), el('p', { class: 'set-hint', text: '中文、English 或中英對照；各區塊（綱目、晨興餵養、信息選讀、禱背）中英一一對應，來源沒有英文的會標明。' }),
      seg('lang', LANGS, '顯示語言', 'lang-set'),
      el('h2', { text: '繁體／簡體' }), el('p', { class: 'set-hint', text: '選簡體時，整個介面與內容都用簡體字顯示。' }),
      seg('script', SCRIPTS, '繁體或簡體', 'zh-set'),
      el('h2', { text: '使用教學' }),
      el('button', { type: 'button', class: 'btn press', id: 'tour-replay', onclick: () => { location.hash = '#/'; setTimeout(() => replayTour(), 50); } }, '重新觀看使用教學'),
      el('h2', { text: '加到主畫面' }), installCard() || el('p', { class: 'set-hint', text: '已經以 App 模式開啟。' }),
      el('h2', { text: '其他' }),
      el('p', {}, el('a', { href: BIBLE_URL, target: '_blank', rel: 'noopener noreferrer' }, '原文對照聖經 ↗'))));
}

// ---------- 路由 ----------
let current = '';
/** 同一頁只換顯示方式：用記住的資料重畫 */
function redraw() { reuse = true; return route(); }
export async function route() {
  const h = location.hash || '#/';
  current = h;
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
initTour({ Z, el });
addEventListener('hashchange', route);
route();

if ('serviceWorker' in navigator && !/[?&]nosw\b/.test(location.search)) {
  addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}
