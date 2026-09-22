/**
 * Aggregate.gs — raw_월말 → 대시보드용 집계 시트 전체 재계산 (매일 적재 후 자동 실행)
 */
function rebuildAggregates() { rebuildAggregates_(); }
function rebuildAggregates_() {
  const ctx = ctx_();
  const months = monthlyBlocks_();
  const keys = Object.keys(months).sort();
  const idx = indexSeries_();
  const mkt = [], mgr = [], typ = [], mgrTyp = [], top = [], snap = [];

  keys.forEach(k => {
    const recs = months[k];
    const date = recs[0].date;
    let tot = 0;
    const byMgr = {}, byType = {}, byMgrType = {};
    recs.forEach(r => {
      tot += r.nav;
      const g = groupOf_(r, ctx);
      const a = byMgr[g.short] = byMgr[g.short] || { top: g.top, nav: 0, n: 0 }; a.nav += r.nav; a.n++;
      const tk = g.f1 + '|' + g.f2 + '|' + g.dom;
      const b = byType[tk] = byType[tk] || { nav: 0, n: 0 }; b.nav += r.nav; b.n++;
      const mk = g.short + '|' + g.f2;
      const c = byMgrType[mk] = byMgrType[mk] || { top: g.top, nav: 0 }; c.nav += r.nav;
    });
    const ix = nearestIndex_(idx, date);
    mkt.push([k, date, tot, recs.length, ix.k || '', ix.s || '', ix.n || '']);
    Object.keys(byMgr).forEach(s => mgr.push([k, s, byMgr[s].top, byMgr[s].nav, byMgr[s].n]));
    Object.keys(byType).forEach(t => { const p = t.split('|'); typ.push([k, p[0], p[1], p[2], byType[t].nav, byType[t].n]); });
    Object.keys(byMgrType).forEach(t => { const p = t.split('|'); mgrTyp.push([k, p[0], byMgrType[t].top, p[1], byMgrType[t].nav]); });
    snap.push.apply(snap, summarize_(recs, ctx, date));
    recs.slice().sort((a, b) => b.nav - a.nav).slice(0, CFG.TOP_N).forEach((r, i) => {
      const g = groupOf_(r, ctx); top.push([k, i + 1, r.code, r.name, g.short, g.top, r.nav]);
    });
  });

  writeAgg_(CFG.SHEET.AGG_MARKET, ['월', '기준일자', '총NAV', '종목수', 'KOSPI', 'S&P500', 'NASDAQ100'], mkt);
  writeAgg_(CFG.SHEET.AGG_MGR, ['월', '운용사', '상위구분', 'NAV', '종목수'], mgr);
  writeAgg_(CFG.SHEET.AGG_TYPE, ['월', '유형최종1', '유형최종2', '국내해외', 'NAV', '종목수'], typ);
  writeAgg_(CFG.SHEET.AGG_MGR_TYPE, ['월', '운용사', '상위구분', '유형최종2', 'NAV'], mgrTyp);
  writeAgg_(CFG.SHEET.AGG_TOP, ['월', '순위', '종목코드', '종목명', '운용사', '상위구분', 'NAV'], top);
  writeAgg_(CFG.SHEET.AGG_SNAP_M, CFG.SNAP_HEADER, snap);
  CacheService.getScriptCache().removeAll(['agg_market', 'agg_mgr', 'agg_type', 'agg_mgrtype', 'agg_top', 'legend', 'dates']);
  bumpCache_();
  log_('집계 재계산 완료: ' + keys.length + '개월');
}

