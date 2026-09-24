/**
 * Load.gs — 범례/마스터 관리, 일별 적재, 월말 스냅샷, 인덱스
 */

// ─────────────────────────── 범례·마스터 ───────────────────────────

/** 범례_운용사 헤더 → 컬럼 인덱스 (헤더명 기준, 없으면 CFG.MGR_COL 기본값). 사용자가 열을 추가·이동해도 동작 */
function mgrCols_(sh) {
  const lc = Math.max(sh.getLastColumn(), 1);
  const h = sh.getRange(1, 1, 1, lc).getValues()[0].map(v => String(v).trim());
  const f = (name, dflt) => { const i = h.indexOf(name); return i >= 0 ? i : dflt; };
  return { FULL: f('운용사명', CFG.MGR_COL.FULL), BRAND: f('브랜드', -1), KOR: f('약식_한글', CFG.MGR_COL.KOR),
           SHORT: f('약식_정식', CFG.MGR_COL.SHORT), TOP: f('약식_상위', CFG.MGR_COL.TOP), TOP_FULL: f('운용사명_상위', CFG.MGR_COL.TOP_FULL), width: Math.max(lc, 5) };
}

/** 범례_운용사 → { 운용사명: {full, kor, short, top, topFull, brands[]} } (브랜드별 다중 행은 한 운용사로 합침) */
function mgrLegend_() {
  const sh = sheet_(CFG.SHEET.MGR_LEGEND), C = mgrCols_(sh), out = {};
  readAll_(sh).forEach(r => {
    const full = String(r[C.FULL] || '').trim();
    if (!full) return;
    const brands = C.BRAND >= 0 ? String(r[C.BRAND] || '').split(/[,\/;|]+/).map(x => x.trim()).filter(Boolean) : [];
    const e = out[full] = out[full] || { full: full, kor: String(r[C.KOR] || ''), short: String(r[C.SHORT] || full), top: String(r[C.TOP] || '기타'), topFull: r[C.TOP_FULL], brands: [] };
    brands.forEach(b => { if (e.brands.indexOf(b) < 0) e.brands.push(b); });
  });
  return out;
}

/** 범례 역조회표: 운용사명·약식_정식·약식_한글·브랜드(대문자) → 범례 항목 */
function mgrLookup_(mgrs) {
  const byName = {}, byBrand = {};
  Object.keys(mgrs).forEach(full => {
    const e = mgrs[full];
    [full, e.short, e.kor].forEach(k => { k = String(k || '').trim(); if (k && !byName[k]) byName[k] = e; });
    e.brands.forEach(b => byBrand[b.toUpperCase()] = e);
  });
  Object.keys(CFG.BRAND_MAP).forEach(b => { const e = mgrs[CFG.BRAND_MAP[b]]; if (e && !byBrand[b.toUpperCase()]) byBrand[b.toUpperCase()] = e; });
  return { byName: byName, byBrand: byBrand };
}

/**
 * 종목 → 범례_운용사 항목. 우선순위: ETF마스터 브랜드열 → ETF마스터 운용사명(운용사명/약식_정식/약식_한글 중 일치) → 종목명 접두 브랜드
 * 반환 {full, short, top, kor, brands} 또는 null
 */
function resolveMgr_(code, name, ctx) {
  const m = ctx.master[code], L = ctx.lookup;
  if (m) {
    if (m.brand && L.byBrand[String(m.brand).trim().toUpperCase()]) return L.byBrand[String(m.brand).trim().toUpperCase()];
    if (m.mgr && L.byName[String(m.mgr).trim()]) return L.byName[String(m.mgr).trim()];
  }
  const full = mgrFromBrand_(name || (m && m.name) || '', ctx);
  return full && ctx.mgrs[full] ? ctx.mgrs[full] : null;
}

/** 브랜드(대문자) → 운용사명. 범례_운용사 '브랜드' 열 우선, 없으면 CFG.BRAND_MAP */
function brandMap_(mgrs) {
  const out = {};
  Object.keys(CFG.BRAND_MAP).forEach(b => out[b.toUpperCase()] = CFG.BRAND_MAP[b]);
  Object.keys(mgrs || {}).forEach(full => (mgrs[full].brands || []).forEach(b => out[b.toUpperCase()] = full));
  return out;
}

/** 범례_유형 → { code: {name, listDd, f1, f2, dom, neu} } */
function typeLegend_() {
  const C = CFG.TYPE_COL, out = {};
  readAll_(sheet_(CFG.SHEET.TYPE_LEGEND)).forEach(r => {
    const code = padCode_(r[C.CODE]);
    if (!code || code === '000000') return;
    out[code] = { name: r[C.NAME], listDd: r[C.LIST_DD] instanceof Date ? fmt_(r[C.LIST_DD]) : String(r[C.LIST_DD] || ''),
                  f1: r[C.F1], f2: r[C.F2], dom: r[C.DOM], neu: r[C.NEW] };
  });
  return out;
}

