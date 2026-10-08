/**
 * Api.gs — 웹앱 진입점(doGet) 및 대시보드 데이터 API.
 *  클라이언트: google.script.run.api(action, params)
 *  새 탭 추가 시: 아래 ACTIONS 에 핸들러 1개 추가 (→ 탭추가_가이드.md)
 */
function doGet(e) {
  // 외부 프런트엔드(Vercel)용 JSON 엔드포인트: .../exec?action=meta&p={...}  — action 이 없으면 기존 웹앱 화면
  if (e && e.parameter && e.parameter.action) {
    let p = {}; try { p = JSON.parse(e.parameter.p || '{}'); } catch (err) {}
    return ContentService.createTextOutput(api(String(e.parameter.action), p)).setMimeType(ContentService.MimeType.JSON);
  }
  const t = HtmlService.createTemplateFromFile('Index');
  t.boot = bootEmbed_();   // v24: 첫 화면 자료(캐시에 있는 것만)를 페이지에 끼워 넣음 → 화면이 서버를 다시 부르지 않고 바로 그림
  return t.evaluate().setTitle('ETF Dashboard')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}
/** v34: FunETF 구성종목 반영(브라우저 즐겨찾기 버튼 → POST text/plain JSON). 비밀 토큰으로만 쓰기 허용(Kis.gs funImport_) */
function doPost(e) {
  let out;
  try { out = { ok: true, data: funImport_(JSON.parse((e && e.postData && e.postData.contents) || '{}')) }; }
  catch (err) { out = { ok: false, error: String((err && err.message) || err) }; }
  return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON);
}
function include(name) { return HtmlService.createHtmlOutputFromFile(name).getContent(); }

function api(action, params) {
  try {
    if (action === 'boot') return bootJson_(false);
    const fn = ACTIONS[action];
    if (!fn) throw new Error('알 수 없는 action: ' + action);
    // 응답 캐시(6시간): 적재·집계 때 캐시 버전이 바뀌므로 오래된 결과가 남지 않음. v24: 큰 응답(히트맵·변천)도 압축해 저장
    const cache = CacheService.getScriptCache(), P = PropertiesService.getScriptProperties().getProperties();
    const key = cacheKey_(action, params, P);
    const hit = getCached_(cache, key);
    if (hit) return action === 'meta' ? withLoadStatus_(hit, P) : hit;
    const out = JSON.stringify({ ok: true, data: fn(params || {}) });
    putCached_(cache, key, out);
    return action === 'meta' ? withLoadStatus_(out, P) : out;
  } catch (err) {
    return JSON.stringify({ ok: false, error: err.message });
  }
}

/** 캐시 세대: 응답 형식이나 계산 로직(Api.gs 핸들러)을 바꾸는 배포 때 올릴 것 → 배포 직후 이전 코드가 만든 캐시를 쓰지 않음 */
const CACHE_GEN_ = 'a26';   // v26: 개별 종목 유형 = 유형최종3 → 이전 캐시 전체 무효화
/** 캐시 키 = 세대 + 버전 + action + 파라미터 해시. v24: 파라미터는 키 이름순으로 직렬화(보내는 쪽의 키 순서와 무관하게 같은 키) */
function cacheKey_(action, params, P) {
  const h = md5_(stableStr_(params));   // v31: UTF-8(한글 파라미터 캐시 충돌 해소)
  P = P || PropertiesService.getScriptProperties().getProperties();
  const tv = action === 'theme' ? '.t' + (P[PROP.THEME_VER] || '0') : '';   // v29: 테마 규칙·기초지수명이 바뀌면 테마 맵만 새로 계산
  return CACHE_GEN_ + ':' + verFor_(action, params, P) + tv + ':' + action + ':' + h;
}
function stableStr_(p) { p = p || {}; return '{' + Object.keys(p).sort().filter(k => p[k] !== undefined).map(k => JSON.stringify(k) + ':' + JSON.stringify(p[k])).join(',') + '}'; }

/** v24: 캐시 버전 — 기준일이 있는 조회는 '그 기준일 이하 월'이 바뀐 경우에만 무효화(MONTH_VER), 그 밖(meta·race 등)은 적재·집계마다 무효화(CACHE_VER).
 *  → 10월 일자 적재 뒤에도 기본 기준일(전월말 9월) 조회는 캐시 유지. 기준일 조회의 결과는 그 기준일 이하 월의 자료로만 계산됨(Api.gs 각 핸들러) */
