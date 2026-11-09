// 繁簡轉換（純函式）：瀏覽器（簡中模式）與 Node 單元測試共用。
// 表格 zh/t2s.json（繁→簡）取自「原文對照聖經」（由 OpenCC 產生，Apache-2.0，見 zh/LICENSE-OpenCC）：
//   { c: "<來源字><目標字>…"（單一碼位成對）, p: "<詞>\t<詞>|…" }
// 規則：最長詞組優先，否則逐字對照；沒有漢字的字串原樣傳回（英文不受影響）。
const ZH_HAN = /[㐀-鿿豈-﫿]|[\u{20000}-\u{2ffff}]/u;

export function makeConv({ c, p }) {
  const chars = new Map();
  const cc = Array.from(c || '');
  for (let i = 0; i < cc.length; i += 2) chars.set(cc[i], cc[i + 1]);
  const phrases = new Map();
  const maxLen = new Map(); // 首字 → 最長詞組長度（碼位）
  for (const e of p ? p.split('|') : []) {
    const [k, v] = e.split('\t');
    if (!k || v == null) continue;
    const a = Array.from(k);
    phrases.set(k, v);
    maxLen.set(a[0], Math.max(maxLen.get(a[0]) || 0, a.length));
  }
  return (s) => {
    s = String(s ?? '');
    if (!ZH_HAN.test(s)) return s;
    const a = Array.from(s);
    let out = '';
    for (let i = 0; i < a.length;) {
      const m = maxLen.get(a[i]);
      if (m) {
        let hit = false;
        for (let n = Math.min(m, a.length - i); n >= 2; n--) {
          const v = phrases.get(a.slice(i, i + n).join(''));
          if (v != null) { out += v; i += n; hit = true; break; }
        }
        if (hit) continue;
      }
      out += chars.get(a[i]) ?? a[i];
      i++;
    }
    return out;
  };
}
