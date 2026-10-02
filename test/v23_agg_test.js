/* TZ=Asia/Seoul node test/v23_agg_test.js   (GAS_DIR=다른 gas 폴더 로 구버전 비교 가능)
 * v23 집계 재설계 검증: 실제 gas/*.gs + 모의 시트/KRX + 가짜 시계·트리거 스케줄러 + '강제 종료' 모의
 *  강제 종료 모의 = 지정 함수 호출 시 예외 → 이후 catch/finally 의 상태 기록·감시 해제·속성 삭제를 무효화(실제 6분 초과 종료와 같게)
 *  [E] 2026-10-01 사고 재현: 09-30 적재 실행이 집계 중 강제 종료 → 감시 재시도(12분 뒤)에서 9월말 = 09-30 반영되는지
 *  [F] 월 경계를 넘는 연속 적재 후 '바뀐 월만 갱신' 결과 = 전체 재계산 결과(6개 시트 행 단위 완전 일치)
 *  [G] 범례 변경 → 05시대 야간 점검 → 분할 전체 재계산(여러 실행) → 전체 재계산 결과와 일치, 지문 저장
 *  [H] 분할 전체 재계산 중 강제 종료(계산·쓰기 단계) → 15분 뒤 재시도로 완료
 *  [I] 잠금 충돌: 다른 실행 중이면 생략하지 않고 5분 뒤 재시도
 *  [J] 지수 늦게 게시 → 다음 실행에서 해당 월 지수 열 갱신
 *  [K] _index 기록 직후 강제 종료(agg_일별요약 누락) → 다음 실행에서 보충
 */
const fs = require('fs'), path = require('path'), vm = require('vm');
if (new Date('2026-01-01T00:00:00').getTimezoneOffset() !== -540) { console.error('TZ=Asia/Seoul 로 실행하십시오'); process.exit(1); }
const gasDir = process.env.GAS_DIR || path.join(__dirname, '..', 'gas');
const OLD = !!process.env.GAS_DIR;