const DATE_SCOPED_ = { overview: 'date', byMgr: 'date', byType: 'date', treemap: 'date', shares: 'date', topEtf: 'date', newListings: 'date', turnover: 'to', theme: 'date' };
function verFor_(action, params, P) {
  // 전역 버전에는 현재 월(KST)을 붙임: meta 의 기본 기준일(전월말)·기준일 없는 조회는 날짜에 따라 달라지므로 월이 바뀌면 새로 계산(예열이 보존 기간을 계속 연장해도)
  const g = ((P && P[PROP.CACHE_VER]) || '0') + '.' + curYm_(), f = DATE_SCOPED_[action], d = f && params ? String(params[f] || '') : '';
  if (!/^\d{4}-\d{2}/.test(d)) return g;
  const mv = parseMonthVer_(P && P[PROP.MONTH_VER]); if (!mv) return g;
  const ym = d.slice(0, 7); let v = mv.f;
  Object.keys(mv.m).forEach(k => { if (k <= ym && mv.m[k] > v) v = mv.m[k]; });
  return 'm' + v;
}
function curYm_() { return Utilities.formatDate(new Date(), TZ, 'yyyy-MM'); }
function parseMonthVer_(s) { try { const o = JSON.parse(s || 'null'); return o && o.f ? { f: +o.f, m: o.m || {} } : null; } catch (e) { return null; } }
/** 데이터 변경 시 호출 → 이후 API 응답 캐시 무효화. yms(바뀐 월 목록 'yyyy-MM')를 주면 그 월 이후 기준일 조회만, 없으면 전부 무효화 */
function bumpCache_(yms) {
  try { SpreadsheetApp.flush(); } catch (e) {}   // 시트 쓰기를 먼저 확정 → 동시 조회가 '새 버전 + 이전 행'을 캐시에 남기지 않게
  const props = PropertiesService.getScriptProperties(), now = Math.max(Date.now(), (+props.getProperty(PROP.CACHE_VER) || 0) + 1);   // 항상 이전 버전보다 큼(같은 1ms 안 연속 호출 대비)
  props.setProperty(PROP.CACHE_VER, String(now));   // meta·race·블록 위치 캐시(bix:)는 항상 무효화
  let mv = parseMonthVer_(props.getProperty(PROP.MONTH_VER));
  const ks = (yms || []).map(k => String(k).slice(0, 7)).filter(k => /^\d{4}-\d{2}$/.test(k));
  if (!mv || !ks.length) mv = { f: now, m: {} };
  else ks.forEach(k => { mv.m[k] = now; });
  props.setProperty(PROP.MONTH_VER, JSON.stringify(mv));
}

/** v24: 응답 캐시 저장 — UTF-8 9만 바이트 미만은 그대로, 이상은 gzip+base64('z:'), 압축 후에도 9.5만 자를 넘으면 여러 키로 분할('zc:n' + key#0..n-1).
 *  CacheService 값 1개 한도 100KB(바이트 기준 — 한글 1자 = 3바이트이므로 글자 수로 판단하면 넘칠 수 있음) */
const CACHE_TTL_ = 21600, CACHE_PART_ = 95000;
function utf8Len_(s) { return s.length + (s.match(/[\u0080-\u07ff]/g) || []).length + (s.match(/[\u0800-\uffff]/g) || []).length * 2; }   // 대리쌍은 많게 셈(안전 측)
function putCached_(cache, key, out) {
  try {
    if (out.length < 30000 || utf8Len_(out) < 90000) { cache.put(key, out, CACHE_TTL_); return true; }
    const z = Utilities.base64Encode(Utilities.gzip(Utilities.newBlob('', 'application/json').setDataFromString(out, 'UTF-8')).getBytes());
    if (z.length < CACHE_PART_) { cache.put(key, 'z:' + z, CACHE_TTL_); return true; }
    const n = Math.ceil(z.length / CACHE_PART_); if (n > 20) return false;
    const parts = {}; for (let i = 0; i < n; i++) parts[key + '#' + i] = z.slice(i * CACHE_PART_, (i + 1) * CACHE_PART_);
    cache.putAll(parts, CACHE_TTL_); cache.put(key, 'zc:' + n, CACHE_TTL_);   // 머리 키는 조각 저장 뒤에
    return true;
  } catch (e) { console.log('캐시 저장 실패(' + key + '): ' + e.message); return false; }
}
/** 캐시 읽기(압축·분할 해제). raw: 이미 읽은 값(getAll 결과) */
function getCached_(cache, key, raw) {
  const v = raw === undefined ? cache.get(key) : raw;
  if (!v || v.charAt(0) !== 'z') return v || null;   // JSON 응답은 항상 '{' 로 시작
  try {
    let z;
    if (v.slice(0, 2) === 'z:') z = v.slice(2);
    else if (v.slice(0, 3) === 'zc:') {
      const n = +v.slice(3), ks = []; for (let i = 0; i < n; i++) ks.push(key + '#' + i);
      const got = cache.getAll(ks); if (ks.some(k => !got[k])) return null;   // 조각 유실 → 다시 계산
      z = ks.map(k => got[k]).join('');
    } else return null;
    return Utilities.ungzip(Utilities.newBlob(Utilities.base64Decode(z), 'application/x-gzip')).getDataAsString('UTF-8');
  } catch (e) { console.log('캐시 해제 실패(' + key + '): ' + e.message); return null; }
}
/** 여러 키 한 번에 읽기 → {key: json} (없는 키는 빠짐) */
function getCachedMany_(cache, keys) {
  const out = {}; if (!keys.length) return out;
  const got = cache.getAll(keys);
  keys.forEach(k => { if (got[k]) { const v = getCached_(cache, k, got[k]); if (v) out[k] = v; } });
  return out;
}
/** 예열(v24): 캐시에 있으면 같은 값을 다시 넣어 보존 기간(6시간)을 연장, 없으면 계산. 반환 'hit'|'put' */
function warmOne_(cache, action, params, P) {
  const key = cacheKey_(action, params, P), v = cache.get(key);
  if (!v) { api(action, params); return 'put'; }
  if (v.slice(0, 3) === 'zc:') {
    const n = +v.slice(3), ks = []; for (let i = 0; i < n; i++) ks.push(key + '#' + i);
    const got = cache.getAll(ks); if (ks.some(k => !got[k])) { cache.remove(key); api(action, params); return 'put'; }
    cache.putAll(got, CACHE_TTL_);
  }
  cache.put(key, v, CACHE_TTL_);
  return 'hit';
}

