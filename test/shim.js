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
    setFontWeight() { return this; } setWrap() { return this; }   // v29
    setNote(n) { (this.sh.notes = this.sh.notes || {})[this.r + ',' + this.c] = String(n); return this; }
    getNote() { return (this.sh.notes && this.sh.notes[this.r + ',' + this.c]) || ''; }
  }
  class Sheet {
    constructor(name) { this.name = name; this.rows = []; }
    trim() { while (this.rows.length && this.rows[this.rows.length - 1].every(v => v === '' || v === undefined)) this.rows.pop(); }
    getName() { return this.name; }
    setName(n) { const st = g.MOCK_STORE; delete st[this.name]; this.name = n; st[n] = this; return this; }   // v29
    getLastRow() { this.trim(); return this.rows.length; }
    getLastColumn() { return Math.max(0, ...this.rows.map(r => r.length)); }
    getRange(a, b, c, d) {
      if (typeof a === 'string') { const m = a.match(/^([A-Z]+):([A-Z]+)$/); if (m) return new Range(this, 1, m[1].charCodeAt(0) - 64, Math.max(this.rows.length, 1), 1); throw new Error('A1 unsupported: ' + a); }
      return new Range(this, a, b, c === undefined ? 1 : c, d === undefined ? 1 : d);
    }
    appendRow(r) { this.trim(); this.rows.push(r.slice()); return this; }
    deleteRows(start, n) { this.rows.splice(start - 1, n); return this; }
    clearContents() { this.rows = []; return this; }
    clear() { this.rows = []; this.notes = {}; return this; } setColumnWidth() { return this; }   // v29
    setFrozenRows() { return this; }
    getMaxColumns() { return this._maxc || 26; }
    deleteColumns(c, n) { this._maxc = (this._maxc || 26) - n; return this; }
  }
  const ss = {
    getSheetByName: n => store[n] || null,
    insertSheet: n => (store[n] = new Sheet(n)),
    getSheets: () => Object.values(store),
    deleteSheet: sh => { delete store[sh.name]; }   // v29
  };
  g.SpreadsheetApp = { flush: () => { g.MOCK_FLUSH = (g.MOCK_FLUSH || 0) + 1; }, getActiveSpreadsheet: () => ss, getUi: () => ({ alert: m => console.log('[UI]', m), prompt: () => ({ getSelectedButton: () => 1, getResponseText: () => 'KEY' }), Button: { OK: 1 }, ButtonSet: { OK_CANCEL: 1 }, createMenu: () => ({ addItem() { return this; }, addSeparator() { return this; }, addToUi() {} }) }) };
  g.PropertiesService = { getScriptProperties: () => ({ getProperty: k => props[k] === undefined ? null : props[k], setProperty: (k, v) => { props[k] = String(v); }, deleteProperty: k => { delete props[k]; }, getProperties: () => Object.assign({}, props) }) };
  // 캐시: 기본은 아무것도 저장하지 않음(기존 테스트 동작 유지). g.MOCK_CACHE = true 이면 메모리 캐시(만료 시각·크기 한도 100KB 점검) — v24 압축·예열·boot 점검용
  const mem = {}; g.MOCK_CACHE_STORE = mem; g.MOCK_NOW = g.MOCK_NOW || (() => Date.now());
  const live = k => mem[k] && mem[k].exp > g.MOCK_NOW() ? mem[k].v : null;
  // 값 한도: UTF-8 100KB(한글 1자 = 3바이트) — 글자 수가 아니라 바이트로 점검
  const bytes = v => unescape(encodeURIComponent(String(v))).length;
  const cput = (k, v, ttl) => { if (!g.MOCK_CACHE) return; if (bytes(v) > 100 * 1024) throw new Error('Argument too large: value'); if (k.length > 250) throw new Error('key too long'); mem[k] = { v: String(v), exp: g.MOCK_NOW() + (ttl || 600) * 1000 }; };
  g.CacheService = { getScriptCache: () => ({
    get: k => g.MOCK_CACHE ? live(k) : null,
    getAll: ks => { const o = {}; if (g.MOCK_CACHE) ks.forEach(k => { const v = live(k); if (v !== null) o[k] = v; }); return o; },
    put: (k, v, ttl) => cput(k, v, ttl),
    putAll: (o, ttl) => Object.keys(o).forEach(k => cput(k, o[k], ttl)),
    remove: k => { delete mem[k]; }, removeAll: ks => ks.forEach(k => { delete mem[k]; }) }) };
  g.LockService = { getScriptLock: () => ({ tryLock: () => true, releaseLock: () => {} }) };
  g.ScriptApp = { WeekDay: { MONDAY: 'MONDAY' }, getProjectTriggers: () => [], newTrigger: () => ({ onWeekDay() { return this; }, timeBased() { return this; }, after() { return this; }, everyDays() { return this; }, atHour() { return this; }, nearMinute() { return this; }, inTimezone() { return this; }, create() { console.log('[trigger created]'); } }), deleteTrigger() {}, EventType: { CLOCK: 'CLOCK' } };
  const pad = n => ('0' + n).slice(-2);
  g.Utilities = { DigestAlgorithm: { MD5: 'md5' }, computeDigest: (a, str) => { let h = 5381; for (const c of String(str)) h = ((h * 33) ^ c.charCodeAt(0)) >>> 0; return [h]; }, base64EncodeWebSafe: b => b.map(x => x.toString(36)).join(''), sleep: () => {}, formatDate: (d, tz, f) => { if (f === 'H') return String(d.getHours()); const y = d.getFullYear(), m = pad(d.getMonth() + 1), dd = pad(d.getDate()); return f === 'yyyyMMdd' ? `${y}${m}${dd}` : f === 'yyyy-MM' ? `${y}-${m}` : `${y}-${m}-${dd}`; } };
  // v24: Blob·gzip·base64 (node 테스트는 실행기가 g.__zlib 를 넣으면 실제 gzip, 브라우저는 표식만 붙인 비압축)
  const u8enc = str => Array.from(unescape(encodeURIComponent(str)), c => c.charCodeAt(0));
  const u8dec = bytes => { let out = ''; for (let i = 0; i < bytes.length; i += 8192) out += String.fromCharCode.apply(null, bytes.slice(i, i + 8192).map(b => b & 255)); return decodeURIComponent(escape(out)); };
  const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const b64enc = bytes => { let o = ''; for (let i = 0; i < bytes.length; i += 3) { const a = bytes[i] & 255, b = i + 1 < bytes.length ? bytes[i + 1] & 255 : 0, c = i + 2 < bytes.length ? bytes[i + 2] & 255 : 0, n = (a << 16) | (b << 8) | c; o += B64[n >> 18 & 63] + B64[n >> 12 & 63] + (i + 1 < bytes.length ? B64[n >> 6 & 63] : '=') + (i + 2 < bytes.length ? B64[n & 63] : '='); } return o; };
  const b64dec = str => { const out = []; let buf = 0, bits = 0; for (const ch of String(str).replace(/[^A-Za-z0-9+/]/g, '')) { buf = (buf << 6) | B64.indexOf(ch); bits += 6; if (bits >= 8) { bits -= 8; out.push((buf >> bits) & 255); buf &= (1 << bits) - 1; } } return out; };
  class Blob_ { constructor(bytes, type) { this.bytes = bytes; this.type = type || ''; } getBytes() { return this.bytes.slice(); } getDataAsString(cs) { if (cs && !/^utf-?8$/i.test(cs)) throw new Error('charset ' + cs); return u8dec(this.bytes); } setDataFromString(str, cs) { if (cs && !/^utf-?8$/i.test(cs)) throw new Error('charset ' + cs); this.bytes = u8enc(str); return this; } getContentType() { return this.type; } }
  Object.assign(g.Utilities, {
    newBlob: (data, type) => new Blob_(typeof data === 'string' ? u8enc(data) : Array.from(data, b => b & 255), type),
    gzip: b => { g.MOCK_GZIP = (g.MOCK_GZIP || 0) + 1; return new Blob_(g.__zlib ? Array.from(g.__zlib.gzipSync(g.__Buffer.from(b.bytes))) : [0x1f, 0x8b].concat(b.bytes), 'application/x-gzip'); },
    ungzip: b => { if (b.type !== 'application/x-gzip') throw new Error('ungzip: content type'); return new Blob_(g.__zlib ? Array.from(g.__zlib.gunzipSync(g.__Buffer.from(b.bytes))) : b.bytes.slice(2)); },
    base64Encode: bytes => b64enc(Array.isArray(bytes) ? bytes : u8enc(String(bytes))),
    base64Decode: str => b64dec(str)
  });
  g.HtmlService = { createTemplateFromFile: () => ({ evaluate: () => ({ setTitle() { return this; }, addMetaTag() { return this; }, setXFrameOptionsMode() { return this; } }) }), createHtmlOutputFromFile: () => ({ getContent: () => '' }), XFrameOptionsMode: { ALLOWALL: 1 } };

  /* ── 모의 KRX: 결정적 난수로 ~320종목 생성, 2021-01 이후 성장 ── */
  const BRANDS = [['KODEX', 90], ['TIGER', 80], ['RISE', 40], ['ACE', 40], ['SOL', 20], ['KIWOOM', 15], ['PLUS', 15], ['HANARO', 10], ['KoAct', 5], ['TIMEFOLIO', 5]];
  const THEMES = ['200', '코스닥150', '미국S&P500', '미국나스닥100', '반도체', '2차전지', '레버리지', '200선물인버스2X', 'CD금리액티브(합성)', 'KOFR금리액티브(합성)', '국고채3년', '단기채권', '미국30년국채액티브(H)', '미국배당다우존스', '골드선물(H)', '인도Nifty50', '차이나항셍테크', '미국AI반도체', '고배당', '헬스케어', '은행', '자동차', '일본TOPIX', '유럽STOXX50', '글로벌리츠', '채권혼합'];
  // v29: 기초지수명(IDX_IND_NM) — 실제 KRX 표기와 비슷하게
  const IDXN = { '200': '코스피 200', '코스닥150': '코스닥 150', '미국S&P500': 'S&P 500', '미국나스닥100': 'NASDAQ 100', '반도체': 'KRX 반도체', '2차전지': 'KRX 2차전지 K-뉴딜지수', '레버리지': '코스피 200',
    '200선물인버스2X': '코스피 200 선물지수', 'CD금리액티브(합성)': 'KAP CD금리 총수익 지수', 'KOFR금리액티브(합성)': 'KAP KOFR 총수익 지수', '국고채3년': 'KTB INDEX(시장가격)', '단기채권': 'KIS 단기채권 지수', '미국30년국채액티브(H)': 'ICE U.S. Treasury 20+ Year Bond Index',
    '미국배당다우존스': 'Dow Jones U.S. Dividend 100 Index', '골드선물(H)': 'S&P GSCI Gold Index(TR)', '인도Nifty50': 'Nifty 50 Index', '차이나항셍테크': 'Hang Seng TECH Index', '미국AI반도체': 'Akros 미국 AI 반도체 지수', '고배당': '코스피 고배당 50',
    '헬스케어': 'KRX 헬스케어', '은행': 'KRX 은행', '자동차': 'KRX 자동차', '일본TOPIX': 'TOPIX', '유럽STOXX50': 'EURO STOXX 50', '글로벌리츠': 'S&P Global REIT Index', '채권혼합': '코스피 200 단기국공채 혼합지수' };
  function rnd(seed) { let x = Math.sin(seed) * 10000; return x - Math.floor(x); }
  const ETFS = []; let code = 100000;
  BRANDS.forEach(([b, n], bi) => { for (let i = 0; i < n; i++) { code += 137; const th = THEMES[(i * 7 + bi) % THEMES.length]; const listYear = 2015 + Math.floor(rnd(code) * 11); const listM = 1 + Math.floor(rnd(code + 1) * 12); ETFS.push({ code: String(code), th: th, name: `${b} ${th}${i > 25 ? ' ' + i : ''}`, base: Math.pow(10, 10 + rnd(code + 2) * 3.2), listDd: `${listYear}-${pad(listM)}-${pad(1 + Math.floor(rnd(code + 3) * 27))}`, vol: 0.5 + rnd(code + 4) }); } });
  const HOLIDAYS = ['01-01', '03-01', '05-05', '06-06', '08-15', '10-03', '10-09', '12-25'];
  function isOpen(ds) { const d = new Date(ds + 'T00:00:00'); if (d.getDay() === 0 || d.getDay() === 6) return false; if (HOLIDAYS.includes(ds.slice(5))) return false; return true; }
  function etfDaily(ds) {
    if (ds > g.MOCK_TODAY) return []; const closed=!isOpen(ds);
    const t = (new Date(ds) - new Date('2021-01-01')) / 86400000;
    return ETFS.filter(e => e.listDd <= ds).map(e => {
      const growth = Math.pow(1 + 0.00045, t) * (1 + 0.15 * Math.sin(t / 60 + e.base % 7) * e.vol);
      const nav = Math.round(e.base * growth);
      return { BAS_DD: ds.replace(/-/g, ''), ISU_CD: e.code, ISU_NM: e.name, IDX_IND_NM: IDXN[e.th] || '', INVSTASST_NETASST_TOTAMT: closed?'0':String(nav), ACC_TRDVAL: closed?'0': String(Math.round(nav * (0.002 + 0.03 * rnd(t + e.base % 97)))) };
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
    else if (url.includes('oauth2/tokenP')) { g.MOCK_KIS_TOKENS = (g.MOCK_KIS_TOKENS || 0) + 1; const e = new Date(Date.now() + 86400000); body = JSON.stringify({ access_token: 'TOK' + g.MOCK_KIS_TOKENS, token_type: 'Bearer', expires_in: 86400, access_token_token_expired: e.toISOString().slice(0, 10) + ' 09:00:00' }); }
    else if (url.includes('inquire-component-stock-price')) { const r = kisMock(q.FID_INPUT_ISCD, opt); return { getResponseCode: () => r[0], getContentText: () => r[1] }; }
    else if (/naverapihub|openapi\.naver/.test(url) && !(opt && opt.headers && opt.headers['X-NCP-APIGW-API-KEY-ID'] && opt.headers['X-NCP-APIGW-API-KEY'])) { g.MOCK_NAVER_401 = (g.MOCK_NAVER_401 || 0) + 1; return { getResponseCode: () => 401, getContentText: () => '{"errorCode":"200","message":"Authentication Failed"}' }; }   // v30: NAVER API HUB 인증 헤더
    else if (url.includes('datalab/search') || url.includes('search-trend/v1/search')) body = JSON.stringify(datalabMock(JSON.parse(opt.payload)));
    else if (url.includes('search/news.json') || url.includes('search/v1/news')) body = JSON.stringify(newsMock(q.query, +q.start || 1, +q.display || 10));
    return { getResponseCode: () => 200, getContentText: () => body };
  }, fetchAll: reqs => reqs.map(r => g.UrlFetchApp.fetch(r.url, r)) };
  /* v29 모의 KIS 구성종목: 테마별 구성(국내 종목코드 6자리, 해외는 티커·영문명 또는 한글명), 현금 행 포함. g.MOCK_KIS_FAIL(code)=true 면 그 종목 오류, 첫 호출 1회 초당 한도 오류 */
  const KR = { 삼성전자: '005930', SK하이닉스: '000660', 삼성전자우: '005935', LG에너지솔루션: '373220', 현대차: '005380', 삼성바이오로직스: '207940', KB금융: '105560', 한화에어로스페이스: '012450', NAVER: '035420', 기아: '000270', 셀트리온: '068270', 신한지주: '055550' };
  const COMP = { '반도체': ['삼성전자', 'SK하이닉스', '삼성전자우'], '미국AI반도체': [['NVDA', 'NVIDIA CORP'], ['AVGO', '브로드컴'], ['TSM', 'TAIWAN SEMICONDUCTOR-SP ADR']], '미국나스닥100': [['NVDA', 'NVIDIA CORP'], ['AAPL', 'APPLE INC'], ['MSFT', 'MICROSOFT CORP'], ['AMZN', 'AMAZON.COM INC']],
    '미국S&P500': [['NVDA', 'NVIDIA CORP'], ['AAPL', 'APPLE INC'], ['MSFT', 'MICROSOFT CORP'], ['MU', 'MICRON TECHNOLOGY']], '200': ['삼성전자', 'SK하이닉스', 'LG에너지솔루션', '현대차', '삼성바이오로직스', 'KB금융'], '레버리지': ['삼성전자', 'SK하이닉스'],
    '2차전지': ['LG에너지솔루션', '삼성전자'], '자동차': ['현대차', '기아'], '헬스케어': ['삼성바이오로직스', '셀트리온'], '은행': ['KB금융', '신한지주'], '고배당': ['KB금융', '신한지주', '기아'], '코스닥150': ['셀트리온', 'NAVER'] };
  function kisMock(code, opt) {
    g.MOCK_KIS_CALLS = (g.MOCK_KIS_CALLS || 0) + 1;
    if (!opt || !opt.headers || !/^Bearer TOK/.test(opt.headers.authorization) || opt.headers.tr_id !== 'FHKST121600C0') return [500, JSON.stringify({ rt_cd: '1', msg_cd: 'X', msg1: 'bad header' })];
    if (g.MOCK_KIS_CALLS === 3 && !g.MOCK_KIS_LIMITED) { g.MOCK_KIS_LIMITED = 1; return [500, JSON.stringify({ rt_cd: '1', msg_cd: 'EGW00201', msg1: '초당 거래건수를 초과하였습니다.' })]; }
    if (g.MOCK_KIS_FAIL && g.MOCK_KIS_FAIL(code)) return [200, JSON.stringify({ rt_cd: '7', msg_cd: 'OPSQ0001', msg1: '조회할 자료가 없습니다' })];
    const e = ETFS.find(x => x.code === code); if (!e) return [200, JSON.stringify({ rt_cd: '0', output1: {}, output2: [] })];
    const list = COMP[e.th]; if (!list) return [200, JSON.stringify({ rt_cd: '0', msg1: '정상', output1: { etf_cnfg_issu_cnt: '0' }, output2: [] })];
    const comps = list.map((c, i) => Array.isArray(c) ? c : [KR[c], c]);
    const ws = comps.map((c, i) => 100 / (i + 1.5)), sw = ws.reduce((a, b) => a + b, 0) * 1.02;
    const out = comps.map((c, i) => ({ stck_shrn_iscd: c[0], hts_kor_isnm: c[1], stck_prpr: '1000', etf_cnfg_issu_rlim: (ws[i] / sw * 100).toFixed(2), etf_vltn_amt: String(Math.round(ws[i] * 1e6)), etf_cnfg_issu_avls: '0' }));
    out.push({ stck_shrn_iscd: 'KRD010010001', hts_kor_isnm: '원화예금', etf_cnfg_issu_rlim: '1.96', etf_vltn_amt: '1000' });
    return [200, JSON.stringify({ rt_cd: '0', msg_cd: 'MCA00000', msg1: '정상처리 되었습니다.', output1: { etf_cnfg_issu_cnt: String(out.length), nav: '10000' }, output2: out })];
  }
  /* v29 모의 네이버 DataLab(주 단위): 기준어 'ETF' ≈ 100, 그룹별 결정적 추세 · 뉴스: 검색어별 하루 n건(ETF 50건, 테마 2~6건) */
  function datalabMock(b) {
    g.MOCK_NAVER_DL = (g.MOCK_NAVER_DL || 0) + 1;
    const per = []; for (let d = new Date(b.startDate + 'T00:00:00'); d <= new Date(b.endDate + 'T00:00:00'); d = new Date(d.getTime() + 7 * 86400000)) per.push(d.toISOString().slice(0, 10));
    const h = s => { let x = 0; for (const c of s) x = (x * 31 + c.charCodeAt(0)) % 997; return x; };
    const res = b.keywordGroups.map(kg => ({ title: kg.groupName, keywords: kg.keywords, data: per.map((p, i) => ({ period: p, ratio: kg.groupName === 'ETF' ? 90 + (i % 3) * 5 : +(1 + h(kg.groupName) % 7 + (h(kg.groupName) % 2 ? i * 0.15 : -i * 0.03)).toFixed(5) })) }));
    const mx = Math.max.apply(null, res.map(r => Math.max.apply(null, r.data.map(d => d.ratio))));
    res.forEach(r => r.data.forEach(d => d.ratio = +(d.ratio / mx * 100).toFixed(5)));
    return { startDate: b.startDate, endDate: b.endDate, timeUnit: b.timeUnit, results: res };
  }
  function newsMock(query, start, display) {
    g.MOCK_NAVER_NEWS = (g.MOCK_NAVER_NEWS || 0) + 1;
    const qy = String(query).replace(/"/g, ''), perDay = (g.MOCK_NEWS_PERDAY && g.MOCK_NEWS_PERDAY[qy]) || (qy === 'ETF' ? 50 : 2 + (qy.length % 5)), total = perDay * 30, items = [];
    if (start > 1000) return { errorMessage: 'Invalid start value', errorCode: 'SE03' };
    const words = ['반도체', '방산', '원자력', '휴머노이드', '스테이블코인', '양자컴퓨터', '배당', '커버드콜', '조선'];
    for (let i = start - 1; i < Math.min(total, start - 1 + display); i++) {
      const t = new Date(Date.now() - i * 86400000 / perDay - 3600000);
      const w = words[i % words.length], w2 = i < perDay * 7 && i % 4 === 0 ? ' 스테이블코인' : '';
      items.push({ title: `<b>${qy}</b> ${w}${w2} 관련 상품에 자금 몰려`, originallink: 'https://news.example/' + qy + '/' + i, link: 'https://n.news/' + qy + '/' + i, description: '', pubDate: t.toUTCString().replace('GMT', '+0000') });
    }
    return { lastBuildDate: new Date().toUTCString(), total: total, start: start, display: items.length, items: items };
  }
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
