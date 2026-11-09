// 禱背經文出處（恢復本中文縮寫，例「羅十一36」「創二二1～2」「啟二十一2」）→ Recovery Version 線上版的章節網址。
// 版權（_research/RCV_TOS.md）：LSM 禁止下載／快取其電子出版品、鼓勵連結，所以這裡只組外連網址，不抓、不存任何經文。
const BOOKS = [
  ['創', 'Genesis'], ['出', 'Exodus'], ['利', 'Leviticus'], ['民', 'Numbers'], ['申', 'Deuteronomy'], ['書', 'Joshua'], ['士', 'Judges'], ['得', 'Ruth'],
  ['撒上', '1Samuel'], ['撒下', '2Samuel'], ['王上', '1Kings'], ['王下', '2Kings'], ['代上', '1Chronicles'], ['代下', '2Chronicles'],
  ['拉', 'Ezra'], ['尼', 'Nehemiah'], ['斯', 'Esther'], ['伯', 'Job'], ['詩', 'Psalms'], ['箴', 'Proverbs'], ['傳', 'Ecclesiastes'], ['歌', 'SongofSongs'],
  ['賽', 'Isaiah'], ['耶', 'Jeremiah'], ['哀', 'Lamentations'], ['結', 'Ezekiel'], ['但', 'Daniel'], ['何', 'Hosea'], ['珥', 'Joel'], ['摩', 'Amos'],
  ['俄', 'Obadiah'], ['拿', 'Jonah'], ['彌', 'Micah'], ['鴻', 'Nahum'], ['哈', 'Habakkuk'], ['番', 'Zephaniah'], ['該', 'Haggai'], ['亞', 'Zechariah'], ['瑪', 'Malachi'],
  ['太', 'Matthew'], ['可', 'Mark'], ['路', 'Luke'], ['約', 'John'], ['徒', 'Acts'], ['羅', 'Romans'], ['林前', '1Corinthians'], ['林後', '2Corinthians'],
  ['加', 'Galatians'], ['弗', 'Ephesians'], ['腓', 'Philippians'], ['西', 'Colossians'], ['帖前', '1Thessalonians'], ['帖後', '2Thessalonians'],
  ['提前', '1Timothy'], ['提後', '2Timothy'], ['多', 'Titus'], ['門', 'Philemon'], ['來', 'Hebrews'], ['雅', 'James'], ['彼前', '1Peter'], ['彼後', '2Peter'],
  ['約壹', '1John'], ['約貳', '2John'], ['約參', '3John'], ['猶', 'Jude'], ['啟', 'Revelation'],
];
const BY_ZH = new Map(BOOKS.map(([zh, en], i) => [zh, { no: i + 1, en }]));
const NAMES = [...BY_ZH.keys()].sort((a, b) => b.length - a.length).join('|'); // 兩字的先比（約壹 先於 約）
const REF = new RegExp(`(${NAMES})([〇一二三四五六七八九十百]+)\\s*\\d`);
const DIGIT = { 〇: 0, 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };

/** 中文章數：「十一」「二十一」「一百一十九」與恢復本逐位寫法「二二」「一一九」 */
export function zhNum(s) {
  if (!/[十百]/.test(s)) return [...s].reduce((n, c) => n * 10 + DIGIT[c], 0);
  let n = 0, cur = 0;
  for (const c of s) {
    if (c === '百') { n += (cur || 1) * 100; cur = 0; } else if (c === '十') { n += (cur || 1) * 10; cur = 0; } else cur = DIGIT[c];
  }
  return n + cur;
}

/** 取出處中的第一處經文 → { book, chapter, url }；看不懂就回 null */
export function rcvLink(ref) {
  const m = REF.exec(String(ref || ''));
  if (!m) return null;
  const b = BY_ZH.get(m[1]), ch = zhNum(m[2]);
  if (!ch) return null;
  const book = b.en.replace(/^(\d)/, '$1 ').replace('SongofSongs', 'Song of Songs');
  return { book, chapter: ch, url: `https://text.recoveryversion.bible/${String(b.no).padStart(2, '0')}_${b.en}_${ch}.htm` };
}