/** ETF마스터 헤더 → 열 인덱스 (사용자가 열을 바꿔도 헤더명으로 인식) */
function masterCols_(sh) {
  return hdrCols_(sh, { CODE: '종목코드', NAME: '종목명', MGR: '운용사명', BRAND: '브랜드', LIST_DD: '상장일', MKT: '기초시장', ASSET: '기초자산', SRC: '출처' });
}
/** ETF마스터 → { code: {name, mgr, brand, listDd, mkt, asset, src} } */
function master_() {
  const sh = sheet_(CFG.SHEET.MASTER, CFG.MASTER_HEADER), C = masterCols_(sh), out = {};
  const g = (r, i) => i >= 0 ? r[i] : '';
  readAll_(sh).forEach(r => {
    const code = padCode_(g(r, C.CODE)); if (!code || code === '000000') return;
    const ld = g(r, C.LIST_DD);
    out[code] = { name: g(r, C.NAME), mgr: String(g(r, C.MGR) || '').trim(), brand: String(g(r, C.BRAND) || '').trim(),
                  listDd: ld instanceof Date ? fmt_(ld) : String(ld || '').slice(0, 10), mkt: g(r, C.MKT), asset: g(r, C.ASSET), src: g(r, C.SRC) };
  });
  return out;
}

/** 종목명 접두어(브랜드)로 운용사 추정. 범례_운용사 브랜드 열 → CFG.BRAND_MAP 순. 가장 긴 브랜드 우선 */
function mgrFromBrand_(name, ctx) {
  const n = String(name || '').trim().toUpperCase(), first = n.split(/\s+/)[0];
  const brands = (ctx && ctx.brands) || brandMap_(null);
  let best = '';
  Object.keys(brands).forEach(b => { if ((n === b || n.startsWith(b + ' ')) && b.length > best.length) best = b; });   // 1) 브랜드 = 첫 토큰(공백 포함 브랜드 허용)
  if (!best) Object.keys(brands).forEach(b => { if (b.length >= 3 && first.startsWith(b) && b.length > best.length) best = b; });  // 2) 첫 토큰이 브랜드로 시작 (TIME → TIMEFOLIO)
  return best ? brands[best] : '';
}

/** 규칙 기반 유형 부여 → {f1, f2, dom, neu} */
function inferType_(name, mkt, asset) {
  const n = String(name || ''), a = String(asset || ''), m = String(mkt || '');
  const dom = (/해외|글로벌|미국|중국|차이나|일본|인도|유럽|베트남|선진|신흥|S&P|나스닥|NASDAQ|다우|니케이|TOPIX|CSI|항셍|HSCEI|MSCI/i.test(n) || /해외/.test(m)) && !/국내/.test(m) ? '해외' : '국내';
  let f2;
  if (/혼합/.test(n) || /혼합/.test(a)) f2 = '혼합채권형';
  else if (/레버리지|인버스|선물|합성|커버드콜|2X|3X/i.test(n)) f2 = '파생형';
  else if (/채권|국채|회사채|통안채|금리|KOFR|CD|SOFR|단기자금|머니마켓|MMF|은행채|국고채/i.test(n) || /채권/.test(a)) f2 = '채권형';
  else if (/원자재|부동산|통화|특별자산/.test(a) || /실물|리츠|달러|엔화|위안|골드|금현물/.test(n)) f2 = '기타';
  else f2 = (dom === '해외') ? '해외주식형' : '국내주식형';
  const f1 = f2 === '국내주식형' || f2 === '해외주식형' ? '주식형' : f2 === '채권형' ? '채권형' : '기타';
  const neu = (f2 === '채권형' || (f2 === '파생형' && /채권|국채|금리|달러|KOFR|CD/i.test(n))) ? '채권/금리' : '주식 등';
  return { f1: f1, f2: f2, dom: dom, neu: neu };
}

/**
 * 신규 종목/운용사 반영.
 * - ETF마스터에 없는 종목: data.krx.co.kr 전종목 기본정보 조회(1회) → 없으면 브랜드 접두어로 운용사 추정
 * - 범례_유형에 없는 종목: 규칙 기반 유형 + '확인필요' 표시(L열)
 * - 범례_운용사에 없는 운용사: 약식=운용사명(‘자산운용’ 제거), 상위='기타' 로 추가
 */