function makeWorld(opts) {
  let NOW = new Date(opts.start).getTime();
  const RealDate = Date;
  class FakeDate extends RealDate { constructor(...a) { if (!a.length) super(NOW); else super(...a); } static now() { return NOW; } }
  const ctx = { console: { log: () => {}, error: console.error, warn: () => {} }, Date: FakeDate, Math, JSON, Object, Array, String, Number, RegExp, Error, isNaN, setTimeout, globalThis: null };
  ctx.globalThis = ctx; vm.createContext(ctx);
  ctx.MOCK_TODAY = '2099-12-31';
  vm.runInContext(fs.readFileSync(path.join(__dirname, 'shim.js'), 'utf8'), ctx);
  for (const f of fs.readdirSync(gasDir).filter(f => f.endsWith('.gs'))) vm.runInContext(fs.readFileSync(path.join(gasDir, f), 'utf8'), ctx, { filename: f });
  const pad = n => ('0' + n).slice(-2);
  const fmtD = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  ctx.Utilities.formatDate = (d, tz, f) => { const y = d.getFullYear(), m = pad(d.getMonth() + 1), dd = pad(d.getDate()), H = pad(d.getHours()), M = pad(d.getMinutes());
    return f === 'H' ? String(d.getHours()) : f === 'yyyyMMdd' ? `${y}${m}${dd}` : f === 'yyyy-MM' ? `${y}-${m}` : f === 'yyyy-MM-dd HH:mm' ? `${y}-${m}-${dd} ${H}:${M}` : f === 'MM-dd HH:mm' ? `${m}-${dd} ${H}:${M}` : `${y}-${m}-${dd}`; };
  ctx.Utilities.parseDate = (s) => new FakeDate(s.replace(' ', 'T') + ':00');
  // 캐시(6시간)·잠금 모의
  const cache = new Map();
  ctx.CacheService = { getScriptCache: () => ({
    get: k => { const e = cache.get(k); return e && e.exp > NOW ? e.v : null; },
    put: (k, v, s) => { if (String(v).length > 100000) throw new Error('cache value too large'); cache.set(k, { v: String(v), exp: NOW + (s || 600) * 1000 }); },
    getAll: ks => { const o = {}; ks.forEach(k => { const e = cache.get(k); if (e && e.exp > NOW) o[k] = e.v; }); return o; },
    remove: k => cache.delete(k), removeAll: ks => ks.forEach(k => cache.delete(k)) }) };
  ctx.__LOCKED = false;
  ctx.LockService = { getScriptLock: () => ({ tryLock: () => !ctx.__LOCKED, releaseLock: () => {} }) };
  // 트리거 레지스트리(1회성 + 매일)
  const trig = [], daily = []; let tid = 0;
  ctx.ScriptApp = {
    getProjectTriggers: () => trig.concat(daily).map(t => ({ id: t.id, getHandlerFunction: () => t.fn })),
    deleteTrigger: x => { [trig, daily].forEach(a => { const i = a.findIndex(t => t.id === x.id); if (i >= 0) a.splice(i, 1); }); },
    newTrigger: fn => { const t = { fn, id: ++tid }; const b = { timeBased() { return b; }, after(ms) { t.at = NOW + ms; return b; }, at(d) { t.at = d.getTime(); return b; }, everyDays() { t.daily = true; return b; }, atHour(h) { t.h = h; return b; }, nearMinute(m) { t.m = m; return b; }, inTimezone() { return b; }, create() { (t.daily ? daily : trig).push(t); } }; return b; }
  };
  // 시장 모의: 휴장일 = 주말 + 2026 KRX 휴장일, 게시 = 다음 영업일 08:00
  const HOL = new Set(['2026-01-01', '2026-02-16', '2026-02-17', '2026-02-18', '2026-03-02', '2026-05-01', '2026-05-05', '2026-05-25', '2026-06-03', '2026-07-17', '2026-08-17', '2026-09-24', '2026-09-25', '2026-10-05', '2026-10-09', '2026-12-25', '2026-12-31']);
  const open = ds => { const d = new RealDate(ds + 'T00:00:00'); return d.getDay() % 6 !== 0 && !HOL.has(ds); };
  const nextOpen = ds => { let d = new RealDate(ds + 'T00:00:00'); do { d.setDate(d.getDate() + 1); } while (!open(fmtD(d))); return fmtD(d); };
  const publishAt = ds => new RealDate(nextOpen(ds) + 'T08:00:00').getTime();
  const fetch0 = ctx.UrlFetchApp.fetch;
  ctx.UrlFetchApp.fetch = (url, o) => {
    const res = fetch0(url, o);
    if (url.includes('finance.yahoo.com')) {   // 지수 일봉: 당일은 09:00 이후, opts.idxDelay[날짜] 이전에는 없음
      const b = JSON.parse(res.getContentText()), r = b.chart.result[0], ts = [], cl = [];
      r.timestamp.forEach((t, i) => { const dd = fmtD(new RealDate(t * 1000)); const avail = NOW >= new RealDate(dd + 'T09:00:00').getTime() && !(opts.idxDelay && opts.idxDelay[dd] && NOW < new RealDate(opts.idxDelay[dd]).getTime());
        if ((url.includes('KS11') ? open(dd) : true) && avail) { ts.push(t); cl.push(r.indicators.quote[0].close[i]); } });
      r.timestamp = ts; r.indicators.quote[0].close = cl; return { getResponseCode: () => 200, getContentText: () => JSON.stringify(b) };
    }
    if (!url.includes('etf_bydd_trd')) return res;
    const q = url.split('basDd=')[1].slice(0, 8), ds = `${q.slice(0, 4)}-${q.slice(4, 6)}-${q.slice(6, 8)}`;
    const body = JSON.parse(res.getContentText()); const avail = open(ds) && NOW >= publishAt(ds);
    body.OutBlock_1 = body.OutBlock_1.map(r => Object.assign({}, r, avail ? {} : { INVSTASST_NETASST_TOTAMT: '0', ACC_TRDVAL: '0' }));
    return { getResponseCode: () => 200, getContentText: () => JSON.stringify(body) };
  };
  const run = code => vm.runInContext(code, ctx);
  // 강제 종료 모의: catch/finally 의 기록·해제를 무효화
  ctx.__KILLED = false; ctx.__KILL = null; ctx.__tick = ms => { NOW += ms; };
  run(`(function(){
    ['setLoadStatus_','log_','retryAfterError_','disarmWatchdog_'].forEach(n => { const o = globalThis[n]; if (o) globalThis[n] = function(){ if (__KILLED) return; return o.apply(this, arguments); }; });
    const P0 = PropertiesService.getScriptProperties;
    PropertiesService.getScriptProperties = function(){ const p = P0(); const d = p.deleteProperty; p.deleteProperty = k => { if (!__KILLED) d(k); }; return p; };
  })()`);
  const killAt = (fnNames, nth) => {   // 다음 실행에서 fnNames 중 하나가 n번째 호출될 때 강제 종료
    ctx.__KILL = { n: nth || 1 };
    fnNames.forEach(n => run(`(function(){ const o = globalThis['${n}']; if (!o || o.__w) return; const w = function(){ if (__KILL && --__KILL.n <= 0) { __KILL = null; __KILLED = true; throw new Error('KILLED(6분 초과 모의) @ ${n}'); } return o.apply(this, arguments); }; w.__w = true; globalThis['${n}'] = w; })()`));
  };
  const props = () => run(`(()=>{ const p = PropertiesService.getScriptProperties(); return { last: p.getProperty('LAST_DAILY_DATE'), status: JSON.parse(p.getProperty('LOAD_STATUS') || 'null'), pendingAgg: p.getProperty('PENDING_AGG'), full: p.getProperty('FULL_AGG'), hash: p.getProperty('AGG_LEGEND_HASH'), wd: p.getProperty('WD_RETRY') }; })()`);
  const events = [];
  const fmt = t => { const d = new RealDate(t); return `${fmtD(d)} ${pad(d.getHours())}:${pad(d.getMinutes())}`; };
  // 스케줄러: 정기(05:10 야간 점검[설치된 경우], 08:31·19:03 적재) + 1회성 트리거를 시간 순으로 실행
  function advance(until) {
    const end = new RealDate(until).getTime();
    for (;;) {
      const nextTrig = trig.slice().sort((a, b) => a.at - b.at)[0];
      let reg = null, regFn = null; const d0 = new RealDate(NOW); d0.setSeconds(0, 0);
      const slots = [[8, 31, 'loadDaily'], [19, 3, 'loadDaily']].concat(daily.some(t => t.fn === 'nightlyAgg') ? [[5, 10, 'nightlyAgg']] : []);
      for (let k = 0; k < 3; k++) { const day = new RealDate(d0); day.setDate(day.getDate() + k); for (const [h, m, fn] of slots) { const t = new RealDate(day); t.setHours(h, m, 0, 0); if (t.getTime() > NOW && (!reg || t.getTime() < reg)) { reg = t.getTime(); regFn = fn; } } }
      const nt = nextTrig && nextTrig.at <= reg ? nextTrig.at : reg;
      if (nt > end) { NOW = end; return; }
      NOW = nt;
      let fn;
      if (nextTrig && nextTrig.at === nt) { fn = nextTrig.fn; trig.splice(trig.indexOf(nextTrig), 1); } else fn = regFn;
      const before = props().last;
      try { run(fn + '()'); } catch (e) { events.push([fmt(NOW), fn, 'ERROR ' + e.message]); ctx.__KILLED = false; continue; }
      const p = props();
      events.push([fmt(NOW), fn, p.last === before ? '' : 'LOADED→' + p.last]);
    }
  }
  return { ctx, run, props, advance, events, trig, daily, killAt, setNow: t => { NOW = new RealDate(t).getTime(); }, now: () => fmt(NOW) };
}

