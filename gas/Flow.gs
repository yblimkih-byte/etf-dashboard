/**
 * Flow.gs — v42 설정액(자금 유출입)·평가 증감 분리
 *  설정액(순설정) = Σ일별 (내재 좌수_t − 내재 좌수_t−1) × 1좌당 NAV_t,  내재 좌수 = 순자산총액 ÷ 1좌당 NAV (KRX ETF 일별매매정보 같은 응답)
 *              = 순자산총액_t − 순자산총액_t−1 × (NAV_t ÷ NAV_t−1)   →   평가 증감 = 순자산총액_t−1 × (NAV_t ÷ NAV_t−1 − 1)
 *   · 상장좌수는 설정·해지가 다음 영업일에 반영돼(2026-10-14 실측: 순자산총액 ≈ NAV × 같은 날 좌수 76% · 다음 날 좌수 94%) 계산에 쓰지 않음(분할 판정 보조·점검용)
 *   · 신규상장 = 첫날 순자산총액 전액 설정, 상장폐지 = 직전 순자산총액 전액 해지
 *   · 분할·병합: 1좌당 NAV 가 정수배로 바뀌고 내재 좌수도 같은 배수로 바뀐 날은 그 배수만큼 보정(가격 급변·대량 설정과 구분)
 *   · 평가 증감에는 분배금 지급(분배락)·보수가 포함됨(KRX 응답에 분배금 없음)
 *  산출: 2026-01 이후(일별 적재) = 일별 합 'D' · 2021-02~2025-12 = 월말 두 시점 근사 'M'(내재 좌수 증감 × 두 시점 평균 NAV)
 *  시트: agg_설정액월별(ETF × 월) · agg_설정액요약(월 × 운용사 × 유형최종2 × 국내해외 — 화면은 이 시트만 읽음)
 *  갱신: 일별 적재 뒤 바뀐 월만(flowUpdate_) · 메뉴 '설정액 다시 계산'(rebuildFlows) · 과거 보충(backfillFlowCols, 1회) 끝나면 전체 계산
 */
const FLOW = {
  HEADER: ['월', '종목코드', '종목명', '운용사', '설정액', '평가증감', '기말NAV', '산출'],
  SUM_HEADER: ['월', '운용사', '상위구분', '유형최종2', '국내해외', '설정액', '평가증감', '기말NAV', '종목수', '산출'],
  SPLITS: [2, 3, 4, 5, 10, 20, 25, 50, 100],   // 분할 배수 후보
  FILL_MS: 4.2 * 60 * 1000,                     // 과거 보충 1회 실행 시한(6분 한도 여유)
  UNIT: 1e8                                     // API 응답 단위(억원)
};

// ─────────────────────────── 계산 ───────────────────────────

