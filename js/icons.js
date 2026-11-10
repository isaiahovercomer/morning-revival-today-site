// 自繪線條圖示（t118u）：底欄與外連標記都用 inline SVG，不用 emoji／系統字形（各系統字體不一）。
// 風格同「原文對照聖經」底欄：viewBox 24、描邊 1.6、圓角線帽、不填色、顏色跟 currentColor（選中／未選由 CSS 決定）。
// 形狀只用 path／circle；需要小實心點的用 class "dot"（填 currentColor）。
const NS = 'http://www.w3.org/2000/svg';

/** 每個圖示：[標籤, 屬性] 清單 */
export const ICONS = {
  // 房子：屋頂＋牆＋門
  home: [['path', { d: 'M3.5 11.2 12 4l8.5 7.2' }], ['path', { d: 'M5.8 9.6V20h12.4V9.6' }], ['path', { d: 'M10 20v-5.2h4V20' }]],
  // 日出：地平線上半個太陽＋三道光
  today: [['path', { d: 'M2.5 18h19M7.5 21h9' }], ['path', { d: 'M6.8 18a5.2 5.2 0 0 1 10.4 0' }], ['path', { d: 'M12 5v3M5.6 8.6l2 2M18.4 8.6l-2 2' }]],
  // 綱要：大點＋第二層縮排的小點
  outline: [['circle', { cx: 4.6, cy: 6, r: 1.1, class: 'dot' }], ['path', { d: 'M8.5 6h11.5' }],
    ['circle', { cx: 9, cy: 12, r: 1, class: 'dot' }], ['path', { d: 'M12.5 12H20' }],
    ['circle', { cx: 4.6, cy: 18, r: 1.1, class: 'dot' }], ['path', { d: 'M8.5 18h11.5' }]],
  // 齒輪：與原文聖經設定 tab 同一畫法（中心圓＋八道齒）
  settings: [['circle', { cx: 12, cy: 12, r: 3 }], ['path', { d: 'M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1' }]],
  // 展開的書（原文聖經「讀經」書形縮小下移）＋右上外連箭頭（另開分頁）
  bible: [['path', { d: 'M2.5 10.2c2.4-1.5 5.1-1.5 7.5 0v11.3c-2.4-1.5-5.1-1.5-7.5 0zM17.5 10.2c-2.4-1.5-5.1-1.5-7.5 0v11.3c2.4-1.5 5.1-1.5 7.5 0z' }], ['path', { d: 'M15.8 2.5h5.7v5.7M21.5 2.5l-5 5' }]],
  // 小外連箭頭（緊貼文字用）
  ext: [['path', { d: 'M9 5H5.5A1.5 1.5 0 0 0 4 6.5v12A1.5 1.5 0 0 0 5.5 20h12a1.5 1.5 0 0 0 1.5-1.5V15' }], ['path', { d: 'M14 4h6v6M20 4l-8.5 8.5' }]],
};

/** 產生 <svg class="ic ic-NAME …" aria-hidden="true"> 節點 */
export function icon(name, cls = '') {
  const svg = document.createElementNS(NS, 'svg');
  for (const [k, v] of Object.entries({ viewBox: '0 0 24 24', 'aria-hidden': 'true', focusable: 'false', class: `ic ic-${name}${cls ? ` ${cls}` : ''}`,
    fill: 'none', stroke: 'currentColor', 'stroke-width': '1.6', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' })) svg.setAttribute(k, v);
  for (const [tag, attrs] of ICONS[name]) {
    const n = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, String(v));
    if (attrs.class === 'dot') { n.setAttribute('fill', 'currentColor'); n.setAttribute('stroke', 'none'); }
    svg.append(n);
  }
  return svg;
}