/** 레코드 → {short(약식_정식), top(상위구분), f1, f2, dom, neu}. 운용사는 ETF마스터 브랜드/운용사명 → 범례_운용사 */
function groupOf_(r, ctx) {
  const e = resolveMgr_(r.code, r.name, ctx);
  let short = e ? e.short : (r.mgr || '미확인');
  let top = e ? e.top : '기타';
  if (!e && r.mgr && ctx.lookup.byName[r.mgr]) { short = ctx.lookup.byName[r.mgr].short; top = ctx.lookup.byName[r.mgr].top; }
  if (CFG.TOP5.indexOf(top) < 0) top = '기타';
  const t = ctx.types[r.code] || { f1: '미분류', f2: '미분류', dom: '미분류', neu: '미분류' };
  return { short: short, top: top, f1: t.f1 || '미분류', f2: t.f2 || '미분류', dom: t.dom || '미분류', neu: t.neu || '미분류' };
}

/** 스냅샷 레코드 → 요약 행 [기준일자, 운용사, 상위구분, 유형최종2, 국내해외, NAV, 종목수] (운용사×유형×국내해외) */
function summarize_(recs, ctx, date) {
  const agg = {};
  recs.forEach(r => {
    const g = groupOf_(r, ctx), k = g.short + '|' + g.top + '|' + g.f2 + '|' + g.dom;
    const a = agg[k] = agg[k] || { nav: 0, n: 0 }; a.nav += r.nav; a.n++;
  });
  return Object.keys(agg).sort().map(k => { const p = k.split('|'); return [date, p[0], p[1], p[2], p[3], agg[k].nav, agg[k].n]; });
}

/**
 * agg_일별요약 전체 재작성 (_index 의 일별 블록을 순회). 6분 예산 초과 시 이어서 실행.
 * 초기 1회 및 범례(운용사·유형) 대량 수정 후 실행. 이후 일별 적재 시 자동 추가됨
 */
function rebuildDailySummary() {
  const lock = LockService.getScriptLock(); if (!lock.tryLock(10000)) return;
  const t0 = Date.now();
  try {
    const props = PropertiesService.getScriptProperties();
    const ctx = ctx_(), ix = indexMap_(), dates = Object.keys(ix).sort();
    const sh = sheet_(CFG.SHEET.AGG_SNAP_D, CFG.SNAP_HEADER);
    let cursor = props.getProperty(PROP.SNAP_CURSOR);
    if (!cursor) { sh.clearContents(); sh.getRange(1, 1, 1, CFG.SNAP_HEADER.length).setValues([CFG.SNAP_HEADER]); sh.getRange('A:A').setNumberFormat('@'); cursor = ''; }
    const shD = sheet_(CFG.SHEET.RAW_DAILY, CFG.RAW_HEADER);
    let buf = [], done = 0, i = 0;
    for (; i < dates.length; i++) {
      const d = dates[i]; if (d <= cursor) continue;
      if (Date.now() - t0 > CFG.HARD_MS) break;
      const b = ix[d];
      const recs = shD.getRange(b.start, 1, b.count, CFG.RAW_HEADER.length).getValues().map(rowToRec_);
      buf = buf.concat(summarize_(recs, ctx, d)); cursor = d; done++;
      if (buf.length > 4000) { appendRows_(sh, buf); buf = []; }
    }
    if (buf.length) appendRows_(sh, buf);
    if (i < dates.length) { props.setProperty(PROP.SNAP_CURSOR, cursor); log_('일별 요약 재작성 진행 중: ' + done + '일, 최종 ' + cursor + ' (이어서 실행 예약)'); scheduleContinue_('rebuildDailySummary', 1); return; }
    props.deleteProperty(PROP.SNAP_CURSOR); clearTriggers_('cont_rebuildDailySummary');
    bumpCache_();
    log_('일별 요약 재작성 완료: ' + dates.length + '일');
  } finally { lock.releaseLock(); }
}

/** 집계 후 기본 조회(기준일 미지정) 응답을 미리 캐시에 채움 → 첫 방문자도 즉시 표시 */
/** API 캐시 예열(v13). 캐시 키는 파라미터 JSON 그대로이므로 **화면이 실제로 보내는 형태**로 호출해야 적중함
 *  (v12 까지는 {} 로 예열해 화면 요청({date:…})과 키가 달라 효과가 없었음).
 *  순서: 최근 영업일 → 기본 기준일(전월말) → 당월의 나머지 일자(최근 순). 시한 내에서만 수행하고,
 *  CacheService 보존 한도(6시간)에 맞춰 5.5시간 뒤 자기 자신을 다시 예약 → 낮에도 첫 조회가 느려지지 않음 */