/** v24 점검용(편집기에서 실행): 큰 응답(히트맵·변천)의 압축 캐시 왕복·소요시간을 로그로 확인 */
function checkCacheV24() {
  const cache = CacheService.getScriptCache(), out = [];
  const sample = JSON.stringify({ ok: true, data: { s: '한글 ETF 이름 KODEX 미국S&P500 '.repeat(4000) } });
  putCached_(cache, 'v24test', sample); const back = getCached_(cache, 'v24test'); cache.remove('v24test');
  out.push('압축 왕복 ' + (back === sample ? '일치' : '불일치') + ' (' + sample.length + '자)');
  const m = JSON.parse(api('meta', {})).data;
  [['treemap', { date: m.defaultDate, ref: 'py' }], ['race', { n: 20 }]].forEach(x => {
    const t0 = Date.now(), a = api(x[0], x[1]), t1 = Date.now(), b = api(x[0], x[1]), t2 = Date.now();
    const raw = cache.get(cacheKey_(x[0], x[1])) || '';
    out.push(x[0] + ': 응답 ' + Math.round(a.length / 1024) + 'KB, 1회 ' + (t1 - t0) + 'ms, 2회 ' + (t2 - t1) + 'ms, 캐시 ' + (raw ? raw.slice(0, 3) + '… ' + Math.round(raw.length / 1024) + 'KB' : '없음') + (a === b ? '' : ' (응답 불일치)'));
  });
  console.log(out.join('\n'));
  return out;
}

/** v17: meta 응답에 최신 적재 상태를 덧붙임(캐시와 무관하게 매번 스크립트 속성에서 읽음) → 화면 상단 '최종 적재 · 미게시 사유 · 확인 시각' */
function withLoadStatus_(json, P) {
  try {
    const o = JSON.parse(json); if (!o.ok || !o.data) return json;
    P = P || PropertiesService.getScriptProperties().getProperties();
    o.data.lastLoaded = P[PROP.LAST_DAILY] || o.data.lastLoaded;
    try { o.data.loadStatus = JSON.parse(P[PROP.LOAD_STATUS] || 'null'); } catch (e) { o.data.loadStatus = null; }
    return JSON.stringify(o);
  } catch (e) { return json; }
}

/** v24: 첫 화면 묶음(boot) = meta + 기본 기준일의 탭별 기본 조회 중 '이미 캐시에 있는 것'만(새로 계산하지 않음).
 *  Apps Script 화면은 doGet 이 페이지에 끼워 넣고(window.BOOT), Vercel 화면은 첫 요청 1건으로 받음 → meta → 탭 자료로 이어지던 왕복을 줄임.
 *  cachedOnly: meta 도 캐시에 없으면 null(doGet 이 계산 때문에 늦어지지 않게) */
function bootJson_(cachedOnly) {
  const cache = CacheService.getScriptCache(), P = PropertiesService.getScriptProperties().getProperties();
  let mj = getCached_(cache, cacheKey_('meta', {}, P));
  if (mj) mj = withLoadStatus_(mj, P);
  else if (cachedOnly) return null;
  else mj = api('meta', {});
  const mo = JSON.parse(mj); if (!mo.ok) return mj;
  const m = mo.data, pre = [];
  if (m.defaultDate) {
    const list = bootList_(m.defaultDate), keys = list.map(x => cacheKey_(x[0], x[1], P)), got = getCachedMany_(cache, keys), head = '{"ok":true,"data":';
    list.forEach((x, i) => { const v = got[keys[i]]; if (v && v.indexOf(head) === 0) pre.push('[' + JSON.stringify(x[0]) + ',' + JSON.stringify(x[1]) + ',' + v.slice(head.length, -1) + ']'); });
  }
  return '{"ok":true,"data":{"meta":' + JSON.stringify(m) + ',"pre":[' + pre.join(',') + ']}}';
}
/** 기본 기준일 화면의 조회 목록 — '요약' 탭(Tabs.html)이 보내는 6건과 같은 파라미터. 운용사별·유형별·유형 비중·상위 ETF·신규상장 탭의 기본 조회도 겸함 */
function bootList_(date) {
  return [['byMgr', { date: date, ref: 'py' }], ['overview', { date: date }], ['byType', { date: date, ref: 'py' }], ['topEtf', { date: date }],
    ['newListings', { date: date, year: date.slice(0, 4), filter: 'exBond' }], ['shares', { date: date, mgr: '' }]];
}
/** doGet 용: boot 의 data({meta, pre})를 스크립트 태그 안에 넣을 수 있게 '<'·U+2028/2029 를 이스케이프. 실패·캐시 없음 → 'null'(화면이 직접 조회) */
function bootEmbed_() {
  try {
    const j = bootJson_(true), head = '{"ok":true,"data":';
    if (!j || j.indexOf(head) !== 0) return 'null';
    return j.slice(head.length, -1).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');   // {meta, pre} 만
  }
  catch (e) { console.log('boot 생성 실패: ' + e.message); return 'null'; }
}

const ACTIONS = {
  meta: apiMeta_,
  overview: apiOverview_,
  byMgr: apiByMgr_,
  byType: apiByType_,
  shares: apiShares_,
  topEtf: apiTopEtf_,
  race: apiRace_,
  newListings: apiNewListings_,
  treemap: apiTreemap_,
  turnover: apiTurnover_,
  theme: p => apiTheme_(p),  // v29: 테마 맵 (Theme.gs — 파일 실행 순서와 무관하게 호출 시점에 찾도록 함수로 감쌈)
  holders: p => apiHolders_(p),   // v29: 종목→ETF 찾기 (Kis.gs)
  buzz: p => apiBuzz_(p)          // v29: 관심도 (Buzz.gs)
};

// ─────────────────────────── 공통 ───────────────────────────