function ensureMaster_(records, ctx, asOf) {
  const master = ctx.master, types = ctx.types, mgrs = ctx.mgrs;
  const newCodes = records.filter(r => !master[r.code]);
  if (!newCodes.length) return;
  let basic = ctx.basic;
  if (!basic) {   // 실행 1회당 1번만 웹 조회
    try { basic = fetchEtfBasic_(); } catch (e) { basic = {}; log_('ETF 기본정보 웹조회 실패 → 브랜드 접두어로 대체: ' + e.message, 'WARN'); }
    ctx.basic = basic;
  }

  const shM = sheet_(CFG.SHEET.MASTER, CFG.MASTER_HEADER), CM = masterCols_(shM);
  ensureCol_(shM, CM, 'LIST_DD', '상장일');
  const shT = sheet_(CFG.SHEET.TYPE_LEGEND);
  const shG = sheet_(CFG.SHEET.MGR_LEGEND);
  const mRows = [], tRows = [], gRows = [];

  newCodes.forEach(r => {
    const b = basic[r.code];
    // 운용사: 종목명 브랜드(범례) → 웹 기본정보 운용사명 순
    const brandFull = mgrFromBrand_(r.name, ctx);
    let entry = brandFull ? mgrs[brandFull] : null;
    let src = entry ? '범례_운용사' : '';
    let webMgr = b ? String(b.mgr || '').trim() : '';
    if (!entry && webMgr) { entry = ctx.lookup.byName[webMgr] || null; src = 'KRX웹'; }
    const listDd = (b && b.listDd) || (types[r.code] && types[r.code].listDd) || asOf || '';
    const brand = entry ? (entry.brands.find(x => String(r.name).toUpperCase().startsWith(x.toUpperCase())) || entry.brands[0] || '') : String(r.name).split(/\s+/)[0];
    const mgrText = entry ? entry.short : (webMgr || '미확인');
    master[r.code] = { name: r.name, mgr: mgrText, brand: brand, listDd: listDd, mkt: b ? b.mkt : '', asset: b ? b.asset : '', src: src || (webMgr ? 'KRX웹' : '미확인') };
    const row = new Array(CM.width).fill('');
    row[CM.CODE] = r.code; if (CM.NAME >= 0) row[CM.NAME] = r.name; if (CM.MGR >= 0) row[CM.MGR] = mgrText; if (CM.BRAND >= 0) row[CM.BRAND] = brand;
    if (CM.LIST_DD >= 0) row[CM.LIST_DD] = listDd; if (CM.MKT >= 0) row[CM.MKT] = b ? b.mkt : ''; if (CM.ASSET >= 0) row[CM.ASSET] = b ? b.asset : ''; if (CM.SRC >= 0) row[CM.SRC] = master[r.code].src;
    mRows.push(row);

    if (!types[r.code]) {
      const t = inferType_(r.name, b ? b.mkt : '', b ? b.asset : '');
      types[r.code] = { name: r.name, listDd: listDd, f1: t.f1, f2: t.f2, dom: t.dom, neu: t.neu };
      // 범례_유형 컬럼: 종목코드/ETF명/설정일/유형1/유형2/유형3/유형4/유형최종1/유형최종2/국내해외/신규상장용/확인필요
      tRows.push([r.code, r.name, listDd, t.f2, t.f2, t.f1, '', t.f1, t.f2, t.dom, t.neu, '확인필요']);
    }
    if (!entry && webMgr && !mgrs[webMgr]) {   // 범례에 없는 새 운용사 → 상위 '기타' 로 추가 (사용자 검토)
      const short = webMgr.replace(/자산운용|투자신탁운용|에셋/g, '') || webMgr;
      mgrs[webMgr] = { full: webMgr, kor: short, short: short, top: '기타', topFull: '기타 운용사', brands: [brand] };
      ctx.lookup = mgrLookup_(mgrs);
      const C = mgrCols_(shG), grow = new Array(C.width).fill('');
      grow[C.FULL] = webMgr; if (C.BRAND >= 0) grow[C.BRAND] = brand; grow[C.KOR] = short; grow[C.SHORT] = short; grow[C.TOP] = '기타'; grow[C.TOP_FULL] = '기타 운용사';
      gRows.push(grow);
    }
  });
  if (mRows.length) appendRows_(shM, mRows);
  if (tRows.length) {
    if (shT.getLastColumn() < 12) shT.getRange(1, 12).setValue('확인필요');
    appendRows_(shT, tRows);
  }
  if (gRows.length) appendRows_(shG, gRows);
  log_('신규 종목 ' + mRows.length + '건, 유형 추가 ' + tRows.length + '건, 운용사 추가 ' + gRows.length + '건');
}

/** 종목코드 → 표시용 운용사 약식(약식_정식) */
function mgrShortOf_(code, ctx, name) {
  const e = resolveMgr_(code, name, ctx);
  if (e) return e.short;
  const m = ctx.master[code];
  return m && m.mgr ? m.mgr : '미확인';
}
/** 종목 상장일: ETF마스터 상장일 → 범례_유형 설정일 → '' */
function listDdOf_(code, ctx) {
  const m = ctx.master[code], t = ctx.types[code];
  return (m && m.listDd) || (t && t.listDd) || '';
}

function ctx_() {
  const mgrs = mgrLegend_();
  return { master: master_(), types: typeLegend_(), mgrs: mgrs, lookup: mgrLookup_(mgrs), brands: brandMap_(mgrs) };
}

/**
 * 보정: ETF마스터 상장일이 없는 종목에 범례_유형 설정일 → raw 최초 등장일(월말 스냅샷·일별) 을 채움.
 * 상장일 열이 없으면 ETF마스터 끝에 추가. 신규상장 탭은 이 값을 사용
 */
function repairListDates() {
  const ctx = ctx_();
  const shM = sheet_(CFG.SHEET.MASTER, CFG.MASTER_HEADER), CM = masterCols_(shM);
  ensureCol_(shM, CM, 'LIST_DD', '상장일');
  const vals = readAll_(shM);
  const need = {};
  vals.forEach((r, i) => { const code = padCode_(r[CM.CODE]); const cur = r[CM.LIST_DD]; if (!cur) need[code] = i; });
  let fromType = 0, fromRaw = 0;
  // 1) 범례_유형 설정일
  Object.keys(need).forEach(code => { const t = ctx.types[code]; if (t && t.listDd) { vals[need[code]][CM.LIST_DD] = t.listDd; delete need[code]; fromType++; } });
  // 2) raw 최초 등장일: 월말 스냅샷(A,B열) → 해당 월이 일별 구간이면 일별 블록으로 정밀화
  if (Object.keys(need).length) {
    const first = {};
    const shMo = sheet_(CFG.SHEET.RAW_MONTHLY, CFG.RAW_HEADER), lr = shMo.getLastRow();
    if (lr >= 2) shMo.getRange(2, 1, lr - 1, 2).getValues().forEach(v => { const d = v[0] instanceof Date ? fmt_(v[0]) : String(v[0]); const c = padCode_(v[1]); if (need[c] !== undefined && (!first[c] || d < first[c])) first[c] = d; });
    const ix = indexMap_(), dailyDates = Object.keys(ix).sort();
    const shD = sheet_(CFG.SHEET.RAW_DAILY, CFG.RAW_HEADER);
    const seen = {};
    dailyDates.forEach(d => {
      const b = ix[d];
      shD.getRange(b.start, 2, b.count, 1).getValues().forEach(v => { const c = padCode_(v[0]); if (need[c] !== undefined && !seen[c]) seen[c] = d; });
    });
    Object.keys(need).forEach(code => {
      let d = first[code] || '';
      if (seen[code] && (!d || seen[code] <= d || ym_(seen[code]) === ym_(d))) d = seen[code];   // 일별 최초 등장일이 있으면 우선
      if (d) { vals[need[code]][CM.LIST_DD] = d; fromRaw++; }
    });
  }
  if (vals.length) shM.getRange(2, 1, vals.length, CM.width).setValues(vals.map(r => { while (r.length < CM.width) r.push(''); return r.slice(0, CM.width); }));
  bumpCache_();
  log_('상장일 보정: 범례_유형 ' + fromType + '건, raw 최초등장 ' + fromRaw + '건');
}