let fails = 0;
function check(name, cond, detail) { console.log((cond ? '  OK  ' : '  FAIL') + ' ' + name + (detail ? ' — ' + detail : '')); if (!cond) { fails++; process.exitCode = 1; } }
function base(opts) {
  const w = makeWorld(opts);
  w.run(`seedLegends([]); setupSheets(); PropertiesService.getScriptProperties().setProperty('KRX_AUTH_KEY','TEST');`);
  w.setNow('2026-09-23T08:10:00');   // 2026-01-02 ~ 09-22 적재된 상태
  w.run(`backfillMonthly(); backfillDaily(); backfillKospi();`);
  w.trig.splice(0);
  return w;
}
const S = w => w.ctx.MOCK_STORE;
const aggMonths = w => { const o = {}; (S(w)['agg_시장월별'] ? S(w)['agg_시장월별'].rows.slice(1) : []).forEach(r => o[String(r[0])] = String(r[1])); return o; };
/** agg_* 6개 시트 = 같은 원천으로 새로 계산한 전체 재계산 결과(행 단위 완전 일치) + raw_월말 일자와 일치 */
function consistent(w, label) {
  const r = w.run(`(()=>{ const ctx = ctx_(), months = monthlyBlocks_(), idx = indexSeries_(), all = emptyAgg_();
    Object.keys(months).sort().forEach(k => mergeAgg_(all, aggMonth_(k, months[k], ctx, idx)));
    const bad = []; let rows = 0;
    aggSheets_().forEach(s => { const got = readAll_(sheet_(s.name)).map(r => r.slice(0, s.header.length)); rows += got.length;
      if (JSON.stringify(got) !== JSON.stringify(all[s.key])) { let i = 0; while (i < got.length && JSON.stringify(got[i]) === JSON.stringify(all[s.key][i])) i++; bad.push(s.name + ' 행' + (i + 2) + ' ' + JSON.stringify(got[i]) + ' ≠ ' + JSON.stringify(all[s.key][i]) + ' (시트 ' + got.length + '행, 기대 ' + all[s.key].length + '행)'); } });
    const st = aggStale_(); return { bad: bad, rows: rows, stale: st.stale.concat(st.extra) }; })()`);
  check(label + ': agg_* = 전체 재계산 결과(행 단위 일치)', !r.bad.length, r.bad.length ? r.bad.join(' / ') : r.rows + '행');
  check(label + ': 집계 점검 불일치 없음', !r.stale.length, r.stale.join(','));
}
const recentEvents = (w, from) => w.events.filter(e => e[1] !== 'cont_warmAll' && e[0] >= from).map(e => '    ' + e.filter(Boolean).join(' | ')).join('\n');