/** 두 시점 사이 분할·병합 배수 k(1좌당 NAV 가 1/k, 내재 좌수가 k 배) — 아니면 1. a·b: {nav, ps} */
function flowSplit_(a, b) {
  if (!(a.ps > 0 && b.ps > 0 && a.nav > 0 && b.nav > 0)) return 1;
  const q = a.ps / b.ps; if (q < 1.8 && q > 0.55) return 1;
  const ur = (b.nav / b.ps) / (a.nav / a.ps);
  let best = 1, err = 1e9;
  (q >= 1 ? FLOW.SPLITS : FLOW.SPLITS.map(x => 1 / x)).forEach(k => { const e1 = Math.abs(q / k - 1), e2 = Math.abs(ur / k - 1); if (e1 < 0.35 && e2 < 0.35 && e1 + e2 < err) { best = k; err = e1 + e2; } });
  return best;
}
/** 하루(전일 a → 당일 b) → [설정액, 평가증감]. 레코드 없음·순자산 0 = 상장 전/폐지 */
function flowStep_(a, b) {
  const an = !!(a && a.nav > 0), bn = !!(b && b.nav > 0);
  if (!an && !bn) return [0, 0];
  if (!an) return [b.nav, 0];
  if (!bn) return [-a.nav, 0];
  if (a.ps > 0 && b.ps > 0) { const k = flowSplit_(a, b), val = a.nav * (b.ps * k / a.ps - 1); return [b.nav - a.nav - val, val]; }
  return [0, b.nav - a.nav];   // 1좌당 NAV 없음(보충 전 자료) → 증감 전부 평가로
}
/** 월말 두 시점(a → b) 근사 → [설정액, 평가증감] = 내재 좌수 증감 × 두 시점 평균 NAV */
function flowSpan_(a, b) {
  const an = !!(a && a.nav > 0), bn = !!(b && b.nav > 0);
  if (!an && !bn) return [0, 0];
  if (!an) return [b.nav, 0];
  if (!bn) return [-a.nav, 0];
  if (a.ps > 0 && b.ps > 0) { const k = flowSplit_(a, b), ua = a.nav / a.ps * k, ub = b.nav / b.ps, f = (ub - ua) * (a.ps / k + b.ps) / 2; return [f, b.nav - a.nav - f]; }
  return [0, b.nav - a.nav];
}
/** 한 달 → {code: {f, v, e, name, mgr}}. chain = [시작(전월말) 맵, 다음 시점 맵, …] — mode 'D' 일별 합 / 'M' 두 시점 근사 */
function flowMonth_(chain, mode) {
  const out = {}, seen = {};
  for (let i = 1; i < chain.length; i++) {
    const A = chain[i - 1] || {}, B = chain[i] || {}, codes = {};
    Object.keys(A).forEach(c => { codes[c] = 1; }); Object.keys(B).forEach(c => { codes[c] = 1; });
    Object.keys(codes).forEach(c => {
      const fv = mode === 'M' ? flowSpan_(A[c], B[c]) : flowStep_(A[c], B[c]);
      const o = out[c] = out[c] || { f: 0, v: 0, e: 0, name: '', mgr: '' };
      o.f += fv[0]; o.v += fv[1];
      const r = B[c] || A[c]; if (r) { o.name = r.name || o.name; o.mgr = r.mgr || o.mgr; }
    });
  }
  const last = chain[chain.length - 1] || {};
  Object.keys(out).forEach(c => { out[c].e = last[c] && last[c].nav > 0 ? last[c].nav : 0; if (!out[c].f && !out[c].v && !out[c].e) delete out[c]; });
  return out;
}
/** 레코드 배열 → {code: rec} (순자산 0 행 포함 — 0 은 '없음'으로 계산) */
function flowMap_(recs) { const m = {}; (recs || []).forEach(r => { m[r.code] = r; }); return m; }
/** 한 달 계산 결과 → 시트 행 */
function flowRows_(ym, res, mode) {
  return Object.keys(res).sort().map(c => { const o = res[c]; return [ym, c, o.name, o.mgr, Math.round(o.f), Math.round(o.v), Math.round(o.e), mode]; });
}

// ─────────────────────────── 원자료 읽기 ───────────────────────────

/** raw_일별의 여러 일자 블록을 한 번에 읽어 {date: 맵} (블록은 일자순으로 이어져 있음) */
function flowDailyMaps_(dates, ix) {
  const out = {}; if (!dates.length) return out;
  const bs = dates.map(d => ix[d]).filter(Boolean); if (!bs.length) return out;
  const s = Math.min.apply(null, bs.map(b => b.start)), e = Math.max.apply(null, bs.map(b => b.start + b.count - 1));
  const vals = sheet_(CFG.SHEET.RAW_DAILY, CFG.RAW_HEADER).getRange(s, 1, e - s + 1, CFG.RAW_HEADER.length).getValues();
  dates.forEach(d => { const b = ix[d]; if (!b) return; out[d] = flowMap_(vals.slice(b.start - s, b.start - s + b.count).map(rowToRec_)); });
  return out;
}
/** raw_월말 한 달 블록 → 맵 */
function flowMonthlyMap_(sh, mm, k) {
  const b = mm[k]; if (!b) return null;
  return flowMap_(sh.getRange(b[1], 1, b[2] - b[1] + 1, CFG.RAW_HEADER.length).getValues().map(rowToRec_).filter(r => r.date === b[0]));
}
/** 일별 구간(DAILY_FROM 이후) 월 목록 → {ym: [일자…]} */
function flowDailyMonths_(ix) {
  const by = {}; Object.keys(ix).sort().forEach(d => { if (d >= CFG.DAILY_FROM) (by[ym_(d)] = by[ym_(d)] || []).push(d); });
  return by;
}
/** 일별 구간 첫 달의 시작 맵 = raw_월말 의 일별 시작 직전 월 스냅샷 */
function flowDailyStart_(shM, mm) {
  const k = Object.keys(mm).filter(x => x < ym_(CFG.DAILY_FROM)).sort().pop();
  return k ? flowMonthlyMap_(shM, mm, k) : {};
}