function aggRows_(name) { return readAll_(sheet_(name)); }
function aggMarket_() { return aggRows_(CFG.SHEET.AGG_MARKET).map(r => ({ ym: ymstr_(r[0]), date: dstr_(r[1]), nav: toNum_(r[2]), n: +r[3], k: toNum_(r[4]), s: toNum_(r[5]), q: toNum_(r[6]) })); }
function dstr_(v) { return v instanceof Date ? fmt_(v) : String(v); }
/** 시트가 '2021-01' 문자열을 날짜로 자동 변환하는 경우 대비 */
function ymstr_(v) { return v instanceof Date ? Utilities.formatDate(v, TZ, 'yyyy-MM') : String(v).slice(0, 7); }

/** 선택 가능한 기준일: 월말 스냅샷 일자 + 일별 일자 */
function availableDates_() {
  const months = aggMarket_();
  const daily = indexDates_();
  const set = {};
  months.forEach(m => set[m.date] = 'M');
  daily.forEach(d => set[d] = set[d] || 'D');
  return { dates: Object.keys(set).sort(), months: months.map(m => ({ ym: m.ym, date: m.date })) };
}

/** 기본 기준일 = 전월말(현재 월 직전 월의 스냅샷 일자) */
function defaultDate_(months) {
  const cur = ym_(fmt_(new Date()));
  const prev = months.filter(m => m.ym < cur);
  return prev.length ? prev[prev.length - 1].date : (months.length ? months[months.length - 1].date : null);
}
/** 기준일 → 전월말 스냅샷 일자, 전년말 스냅샷 일자 */
function refDates_(date, months) {
  const y = date.slice(0, 4), m = ym_(date);
  const prevM = months.filter(x => x.ym < m); const prevY = months.filter(x => x.ym < y + '-01');
  return { pm: prevM.length ? prevM[prevM.length - 1].date : null, py: prevY.length ? prevY[prevY.length - 1].date : null };
}

/** v19: 비교 기준 선택 — 'py' 전년말(기본) · 'pq' 전분기말 · 'pm' 전월말 · 'ly' 전년동월. refDates_ 결과의 py 를 바꿔 씀(필드명은 호환 유지) */
const REF_LABEL = { py: '전년말', pq: '전분기말', pm: '전월말', ly: '전년동월' };
function applyRef_(ref, date, months, mode) {
  mode = REF_LABEL[mode] ? mode : 'py';
  const ym = ym_(date), y = +ym.slice(0, 4), m = +ym.slice(5, 7);
  let base = null;
  if (mode === 'pm') base = ref.pm;
  else if (mode === 'pq') { const qs = ym.slice(0, 4) + '-' + ('0' + (Math.floor((m - 1) / 3) * 3 + 1)).slice(-2); const xs = months.filter(x => x.ym < qs); base = xs.length ? xs[xs.length - 1].date : null; }
  else if (mode === 'ly') { const t = (y - 1) + '-' + ('0' + m).slice(-2); const xs = months.filter(x => x.ym === t); base = xs.length ? xs[0].date : null; }
  if (mode !== 'py' && base) ref.py = base;
  ref.mode = base || mode === 'py' ? mode : 'py'; ref.label = REF_LABEL[ref.mode];
  return ref;
}

/** 특정일 스냅샷 레코드: 일별 블록 우선, 없으면 해당 월 스냅샷 */
const SNAP_MEMO_ = {};
function snapshot_(date) {
  if (SNAP_MEMO_[date]) return SNAP_MEMO_[date];
  let recs = readDailyBlock_(date);
  if (!recs) {
    // v24: raw_월말은 스크립트 속성의 월별 블록 위치(MONTHLY_MAP, 시트 행 수가 같을 때 유효)로 해당 범위만 읽음 → 5만여 행 A열 읽기 생략
    const sh = sheet_(CFG.SHEET.RAW_MONTHLY, CFG.RAW_HEADER), mm = monthlyMap_(sh)[ym_(date)];
    if (mm && mm[0] === date) { const xs = sh.getRange(mm[1], 1, mm[2] - mm[1] + 1, CFG.RAW_HEADER.length).getValues().map(rowToRec_).filter(r => r.date === date); if (xs.length) recs = xs; }
    if (!recs) {   // 위치 정보가 맞지 않으면 블록 위치 인덱스(캐시)로 — A열 전체 스캔은 데이터 버전당 1회
      const ix = monthlyIndex_()[date];
      if (ix) recs = sh.getRange(ix.start, 1, ix.count, CFG.RAW_HEADER.length).getValues().map(rowToRec_);
    }
  }
  if (!recs) throw new Error('해당 일자 데이터 없음: ' + date);
  SNAP_MEMO_[date] = recs;
  return recs;
}
/** 시트 A열(기준일자) 블록 인덱스 {date: {start, count}}. CACHE_VER 별 캐시(집계 재계산 시 자동 갱신) */
function blockIndex_(sheetName) {
  const cache = CacheService.getScriptCache();
  const key = 'bix:' + sheetName + ':' + (PropertiesService.getScriptProperties().getProperty(PROP.CACHE_VER) || '0');
  const hit = cache.get(key); if (hit) return JSON.parse(hit);
  const sh = sheet_(sheetName), lr = sh.getLastRow(), out = {};
  if (lr >= 2) {
    const col = sh.getRange(2, 1, lr - 1, 1).getValues();
    let cur = null;
    for (let i = 0; i < col.length; i++) { const d = dstr_(col[i][0]); if (d !== cur) { cur = d; out[d] = { start: i + 2, count: 0 }; } out[d].count++; }
  }
  try { cache.put(key, JSON.stringify(out), 21600); } catch (e) {}
  return out;
}
function monthlyIndex_() { return blockIndex_(CFG.SHEET.RAW_MONTHLY); }