if (OLD) {
  console.log('[E-old] 구버전(' + gasDir + ')으로 10-01·10-02 아침 집계 강제 종료 재현');
  const w = base({ start: '2026-09-23T07:00:00' });
  w.advance('2026-10-01T08:00:00');
  w.killAt(['rebuildAggregates_']); w.advance('2026-10-01T23:00:00');
  w.killAt(['rebuildAggregates_']); w.advance('2026-10-02T12:00:00');
  const m = aggMonths(w);
  console.log(recentEvents(w, '2026-10-01'));
  console.log('  구버전 결과: agg_시장월별 2026-09 =', m['2026-09'], '/ 2026-10 =', m['2026-10'] || '(없음)', '/ LAST', w.props().last);
  process.exit(0);
}

console.log('\n[E] 2026-10-01 사고 재현: 09-30 적재 실행이 집계 중 강제 종료');
{
  const w = base({ start: '2026-09-23T07:00:00' });
  w.advance('2026-10-01T08:00:00');
  check('09-30 08:31 실행 후 9월 = 09-29', aggMonths(w)['2026-09'] === '2026-09-29', aggMonths(w)['2026-09']);
  w.killAt(['replaceAggMonths_', 'writeAgg_']);   // 10-01 08:31 실행: 집계 시트 쓰기 시작 시 강제 종료
  w.advance('2026-10-01T08:40:00');
  check('강제 종료 직후: raw_월말 9월 = 09-30, 집계는 아직 09-29', aggMonths(w)['2026-09'] === '2026-09-29' && w.run(`monthlyMap_(sheet_(CFG.SHEET.RAW_MONTHLY))['2026-09'][0]`) === '2026-09-30');
  check('감시 트리거 남음(wd_loadDaily)', w.trig.some(t => t.fn === 'wd_loadDaily'));
  w.advance('2026-10-01T09:00:00');
  check('감시 재시도(08:43)에서 9월 = 09-30 반영', aggMonths(w)['2026-09'] === '2026-09-30', aggMonths(w)['2026-09']);
  consistent(w, 'E 10-01');
  w.killAt(['replaceAggMonths_', 'writeAgg_'], 1);   // 10-02 08:31 도 강제 종료 + 감시 재시도 1회도 강제 종료
  w.advance('2026-10-02T08:35:00');
  w.killAt(['replaceAggMonths_', 'writeAgg_'], 1);
  w.advance('2026-10-02T10:00:00');
  const m = aggMonths(w);
  check('10-02: 연속 강제 종료(08:31·08:43) 후 두 번째 감시 재시도에서 10월 = 10-01', m['2026-10'] === '2026-10-01' && m['2026-09'] === '2026-09-30', JSON.stringify({ '09': m['2026-09'], '10': m['2026-10'] }));
  consistent(w, 'E 10-02');
  const meta = JSON.parse(w.run(`api('meta', {})`)).data;
  check('meta: 9월 = 09-30, 10월 = 10-01, 기본 기준일 09-30', meta.months.slice(-2).map(x => x.date).join() === '2026-09-30,2026-10-01' && meta.defaultDate === '2026-09-30', JSON.stringify(meta.months.slice(-2)) + ' ' + meta.defaultDate);
  console.log(recentEvents(w, '2026-10-01'));
}

