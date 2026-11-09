// 首屏前套用版面配色（設定 › 版面配色，localStorage mrt.theme），免得先閃預設色再換。
// CSP 不允許 inline script，所以獨立成檔、在 <head> 同步載入；其餘邏輯在 app.js。
// 預設暖白、不跟系統深色（與原文對照聖經相同）；舊的 'system' 或無效值一律當暖白。
(function () {
  var t = 'warm';
  try { t = localStorage.getItem('mrt.theme') || t; } catch (e) {}
  if (!/^(warm|light|eye|dark)$/.test(t)) t = 'warm';
  document.documentElement.setAttribute('data-theme', t);
})();