/** 일자별 요약 행 [{mgr, top, f2, dom, nav, n}] — 일별 요약 우선, 없으면 월말 요약 (raw 를 읽지 않음) */
const SNAPROWS_MEMO_ = {};
function snapRows_(date) {
  if (SNAPROWS_MEMO_[date]) return SNAPROWS_MEMO_[date];
  let rows = null;
  [CFG.SHEET.AGG_SNAP_D, CFG.SHEET.AGG_SNAP_M].some(name => {
    const ix = blockIndex_(name)[date]; if (!ix) return false;
    rows = sheet_(name).getRange(ix.start, 1, ix.count, CFG.SNAP_HEADER.length).getValues().map(r => ({ mgr: String(r[1]), top: String(r[2]), f2: String(r[3]), dom: String(r[4]), nav: toNum_(r[5]), n: +r[6] || 0 }));
    return true;
  });
  if (!rows) {   // 요약 미생성 일자: raw 스냅샷으로 대체 (느림) → "일별 요약 재작성" 메뉴로 채울 것
    const ctx = ctx_();
    rows = summarize_(snapshot_(date), ctx, date).map(r => ({ mgr: String(r[1]), top: String(r[2]), f2: String(r[3]), dom: String(r[4]), nav: toNum_(r[5]), n: +r[6] || 0 }));
  }
  SNAPROWS_MEMO_[date] = rows;
  return rows;
}
function sumBy_(recs, keyFn) { const o = {}; recs.forEach(r => { const k = keyFn(r); o[k] = (o[k] || 0) + r.nav; }); return o; }
function cntBy_(recs, keyFn) { const o = {}; recs.forEach(r => { const k = keyFn(r); o[k] = (o[k] || 0) + (r.n || 1); }); return o; }
function chg_(cur, base) { return { amt: cur - (base || 0), pct: base ? (cur / base - 1) * 100 : null }; }
function topOf_(t) { return CFG.TOP5.indexOf(t) >= 0 ? t : '기타'; }

// ─────────────────────────── 핸들러 ───────────────────────────

function apiMeta_() {
  const av = availableDates_();
  const legend = mgrLegend_();
  const mgrs = Object.keys(legend).filter(k => CFG.TOP5.indexOf(legend[k].top) < 0).map(k => legend[k].short).filter((v, i, a) => a.indexOf(v) === i).sort();   // 개별 운용사 선택용: 상위 5개사 제외
  const last = PropertiesService.getScriptProperties().getProperty(PROP.LAST_DAILY);
  return {
    dates: av.dates, months: av.months, daily: indexDates_(), defaultDate: defaultDate_(av.months),
    dailyFrom: CFG.DAILY_FROM, top5: CFG.TOP5, colors: CFG.COLOR, typeOrder: CFG.TYPE_ORDER, mgrs: mgrs,
    lastLoaded: last, curMonth: last ? ym_(last) : ym_(fmt_(new Date())),
    holdingsDate: PropertiesService.getScriptProperties().getProperty(PROP.KIS_DATE) || null,   // v29: 종목→ETF 찾기 탭 표시(첫 수집 뒤)
    buzzDate: PropertiesService.getScriptProperties().getProperty(PROP.BUZZ_DATE) || null       // v29: 관심도 탭 표시(첫 수집 뒤)
  };
}

/** ETF 시장 개관 */
function apiOverview_(p) {
  const months = aggMarket_();
  const date = p.date || defaultDate_(months);
  const ym = ym_(date), y = ym.slice(0, 4);
  // 연도별: 각 연도 12월(없으면 그 해 마지막 월), 당해년도는 기준월
  const yearly = [];
  const years = months.map(m => m.ym.slice(0, 4)).filter((v, i, a) => a.indexOf(v) === i).filter(v => v <= y);
  years.forEach(yy => {
    const rows = months.filter(m => m.ym.slice(0, 4) === yy && (yy < y || m.ym <= ym));
    if (rows.length) { const r = rows[rows.length - 1]; yearly.push({ label: yy === y ? yy + '.' + ym.slice(5) : yy, ym: r.ym, date: r.date, nav: r.nav, n: r.n, k: r.k, s: r.s, q: r.q }); }
  });
  // 당해년도 월별: 전년말(기준점) + 당해년도 각 월
  const prevYE = months.filter(m => m.ym < y + '-01').pop() || null;
  const cur = months.filter(m => m.ym.slice(0, 4) === y && m.ym <= ym);
  const series = (prevYE ? [prevYE] : []).concat(cur);
  const monthly = series.map((m, i) => {
    const base = prevYE ? prevYE.nav : null, prev = i ? series[i - 1].nav : null;
    const pct = (a, b) => a && b ? (a / b - 1) * 100 : null;
    return Object.assign({}, m, { isBase: i === 0 && !!prevYE, ytd: chg_(m.nav, base), mom: chg_(m.nav, prev),
      navYtd: prevYE ? pct(m.nav, prevYE.nav) : null, kYtd: prevYE ? pct(m.k, prevYE.k) : null, sYtd: prevYE ? pct(m.s, prevYE.s) : null, qYtd: prevYE ? pct(m.q, prevYE.q) : null });
  });
  return { date: date, yearly: yearly, monthly: monthly, prevYE: prevYE };
}

