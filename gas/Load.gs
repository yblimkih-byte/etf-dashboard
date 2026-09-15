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

/** 매일 트리거 진입점 (08:30 KST 권장). 미적재 영업일을 오늘까지 순차 적재 */
function loadDaily() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) return;
  const t0 = Date.now(), ok = budget_(t0);
  try {
    const props = PropertiesService.getScriptProperties();
    const ctx = ctx_();
    const ix = indexMap_();
    const dates = Object.keys(ix).sort();
    let last = props.getProperty(PROP.LAST_DAILY) || (dates.length ? dates[dates.length - 1] : null);
    let d = last ? addDays_(parse_(last), 1) : parse_(CFG.DAILY_FROM);
    const today = parse_(new Date());
    let loaded = 0;
    trimOrphanRows_(ix);   // 직전 실행이 시간 초과로 중단된 경우 _index 없는 꼬리 행 제거
    syncMonthly_(t0, CFG.PRE_SYNC_MS, true);   // 이전 회차에서 이월된 월말 스냅샷 갱신을 먼저 처리 (진행 중인 당월은 제외)

    while (d <= today && ok()) {
      if (isWeekend_(d)) { d = addDays_(d, 1); continue; }
      const ds = fmt_(d);
      const recs = fetchEtfDaily_(ds);
      if (!recs.length) {
        // 최근 3일 이내 빈 응답 = 미게시 가능성 → 중단(다음 실행에 재시도). 그 이전은 휴장으로 간주하고 건너뜀
        if ((today - d) / 86400000 <= 3) break;
        d = addDays_(d, 1); continue;
      }
      ensureMaster_(recs, ctx, ds);
      const prev = last ? readDailyBlock_(last) : null;
      const rows = buildDailyRows_(recs, prev, ds, ctx);
      const sh = sheet_(CFG.SHEET.RAW_DAILY, CFG.RAW_HEADER);
      const start = appendRows_(sh, rows);
      sheet_(CFG.SHEET.META, ['기준일자', '시작행', '행수']).appendRow([ds, start, rows.length]);
      appendRows_(sheet_(CFG.SHEET.AGG_SNAP_D, CFG.SNAP_HEADER), summarize_(recs, ctx, ds));   // 일자별 요약(대시보드용) 즉시 적재
      props.setProperty(PROP.LAST_DAILY, ds);
      last = ds; loaded++;
      d = addDays_(d, 1);
    }
    // 월말 스냅샷 동기화: _index 기준 월별 마지막 일자와 raw_월말 비교 → 부족한 월만 갱신 (하드 시한 내에서, 남으면 다음 회차)
    const cut = d <= today && !ok();                       // 예산 초과로 중단 → 당월 스냅샷은 마지막 회차에서만 갱신
    const leftMonths = syncMonthly_(t0, CFG.HARD_MS, cut);
    const unfinished = cut || leftMonths > 0;
    if (unfinished) {
      props.setProperty(PROP.PENDING_AGG, '1');
      log_('일별 적재 진행 중: ' + loaded + '영업일, 최종 ' + last + (leftMonths ? ', 월말 갱신 잔여 ' + leftMonths + '개월' : '') + ' (이어서 실행 예약)');
      scheduleContinue_('loadDaily', 1); return;   // 집계는 마지막 회차에서만
    }
    if (loaded || props.getProperty(PROP.PENDING_AGG)) {
      if (Date.now() - t0 > CFG.AGG_START_MS) {   // 집계(전체 raw_월말 스캔)는 여유가 있을 때만 → 없으면 다음 회차에서 단독 수행
        props.setProperty(PROP.PENDING_AGG, '1');
        log_('일별 적재 완료(' + loaded + '영업일, 최종 ' + last + ') → 집계는 다음 회차에서 실행');
        scheduleContinue_('loadDaily', 1); return;
      }
      props.deleteProperty(PROP.PENDING_AGG);
      try { loadIndices_(last); } catch (e) { log_('지수 적재 실패: ' + e.message, 'WARN'); }
      rebuildAggregates_();
      if (CFG.KRX_WEB.INVESTOR_ENABLED) { try { loadInvestorNetBuy_(last, ctx); } catch (e) { log_('투자자별 순매수 실패: ' + e.message, 'WARN'); } }
      warmCache_(t0);
      log_('일별 적재 완료: ' + loaded + '영업일, 최종 ' + last);
    }
  } finally { lock.releaseLock(); }
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

/** 해당 월의 기존 스냅샷을 삭제하고 최신 일자 행으로 교체 (월중에는 '당월 최근일' 스냅샷 역할) */
function upsertMonthly_(rows, ds) {
  const sh = sheet_(CFG.SHEET.RAW_MONTHLY, CFG.RAW_HEADER);
  const target = ym_(ds);
  const lr = sh.getLastRow();
  if (lr >= 2) {
    const col = sh.getRange(2, 1, lr - 1, 1).getValues();
    let s = -1, e = -1;
    for (let i = 0; i < col.length; i++) {
      const v = col[i][0] instanceof Date ? fmt_(col[i][0]) : String(col[i][0]);
      if (ym_(v) === target) { if (s < 0) s = i; e = i; }
    }
    if (s >= 0) {
      const existing = col[s][0] instanceof Date ? fmt_(col[s][0]) : String(col[s][0]);
      if (existing >= ds) return;               // 이미 더 최근 스냅샷 존재
      if (e - s + 1 === rows.length) { sh.getRange(s + 2, 1, rows.length, rows[0].length).setValues(rows); return; }  // 행수 동일 → 제자리 덮어쓰기(빠름)
      sh.deleteRows(s + 2, e - s + 1);
    }
  }
  appendRows_(sh, rows);
}

/**
 * raw_월말 ↔ raw_일별 동기화. _index 의 월별 마지막 일자보다 raw_월말 스냅샷이 오래됐거나 없는 월만 갱신.
 * 시간 초과로 중단된 실행이 있어도 다음 회차에서 자동 복구됨. 하드 시한(CFG.HARD_MS) 초과 시 남은 월 수 반환.
 */
function syncMonthly_(t0, limitMs, skipCurrent) {
  const ix = indexMap_(), lastOf = {};
  Object.keys(ix).forEach(d => { const k = ym_(d); if (!lastOf[k] || d > lastOf[k]) lastOf[k] = d; });
  const sh = sheet_(CFG.SHEET.RAW_MONTHLY, CFG.RAW_HEADER), have = {};
  const lr = sh.getLastRow();
  if (lr >= 2) sh.getRange(2, 1, lr - 1, 1).getValues().forEach(v => { const d = v[0] instanceof Date ? fmt_(v[0]) : String(v[0]); const k = ym_(d); if (!have[k] || d > have[k]) have[k] = d; });
  const months = Object.keys(lastOf).sort(), current = months[months.length - 1];
  const todo = months.filter(k => (!have[k] || have[k] < lastOf[k]) && !(skipCurrent && k === current));
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
