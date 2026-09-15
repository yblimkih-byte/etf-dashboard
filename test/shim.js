/* 로컬 테스트용 Apps Script 서비스 모의 구현 (node + 브라우저 공용) */
(function (g) {
  const store = {};                       // 시트 데이터
  const props = {};
  class Range {
    constructor(sh, r, c, nr, nc) { this.sh = sh; this.r = r; this.c = c; this.nr = nr; this.nc = nc; }
    getValues() { const out = []; for (let i = 0; i < this.nr; i++) { const row = this.sh.rows[this.r - 1 + i] || []; const o = []; for (let j = 0; j < this.nc; j++) o.push(row[this.c - 1 + j] === undefined ? '' : row[this.c - 1 + j]); out.push(o); } return out; }
    setValues(v) { for (let i = 0; i < v.length; i++) { const ri = this.r - 1 + i; this.sh.rows[ri] = this.sh.rows[ri] || []; for (let j = 0; j < v[i].length; j++) this.sh.rows[ri][this.c - 1 + j] = v[i][j]; } return this; }
    setValue(v) { return this.setValues([[v]]); }
    clearContent() { for (let i = 0; i < this.nr; i++) { const row = this.sh.rows[this.r - 1 + i]; if (row) for (let j = 0; j < this.nc; j++) row[this.c - 1 + j] = ''; } this.sh.trim(); return this; }
    setNumberFormat() { return this; }
  }
  class Sheet {
    constructor(name) { this.name = name; this.rows = []; }
    trim() { while (this.rows.length && this.rows[this.rows.length - 1].every(v => v === '' || v === undefined)) this.rows.pop(); }
    getName() { return this.name; }
    getLastRow() { this.trim(); return this.rows.length; }
    getLastColumn() { return Math.max(0, ...this.rows.map(r => r.length)); }
    getRange(a, b, c, d) {
      if (typeof a === 'string') { const m = a.match(/^([A-Z]+):([A-Z]+)$/); if (m) return new Range(this, 1, m[1].charCodeAt(0) - 64, Math.max(this.rows.length, 1), 1); throw new Error('A1 unsupported: ' + a); }
      return new Range(this, a, b, c === undefined ? 1 : c, d === undefined ? 1 : d);
    }
    appendRow(r) { this.trim(); this.rows.push(r.slice()); return this; }
    deleteRows(start, n) { this.rows.splice(start - 1, n); return this; }
    clearContents() { this.rows = []; return this; }
    setFrozenRows() { return this; }
  }
  const ss = {
    getSheetByName: n => store[n] || null,
    insertSheet: n => (store[n] = new Sheet(n)),
    getSheets: () => Object.values(store)
  };
  g.SpreadsheetApp = { getActiveSpreadsheet: () => ss, getUi: () => ({ alert: m => console.log('[UI]', m), prompt: () => ({ getSelectedButton: () => 1, getResponseText: () => 'KEY' }), Button: { OK: 1 }, ButtonSet: { OK_CANCEL: 1 }, createMenu: () => ({ addItem() { return this; }, addSeparator() { return this; }, addToUi() {} }) }) };
  g.PropertiesService = { getScriptProperties: () => ({ getProperty: k => props[k] === undefined ? null : props[k], setProperty: (k, v) => { props[k] = String(v); }, deleteProperty: k => { delete props[k]; } }) };
  g.CacheService = { getScriptCache: () => ({ get: () => null, put: () => {}, remove: () => {}, removeAll: () => {} }) };
  g.LockService = { getScriptLock: () => ({ tryLock: () => true, releaseLock: () => {} }) };
  g.ScriptApp = { getProjectTriggers: () => [], newTrigger: () => ({ timeBased() { return this; }, after() { return this; }, everyDays() { return this; }, atHour() { return this; }, nearMinute() { return this; }, inTimezone() { return this; }, create() { console.log('[trigger created]'); } }), deleteTrigger() {}, EventType: { CLOCK: 'CLOCK' } };
  const pad = n => ('0' + n).slice(-2);
  g.Utilities = { DigestAlgorithm: { MD5: 'md5' }, computeDigest: (a, str) => { let h = 5381; for (const c of String(str)) h = ((h * 33) ^ c.charCodeAt(0)) >>> 0; return [h]; }, base64EncodeWebSafe: b => b.map(x => x.toString(36)).join(''), formatDate: (d, tz, f) => { const y = d.getFullYear(), m = pad(d.getMonth() + 1), dd = pad(d.getDate()); return f === 'yyyyMMdd' ? `${y}${m}${dd}` : `${y}-${m}-${dd}`; } };
  g.HtmlService = { createTemplateFromFile: () => ({ evaluate: () => ({ setTitle() { return this; }, addMetaTag() { return this; }, setXFrameOptionsMode() { return this; } }) }), createHtmlOutputFromFile: () => ({ getContent: () => '' }), XFrameOptionsMode: { ALLOWALL: 1 } };

  /* ── 모의 KRX: 결정적 난수로 ~320종목 생성, 2021-01 이후 성장 ── */
  const BRANDS = [['KODEX', 90], ['TIGER', 80], ['RISE', 40], ['ACE', 40], ['SOL', 20], ['KIWOOM', 15], ['PLUS', 15], ['HANARO', 10], ['KoAct', 5], ['TIMEFOLIO', 5]];
  const THEMES = ['200', '코스닥150', '미국S&P500', '미국나스닥100', '반도체', '2차전지', '레버리지', '200선물인버스2X', 'CD금리액티브(합성)', 'KOFR금리액티브(합성)', '국고채3년', '단기채권', '미국30년국채액티브(H)', '미국배당다우존스', '골드선물(H)', '인도Nifty50', '차이나항셍테크', '미국AI반도체', '고배당', '헬스케어', '은행', '자동차', '일본TOPIX', '유럽STOXX50', '글로벌리츠', '채권혼합'];
  function rnd(seed) { let x = Math.sin(seed) * 10000; return x - Math.floor(x); }
  const ETFS = []; let code = 100000;
  BRANDS.forEach(([b, n], bi) => { for (let i = 0; i < n; i++) { code += 137; const th = THEMES[(i * 7 + bi) % THEMES.length]; const listYear = 2015 + Math.floor(rnd(code) * 11); const listM = 1 + Math.floor(rnd(code + 1) * 12); ETFS.push({ code: String(code), name: `${b} ${th}${i > 25 ? ' ' + i : ''}`, base: Math.pow(10, 10 + rnd(code + 2) * 3.2), listDd: `${listYear}-${pad(listM)}-${pad(1 + Math.floor(rnd(code + 3) * 27))}`, vol: 0.5 + rnd(code + 4) }); } });
  const HOLIDAYS = ['01-01', '03-01', '05-05', '06-06', '08-15', '10-03', '10-09', '12-25'];
  function isOpen(ds) { const d = new Date(ds + 'T00:00:00'); if (d.getDay() === 0 || d.getDay() === 6) return false; if (HOLIDAYS.includes(ds.slice(5))) return false; return true; }
  function etfDaily(ds) {
    if (ds > g.MOCK_TODAY) return []; const closed=!isOpen(ds);
    const t = (new Date(ds) - new Date('2021-01-01')) / 86400000;
    return ETFS.filter(e => e.listDd <= ds).map(e => {
      const growth = Math.pow(1 + 0.00045, t) * (1 + 0.15 * Math.sin(t / 60 + e.base % 7) * e.vol);
      const nav = Math.round(e.base * growth);
      return { BAS_DD: ds.replace(/-/g, ''), ISU_CD: e.code, ISU_NM: e.name, INVSTASST_NETASST_TOTAMT: closed?'0':String(nav), ACC_TRDVAL: closed?'0': String(Math.round(nav * (0.002 + 0.03 * rnd(t + e.base % 97)))) };
    });
  }
  function kospi(ds) { const t = (new Date(ds) - new Date('2021-01-01')) / 86400000; return [{ IDX_NM: '코스피', CLSPRC_IDX: (2800 + 400 * Math.sin(t / 200) + t * 0.3).toFixed(2) }]; }
  function stooq(sym, d1, d2) { let out = 'Date,Open,High,Low,Close,Volume\n'; let d = new Date(`${d1.slice(0, 4)}-${d1.slice(4, 6)}-${d1.slice(6, 8)}`); const end = new Date(`${d2.slice(0, 4)}-${d2.slice(4, 6)}-${d2.slice(6, 8)}`); while (d <= end) { const ds = g.Utilities.formatDate(d, '', ''); if (d.getDay() % 6) { const t = (d - new Date('2021-01-01')) / 86400000; const v = sym.includes('spx') ? 3700 + t * 0.9 + 200 * Math.sin(t / 90) : 12500 + t * 3 + 900 * Math.sin(t / 70); out += `${ds},0,0,0,${v.toFixed(2)},0\n`; } d.setDate(d.getDate() + 1); } return out; }
  function basic() { return ETFS.map(e => ({ ISU_SRT_CD: e.code, ISU_ABBRV: e.name, COM_ABBRV: ({ KODEX: '삼성자산운용', TIGER: '미래에셋자산운용', RISE: '케이비자산운용', ACE: '한국투자신탁운용', SOL: '신한자산운용', KIWOOM: '키움투자자산운용', PLUS: '한화자산운용', HANARO: '엔에이치아문디자산운용', KoAct: '삼성액티브자산운용', TIMEFOLIO: '타임폴리오자산운용' })[e.name.split(' ')[0]], LIST_DD: e.listDd.replace(/-/g, '/'), IDX_MKT_CLSS_NM: /미국|인도|차이나|일본|유럽|글로벌/.test(e.name) ? '해외' : '국내', IDX_ASST_CLSS_NM: /금리|채권|국채/.test(e.name) ? '채권' : /골드/.test(e.name) ? '원자재' : /혼합/.test(e.name) ? '혼합자산' : '주식' })); }
  g.MOCK_CALLS = 0;
  g.UrlFetchApp = { fetch: (url, opt) => {
    g.MOCK_CALLS++;
    let body = '[]';
    const q = Object.fromEntries((url.split('?')[1] || '').split('&').map(kv => kv.split('=').map(decodeURIComponent)));
    if (url.includes('etf_bydd_trd')) body = JSON.stringify({ OutBlock_1: etfDaily(`${q.basDd.slice(0, 4)}-${q.basDd.slice(4, 6)}-${q.basDd.slice(6, 8)}`) });
    else if (url.includes('kospi_dd_trd')) body = JSON.stringify({ OutBlock_1: kospi(`${q.basDd.slice(0, 4)}-${q.basDd.slice(4, 6)}-${q.basDd.slice(6, 8)}`) });
    else if (url.includes('finance.yahoo.com')) { const sym = decodeURIComponent(url.split('/chart/')[1].split('?')[0]); const p1 = +q.period1 * 1000, p2 = +q.period2 * 1000; const ts = [], cl = []; for (let t = p1; t < p2; t += 86400000) { const d = new Date(t); if (d.getDay() % 6 === 0) continue; ts.push(Math.floor(t / 1000)); const x = (t - new Date('2021-01-01').getTime()) / 86400000; cl.push(sym === '^KS11' ? 2800 + 400 * Math.sin(x / 200) + x * 0.3 : sym === '^GSPC' ? 3700 + x * 0.9 + 200 * Math.sin(x / 90) : 12500 + x * 3 + 900 * Math.sin(x / 70)); } body = JSON.stringify({ chart: { result: [{ meta: { exchangeTimezoneName: 'Asia/Seoul' }, timestamp: ts, indicators: { quote: [{ close: cl }] } }] } }); }
    else if (url.includes('stooq')) body = '<html>blocked</html>';
    else if (url.includes('getJsonData')) body = JSON.stringify({ output: basic() });
    return { getResponseCode: () => 200, getContentText: () => body };
  } };
  g.MOCK_STORE = store;
  g.MOCK_TODAY = g.MOCK_TODAY || '2026-09-09';
  g.__mockToday = () => g.MOCK_TODAY;
  /* 사용자 범례 시트 시딩 */
  g.seedLegends = function (rowsType, rowsMgr) {
    const t = ss.insertSheet('범례_유형'); t.appendRow(['종목코드', 'ETF명', '설정일', '유형1', '유형2', '유형3', '유형4', '유형최종1', '유형최종2', '국내해외', '신규상장용']); (rowsType || []).forEach(r => t.appendRow(r));
    const m = ss.insertSheet('범례_운용사'); m.appendRow(['운용사명', '브랜드', '약식_한글', '약식_정식', '약식_상위', '운용사명_상위']);
    (rowsMgr || [['삼성자산운용', 'KODEX', '삼성', '삼성', '삼성', '삼성자산운용'], ['미래에셋자산운용', 'TIGER', '미래에셋', '미래', '미래', '미래에셋자산운용'], ['한국투자신탁운용', 'ACE', '한국투자신탁운용', '한투', '한투', '한국투자신탁운용'], ['한국투자신탁운용', 'KINDEX', '한국투자신탁운용', '한투', '한투', '한국투자신탁운용'], ['케이비자산운용', 'RISE', '케이비', 'KB', 'KB', 'KB자산운용'], ['신한자산운용', 'SOL', '신한', '신한', '신한', '신한자산운용'], ['키움투자자산운용', 'KIWOOM', '키움투자', '키움', '키움', '키움투자자산운용'], ['엔에이치아문디자산운용', 'HANARO', '엔에이치아문디', 'NH', '기타', 'NH아문디'], ['삼성액티브자산운용', 'KoAct', '삼성액티브', '삼성액티브', '삼성액티브', '기타 운용사'], ['한화자산운용', 'PLUS', '한화', '한화', '한화', '한화자산운용'], ['타임폴리오자산운용', 'TIME', '타임폴리오', '타임폴리오', '기타', '기타 운용사']]).forEach(r => m.appendRow(r));
  };
})(typeof window !== 'undefined' ? window : globalThis);