/** 운용사별 NAV (상위 5개사 + 기타) — 일자별 요약 사용 */
function apiByMgr_(p) {
  const months = aggMarket_();
  const date = p.date || defaultDate_(months);
  const ref = applyRef_(refDates_(date, months), date, months, p.ref);
  const key = r => topOf_(r.top);
  const S = snapRows_(date), Py = ref.py ? snapRows_(ref.py) : [];
  const cur = sumBy_(S, key), pm = ref.pm ? sumBy_(snapRows_(ref.pm), key) : {}, py = sumBy_(Py, key);
  const tot = o => Object.keys(o).reduce((s, k) => s + o[k], 0);
  const total = tot(cur), totalPy = tot(py), totalPm = tot(pm);
  const groups = CFG.TOP5.concat(['기타']);
  const rows = groups.map(k => ({ mgr: k, nav: cur[k] || 0, ms: total ? (cur[k] || 0) / total * 100 : 0,
    navPy: py[k] || 0, msPy: totalPy ? (py[k] || 0) / totalPy * 100 : null, navPm: pm[k] || 0, msPm: totalPm ? (pm[k] || 0) / totalPm * 100 : null,
    ytd: chg_(cur[k] || 0, py[k]), mom: chg_(cur[k] || 0, pm[k]) }));
  // v24: M/S 변동 요인(증감률 비교)용 유형별 NAV — mix.mkt[유형] = [기준일, 비교 기준], mix.mgr[운용사][유형] = [기준일, 비교 기준]
  //      (v19~v23 의 '점유율 효과·구성 효과' 기여도 분해는 보고·실무용으로 이해가 어려워 제거)
  const kT = r => topOf_(r.top) + '|' + r.f2, cT = sumBy_(S, kT), pT = sumBy_(Py, kT);
  const allT = CFG.TYPE_ORDER.concat(Object.keys(cT).concat(Object.keys(pT)).map(k => k.split('|')[1]).filter((k, i, a) => CFG.TYPE_ORDER.indexOf(k) < 0 && a.indexOf(k) === i));
  const mix = { mkt: {}, mgr: {} };
  allT.forEach(t => { let c = 0, b = 0; groups.forEach(g => { c += cT[g + '|' + t] || 0; b += pT[g + '|' + t] || 0; }); if (c || b) mix.mkt[t] = [c, b]; });
  const types = allT.filter(t => mix.mkt[t]);
  groups.forEach(g => { const o = mix.mgr[g] = {}; types.forEach(t => { const c = cT[g + '|' + t] || 0, b = pT[g + '|' + t] || 0; if (c || b) o[t] = [c, b]; }); });
  // 월별 M/S 추이 (agg_운용사월별)
  const trend = {};
  aggRows_(CFG.SHEET.AGG_MGR).forEach(r => { const m = ymstr_(r[0]); if (m > ym_(date)) return; const t = trend[m] = trend[m] || {}; const g = topOf_(String(r[2])); t[g] = (t[g] || 0) + toNum_(r[3]); });
  return { date: date, ref: ref, refLabel: ref.label, total: total, totalPy: totalPy, totalPm: totalPm, rows: rows, mix: mix, types: types, trend: Object.keys(trend).sort().map(m => Object.assign({ ym: m }, trend[m])) };
}

/** 유형별 NAV — 일자별 요약 사용 */
function apiByType_(p) {
  const months = aggMarket_();
  const date = p.date || defaultDate_(months);
  const ref = applyRef_(refDates_(date, months), date, months, p.ref);
  const S = snapRows_(date), Pm = ref.pm ? snapRows_(ref.pm) : [], Py = ref.py ? snapRows_(ref.py) : [];
  const kT = r => r.f2, kD = r => r.dom;
  const cur = sumBy_(S, kT), pm = sumBy_(Pm, kT), py = sumBy_(Py, kT), curN = cntBy_(S, kT);
  const total = Object.keys(cur).reduce((s, k) => s + cur[k], 0), totalPy = Object.keys(py).reduce((s, k) => s + py[k], 0);
  const order = CFG.TYPE_ORDER.concat(Object.keys(cur).concat(Object.keys(py)).filter((k, i, a) => CFG.TYPE_ORDER.indexOf(k) < 0 && a.indexOf(k) === i));
  const rows = order.filter(k => cur[k] !== undefined || py[k] !== undefined).map(k => ({ type: k, nav: cur[k] || 0, n: curN[k] || 0, share: total ? (cur[k] || 0) / total * 100 : 0,
    navPy: py[k] || 0, sharePy: totalPy ? (py[k] || 0) / totalPy * 100 : null, ytd: chg_(cur[k] || 0, py[k]), mom: chg_(cur[k] || 0, pm[k]) }));
  const dom = sumBy_(S, kD), domPy = sumBy_(Py, kD), domPm = sumBy_(Pm, kD);
  const domRows = ['국내', '해외'].concat(Object.keys(dom).filter(k => k !== '국내' && k !== '해외')).filter(k => dom[k] !== undefined || domPy[k] !== undefined)
    .map(k => ({ dom: k, nav: dom[k] || 0, share: total ? (dom[k] || 0) / total * 100 : 0, navPy: domPy[k] || 0, sharePy: totalPy ? (domPy[k] || 0) / totalPy * 100 : null, ytd: chg_(dom[k] || 0, domPy[k]), mom: chg_(dom[k] || 0, domPm[k]) }));
  // 월별 유형 추이: 전년말 + 당해년도 각 월 (agg_유형월별)
  const y = date.slice(0, 4);
  const prevYE = months.filter(m => m.ym < y + '-01').pop();
  const wanted = (prevYE ? [prevYE.ym] : []).concat(months.filter(m => m.ym.slice(0, 4) === y && m.ym <= ym_(date)).map(m => m.ym));
  const trend = {};
  aggRows_(CFG.SHEET.AGG_TYPE).forEach(r => { const m = ymstr_(r[0]); if (wanted.indexOf(m) < 0) return; const t = trend[m] = trend[m] || {}; t[String(r[2])] = (t[String(r[2])] || 0) + toNum_(r[4]); });
  return { date: date, ref: ref, refLabel: ref.label, total: total, totalPy: totalPy, rows: rows, dom: domRows, trend: wanted.filter(m => trend[m]).map(m => Object.assign({ ym: m, isBase: prevYE && m === prevYE.ym }, trend[m])) };
}