/**
 * 보정: 운용사 '미확인'/공란 종목을 범례_운용사 브랜드 열로 재추정 → ETF마스터·raw_일별·raw_월말 운용사 컬럼 갱신 후 집계 재계산.
 * 범례_운용사에 브랜드를 추가·수정한 뒤 메뉴에서 실행
 */
function repairUnknownMgr() {
  const ctx = ctx_();
  const shM = sheet_(CFG.SHEET.MASTER, CFG.MASTER_HEADER), CM = masterCols_(shM);
  const vals = readAll_(shM);
  let fixed = 0, still = [];
  vals.forEach(r => {
    const code = padCode_(r[CM.CODE]);
    const e = resolveMgr_(code, r[CM.NAME], ctx);
    if (!e) { still.push(r[CM.NAME]); return; }
    const cur = String(r[CM.MGR] || '').trim();
    if (cur !== e.short) { r[CM.MGR] = e.short; if (CM.SRC >= 0 && (!cur || cur === '미확인')) r[CM.SRC] = '범례_운용사'; fixed++; }
    if (CM.BRAND >= 0 && !r[CM.BRAND]) { const b = e.brands.find(x => String(r[CM.NAME]).toUpperCase().startsWith(x.toUpperCase())); if (b) r[CM.BRAND] = b; }
  });
  if (vals.length) shM.getRange(2, 1, vals.length, vals[0].length).setValues(vals);
  // raw 시트 D열(자산운용사): 약식_정식으로 통일
  let rawFixed = 0;
  const ctx2 = ctx_();
  [CFG.SHEET.RAW_DAILY, CFG.SHEET.RAW_MONTHLY].forEach(name => {
    const sh = sheet_(name, CFG.RAW_HEADER), lr = sh.getLastRow(); if (lr < 2) return;
    const codes = sh.getRange(2, 2, lr - 1, 1).getValues(), mg = sh.getRange(2, 4, lr - 1, 1).getValues();
    let changed = false;
    for (let i = 0; i < mg.length; i++) {
      const s = mgrShortOf_(padCode_(codes[i][0]), ctx2);
      if (s !== '미확인' && String(mg[i][0]) !== s) { mg[i][0] = s; changed = true; rawFixed++; }
    }
    if (changed) sh.getRange(2, 4, lr - 1, 1).setValues(mg);
  });
  if (fixed || rawFixed) rebuildAggregates_();
  log_('운용사 보정: 마스터 ' + fixed + '건, raw ' + rawFixed + '행 갱신' + (still.length ? ' / 미확인: ' + still.slice(0, 20).join(', ') + (still.length > 20 ? ' 외 ' + (still.length - 20) + '건' : '') : ''), still.length ? 'WARN' : 'INFO');
  return { fixed: fixed, rawFixed: rawFixed, still: still };
}

// ─────────────────────────── 일별 인덱스 ───────────────────────────

/** _index 시트: 기준일자 | 시작행 | 행수 */
function indexMap_() {
  const out = {};
  readAll_(sheet_(CFG.SHEET.META, ['기준일자', '시작행', '행수'])).forEach(r => {
    const d = r[0] instanceof Date ? fmt_(r[0]) : String(r[0]);
    out[d] = { start: +r[1], count: +r[2] };
  });
  return out;
}
function indexDates_() { return Object.keys(indexMap_()).sort(); }

/** raw_일별에서 특정일 블록 읽기 → 표준 레코드 배열 */
function readDailyBlock_(dateStr) {
  const ix = indexMap_()[dateStr]; if (!ix) return null;
  const vals = sheet_(CFG.SHEET.RAW_DAILY).getRange(ix.start, 1, ix.count, CFG.RAW_HEADER.length).getValues();
  return vals.map(rowToRec_);
}
function rowToRec_(v) {
  return { date: v[0] instanceof Date ? fmt_(v[0]) : String(v[0]), code: padCode_(v[1]), name: v[2], mgr: v[3],
           nav: toNum_(v[4]), trdval: toNum_(v[5]), ytd: toNum_(v[6]), mtd: toNum_(v[7]) };
}

// ─────────────────────────── 일별 적재 ───────────────────────────