// ─────────────────────────── 시트 쓰기 ───────────────────────────

/** agg_설정액월별: fromYm 이후 행을 rows 로 교체(그 앞은 그대로). fromYm 없음 = 전체 */
function flowWrite_(rows, fromYm) {
  const sh = sheet_(CFG.SHEET.FLOW_ETF, FLOW.HEADER), w = FLOW.HEADER.length, lr = sh.getLastRow();
  let r0 = 2;
  if (fromYm && lr >= 2) {
    const col = sh.getRange(2, 1, lr - 1, 1).getValues();
    let i = col.findIndex(v => ymstr_(v[0]) >= fromYm); if (i < 0) i = col.length;
    r0 = i + 2;
  }
  if (r0 === 2) { sh.getRange(1, 1, 1, w).setValues([FLOW.HEADER]); sh.setFrozenRows(1); }
  sh.getRange(r0, 2, Math.max(rows.length, Math.max(lr, r0) - r0 + 1, 1), 1).setNumberFormat('@');   // 종목코드 텍스트(앞자리 0 유지) — 쓰기 전에
  putRows_(sh, r0, rows, w, Math.max(lr, r0));
}
/** agg_설정액요약 다시 쓰기: ETF × 월 시트 전체를 현재 범례(운용사·유형)로 묶음 → [월, 운용사, 상위구분, 유형최종2, 국내해외, 설정액, 평가증감, 기말NAV, 종목수, 산출] */
function flowSummary_(ctx) {
  ctx = ctx || ctx_();
  const rows = readAll_(sheet_(CFG.SHEET.FLOW_ETF, FLOW.HEADER)), agg = {}, memo = {};
  rows.forEach(r => {
    const ym = ymstr_(r[0]), c = padCode_(r[1]); if (!/^\d{4}-\d{2}$/.test(ym) || !c) return;
    const g = memo[c] || (memo[c] = groupOf_({ code: c, name: r[2], mgr: r[3] }, ctx));
    const k = [ym, g.short, g.top, g.f2, g.dom].join('|'), a = agg[k] = agg[k] || { f: 0, v: 0, e: 0, n: 0, m: r[7] };
    a.f += toNum_(r[4]); a.v += toNum_(r[5]); const e = toNum_(r[6]); a.e += e; if (e > 0) a.n++;
  });
  const out = Object.keys(agg).sort().map(k => { const p = k.split('|'), a = agg[k]; return [p[0], p[1], p[2], p[3], p[4], a.f, a.v, a.e, a.n, a.m]; });
  writeAgg_(CFG.SHEET.FLOW_SUM, FLOW.SUM_HEADER, out);
  return out.length;
}
/** 반영 후: 상태 기록 + 설정액 화면 캐시 버전 올림 */
function flowDone_(last, msg) {
  const P = PropertiesService.getScriptProperties();
  P.setProperty(PROP.FLOW_STATE, JSON.stringify({ last: last, at: Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd HH:mm'), msg: msg || '' }));
  try { SpreadsheetApp.flush(); } catch (e) {}
  P.setProperty(PROP.FLOW_VER, String(Date.now()));
}
/** 과거 보충(1좌당 NAV·상장좌수)이 끝났는지 */
function flowReady_() { try { const o = JSON.parse(PropertiesService.getScriptProperties().getProperty(PROP.FLOW_FILL) || 'null'); return !!(o && o.ok); } catch (e) { return false; } }

// ─────────────────────────── 전체·증분 계산 ───────────────────────────

/** 메뉴 '설정액 다시 계산': 2021-02 ~ 최근 영업일 전체(약 1~2분) */
function rebuildFlows() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) { scheduleContinue_('rebuildFlows', 3); return; }
  try { const r = rebuildFlows_(); log_('설정액 전체 계산: ' + r.msg); } finally { lock.releaseLock(); }
}
function cont_rebuildFlows() { clearTriggers_('cont_rebuildFlows'); rebuildFlows(); }
function rebuildFlows_() {
  const t0 = Date.now(), ix = indexMap_(), shM = sheet_(CFG.SHEET.RAW_MONTHLY, CFG.RAW_HEADER), mm = monthlyMap_(shM), dFrom = ym_(CFG.DAILY_FROM);
  const rows = [];
  let prev = null, nM = 0, nD = 0;
  Object.keys(mm).filter(k => k < dFrom).sort().forEach(k => {   // 월말 근사 구간
    const cur = flowMonthlyMap_(shM, mm, k);
    if (prev && cur) { flowRows_(k, flowMonth_([prev, cur], 'M'), 'M').forEach(r => rows.push(r)); nM++; }
    if (cur) prev = cur;
  });
  const by = flowDailyMonths_(ix), dks = Object.keys(by).sort();
  if (dks.length && !prev) prev = flowDailyStart_(shM, mm);
  dks.forEach(k => {   // 일별 구간
    const maps = flowDailyMaps_(by[k], ix), chain = [prev || {}].concat(by[k].map(d => maps[d]));
    flowRows_(k, flowMonth_(chain, 'D'), 'D').forEach(r => rows.push(r)); nD++;
    prev = maps[by[k][by[k].length - 1]];
  });
  flowWrite_(rows, null);
  const ns = flowSummary_();
  const last = dks.length ? by[dks[dks.length - 1]].slice(-1)[0] : (Object.keys(mm).sort().pop() || '');
  const msg = `월말 근사 ${nM}개월 · 일별 합 ${nD}개월 · ${rows.length}행 · 요약 ${ns}행 · ${Math.round((Date.now() - t0) / 1000)}s`;
  flowDone_(last, msg);
  return { msg: msg, rows: rows.length, last: last };
}
/** 이어서 실행용(적재 실행의 시한이 빠듯할 때) */
function flowUpdateRun() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) { scheduleContinue_('flowUpdateRun', 3); return; }
  try { const r = flowUpdate_(); if (r.state !== 'none') log_('설정액 갱신: ' + r.msg); } catch (e) { log_('설정액 갱신 실패: ' + e.message, 'WARN'); } finally { lock.releaseLock(); }
}
function cont_flowUpdateRun() { clearTriggers_('cont_flowUpdateRun'); flowUpdateRun(); }
/** 일별 적재 뒤(적재 실행·야간 점검): 마지막 반영일이 속한 월 ~ 최근 월만 다시 계산. 과거 보충 전이면 건너뜀 → {state, msg} */
function flowUpdate_() {
  if (!flowReady_()) return { state: 'notready', msg: '과거 보충 전' };
  const P = PropertiesService.getScriptProperties(), ix = indexMap_(), dates = Object.keys(ix).sort(), last = dates[dates.length - 1];
  let st = null; try { st = JSON.parse(P.getProperty(PROP.FLOW_STATE) || 'null'); } catch (e) {}
  if (!st || !st.last || !ss_().getSheetByName(CFG.SHEET.FLOW_ETF)) { const r = rebuildFlows_(); return { state: 'full', msg: r.msg }; }
  if (!last || st.last === last) return { state: 'none', msg: '최신' };
  const t0 = Date.now(), from = st.last > last ? ym_(last) : ym_(st.last), by = flowDailyMonths_(ix), ks = Object.keys(by).sort().filter(k => k >= from);
  if (!ks.length) return { state: 'none', msg: '일별 구간 아님' };
  const shM = sheet_(CFG.SHEET.RAW_MONTHLY, CFG.RAW_HEADER), mm = monthlyMap_(shM), pk = Object.keys(by).sort().filter(k => k < ks[0]).pop();
  let prev = pk ? flowDailyMaps_([by[pk][by[pk].length - 1]], ix)[by[pk][by[pk].length - 1]] : flowDailyStart_(shM, mm);
  const rows = [];
  ks.forEach(k => {
    const maps = flowDailyMaps_(by[k], ix), chain = [prev || {}].concat(by[k].map(d => maps[d]));
    flowRows_(k, flowMonth_(chain, 'D'), 'D').forEach(r => rows.push(r));
    prev = maps[by[k][by[k].length - 1]];
  });
  flowWrite_(rows, ks[0]);
  flowSummary_();
  const msg = `${ks.join(',')} 다시 계산(${rows.length}행, ${Math.round((Date.now() - t0) / 1000)}s)`;
  flowDone_(last, msg);
  return { state: 'inc', msg: msg };
}