console.log('\n[F] 월 경계를 넘는 연속 적재: 바뀐 월만 갱신 = 전체 재계산');
{
  const w = base({ start: '2026-09-23T07:00:00' });
  w.advance('2026-10-13T09:00:00');
  const m = aggMonths(w);
  check('9월 09-30 · 10월 10-12', m['2026-09'] === '2026-09-30' && m['2026-10'] === '2026-10-12', JSON.stringify({ '09': m['2026-09'], '10': m['2026-10'] }));
  consistent(w, 'F');
  const logs = S(w)['_log'].rows.filter(r => /집계 갱신\(바뀐 월만\)/.test(r[2])).map(r => r[2]);
  check('적재마다 바뀐 월만 갱신(전체 재계산 없음)', logs.length >= 10 && !S(w)['_log'].rows.some(r => /집계 재계산 완료/.test(r[2]) && r[0] > new Date('2026-09-23T09:00:00')), logs.length + '회, 예: ' + logs[logs.length - 1]);
  check('야간 점검 트리거 자동 설치', w.daily.some(t => t.fn === 'nightlyAgg'));
}

console.log('\n[G] 범례 변경 → 야간 점검 → 분할 전체 재계산');
{
  const w = base({ start: '2026-09-23T07:00:00' });
  w.advance('2026-09-30T10:00:00');
  // 첫 야간 점검: 지문 없음 → 전체 재계산(분할) 1회 → 지문 저장
  w.run(`(function(){ const o = aggMonth_; aggMonth_ = function(){ __tick(10000); return o.apply(this, arguments); }; })()`);   // 월당 10초 소요 모의 → 실행당 약 18개월
  w.advance('2026-10-01T07:00:00');
  let p = w.props();
  check('범례 지문 저장(초기 전체 재계산)·진행 중 작업 없음', !p.full && !!p.hash, 'hash ' + p.hash);
  consistent(w, 'G 첫 야간');
  // 범례 변경: 상위 1개 종목 유형을 바꾸고 운용사 약식명 변경
  const code = w.run(`readAll_(sheet_(CFG.SHEET.TYPE_LEGEND))[0][0]`);
  w.run(`(function(){ const sh = sheet_(CFG.SHEET.TYPE_LEGEND); const rows = sh.rows; rows[1][8] = '기타'; rows[1][7] = '기타';
    const g = sheet_(CFG.SHEET.MGR_LEGEND).rows; g.forEach((r, i) => { if (i && r[3] === '키움') r[3] = '키움투자'; }); })()`);
  w.advance('2026-10-01T09:00:00');   // 08:31 적재: 바뀐 월만(범례 새 값으로) → 과거 월은 아직 이전 범례
  const before = w.run(`readAll_(sheet_(CFG.SHEET.AGG_MGR)).filter(r => r[0] === '2026-08' && /키움/.test(r[1])).map(r => r[1]).join()`);
  check('적재 실행은 과거 월을 다시 계산하지 않음(08월 운용사명 그대로)', before === '키움', before);
  w.advance('2026-10-02T07:00:00');
  p = w.props();
  const after = w.run(`readAll_(sheet_(CFG.SHEET.AGG_MGR)).filter(r => r[0] === '2026-08' && /키움/.test(r[1])).map(r => r[1]).join()`);
  check('야간 점검이 범례 변경 감지 → 전체 재계산 → 과거 월 반영', !p.full && after === '키움투자', after + ' / 종목 ' + code);
  const steps = w.events.filter(e => e[1] === 'cont_fullAgg' && e[0] >= '2026-10-02').map(e => e[0].slice(11));
  check('분할 실행(실행당 약 3분 계산 → 여러 번)', steps.length >= 4, steps.length + '회: ' + steps.join(', '));
  consistent(w, 'G 범례 변경 후');
}