function warmParams_(date, dv, months) {
  const to = dv.indexOf(date) >= 0 ? date : dv[dv.length - 1];
  let from = dv[0];
  if (to) { const py = months.filter(x => x.ym < to.slice(0, 4) + '-01').pop(); const f = py && dv.filter(d => d > py.date)[0]; if (f) from = f; }
  const list = [['overview', { date: date }], ['byMgr', { date: date }], ['byType', { date: date }], ['shares', { date: date, mgr: '' }], ['topEtf', { date: date }],
    ['newListings', { date: date, year: date.slice(0, 4), filter: 'exBond' }], ['treemap', { date: date }]];
  if (to) list.push(['turnover', { from: from, to: to }]);
  return list;
}
function warmAll() {
  clearTriggers_('cont_warmAll');
  const t0 = Date.now(), limit = Math.min(CFG.WARM_MS, 4.5 * 60 * 1000);
  let n = 0, left = 0;
  try {
    const m = JSON.parse(api('meta', {})).data;
    api('race', { n: 20 });
    const dv = m.dates.filter(d => d >= m.dailyFrom), latest = dv[dv.length - 1] || null, cur = (latest || '').slice(0, 7);
    const order = [latest, m.defaultDate].concat(dv.filter(d => d.slice(0, 7) === cur).reverse()).filter((d, i, a) => d && a.indexOf(d) === i);
    order.forEach(d => warmParams_(d, dv, m.months).forEach(x => {
      if (Date.now() - t0 > limit) { left++; return; }
      try { api(x[0], x[1]); n++; } catch (e) {}
    }));
  } catch (e) { console.log('warmAll 오류: ' + e.message); }
  console.log('[warmAll] ' + n + '건 예열, 잔여 ' + left + '건, ' + ((Date.now() - t0) / 1000).toFixed(0) + 's');
  scheduleContinue_('warmAll', left ? 2 : 330);   // 남았으면 곧바로 이어서, 다 했으면 캐시 만료 전에 재예열
}
function cont_warmAll() { warmAll(); }
function warmCache_() { scheduleContinue_('warmAll', 1); }   // 적재 직후: 별도 실행(자체 6분)으로 예열

function writeAgg_(name, header, rows) {
  const sh = sheet_(name, header);
  sh.clearContents();
  sh.getRange(1, 1, Math.max(rows.length + 1, 2), 1).setNumberFormat('@');   // '월' 컬럼 텍스트 고정(날짜 자동변환 방지)
  sh.getRange(1, 1, 1, header.length).setValues([header]);
  if (rows.length) sh.getRange(2, 1, rows.length, header.length).setValues(rows);
  sh.setFrozenRows(1);
}

/** 지수 시트 → 정렬된 [{d,k,s,n}] */
function indexSeries_() {
  return readAll_(sheet_(CFG.SHEET.INDEX, ['일자', 'KOSPI', 'S&P500', 'NASDAQ100']))
    .map(r => ({ d: r[0] instanceof Date ? fmt_(r[0]) : String(r[0]), k: toNum_(r[1]), s: toNum_(r[2]), n: toNum_(r[3]) }))
    .sort((a, b) => a.d < b.d ? -1 : 1);
}
/** 기준일 이하 가장 가까운 값 (각 지수별로 개별 탐색: 휴장일 상이) */
function nearestIndex_(series, date) {
  const out = { k: 0, s: 0, n: 0 };
  for (let i = series.length - 1; i >= 0; i--) {
    if (series[i].d > date) continue;
    if (!out.k && series[i].k) out.k = series[i].k;
    if (!out.s && series[i].s) out.s = series[i].s;
    if (!out.n && series[i].n) out.n = series[i].n;
    if (out.k && out.s && out.n) break;
  }
  return out;
}