// ─────────────────────────── 과거 보충(1회) ───────────────────────────

/** 1좌당 NAV 가 비어 있는 블록 목록 [{s:'D'|'M', date, start, count}] — 일별(최근 먼저) → 월말 */
function flowFillTodo_() {
  const out = [], ix = indexMap_(), shD = sheet_(CFG.SHEET.RAW_DAILY, CFG.RAW_HEADER), shM = sheet_(CFG.SHEET.RAW_MONTHLY, CFG.RAW_HEADER);
  const colOf = sh => { const lr = sh.getLastRow(); return lr >= 2 ? sh.getRange(2, 9, lr - 1, 1).getValues() : []; };
  const cd = colOf(shD);
  Object.keys(ix).sort().reverse().forEach(d => { const b = ix[d], v = cd[b.start - 2]; if (!v || v[0] === '' || v[0] === null) out.push({ s: 'D', date: d, start: b.start, count: b.count }); });
  const mm = monthlyMap_(shM), cm = colOf(shM);
  Object.keys(mm).sort().reverse().forEach(k => { const b = mm[k], v = cm[b[1] - 2]; if (!v || v[0] === '' || v[0] === null) out.push({ s: 'M', date: b[0], start: b[1], count: b[2] - b[1] + 1 }); });
  return out;
}
/** 메뉴 '설정액 자료 보충(1회)': 이미 적재된 일자의 1좌당 NAV·상장좌수를 KRX 에서 다시 받아 raw 두 시트의 새 2열에 채움.
 *  일별 약 190일 + 월말 약 70개월(KRX 호출 1회/일자), 4분여씩 이어서 실행 → 끝나면 설정액 전체 계산 예약 */
