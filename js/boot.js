// 首屏前套用版面配色（設定 › 版面配色，localStorage mrt.theme），免得先閃預設色再換。
// CSP 不允許 inline script，所以獨立成檔、在 <head> 同步載入；其餘邏輯在 app.js。
(function () {
  var t = 'system';
  try { t = localStorage.getItem('mrt.theme') || t; } catch (e) {}
  if (!/^(system|light|warm|eye|dark)$/.test(t)) t = 'system';
  document.documentElement.setAttribute('data-theme', t);
})();
