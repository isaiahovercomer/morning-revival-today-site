// 按鈕與標題換行時只在「詞」之間斷（t110u）：「今日｜晨興｜聖言」「當週｜禱研背｜進度」，不會斷成「今日晨興聖｜言」。
// 做法：文字切成詞，詞與詞之間插 <wbr>；元素加 class wb（CSS word-break: keep-all → 中文字之間不再任意斷行，只在 <wbr>、空白與標點處斷）。
// 切詞：先用領域詞庫（晨興、禱研背…，ICU 不認得）最長比對，其餘交給 Intl.Segmenter（沒有就逐字）；標點黏在前一個詞後面。
// 英文本來就只在空白斷，keep-all 不影響；不加 overflow-wrap:anywhere，所以不切英文單字。

// 繁體詞庫；簡中模式由呼叫端把每個詞轉簡體後一起比對
export const LEXICON = [
  '晨興', '聖言', '禱研背', '禱背', '講要點', '要點', '綱要', '綱目', '餵養', '選讀', '信息', '經文', '進度', '當週', '本週',
  '今日', '今天', '主日', '原文', '聖經', '首頁', '設定', '收合', '展開', '分段', '段落', '主畫面', '加到', '安裝', '重新', '觀看', '使用', '教學',
  '上一步', '下一步', '略過', '完成', '前一天', '後一天', '一天', '重新載入', '載入', '顯示', '語言', '繁體', '簡體', '版面', '配色',
  '暖白', '白天', '護眼', '黑夜', '中英', '中文', '完整', '其他', '以撒', '亞伯拉罕', '分頁', '新分頁', '台中',
];

const CJK = /[㐀-鿿豈-﫿]/;
const ORDINAL = /^第[〇一二三四五六七八九十百\d]+[週周篇天步點点章]?/; // 「第四週」「第四篇」整個算一詞
const PUNCT = /^[\s\p{P}\p{S}]+$/u;
const HEAD = new Set('（「『〈《【'); // 開括號跟後面的詞走

let segmenter;
const seg = (locale) => {
  if (segmenter === undefined) segmenter = typeof Intl !== 'undefined' && Intl.Segmenter ? new Intl.Segmenter(locale, { granularity: 'word' }) : null;
  return segmenter;
};

/** 一段文字 → 詞陣列（接起來等於原文）。lex：詞庫（同一字形） */
export function wordPieces(text, lex = LEXICON, locale = 'zh-Hant') {
  const s = String(text ?? '');
  if (!CJK.test(s)) return [s];
  const words = [...new Set(lex)].sort((a, b) => b.length - a.length);
  const raw = [];
  let rest = '';
  // 非中文的一段（英文、數字、符號）整段當一個詞：英文只在空白斷（由瀏覽器處理），不在連字號等處另插 <wbr>
  const flush = () => {
    if (!rest) return;
    const sg = seg(locale);
    for (const run of rest.match(/[\u3400-\u9fff\uf900-\ufaff]+|[^\u3400-\u9fff\uf900-\ufaff]+/g)) {
      if (!CJK.test(run)) raw.push(run);
      else if (sg) for (const x of sg.segment(run)) raw.push(x.segment);
      else for (const ch of run) raw.push(ch);
    }
    rest = '';
  };
  for (let i = 0; i < s.length;) {
    const w = ORDINAL.exec(s.slice(i))?.[0] || words.find(x => s.startsWith(x, i));
    if (w) { flush(); raw.push(w); i += w.length; } else { rest += s[i]; i++; }
  }
  flush();
  // 標點、空白黏前一個詞；開括號黏下一個詞
  const out = [];
  let carry = '';
  for (const p of raw) {
    if (!PUNCT.test(p)) { out.push(carry + p); carry = ''; }
    else if (HEAD.has(p[p.length - 1]) || !out.length) carry += p;
    else out[out.length - 1] += p;
  }
  if (carry) { if (out.length) out[out.length - 1] += carry; else out.push(carry); }
  return out;
}

// 套用範圍：所有按鈕、底部選單、今日大按鈕、卡片標題與小標、頁面標題、上一天／下一天
export const WB_SELECTOR = 'button, .btn, .tab-t, .today-btn > span, .blk-head h2, .hc-label, .daynav a, .day-head h1, .home-head h1, .home-head p, .msg-zh, .tour-head h2, .topbar-back, .topbar-title, .seg-day, .wp-day';

// 英文帶連字號的字（Pray-reading）包成不斷行的 span，免得在連字號處被拆開
const HYPHENED = /[A-Za-z]+(?:[-‐][A-Za-z]+)+/;
function noHyphenBreak(p) {
  if (!HYPHENED.test(p)) return [p];
  const out = [];
  let last = 0;
  for (const m of p.matchAll(new RegExp(HYPHENED.source, 'g'))) {
    if (m.index > last) out.push(p.slice(last, m.index));
    const span = document.createElement('span');
    span.className = 'nw';
    span.textContent = m[0];
    out.push(span);
    last = m.index + m[0].length;
  }
  if (last < p.length) out.push(p.slice(last));
  return out;
}

/** root 裡符合 WB_SELECTOR 的元素：中文文字節點換成「詞＋<wbr>」；可重複呼叫 */
export function applyWordBreaks(root, lex = LEXICON, locale = 'zh-Hant') {
  if (!root) return;
  const els = [...(root.matches?.(WB_SELECTOR) ? [root] : []), ...root.querySelectorAll(WB_SELECTOR)];
  for (const e of els) {
    e.classList.add('wb');
    const walker = document.createTreeWalker(e, NodeFilter.SHOW_TEXT);
    const nodes = [];
    for (let n = walker.nextNode(); n; n = walker.nextNode()) if (!n.parentElement.closest('.nw')) nodes.push(n);
    for (const n of nodes) {
      const parts = CJK.test(n.data) ? wordPieces(n.data, lex, locale) : [n.data];
      const hyph = parts.some(p => HYPHENED.test(p));
      if (parts.length < 2 && !hyph) continue;
      const frag = document.createDocumentFragment();
      parts.forEach((p, i) => { if (i) frag.append(document.createElement('wbr')); frag.append(...noHyphenBreak(p)); });
      n.replaceWith(frag);
    }
  }
}