/** 매일 트리거 진입점 (08:30 / 19:00 KST). 미적재 KRX 영업일을 어제까지 순차 적재 (v17 재작성)
 *  - KRX 부터 조회: 적재할 자료가 없으면(미게시·휴장) 시트를 읽지 않고 곧바로 종료 → 시간 초과·트리거 실행시간 절약
 *  - 빈 응답 일자 판정: 휴장일 목록(CFG.KRX_HOLIDAYS), 또는 '뒤 영업일 자료 게시 + 그날 KOSPI 일봉 없음' → 휴장으로 건너뜀.
 *    그 밖의 경우는 절대 건너뛰지 않고 '미게시'로 멈춘 뒤 다음 실행에서 다시 확인 (v16 까지는 '3일 지난 빈 응답 = 휴장' 어림 규칙)
 *  - 결과는 LOAD_STATUS 에 남겨 화면 상단에 표시 (예: '09-23(수)분 KRX 미게시 — 추석 연휴(09-24~09-25) 휴장, 09-28(월) 오전 게시 예상') */
function loadDaily() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) { console.log('다른 적재 실행 중 → 이번 실행 생략'); return; }
  const t0 = Date.now(), ok = budget_(t0);
  const props = PropertiesService.getScriptProperties();
  const todayS = fmt_(new Date());
  const st = { at: Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd HH:mm'), last: null, pending: null, expect: null, note: '', skipped: [], error: '' };
  let last = null;
  try {
    armWatchdog_();   // 강제 종료 대비(정상 종료 시 finally 에서 해제)
    props.setProperty(PROP.LOADING, String(t0));
    step_(t0, 'start');
    last = props.getProperty(PROP.LAST_DAILY) || indexDates_().pop() || null;
    let d = last ? addDays_(parse_(last), 1) : parse_(CFG.DAILY_FROM);
    let loaded = 0, cutByBudget = false, ctx = null;   // ctx: 실제로 적재할 자료가 있을 때만 준비(시트 읽기)
    while (fmt_(d) < todayS) {                              // 당일분은 다음 영업일 오전에 게시됨 → 어제까지만 조회
      if (!ok()) { cutByBudget = true; break; }
      if (isWeekend_(d)) { d = addDays_(d, 1); continue; }
      const ds = fmt_(d);
      step_(t0, 'KRX 조회 시작 ' + ds);
      const recs = fetchEtfDaily_(ds);
      step_(t0, 'KRX 조회 완료 ' + ds + ' (' + recs.length + '건' + (recs.length ? '' : ', 원자료 ' + (recs.raw || 0) + '행·거래대금 ' + (recs.trd || 0) + '종목') + ')');
      if (!recs.length) {
        if (krxHoliday_(ds)) { d = addDays_(d, 1); continue; }                     // 휴장일 목록
        const why = unlistedHoliday_(d, todayS);                                    // 목록에 없는 임시 휴장인지: 두 가지 근거가 모두 있을 때만
        if (why) {
          log_(ds + ' KRX 빈 응답 → 휴장으로 판단해 건너뜀 (' + why + ') — Config.gs KRX_HOLIDAYS 에 추가 권장', 'WARN');
          st.skipped.push(ds); d = addDays_(d, 1); continue;
        }
        st.pending = ds; break;                                                     // 그 밖에는 절대 건너뛰지 않고 대기(다음 실행에서 다시 확인)
      }
      if (!ctx) {                                                                   // 적재 준비(최초 1회): 마스터·인덱스, 중단된 실행의 잔여 행 정리
        ctx = ctx_();
        const ix = indexMap_(), il = Object.keys(ix).sort().pop();
        if (il && (!last || il > last)) { last = il; props.setProperty(PROP.LAST_DAILY, il); }   // _index 는 기록됐는데 LAST_DAILY 가 뒤처진 경우
        trimOrphanRows_(ix);
        step_(t0, '적재 준비(ctx·index·잔여 행)');
      }
      if (last && ds <= last) { d = addDays_(d, 1); continue; }                     // 이미 적재된 일자
      ensureMaster_(recs, ctx, ds);
      step_(t0, '마스터 확인');
      const prev = last ? readDailyBlock_(last) : null;
      const rows = buildDailyRows_(recs, prev, ds, ctx);
      const sh = sheet_(CFG.SHEET.RAW_DAILY, CFG.RAW_HEADER);
      const start = appendRows_(sh, rows);
      sheet_(CFG.SHEET.META, ['기준일자', '시작행', '행수']).appendRow([ds, start, rows.length]);
      appendRows_(sheet_(CFG.SHEET.AGG_SNAP_D, CFG.SNAP_HEADER), summarize_(recs, ctx, ds));   // 일자별 요약(대시보드용) 즉시 적재
      props.setProperty(PROP.LAST_DAILY, ds);
      step_(t0, '일별 기록 완료 ' + ds + ' (' + rows.length + '행)');
      last = ds; loaded++;
      d = addDays_(d, 1);
    }
    st.last = last;
    if (st.pending) { st.expect = nextKrxDay_(st.pending); st.note = pendingNote_(st.pending, st.expect, todayS); }
    else if (cutByBudget) st.note = '적재 진행 중 — 이어서 실행';
    setLoadStatus_(st);
    if (st.pending) scheduleUnpublishedRetry_(st.pending, st.expect);
    // 월말 스냅샷·집계: 새로 적재했거나 이전 회차에서 넘어온 작업이 있을 때만 (없으면 큰 시트를 읽지 않고 종료)
    if (!loaded && !props.getProperty(PROP.PENDING_AGG)) {
      maintainSheets_(t0);
      step_(t0, '적재할 자료 없음 → 종료' + (st.pending ? ' · ' + st.note : ''));
      return;
    }
    const leftMonths = syncMonthly_(t0, CFG.HARD_MS, cutByBudget);   // 예산 초과로 중단 → 당월 스냅샷은 마지막 회차에서만 갱신
    step_(t0, '월말 스냅샷 동기화');
    if (cutByBudget || leftMonths > 0) {
      props.setProperty(PROP.PENDING_AGG, '1');
      log_('일별 적재 진행 중: ' + loaded + '영업일, 최종 ' + last + (leftMonths ? ', 월말 갱신 잔여 ' + leftMonths + '개월' : '') + ' (이어서 실행 예약)');
      scheduleContinue_('loadDaily', 1); return;   // 집계는 마지막 회차에서만
    }
    if (Date.now() - t0 > CFG.AGG_START_MS) {   // 집계(전체 raw_월말 스캔)는 여유가 있을 때만 → 없으면 다음 회차에서 단독 수행
      props.setProperty(PROP.PENDING_AGG, '1');
      log_('일별 적재 완료(' + loaded + '영업일, 최종 ' + last + ') → 집계는 다음 회차에서 실행');
      scheduleContinue_('loadDaily', 1); return;
    }
    props.deleteProperty(PROP.PENDING_AGG);
    try { loadIndices_(last); } catch (e) { log_('지수 적재 실패: ' + e.message, 'WARN'); }
    step_(t0, '집계 재계산 시작');
    rebuildAggregates_();
    step_(t0, '집계 재계산 완료');
    if (CFG.KRX_WEB.INVESTOR_ENABLED) { try { loadInvestorNetBuy_(last, ctx || ctx_()); } catch (e) { log_('투자자별 순매수 실패: ' + e.message, 'WARN'); } }
    warmCache_(t0);
    log_('일별 적재 완료: ' + loaded + '영업일, 최종 ' + last);
  } catch (e) {
    st.last = last; st.error = String((e && e.message) || e).slice(0, 200); setLoadStatus_(st);
    log_('적재 오류: ' + st.error, 'ERROR');
    try { retryAfterError_(); } catch (x) {}
    throw e;
  } finally { try { disarmWatchdog_(); } catch (e) {} try { props.deleteProperty(PROP.LOADING); } catch (e) {} lock.releaseLock(); }
}