function backfillFlowCols() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) { scheduleContinue_('backfillFlowCols', 3); return; }
  const t0 = Date.now(), P = PropertiesService.getScriptProperties();
  let st = {}; try { st = JSON.parse(P.getProperty(PROP.FLOW_FILL) || '{}') || {}; } catch (e) {}
  const failed = st.failed || {};
  try {
    const todo = flowFillTodo_().filter(b => (failed[b.date] || 0) < 3);
    let done = 0, miss = 0;
    for (let i = 0; i < todo.length; i++) {
      if (Date.now() - t0 > FLOW.FILL_MS) break;
      const b = todo[i];
      let recs = [];
      try { recs = fetchEtfDaily_(b.date); } catch (e) { log_('설정액 자료 보충: ' + b.date + ' 조회 실패 — ' + e.message, 'WARN'); }
      if (!recs.length) { failed[b.date] = (failed[b.date] || 0) + 1; continue; }
      const m = flowMap_(recs), sh = sheet_(b.s === 'D' ? CFG.SHEET.RAW_DAILY : CFG.SHEET.RAW_MONTHLY, CFG.RAW_HEADER);
      const vals = sh.getRange(b.start, 2, b.count, 1).getValues().map(v => { const r = m[padCode_(v[0])]; if (!r) { miss++; return ['', '']; } return [r.ps || '', r.sh || '']; });
      if (vals.length && vals[0][0] === '') vals[0][0] = 0;   // 첫 행이 비면 '보충 끝' 표시를 위해 0(그 종목만 1좌당 NAV 없음 → 계산에서 평가로)
      sh.getRange(b.start, 9, b.count, 2).setValues(vals);
      done++;
    }
    const left = flowFillTodo_().filter(b => (failed[b.date] || 0) < 3).length;
    st = { done: (st.done || 0) + done, left: left, miss: (st.miss || 0) + miss, failed: failed, at: Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd HH:mm') };
    if (left) { P.setProperty(PROP.FLOW_FILL, JSON.stringify(st)); scheduleContinue_('backfillFlowCols', 1); log_(`설정액 자료 보충 진행: 이번 ${done}개 일자, 남은 ${left}개 (이어서 실행)`); return; }
    st.ok = st.at; P.setProperty(PROP.FLOW_FILL, JSON.stringify(st));
    const nf = Object.keys(failed).filter(d => failed[d] >= 3);
    log_(`설정액 자료 보충 완료: ${st.done}개 일자` + (st.miss ? ` · 응답에 없던 종목 ${st.miss}행` : '') + (nf.length ? ` · 받지 못한 일자 ${nf.join(', ')}` : '') + ' → 설정액 전체 계산 예약', nf.length ? 'WARN' : 'INFO');
    scheduleContinue_('rebuildFlows', 1);
  } finally { lock.releaseLock(); }
}
function cont_backfillFlowCols() { clearTriggers_('cont_backfillFlowCols'); backfillFlowCols(); }