/** 원 → 억원(소수 첫째 자리). v24 큰 응답(히트맵·변천) 축소용 — 화면은 조원 소수 첫째 자리로 표시하므로 정밀도 충분 */
function eok1_(v) { return Math.round(v / 1e7) / 10; }

/** 유형 > 개별 ETF 트리맵 (v14). 넓이 = 기준일 NAV, 증감 = 전년말(신규상장은 상장 이후) 대비 NAV 증가액
 *  v24: 행 배열 형식 rows[[종목명, 운용사, 상위구분, 유형, NAV(억원), 증감(억원|null), 신규상장이면 상장일 아니면 0]] (약 200KB → 60KB, 화면에서 복원) */
function apiTreemap_(p) {
  const months = aggMarket_();
  const date = p.date || defaultDate_(months);
  const ref = applyRef_(refDates_(date, months), date, months, p.ref);
  const ctx = ctx_();
  const cur = snapshot_(date), py = {};
  if (ref.py) snapshot_(ref.py).forEach(r => py[r.code] = r.nav);
  let total = 0;
  const rows = cur.filter(r => r.nav > 0).map(r => {
    const g = groupOf_(r, ctx), ld = listDdOf_(r.code, ctx), isNew = !!(ref.py && ld && ld > ref.py);
    const base = isNew ? 0 : (py[r.code] !== undefined ? py[r.code] : null);
    total += r.nav;
    return [String(r.name), g.short, g.top, g.f2, eok1_(r.nav), base === null ? null : eok1_(r.nav - base), isNew ? ld : 0];
  });
  return { date: date, ref: ref, refLabel: ref.label, total: total, unit: 1e8, cols: ['name', 'mgr', 'top', 'type', 'nav', 'chg', 'new'], rows: rows };
}

/** 상위 5개사 및 시장 전체의 유형별 비중 (+ 선택 운용사) — 일자별 요약 사용 */
function apiShares_(p) {
  const months = aggMarket_();
  const date = p.date || defaultDate_(months);
  const S = snapRows_(date);
  const groups = { '시장 전체': S };
  CFG.TOP5.forEach(t => groups[t] = S.filter(r => r.top === t));
  if (p.mgr) groups[p.mgr] = S.filter(r => r.mgr === p.mgr);
  const out = {};
  Object.keys(groups).forEach(g => {
    const s = sumBy_(groups[g], r => r.f2), n = cntBy_(groups[g], r => r.f2); const tot = Object.keys(s).reduce((a, k) => a + s[k], 0);
    const types = CFG.TYPE_ORDER.concat(Object.keys(s).filter(k => CFG.TYPE_ORDER.indexOf(k) < 0));
    out[g] = { total: tot, n: Object.keys(n).reduce((a, k) => a + n[k], 0), types: types.map(t => ({ type: t, nav: s[t] || 0, n: n[t] || 0, share: tot ? (s[t] || 0) / tot * 100 : 0 })) };
  });
  const mgrs = Object.keys(sumBy_(S, r => r.mgr)).sort();
  return { date: date, groups: out, mgrs: mgrs, selected: p.mgr || null };
}

/** 상위 ETF 50 */
function apiTopEtf_(p) {
  const months = aggMarket_();
  const date = p.date || defaultDate_(months);
  const ctx = ctx_();
  const recs = snapshot_(date).slice().sort((a, b) => b.nav - a.nav);
  const total = recs.reduce((s, r) => s + r.nav, 0);
  const top = recs.slice(0, CFG.TOP_N).map((r, i) => { const g = groupOf_(r, ctx); return { rank: i + 1, code: r.code, name: r.name, mgr: g.short, top: g.top, type: g.f3, nav: r.nav, share: total ? r.nav / total * 100 : 0 }; });
  const topTotal = top.reduce((s, t) => s + t.nav, 0);
  const byMgr = CFG.TOP5.concat(['기타']).map(k => { const xs = top.filter(t => t.top === k); const nav = xs.reduce((s, t) => s + t.nav, 0); return { top: k, n: xs.length, nav: nav, share: topTotal ? nav / topTotal * 100 : 0 }; });
  return { date: date, total: total, topTotal: topTotal, top: top, byMgr: byMgr };
}

/** bar chart race 자료: 월별 상위 N (agg_상위ETF월별)
 *  v24: 행 배열 rows[[순위, 종목코드, 종목명, 상위구분, NAV(억원), 채권/금리 1|0, 유형]] — 유형 추가(상위 N 내 유형별 M/S 막대), 크기 축소(약 150KB → 70KB)
 *  v26: 유형 = 유형최종3(파생형 중 신규상장용 '채권/금리' → 채권형). KOFR·CD금리 액티브(합성)가 파생형으로 잡혀 파생형 비중이 커 보이던 착시 해소 */