/** 휴장일 목록에 없는 날의 빈 응답이 '임시 휴장'인지 판정 (v17). 휴장으로 볼 근거 문구 또는 '' 반환.
 *  ① 뒤 영업일 KRX 자료가 이미 게시됐고 ② KOSPI(Yahoo) 일봉이 그날만 없을 때(뒤 날짜는 있음)만 휴장으로 판단.
 *  KOSPI 일봉이 그날 있으면 거래일 → 절대 건너뛰지 않음. Yahoo 조회가 안 되면 뒤 영업일 3일치가 게시된 뒤에만 건너뜀 */
function unlistedHoliday_(d, todayS) {
  const ds = fmt_(d);
  let later = 0, e = addDays_(d, 1);
  for (let n = 0; n < 3 && fmt_(e) < todayS; e = addDays_(e, 1)) {
    if (isWeekend_(e) || krxHoliday_(fmt_(e))) continue;
    n++;
    if (fetchEtfDaily_(fmt_(e)).length) later++; else break;
  }
  if (!later) return '';
  const k = kospiDays_(ds, todayS);
  if (k) return !k.days[ds] && k.max > ds ? '뒤 영업일 자료 게시 · KOSPI 일봉 없음' : '';
  return later >= 3 ? '뒤 3영업일 자료 게시 · KOSPI 조회 불가' : '';
}
/** KOSPI 거래일(Yahoo 일봉) {days:{날짜:1}, max:'yyyy-MM-dd'} — ds 7일 전 ~ 오늘. 조회 실패 시 null */
function kospiDays_(ds, todayS) {
  try {
    const k = fetchYahoo_(CFG.YAHOO.KOSPI, fmt_(addDays_(parse_(ds), -7)), todayS), keys = Object.keys(k).sort();
    if (!keys.length) return null;
    const days = {}; keys.forEach(x => days[x] = 1);
    return { days: days, max: keys[keys.length - 1] };
  } catch (e) { return null; }
}

/** v17: 한가한 실행(적재할 자료 없음)에서 1회성 시트 정리 */
function maintainSheets_(t0) {
  if (PropertiesService.getScriptProperties().getProperty(PROP.COLS_TRIMMED)) return;
  if (Date.now() - t0 > 60 * 1000) return;   // 시간 여유가 있을 때만
  try { trimRawColumns(); } catch (e) { PropertiesService.getScriptProperties().setProperty(PROP.COLS_TRIMMED, 'fail ' + fmt_(new Date())); log_('시트 빈 열 정리 실패(메뉴에서 다시 실행 가능): ' + e.message, 'WARN'); }
}
/** raw_일별·raw_월말·agg_일별요약의 쓰지 않는 열(새 시트 기본 26열 중 헤더 뒤 빈 열) 삭제.
 *  스프레드시트 셀 한도(1,000만 셀) 여유 확보 — 2026-09-24 기준 약 778만 셀(raw_일별 19.8만 행×26열) → 정리 후 약 290만.
 *  값이 있는 열은 건드리지 않음(헤더 뒤에 값이 있으면 그 시트는 건너뜀). 메뉴에서도 실행 가능 */
