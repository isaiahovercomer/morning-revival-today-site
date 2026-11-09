// 首次使用教學：半透明遮罩＋聚光圈住一個元件＋旁邊的說明泡泡（上一步／下一步／略過，「2 / 6」）。
// 精神參考「原文對照聖經」js/tour.js：找不到目標的步驟自動跳過；Esc 略過；Tab 只在泡泡按鈕間移動。
// 第一次進首頁時自動開始（localStorage mrt.tour）；設定 › 「重新觀看使用教學」可重播。
const KEY = 'mrt.tour';
const TOUR_VERSION = 1;
const PAD = 6, GAP = 14, EDGE = 12, WAIT = 2500;
const $ = (s) => document.querySelector(s);
const visible = (el) => el && el.getClientRects().length > 0 && !el.closest('[hidden]');

const STEPS = [
  { id: 'today', target: () => $('#today-btn'), title: '今日晨興聖言',
    text: '每天打開點這裡：當天的禱背、綱目、晨興餵養、信息選讀，中文與 English 一一對照。主日則顯示本週完整綱要。' },
  { id: 'week', target: () => $('#daylist'), title: '當週禱研背進度',
    text: '本週禱研背進度：週一到週六每天的禱背出處，點進去看當天內容；標「今天」的是今天，最下面「主日」是本週完整綱要。' },
  { id: 'seg', target: () => $('#seg-card .blk-head'), title: '本週分段・段落要點',
    text: '每週PSRP 表格 D1～D6 左側的「分段」與「段落要點」：每段一列，粗體是段落要點，下面是分段，右邊小標是啟示／應用／結果；今天那段會標出來。' },
  { id: 'psrp', target: () => $('#psrp-card .blk-head'), title: '禱研背講要點',
    text: '每週PSRP 表格下面的帶領要點，分三色：指引（帶領步驟）、綱目（綱目思路與要點）、經文（經文引用）；上方有顏色說明。' },
  { id: 'outline', target: () => $('#tabbar [data-tab="outline"]'), title: '本週綱要',
    text: '整篇綱要（中文＋官方英文綱目）一次看完。' },
  { id: 'settings', target: () => $('#tabbar [data-tab="settings"]'), title: '設定',
    text: '切換顯示語言、繁體／簡體、版面配色（跟隨系統、白天、暖白、護眼、黑夜），也可以重看這份教學。' },
  { id: 'bible', target: () => $('#tabbar [data-tab="bible"]'), title: '原文聖經',
    text: '另開新分頁到「原文對照聖經」，查經文的希臘文、希伯來文原文。' },
  { id: 'install', target: () => $('#install-card'), title: '加到主畫面',
    text: '加到手機主畫面後就像 App 一樣，每天一點就開。首頁每張卡片和內容區塊都可以「收合／展開」，預設全部展開。' },
];

let hooks = { Z: (s) => s, el: null };
export function initTour(h) { hooks = { ...hooks, ...h }; }
const seen = () => { try { return +localStorage.getItem(KEY) >= TOUR_VERSION; } catch { return true; } };
const markSeen = () => { try { localStorage.setItem(KEY, String(TOUR_VERSION)); } catch {} };

let active = null;
export const tourActive = () => !!active;
export function maybeStartTour() { if (!active && !seen()) start(); }
export function replayTour() { if (!active) start(); }

function start() {
  markSeen();
  const { el, Z } = hooks;
  const a = active = { i: -1, skipped: new Set(), focus: document.activeElement };
  a.root = el('div', { class: 'tour', 'data-testid': 'tour' },
    a.catcher = el('div', { class: 'tour-catch' }),
    a.hole = el('div', { class: 'tour-hole', 'aria-hidden': 'true' }),
    a.bubble = el('div', { class: 'tour-bubble', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'tour-title', 'aria-describedby': 'tour-text' },
      a.arrow = el('i', { class: 'tour-arrow', 'aria-hidden': 'true' }),
      el('div', { class: 'tour-head' }, a.titleEl = el('h2', { id: 'tour-title' }), a.countEl = el('span', { class: 'tour-count', 'aria-hidden': 'true' })),
      a.textEl = el('p', { id: 'tour-text' }),
      el('div', { class: 'tour-btns' },
        a.skipBtn = el('button', { type: 'button', class: 'tour-skip press', onclick: () => end() }, '略過'),
        a.prevBtn = el('button', { type: 'button', class: 'tour-prev press', onclick: () => go(a.i - 1, -1) }, '上一步'),
        a.nextBtn = el('button', { type: 'button', class: 'tour-next press', onclick: () => go(a.i + 1, 1) }, '下一步')),
      a.live = el('div', { class: 'tour-live', 'aria-live': 'polite', role: 'status' })));
  for (const t of ['pointerdown', 'click', 'touchstart']) a.catcher.addEventListener(t, (e) => { e.preventDefault(); e.stopPropagation(); }, { passive: false });
  addEventListener('keydown', onKey, true);
  document.body.append(a.root);
  requestAnimationFrame(() => a.root.classList.add('on'));
  a.raf = requestAnimationFrame(follow);
  a.Z = Z;
  go(0, 1);
}