// ─────────────────────────── 화면 API ───────────────────────────

/** flows: 월별 설정액·평가 증감·기말 NAV 시계열 — 시장 전체·상위 5개사+기타·유형(유형최종2)·운용사×유형. 단위 억원(unit) */
function apiFlows_() {
  const st = (() => { try { return JSON.parse(PropertiesService.getScriptProperties().getProperty(PROP.FLOW_STATE) || 'null'); } catch (e) { return null; } })();
  const sh = ss_().getSheetByName(CFG.SHEET.FLOW_SUM);
  if (!st || !sh || sh.getLastRow() < 2) return { ready: false, fill: (() => { try { return JSON.parse(PropertiesService.getScriptProperties().getProperty(PROP.FLOW_FILL) || 'null'); } catch (e) { return null; } })() };
  const rows = readAll_(sh), U = FLOW.UNIT, r2 = v => Math.round(v / U * 100) / 100;
  const months = [...new Set(rows.map(r => ymstr_(r[0])))].filter(k => /^\d{4}-\d{2}$/.test(k)).sort(), mi = {}; months.forEach((k, i) => mi[k] = i);
  const z = () => ({ f: months.map(() => 0), v: months.map(() => 0), e: months.map(() => 0), n: months.map(() => 0) });
  const groups = {}, types = {}, mt = {}, doms = {}, method = months.map(() => 'M'), tops = CFG.TOP5.concat(['기타']);
  groups['시장 전체'] = z(); tops.forEach(t => groups[t] = z());
  rows.forEach(r => {
    const i = mi[ymstr_(r[0])]; if (i === undefined) return;
    const top = tops.indexOf(String(r[2])) >= 0 ? String(r[2]) : '기타', f2 = String(r[3] || '미분류'), dom = String(r[4] || '미분류');
    const f = toNum_(r[5]), v = toNum_(r[6]), e = toNum_(r[7]), n = +r[8] || 0;
    if (r[9] === 'D') method[i] = 'D';
    [groups['시장 전체'], groups[top], types[f2] || (types[f2] = z()), doms[dom] || (doms[dom] = z()), (mt[top] = mt[top] || {})[f2] || (mt[top][f2] = z())].forEach(o => { o.f[i] += f; o.v[i] += v; o.e[i] += e; o.n[i] += n; });
  });
  const pack = o => ({ f: o.f.map(r2), v: o.v.map(r2), e: o.e.map(r2), n: o.n });
  const P = x => { const o = {}; Object.keys(x).forEach(k => o[k] = pack(x[k])); return o; };
  const mtp = {}; Object.keys(mt).forEach(t => { mtp[t] = {}; Object.keys(mt[t]).forEach(k => { const p = pack(mt[t][k]); mtp[t][k] = { f: p.f, v: p.v }; }); });
  return { ready: true, last: st.last, at: st.at, months: months, method: method, unit: U, dailyFrom: ym_(CFG.DAILY_FROM), typeOrder: CFG.TYPE_ORDER,
    groups: P(groups), types: P(types), doms: P(doms), mt: mtp };
}
/** flowTop {ym, top?, f2?}: 그 달 설정 상위·해지 상위 ETF(각 15) + 그 달 전체 건수. 행 [종목코드, 종목명, 상위구분, 유형최종2, 설정액, 평가증감, 기말NAV] (억원)
 *  top(상위 5개사·기타)·f2(유형)를 주면 그 운용사·유형 종목만 */