console.log('\n[H] 분할 전체 재계산 중 강제 종료');
{
  const w = base({ start: '2026-09-23T07:00:00' });
  w.advance('2026-09-30T10:00:00');
  w.run(`(function(){ const o = aggMonth_; aggMonth_ = function(){ __tick(10000); return o.apply(this, arguments); }; })()`);
  w.run(`requestFullAgg_('시험')`);
  w.killAt(['aggMonth_'], 5);           // 첫 단계: 5번째 월 계산 중 강제 종료
  w.advance('2026-09-30T10:05:00');
  let p = w.props(), st = JSON.parse(p.full || 'null');
  check('계산 중 종료 → 상태 보존(완료 월 기록)·재시도 트리거', st && st.done.length === 4 && st.tries === 1 && w.trig.some(t => t.fn === 'cont_fullAgg'), st && ('done ' + st.done.length + ', tries ' + st.tries));
  w.advance('2026-09-30T12:00:00');
  p = w.props();
  check('15분 뒤 재시도로 이어서 완료', !p.full && !!p.hash);
  consistent(w, 'H 계산 중 종료');
  w.run(`requestFullAgg_('시험2')`);
  w.killAt(['writeAgg_'], 3);           // 쓰기 단계: 세 번째 시트 쓰는 중 종료
  w.advance('2026-09-30T16:00:00');
  p = w.props();
  check('쓰기 중 종료 → 재시도로 완료', !p.full, p.full);
  consistent(w, 'H 쓰기 중 종료');
  console.log(recentEvents(w, '2026-09-30 10'));
}

console.log('\n[I] 잠금 충돌: 다른 실행 중이면 5분 뒤 재시도');
{
  const w = base({ start: '2026-09-23T07:00:00' });
  w.advance('2026-09-29T08:00:00');
  w.ctx.__LOCKED = true;
  w.advance('2026-09-29T08:33:00');
  check('08:31 잠금 실패 → 재시도 예약', w.trig.some(t => t.fn === 'cont_loadDaily') && w.props().last === '2026-09-23', w.props().last);
  w.ctx.__LOCKED = false;
  w.advance('2026-09-29T09:00:00');
  check('08:36 재시도에서 09-28 적재', w.props().last === '2026-09-28', w.props().last);
  consistent(w, 'I');
}

console.log('\n[J] 지수 늦게 게시: 다음 실행에서 해당 월 지수 갱신');
{
  const w = base({ start: '2026-09-23T07:00:00', idxDelay: { '2026-09-30': '2026-10-01T20:00:00' } });
  w.advance('2026-10-01T09:00:00');
  const k1 = w.run(`readAll_(sheet_(CFG.SHEET.AGG_MARKET)).filter(r => r[0] === '2026-09')[0][4]`);
  w.advance('2026-10-02T09:00:00');
  const k2 = w.run(`readAll_(sheet_(CFG.SHEET.AGG_MARKET)).filter(r => r[0] === '2026-09')[0][4]`);
  const k930 = w.run(`(indexSeries_().filter(x => x.d === '2026-09-30')[0] || {}).k`);
  check('10-01: 09-30 지수 없음 → 09-29 값 사용', k1 !== k930 && !!k1, k1 + ' vs ' + k930);
  check('10-02(또는 10-01 19:03): 09-30 지수 반영', k2 === k930, k2 + ' vs ' + k930);
  consistent(w, 'J');
}

console.log('\n[K] _index 기록 직후 강제 종료 → agg_일별요약 누락 보충');
{
  const w = base({ start: '2026-09-23T07:00:00' });
  w.advance('2026-09-29T08:00:00');
  w.killAt(['summarize_']);             // 09-29 08:31: _index 기록 후 agg_일별요약 추가 직전 종료
  w.advance('2026-09-29T08:35:00');
  const has = () => S(w)['agg_일별요약'].rows.some(r => r[0] === '2026-09-28');
  check('강제 종료 직후 09-28 요약 없음', !has() && S(w)['_index'].rows.some(r => r[0] === '2026-09-28'));
  w.advance('2026-09-29T09:30:00');
  check('감시 재시도에서 09-28 요약 보충·집계 반영', has() && aggMonths(w)['2026-09'] === '2026-09-28', aggMonths(w)['2026-09']);
  w.advance('2026-09-30T09:00:00');
  const d = S(w)['agg_일별요약'].rows.slice(1).map(r => r[0]).filter((v, i, a) => a.indexOf(v) === i);
  check('일별요약 일자 = _index 일자', d.join() === S(w)['_index'].rows.slice(1).map(r => r[0]).join(), d.slice(-3).join(','));
  consistent(w, 'K');
  console.log(recentEvents(w, '2026-09-29'));
}