function trimRawColumns() {
  const S = CFG.SHEET, out = [];
  [[S.RAW_DAILY, CFG.RAW_HEADER.length], [S.RAW_MONTHLY, CFG.RAW_HEADER.length], [S.AGG_SNAP_D, CFG.SNAP_HEADER.length]].forEach(x => {
    const sh = ss_().getSheetByName(x[0]), w = x[1]; if (!sh) return;
    const max = sh.getMaxColumns(), used = sh.getLastColumn();
    if (used > w) { out.push(x[0] + ' ' + used + '열까지 값 있음 → 건너뜀'); return; }
    if (max > w) { sh.deleteColumns(w + 1, max - w); out.push(x[0] + ' ' + max + '→' + w + '열'); }
  });
  PropertiesService.getScriptProperties().setProperty(PROP.COLS_TRIMMED, fmt_(new Date()));
  log_('시트 빈 열 정리: ' + (out.join(', ') || '대상 없음'));
}

/** 표준 레코드 → raw 행 */
function recToRow_(r) { return [r.date, r.code, r.name, r.mgr, r.nav, r.trdval, r.ytd, r.mtd]; }

/** raw_일별에서 _index 마지막 블록 이후에 남은 행(중단된 실행의 잔여) 삭제 */
function trimOrphanRows_(ix) {
  const sh = sheet_(CFG.SHEET.RAW_DAILY, CFG.RAW_HEADER);
  const dates = Object.keys(ix).sort();
  const end = dates.length ? ix[dates[dates.length - 1]].start + ix[dates[dates.length - 1]].count - 1 : 1;
  const lr = sh.getLastRow();
  if (lr > end) { sh.deleteRows(end + 1, lr - end); log_('잔여 행 ' + (lr - end) + '건 제거 (중단된 실행 정리)', 'WARN'); }
}

/** 표준 레코드 + 전영업일 블록 → raw 행 (연·월 누적 계산) */
function buildDailyRows_(recs, prev, ds, ctx) {
  const pm = {};
  if (prev) prev.forEach(p => pm[p.code] = p);
  const prevDate = prev && prev.length ? prev[0].date : null;
  const sameYear = prevDate && prevDate.slice(0, 4) === ds.slice(0, 4);
  const sameMonth = prevDate && ym_(prevDate) === ym_(ds);
  return recs.map(r => {
    const p = pm[r.code];
    const ytd = (p && sameYear ? p.ytd : 0) + r.trdval;
    const mtd = (p && sameMonth ? p.mtd : 0) + r.trdval;
    return [ds, r.code, r.name, mgrShortOf_(r.code, ctx), r.nav, r.trdval, ytd, mtd];
  });
}

// ─────────────────────────── 월말 스냅샷 ───────────────────────────

/** raw_월말 월별 블록 위치 {ym: [최근일자, 시작행, 끝행]} (v17).
 *  스크립트 속성(MONTHLY_MAP)에 보관하고, 시트 행 수(lr)가 달라졌을 때만 A열(5만여 행)을 다시 읽음 → 적재 때마다 하던 전체 읽기 생략 */
function monthlyMap_(sh) {
  const lr = sh.getLastRow();
  try { const c = JSON.parse(PropertiesService.getScriptProperties().getProperty(PROP.MONTHLY_MAP) || 'null'); if (c && c.lr === lr && c.m) return c.m; } catch (e) {}
  const m = {};
  if (lr >= 2) sh.getRange(2, 1, lr - 1, 1).getValues().forEach((v, i) => {
    const d = v[0] instanceof Date ? fmt_(v[0]) : String(v[0]), k = ym_(d);
    if (!m[k]) m[k] = [d, i + 2, i + 2];
    m[k][2] = i + 2; if (d > m[k][0]) m[k][0] = d;
  });
  saveMonthlyMap_(m, lr);
  return m;
}
function saveMonthlyMap_(m, lr) {
  try { PropertiesService.getScriptProperties().setProperty(PROP.MONTHLY_MAP, JSON.stringify({ lr: lr, m: m })); } catch (e) { console.log('MONTHLY_MAP 저장 실패: ' + e.message); }
}

/** 해당 월의 기존 스냅샷을 삭제하고 최신 일자 행으로 교체 (월중에는 '당월 최근일' 스냅샷 역할) */
function upsertMonthly_(rows, ds) {
  const sh = sheet_(CFG.SHEET.RAW_MONTHLY, CFG.RAW_HEADER);
  const target = ym_(ds), m = monthlyMap_(sh), cur = m[target];
  if (cur) {
    if (cur[0] >= ds) return;                                // 이미 더 최근 스냅샷 존재
    const s = cur[1], e = cur[2], n = e - s + 1;
    if (n === rows.length) {                                  // 행수 동일 → 제자리 덮어쓰기(빠름)
      sh.getRange(s, 1, rows.length, rows[0].length).setValues(rows);
      m[target] = [ds, s, e]; saveMonthlyMap_(m, sh.getLastRow()); return;
    }
    sh.deleteRows(s, n);
    Object.keys(m).forEach(k => { if (m[k][1] > e) { m[k][1] -= n; m[k][2] -= n; } });
    delete m[target];
  }
  const start = appendRows_(sh, rows);
  m[target] = [ds, start, start + rows.length - 1];
  saveMonthlyMap_(m, sh.getLastRow());
}