function apiRace_(p) {
  const n = +p.n || 10;
  const out = {}, types = typeLegend_();
  const isBond = c => { const t = types[c]; return !!t && (t.neu === '채권/금리' || t.f2 === '채권'); };   // 채권/금리형 → 회색 표시용
  aggRows_(CFG.SHEET.AGG_TOP).forEach(r => { const k = ymstr_(r[0]); if (+r[1] <= n) { const c = padCode_(r[2]); (out[k] = out[k] || []).push([+r[1], c, String(r[3]), String(r[5]), eok1_(toNum_(r[6])), isBond(c) ? 1 : 0, (types[c] && (types[c].f3 || types[c].f2)) || '미분류']); } });
  return { unit: 1e8, cols: ['rank', 'code', 'name', 'top', 'nav', 'bond', 'type'], frames: Object.keys(out).sort().map(k => ({ ym: k, rows: out[k] })) };
}

/** 신규상장 ETF (기준일자 연도에 상장된 종목의 기준일자 NAV). 상장일 = ETF마스터 상장일 → 범례_유형 설정일 */
function apiNewListings_(p) {
  const months = aggMarket_();
  const date = p.date || defaultDate_(months);
  const year = p.year || date.slice(0, 4);
  const ctx = ctx_();
  const recs = snapshot_(date);
  const nav = {}; recs.forEach(r => nav[r.code] = r.nav);
  const codes = Object.keys(ctx.master).concat(Object.keys(ctx.types)).filter((c, i, a) => a.indexOf(c) === i);
  let items = codes.map(c => ({ c: c, ld: listDdOf_(c, ctx) })).filter(x => x.ld.slice(0, 4) === year && x.ld <= date).map(x => {
    const m = ctx.master[x.c], t = ctx.types[x.c];
    const g = groupOf_({ code: x.c, name: (m && m.name) || (t && t.name) || '', mgr: m ? m.mgr : '' }, ctx);
    return { code: x.c, name: (m && m.name) || (t && t.name) || x.c, listDd: x.ld, mgr: g.short, top: g.top, type: g.f3, neu: g.neu, nav: nav[x.c] || 0, listed: nav[x.c] !== undefined };
  });
  if ((p.filter || 'exBond') === 'exBond') items = items.filter(i => i.neu !== '채권/금리');
  items.sort((a, b) => b.nav - a.nav);
  const byMgr = {};
  items.forEach(i => { const b = byMgr[i.mgr] = byMgr[i.mgr] || { top: i.top, n: 0, nav: 0 }; b.n++; b.nav += i.nav; });
  const rows = Object.keys(byMgr).map(k => Object.assign({ mgr: k }, byMgr[k])).sort((a, b) => b.nav - a.nav);
  const noDate = codes.filter(c => !listDdOf_(c, ctx)).length;
  return { date: date, year: year, filter: p.filter || 'exBond', items: items, byMgr: rows, total: items.reduce((s, i) => s + i.nav, 0), noDate: noDate };
}

/** 거래대금 상위 50 (from~to). 일별 누적컬럼 차분으로 계산 → 대용량 스캔 불필요 */
function apiTurnover_(p) {
  const dates = indexDates_();
  if (!dates.length) throw new Error('일별 데이터가 없습니다 (backfillDaily 필요)');
  const months = aggMarket_();
  const def = defaultDate_(months);
  const to = p.to || (def >= dates[0] ? def : dates[dates.length - 1]);
  let from = p.from;
  if (!from) { const ref = refDates_(to, months); from = ref.py && ref.py >= dates[0] ? fmt_(addDays_(parse_(ref.py), 1)) : dates[0]; }
  if (from < dates[0]) throw new Error('일별 거래대금은 ' + dates[0] + ' 이후만 조회 가능합니다 (그 이전은 월말 스냅샷만 보유)');
  const inRange = dates.filter(d => d >= from && d <= to);
  if (!inRange.length) throw new Error('구간 내 영업일 없음');
  const ctx = ctx_();
  const sum = {}, names = {};
  // 연도별로 [구간 마지막일 ytd] − [구간 시작 직전일 ytd]
  const years = inRange.map(d => d.slice(0, 4)).filter((v, i, a) => a.indexOf(v) === i);
  years.forEach(y => {
    const ds = inRange.filter(d => d.slice(0, 4) === y);
    const endBlk = readDailyBlock_(ds[ds.length - 1]);
    const before = dates.filter(d => d < ds[0] && d.slice(0, 4) === y).pop();
    const startBlk = before ? readDailyBlock_(before) : [];
    const sm = {}; startBlk.forEach(r => sm[r.code] = r.ytd);
    endBlk.forEach(r => { sum[r.code] = (sum[r.code] || 0) + r.ytd - (sm[r.code] || 0); names[r.code] = r; });
  });
  const days = inRange.length;
  // v19: 회전율 = 구간 거래대금 ÷ 구간 말일 NAV (배)
  const top = Object.keys(sum).map(c => { const r = names[c], g = groupOf_(r, ctx); return { code: c, name: r.name, mgr: g.short, top: g.top, type: g.f3, sum: sum[c], avg: sum[c] / days, nav: r.nav, turn: r.nav ? sum[c] / r.nav : null }; })
    .sort((a, b) => b.sum - a.sum).slice(0, CFG.TOP_N).map((r, i) => Object.assign({ rank: i + 1 }, r));
  const marketSum = Object.keys(sum).reduce((s, c) => s + sum[c], 0);
  return { from: from, to: to, days: days, top: top, marketSum: marketSum };   // v24: dailyDates(전체 일별 일자, 화면 미사용) 제외 → 결과가 'to' 이하 월 자료로만 정해져 월 단위 캐시 버전 적용
}
