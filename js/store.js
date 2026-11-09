// 本機資料（IndexedDB）：顯示過的 API 回應存在使用者自己的裝置；再開時先用本地立刻畫出來，背景再向代理更新（stale-while-revalidate）。
// 換日／換週就失效：today／week（含「今天」標記）只認同一天，day／outline 只認同一週（台北時間）。代理標 stale（來源暫時取不到）的回應不存。
const DB_NAME = 'mrt', STORE = 'api', KEEP_MS = 8 * 864e5;

/** 台北時間的日期 YYYY-MM-DD */
export const taipeiDate = (now = Date.now()) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);

/** 這份回應現在還能直接拿來顯示嗎（同一天／同一週、不是暫用快取） */
export function isFresh(route, data, now = Date.now()) {
  if (!data || typeof data !== 'object' || data.error || data.week?.stale) return false;
  const d = taipeiDate(now);
  if (route === 'today' || route === 'week') return data.today?.date === d;
  const w = data.week;
  return !!(w?.weekStart && w?.weekEnd) && w.weekStart <= d && d <= w.weekEnd;
}

/** 比較兩份回應的內容（忽略代理抓取時間） */
export const sameContent = (a, b) => JSON.stringify(a, (k, v) => (k === 'fetchedAt' ? undefined : v)) === JSON.stringify(b, (k, v) => (k === 'fetchedAt' ? undefined : v));

let dbp = null;
function db() {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null);
  return dbp ??= new Promise((res) => {
    const r = indexedDB.open(DB_NAME, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE);
    r.onsuccess = () => res(r.result);
    r.onerror = r.onblocked = () => res(null);
  }).catch(() => null);
}
async function tx(mode, fn) {
  const d = await db();
  if (!d) return null;
  return new Promise((res) => {
    let req;
    try {
      const t = d.transaction(STORE, mode);
      req = fn(t.objectStore(STORE));
      t.oncomplete = () => res(req?.result ?? null);
      t.onerror = t.onabort = () => res(null);
    } catch { res(null); }
  });
}

/** { data, savedAt } 或 null（私密模式、無 IndexedDB 時一律 null，照常走網路） */
export const getLocal = (key) => tx('readonly', (s) => s.get(key)).catch(() => null);
export const putLocal = (key, data) => tx('readwrite', (s) => s.put({ data, savedAt: Date.now() }, key)).catch(() => null);
/** 刪掉 8 天前的資料（只留本週附近） */
export const pruneLocal = () => tx('readwrite', (s) => {
  const r = s.openCursor();
  r.onsuccess = () => { const c = r.result; if (!c) return; if (!(c.value?.savedAt > Date.now() - KEEP_MS)) c.delete(); c.continue(); };
  return r;
}).catch(() => null);