/**
 * raw_월말 ↔ raw_일별 동기화. _index 의 월별 마지막 일자보다 raw_월말 스냅샷이 오래됐거나 없는 월만 갱신.
 * 시간 초과로 중단된 실행이 있어도 다음 회차에서 자동 복구됨. 하드 시한(CFG.HARD_MS) 초과 시 남은 월 수 반환.
 */
function syncMonthly_(t0, limitMs, skipCurrent) {
  const ix = indexMap_(), lastOf = {};
  Object.keys(ix).forEach(d => { const k = ym_(d); if (!lastOf[k] || d > lastOf[k]) lastOf[k] = d; });
  const have = monthlyMap_(sheet_(CFG.SHEET.RAW_MONTHLY, CFG.RAW_HEADER));
  const months = Object.keys(lastOf).sort(), current = months[months.length - 1];
  const todo = months.filter(k => (!have[k] || have[k][0] < lastOf[k]) && !(skipCurrent && k === current));
  let left = 0, cost = CFG.SYNC_COST_MS;   // 직전 갱신 소요시간(초기값 보수적) → 남은 시간 안에 끝낼 수 없으면 다음 회차로
  todo.forEach(k => {
    const el = Date.now() - t0;
    if (el > limitMs || el + cost > CFG.SAFE_MS) { left++; return; }
    const s = Date.now();
    const blk = readDailyBlock_(lastOf[k]);
    if (blk) upsertMonthly_(blk.map(recToRow_), lastOf[k]);
    cost = Date.now() - s;
    log_('월말 스냅샷 갱신 ' + k + ' (' + lastOf[k] + ', ' + Math.round(cost / 1000) + 's)');
  });
  return left;
}

/** raw_월말 전체 → {ym: [rec]} (ym 오름차순 키) */
function monthlyBlocks_() {
  const out = {};
  readAll_(sheet_(CFG.SHEET.RAW_MONTHLY, CFG.RAW_HEADER)).forEach(v => {
    const r = rowToRec_(v); const k = ym_(r.date);
    (out[k] = out[k] || []).push(r);
  });
  return out;
}

// ─────────────────────────── 지수 ───────────────────────────

/** 지수 시트 upsert: 마지막 적재일 -10일 ~ toDate 구간을 Yahoo 에서 받아 병합 (KOSPI 는 Yahoo 실패 시 KRX) */
function loadIndices_(toDate) {
  const sh = sheet_(CFG.SHEET.INDEX, ['일자', 'KOSPI', 'S&P500', 'NASDAQ100']);
  const map = {};
  readAll_(sh).forEach(r => { const d = r[0] instanceof Date ? fmt_(r[0]) : String(r[0]); map[d] = { k: toNum_(r[1]), s: toNum_(r[2]), n: toNum_(r[3]) }; });
  const dates = Object.keys(map).sort();
  const from = dates.length ? fmt_(addDays_(parse_(dates[dates.length - 1]), -10)) : CFG.MONTHLY_FROM + '-01';
  mergeIndices_(map, from, toDate);
  writeIndices_(sh, map);
}
/** Yahoo 3개 지수를 map 에 병합. KOSPI 가 비면 KRX API 로 최근 10영업일 보완 */
function mergeIndices_(map, from, to) {
  const put = (obj, key) => Object.keys(obj).forEach(d => { (map[d] = map[d] || { k: 0, s: 0, n: 0 })[key] = obj[d]; });
  const k = fetchYahoo_(CFG.YAHOO.KOSPI, from, to); put(k, 'k');
  put(fetchYahoo_(CFG.YAHOO.SP500, from, to), 's');
  put(fetchYahoo_(CFG.YAHOO.NDX100, from, to), 'n');
  if (!Object.keys(k).length) {
    let d = addDays_(parse_(to), -10); const end = parse_(to);
    while (d <= end) { const ds = fmt_(d); if (!isWeekend_(d) && !(map[ds] && map[ds].k)) { const v = fetchKospi_(ds); if (v) (map[ds] = map[ds] || { k: 0, s: 0, n: 0 }).k = v; } d = addDays_(d, 1); }
  }
}
function writeIndices_(sh, map) {
  const rows = Object.keys(map).filter(d => map[d].k || map[d].s || map[d].n).sort().map(d => [d, map[d].k || '', map[d].s || '', map[d].n || '']);
  const lr = sh.getLastRow();
  if (lr >= 2) sh.getRange(2, 1, lr - 1, 4).clearContent();
  if (rows.length) { sh.getRange(2, 1, rows.length, 1).setNumberFormat('@'); sh.getRange(2, 1, rows.length, 4).setValues(rows); }
}

// ─────────────────────────── (선택) 투자자별 순매수 ───────────────────────────

/** 종목별 투자자별 순매수 → 운용사 × 투자자 합계 적재. 종목 수만큼 웹 호출이 발생하므로 기본 비활성 */
function loadInvestorNetBuy_(ds, ctx) {
  const sh = sheet_(CFG.SHEET.INVESTOR, ['기준일자', '운용사', '투자자', '순매수대금']);
  const recs = readDailyBlock_(ds) || [];
  const agg = {};
  recs.forEach(r => {
    const full = isinOf_(r.code);
    let rows = [];
    try { rows = fetchInvestorNetBuy_(full, ds); } catch (e) { return; }
    rows.forEach(x => { const k = r.mgr + '|' + x.investor; agg[k] = (agg[k] || 0) + x.netbuy; });
  });
  const out = Object.keys(agg).map(k => [ds].concat(k.split('|'), [agg[k]]));
  if (out.length) appendRows_(sh, out);
}