function apiFlowTop_(p) {
  const sh = ss_().getSheetByName(CFG.SHEET.FLOW_ETF); if (!sh || sh.getLastRow() < 2) return { ready: false };
  const lr = sh.getLastRow(), col = sh.getRange(2, 1, lr - 1, 1).getValues().map(v => ymstr_(v[0]));
  const months = [...new Set(col)].filter(k => /^\d{4}-\d{2}$/.test(k)).sort();
  const ym = p && months.indexOf(String(p.ym || '')) >= 0 ? String(p.ym) : months[months.length - 1];
  const i0 = col.indexOf(ym), i1 = col.lastIndexOf(ym);
  if (i0 < 0) return { ready: true, ym: ym, months: months, inflow: [], outflow: [], n: 0 };
  const ctx = ctx_(), U = FLOW.UNIT, r2 = v => Math.round(v / U * 100) / 100;
  let rows = sh.getRange(i0 + 2, 1, i1 - i0 + 1, FLOW.HEADER.length).getValues().map(r => { const c = padCode_(r[1]), g = groupOf_({ code: c, name: r[2], mgr: r[3] }, ctx); return [c, String(r[2]), g.top, g.f2, toNum_(r[4]), toNum_(r[5]), toNum_(r[6])]; });
  const pk = r => [r[0], r[1], r[2], r[3], r2(r[4]), r2(r[5]), r2(r[6])];
  const top = p && p.top ? String(p.top) : '', f2 = p && p.f2 ? String(p.f2) : '';
  if (top || f2) rows = rows.filter(r => (!top || r[2] === top) && (!f2 || r[3] === f2));
  const by = rows.slice().sort((a, b) => b[4] - a[4]);
  return { ready: true, ym: ym, months: months, top: top, f2: f2, method: (sh.getRange(i0 + 2, 8).getValue() || 'M'), unit: U, n: rows.length, nIn: rows.filter(r => r[4] > 0).length, nOut: rows.filter(r => r[4] < 0).length,
    inflow: by.filter(r => r[4] > 0).slice(0, 15).map(pk), outflow: by.filter(r => r[4] < 0).reverse().slice(0, 15).map(pk) };
}
/** flowCheck(점검용): 일별 구간 각 월의 ETF별 설정액 — U(화면 산식: 내재 좌수) · S1(상장좌수, 다음 영업일 좌수로 맞춤) [원 → 백만원 반올림]
 *  외부 자료와의 대조에 사용(화면에는 쓰지 않음). 일별 원자료를 모두 읽으므로 수십 초 */
function apiFlowCheck_() {
  const ix = indexMap_(), by = flowDailyMonths_(ix), ks = Object.keys(by).sort(), shM = sheet_(CFG.SHEET.RAW_MONTHLY, CFG.RAW_HEADER), mm = monthlyMap_(shM);
  const U = {}, S = {}, names = {}, M6 = v => Math.round(v / 1e6);
  let prev = flowDailyStart_(shM, mm);
  ks.forEach((k, ki) => {
    const ds = by[k], nextFirst = ks[ki + 1] ? by[ks[ki + 1]][0] : null, maps = flowDailyMaps_(nextFirst ? ds.concat([nextFirst]) : ds, ix);
    const chain = [prev || {}].concat(ds.map(d => maps[d])), res = flowMonth_(chain, 'D');
    Object.keys(res).forEach(c => { (U[c] = U[c] || {})[k] = M6(res[c].f); names[c] = res[c].name; });
    // S1: 날짜 t 의 설정 = (상장좌수_t+1 − 상장좌수_t) × NAV_t (설정분이 다음 영업일 좌수에 반영) — t = 이달 첫날 ~ 마지막 날(마지막 날은 다음 달 첫날 좌수).
    //     신규상장·상장폐지는 레코드가 생기고 없어지는 날(전월말→첫날 포함)에 순자산총액 전액
    const seq = [prev || {}].concat(ds.map(d => maps[d])).concat(nextFirst ? [maps[nextFirst]] : []);
    for (let i = 0; i + 1 < seq.length; i++) {
      const A = seq[i] || {}, B = seq[i + 1] || {}, codes = {}, tail = i === ds.length; Object.keys(A).forEach(c => codes[c] = 1); Object.keys(B).forEach(c => codes[c] = 1);
      Object.keys(codes).forEach(c => { const a = A[c], b = B[c], an = !!(a && a.nav > 0), bn = !!(b && b.nav > 0); let f = 0;
        if (an && bn) { if (i >= 1 && a.sh > 0 && b.sh > 0 && a.ps > 0) f = (b.sh - a.sh) * a.ps; }
        else if (!tail && bn && !an) f = b.nav; else if (!tail && an && !bn) f = -a.nav;
        if (f) { const o = S[c] = S[c] || {}; o[k] = (o[k] || 0) + M6(f); } });
    }
    prev = maps[ds[ds.length - 1]];
  });
  return { months: ks, unit: 1e6, U: U, S1: S, names: names };
}