function onKey(e) {
  const a = active;
  if (!a) return;
  if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); end(); return; }
  if (e.key === 'Tab') {
    e.preventDefault(); e.stopImmediatePropagation();
    const items = [a.skipBtn, a.prevBtn, a.nextBtn].filter(b => !b.disabled);
    const at = items.indexOf(document.activeElement);
    items[at < 0 ? 0 : (at + (e.shiftKey ? -1 : 1) + items.length) % items.length].focus({ preventScroll: true });
    return;
  }
  if (!a.bubble.contains(e.target)) { e.preventDefault(); e.stopImmediatePropagation(); }
}

const frame = () => new Promise(r => requestAnimationFrame(r));
async function waitFor(fn, ms) {
  const t0 = performance.now();
  for (;;) {
    const el = fn();
    if (visible(el)) return el;
    if (performance.now() - t0 >= ms) return null;
    await frame();
  }
}

async function go(i, dir) {
  const a = active;
  if (!a || a.busy || i < 0) return;
  if (i >= STEPS.length) { end(); return; }
  a.busy = true;
  // 首頁還在載入就等一下；已載入（或載入失敗）就不等，缺的步驟直接跳過
  const el = await waitFor(STEPS[i].target, document.querySelector('#app .loading') ? WAIT : 300);
  if (active !== a) return;
  a.busy = false;
  if (!el) {
    a.skipped.add(STEPS[i].id);
    if (dir < 0 && i === 0) { if (a.i >= 0) return; dir = 1; }
    go(i + dir, dir);
    return;
  }
  a.i = i;
  a.target = el;
  a.root.dataset.step = STEPS[i].id;
  const r = el.getBoundingClientRect();
  if (!el.closest('#tabbar') && (r.top < 56 || r.bottom > innerHeight - 80)) el.scrollIntoView({ block: 'center' });
  render();
}

function render() {
  const a = active;
  const s = STEPS[a.i];
  const shown = STEPS.filter(x => !a.skipped.has(x.id));
  const n = shown.indexOf(s) + 1, total = shown.length;
  const last = !STEPS.slice(a.i + 1).some(x => !a.skipped.has(x.id));
  a.titleEl.textContent = a.Z(s.title);
  a.textEl.textContent = a.Z(s.text);
  a.countEl.textContent = `${n} / ${total}`;
  a.prevBtn.disabled = n <= 1;
  a.nextBtn.textContent = a.Z(last ? '完成' : '下一步');
  a.live.textContent = a.Z(`第 ${n} 步，共 ${total} 步。${s.title}。${s.text}`);
  a.nextBtn.focus({ preventScroll: true });
  a.key = '';
  a.root.classList.add('ready'); // 第一步就緒前不顯示空泡泡
}

function holeFor(el) {
  const r = el.getBoundingClientRect();
  const x1 = Math.max(r.left - PAD, 4), y1 = Math.max(r.top - PAD, 4);
  const x2 = Math.min(r.right + PAD, innerWidth - 4), y2 = Math.min(r.bottom + PAD, innerHeight - 4);
  return { x: x1, y: y1, w: Math.max(0, x2 - x1), h: Math.max(0, y2 - y1) };
}
function bubbleFor(hole, bw, bh) {
  const below = innerHeight - (hole.y + hole.h) - GAP - EDGE, above = hole.y - GAP - EDGE;
  let y, side;
  if (below >= bh) { y = hole.y + hole.h + GAP; side = 'below'; }
  else if (above >= bh) { y = hole.y - GAP - bh; side = 'above'; }
  else { y = below >= above ? innerHeight - EDGE - bh : EDGE; side = 'inside'; }
  const cx = hole.x + hole.w / 2;
  const x = Math.min(Math.max(cx - bw / 2, EDGE), innerWidth - EDGE - bw);
  return { x, y: Math.max(EDGE, y), side, ax: Math.min(Math.max(cx - x, 22), bw - 22) };
}
// 每個 frame 追蹤目標位置（捲動、旋轉螢幕都跟著走）
function follow() {
  const a = active;
  if (!a) return;
  a.raf = requestAnimationFrame(follow);
  if (!a.target?.isConnected) return;
  const hole = holeFor(a.target);
  const b = bubbleFor(hole, a.bubble.offsetWidth, a.bubble.offsetHeight);
  const k = `${hole.x},${hole.y},${hole.w},${hole.h}|${b.x},${b.y}`;
  if (k === a.key) return;
  a.key = k;
  Object.assign(a.hole.style, { width: `${hole.w}px`, height: `${hole.h}px`, transform: `translate3d(${hole.x}px,${hole.y}px,0)` });
  a.bubble.style.transform = `translate3d(${b.x}px,${b.y}px,0)`;
  a.bubble.dataset.side = b.side;
  a.arrow.style.left = `${b.ax}px`;
}

function end() {
  const a = active;
  if (!a) return;
  active = null;
  cancelAnimationFrame(a.raf);
  removeEventListener('keydown', onKey, true);
  a.root.classList.remove('on');
  a.root.classList.add('closing');
  setTimeout(() => a.root.remove(), matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 220);
  if (a.focus?.isConnected && a.focus !== document.body) a.focus.focus({ preventScroll: true });
}
