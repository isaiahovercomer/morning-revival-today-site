// 加到主畫面（t117u）：平台偵測與文案（純函式，unit 測得到；畫面在 js/app.js installBody）。
// 參考「原文對照聖經」js/offline.js：iPadOS 13+ 回報 MacIntel＋觸控；standalone 用 display-mode 或 navigator.standalone。
// 狀態：installed 已以 App 開啟｜done 剛在瀏覽器裝好｜ios 永遠顯示 Safari「分享 › 加入主畫面」步驟｜
//      prompt 有 beforeinstallprompt → 安裝按鈕｜menu 還沒有事件 → 瀏覽器選單步驟（不留白）。

/** iPhone／iPad／iPod（含回報成 Mac 的 iPadOS） */
export const isIOS = ({ userAgent = '', platform = '', maxTouchPoints = 0 } = {}) =>
  /iPhone|iPad|iPod/.test(userAgent) || (platform === 'MacIntel' && maxTouchPoints > 1);

/** 已經從主畫面以 App 開啟 */
export const isStandalone = (win) =>
  !!(win?.matchMedia?.('(display-mode: standalone)').matches || win?.navigator?.standalone === true);

export function installKind({ standalone, installed, ios, prompt }) {
  if (standalone) return 'installed';
  if (installed) return 'done';
  if (ios) return 'ios';
  return prompt ? 'prompt' : 'menu';
}

// tw 繁中、en English；cn 只在要對上手機實際選單字樣時另寫（iOS 簡中是「共享」「添加到主屏幕」），其餘由 t2s 轉
const C = {
  title: { tw: '加到主畫面', en: 'Add to Home Screen' },
  lead: {
    tw: '加到手機主畫面後就像 App 一樣，每天一點就開今日晨興聖言；看過的內容沒有網路也能開。',
    en: 'Add it to your Home Screen and it opens like an app — one tap for today’s Morning Revival; pages you have read open offline too.',
  },
  button: { tw: '安裝到主畫面', en: 'Install to Home Screen' },
  promptHint: { tw: '按下後瀏覽器會再問一次，選「安裝」即可。', en: 'Your browser will ask you to confirm — choose “Install”.' },
  iosLead: {
    tw: 'iPhone／iPad 用 Safari 的「分享 › 加入主畫面」安裝：',
    cn: 'iPhone／iPad 用 Safari 的「共享 › 添加到主屏幕」安装：',
    en: 'On iPhone/iPad, install from Safari with Share › Add to Home Screen:',
  },
  iosSteps: {
    tw: ['用 Safari 開啟這個網頁。', '點「分享」按鈕：方框加向上箭頭；新版 iOS 在右下角「⋯」裡。', '往下捲，點「加入主畫面」。', '點右上角「加入」，主畫面就會出現「晨興TODAY」圖示。'],
    cn: ['用 Safari 打开这个网页。', '点「共享」按钮：方框加向上箭头；新版 iOS 在右下角「⋯」里。', '往下滑，点「添加到主屏幕」。', '点右上角「添加」，主屏幕就会出现「晨興TODAY」图标。'],
    en: ['Open this page in Safari.', 'Tap the Share button — a square with an up arrow; on newer iOS it is under “⋯” at the bottom right.', 'Scroll down and tap “Add to Home Screen”.', 'Tap “Add” at the top right — the 晨興TODAY icon appears on your Home Screen.'],
  },
  menuLead: { tw: '用瀏覽器選單安裝：', cn: '用浏览器菜单安装：', en: 'Install from the browser menu:' },
  menuSteps: {
    tw: ['點瀏覽器右上角的選單「⋮」；電腦版也可以點網址列右邊的安裝圖示。', '選「安裝應用程式」或「加到主畫面」。', '按「安裝」確認，主畫面就會出現「晨興TODAY」圖示。'],
    cn: ['点浏览器右上角的菜单「⋮」；电脑版也可以点地址栏右边的安装图标。', '选「安装应用」或「添加到主屏幕」。', '点「安装」确认，主屏幕就会出现「晨興TODAY」图标。'],
    en: ['Open the browser menu “⋮” at the top right; on a computer you can also click the install icon in the address bar.', 'Choose “Install app” or “Add to Home screen”.', 'Confirm with “Install” — the 晨興TODAY icon appears on your Home Screen.'],
  },
  installed: { tw: '已安裝：現在是以 App 開啟。之後從主畫面「晨興TODAY」圖示一點就開。', en: 'Installed — you are using the app from your Home Screen. Open it any time from the 晨興TODAY icon.' },
  done: { tw: '已加到主畫面：之後從主畫面「晨興TODAY」圖示一點就開。', en: 'Added to your Home Screen — open it any time from the 晨興TODAY icon.' },
};

/**
 * 某狀態要顯示的文字。lang：zh／en／both（both 內文用中文，標題由呼叫端並列）；script：tw／cn；t2s：繁轉簡函式。
 * 回傳 { title, lead, steps, button, hint, note }（沒有的欄位為 '' 或 []）；字串已是最終字形，畫面不要再轉。
 */
export function installCopy(kind, { lang = 'zh', script = 'tw' } = {}, t2s = (s) => s) {
  const pick = (e) => {
    if (lang === 'en') return e.en;
    if (script !== 'cn') return e.tw;
    return e.cn ?? (Array.isArray(e.tw) ? e.tw.map(t2s) : t2s(e.tw));
  };
  const out = { title: pick(C.title), lead: '', steps: [], stepsLead: '', button: '', hint: '', note: '' };
  if (kind === 'installed' || kind === 'done') return { ...out, note: pick(C[kind]) };
  out.lead = pick(C.lead);
  if (kind === 'prompt') return { ...out, button: pick(C.button), hint: pick(C.promptHint) };
  if (kind === 'ios') return { ...out, stepsLead: pick(C.iosLead), steps: pick(C.iosSteps) };
  return { ...out, stepsLead: pick(C.menuLead), steps: pick(C.menuSteps) };
}