console.log('\n[L] v22 표식(PENDING_AGG) 정리');
{
  const w = base({ start: '2026-09-23T07:00:00' });
  w.run(`PropertiesService.getScriptProperties().setProperty('PENDING_AGG', '1')`);
  w.advance('2026-09-23T20:00:00');
  check('PENDING_AGG 삭제', !w.props().pendingAgg);
}
console.log('\n[M] 검토 지적 1: 분할 재계산 무한 반복 방지 (준비 읽기 2분 초과·스냅샷 일자 불일치)');
{
  const w = base({ start: '2026-09-23T07:00:00' });
  w.advance('2026-09-30T10:00:00');
  w.run(`(function(){ const o = aggMonth_; aggMonth_ = function(){ __tick(10000); return o.apply(this, arguments); }; const c = ctx_; ctx_ = function(){ __tick(130000); return c.apply(this, arguments); }; })()`);   // 준비 읽기 130초
  w.run(`requestFullAgg_('느린 준비 읽기')`);
  w.advance('2026-09-30T13:00:00');
  const steps = w.events.filter(e => e[1] === 'cont_fullAgg' && e[0] >= '2026-09-30 10').length;
  check('준비 읽기가 2분을 넘어도 완료(중단 아님, 8회 이내)', !w.props().full && steps <= 8 && !w.run(`PropertiesService.getScriptProperties().getProperty(PROP.FULL_BLOCK)`) && S(w)['_log'].rows.some(r => /전체 집계 재계산 완료\(분할/.test(r[2])), steps + '회');
  consistent(w, 'M 느린 준비');
  // 스냅샷 일자 불일치를 강제로 만들어도(캐시 결과를 항상 '다시 계산'으로 판정) 3회 뒤 중단
  w.run(`(function(){ const g = CacheService.getScriptCache; CacheService.getScriptCache = function(){ const c = g(); c.getAll = () => ({}); return c; }; })()`);   // 캐시 유실 지속
  w.run(`requestFullAgg_('캐시 유실 지속')`);
  w.advance('2026-09-30T20:00:00');
  const n = w.events.filter(e => e[1] === 'cont_fullAgg' && e[0] >= '2026-09-30 13').length, p = w.props();
  check('캐시 유실 지속 → 실행 횟수 한도(8회+중단 1회)로 중단·오늘 재예약 차단', !p.full && n <= 9 && w.run(`PropertiesService.getScriptProperties().getProperty(PROP.FULL_BLOCK)`) === '2026-09-30', n + '회');
  check('같은 날 재예약 요청 거절', w.run(`requestFullAgg_('다시')`) === false && !w.trig.some(t => t.fn === 'cont_fullAgg'));
}

console.log('\n[N] 검토 지적 2: 쓰기 단계가 계속 강제 종료 → 3회 후 중단, 그날 적재 실행이 재예약하지 않음');
{
  const w = base({ start: '2026-09-23T07:00:00' });
  w.advance('2026-09-30T10:00:00');
  w.run(`(function(){ const o = writeAllAgg_; writeAllAgg_ = function(){ __KILLED = true; throw new Error('KILLED(쓰기 단계 항상 종료)'); }; globalThis.__restoreWrite = () => { writeAllAgg_ = o; }; })()`);
  w.run(`requestFullAgg_('쓰기 항상 종료')`);
  w.advance('2026-09-30T18:00:00');
  const runs = w.events.filter(e => e[1] === 'cont_fullAgg' && e[0] >= '2026-09-30 10').length;
  check('쓰기 단계 연속 강제 종료 → 중단(실행 횟수 제한)', !w.props().full && runs <= 6, runs + '회');
  // 많은 월이 어긋난 상태(지수 열 변조)에서 그날 19시·다음날 08:31 적재가 무한 재예약하지 않는지
  w.run(`(function(){ const sh = sheet_(CFG.SHEET.AGG_MARKET); sh.rows.slice(1).forEach(r => r[4] = 1); })()`);
  w.advance('2026-09-30T23:00:00');
  check('19:03 적재: 오늘 중단 → 전체 재계산 재예약 안 함', !w.props().full && !w.trig.some(t => t.fn === 'cont_fullAgg'));
  w.run(`__restoreWrite()`);
  w.advance('2026-10-01T09:30:00');
  check('다음 날 05시대 야간 점검 → 전체 재계산 완료', !w.props().full);
  consistent(w, 'N 다음 날');
}

console.log('\n[O] 검토 지적 2: 운용사 통합(행 수 감소) 후 전체 재계산 쓰기 중 강제 종료 → 중복 행 없음');
{
  const w = base({ start: '2026-09-23T07:00:00' });
  w.advance('2026-09-30T10:00:00');
  w.run(`(function(){ const g = sheet_(CFG.SHEET.MGR_LEGEND).rows; g.forEach((r, i) => { if (i && (r[3] === '한화' || r[3] === '키움')) { r[2] = '통합운용'; r[3] = '통합'; } }); })()`);
  w.killAt(['writeAgg_'], 2);   // 두 번째 시트(유형월별) 쓰기 직전 종료
  w.run(`requestFullAgg_('운용사 통합')`);
  w.advance('2026-09-30T10:20:00');
  const dup = w.run(`(function(){ const rows = readAll_(sheet_(CFG.SHEET.AGG_MGR)); const seen = {}; let d = 0; rows.forEach(r => { const k = r[0] + '|' + r[1]; if (seen[k]) d++; seen[k] = 1; }); return d; })()`);
  check('강제 종료 직후 agg_운용사월별 중복 행 없음(한 번에 쓰기)', dup === 0, dup + '건');
  w.advance('2026-09-30T12:00:00');
  check('재시도로 완료', !w.props().full);
  consistent(w, 'O');
}

console.log('\n[P] 검토 지적 5: 집계 쓰기 후 캐시 갱신 전 강제 종료 → 다음 실행에서 캐시 갱신');
{
  const w = base({ start: '2026-09-23T07:00:00' });
  w.advance('2026-09-29T08:00:00');
  w.killAt(['aggDone_']);   // 6개 시트를 다 쓴 뒤 캐시 갱신 직전 종료
  const v0 = w.run(`PropertiesService.getScriptProperties().getProperty(PROP.CACHE_VER)`);
  w.advance('2026-09-29T08:35:00');
  const v1 = w.run(`PropertiesService.getScriptProperties().getProperty(PROP.CACHE_VER)`), dirty = w.run(`PropertiesService.getScriptProperties().getProperty(PROP.AGG_DIRTY)`);
  check('종료 직후: 집계는 반영(09-28), 쓰는 중 표시 남음', aggMonths(w)['2026-09'] === '2026-09-28' && !!dirty);
  w.advance('2026-09-29T09:00:00');
  const v2 = w.run(`PropertiesService.getScriptProperties().getProperty(PROP.CACHE_VER)`);
  check('감시 재시도에서 캐시 버전 갱신·표시 해제', v2 !== v1 && !w.run(`PropertiesService.getScriptProperties().getProperty(PROP.AGG_DIRTY)`), [v0, v1, v2].join(' → '));
}

console.log('\n[Q] 검토 지적 4: 적재가 3분을 넘기면 지수·집계는 이어서 실행 / 지수 시트 쓰기 중 종료해도 비지 않음');
{
  const w = base({ start: '2026-09-23T07:00:00' });
  w.advance('2026-09-30T08:00:00');
  w.run(`(function(){ const o = fetchEtfDaily_; fetchEtfDaily_ = function(){ __tick(200000); return o.apply(this, arguments); }; globalThis.__restoreFetch = () => { fetchEtfDaily_ = o; }; })()`);   // KRX 조회 200초
  w.advance('2026-09-30T08:33:00');
  check('08:31 실행: 09-29 적재 후 지수·집계는 이어서 실행으로', w.props().last === '2026-09-29' && w.trig.some(t => t.fn === 'cont_loadDaily') && aggMonths(w)['2026-09'] === '2026-09-28', [w.props().last, aggMonths(w)['2026-09'], S(w)['_log'].rows.slice(-1).map(r => r[2]).join('')].join(' | '));
  w.run(`__restoreFetch()`);
  w.advance('2026-09-30T08:40:00');
  check('이어서 실행에서 지수·집계 갱신', aggMonths(w)['2026-09'] === '2026-09-29' && !w.run(`indexBehind_('2026-09-29')`), aggMonths(w)['2026-09']);
  consistent(w, 'Q 이어서 실행');
  const n0 = S(w)['지수'].rows.length;
  w.run(`(function(){ const sh = sheet_(CFG.SHEET.INDEX); const lr = sh.getLastRow(); const o = sh.getRange; sh.getRange = function(r, c, n, m){ const g = o.apply(sh, arguments); const sv = g.setValues; g.setValues = function(v){ if (r === 2 && c === 1 && m === 4) { __KILLED = true; throw new Error('KILLED(지수 쓰기)'); } return sv.apply(g, arguments); }; return g; }; })()`);
  let killed = false; try { w.run(`loadIndices_('2026-09-30')`); } catch (e) { killed = /KILLED/.test(e.message); } w.ctx.__KILLED = false;
  check('지수 시트 쓰기 중 종료해도 기존 행 유지(지우고 쓰지 않음)', killed && S(w)['지수'].rows.length === n0, n0 + '행 유지');
}

console.log(fails ? '\n실패 ' + fails + '건' : '\n모두 통과');
