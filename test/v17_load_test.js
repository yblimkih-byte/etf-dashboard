/* TZ=Asia/Seoul node test/v17_load_test.js
 * v17 loadDaily 시나리오 모의 실행: 실제 gas/*.gs + 모의 시트/KRX + 가짜 시계·트리거 스케줄러
 *  A) 추석(09-24·25 휴장): 09-23분이 09-28 08:00 에 게시 → 휴장 기간에는 재시도 없이 상태만 표시, 09-28 08:31 적재
 *  B) 09-23분 게시가 09-29 10:00 로 지연 → 절대 건너뛰지 않고 재시도 끝에 09-23·09-28 순서대로 적재
 *  C) 휴장일 목록에 없는 휴장(10-05 를 목록에서 뺌) → 다음 영업일 자료가 게시되면 휴장으로 판단해 건너뜀
 */
const fs = require('fs'), path = require('path'), vm = require('vm');
if (new Date('2026-01-01T00:00:00').getTimezoneOffset() !== -540) { console.error('TZ=Asia/Seoul 로 실행하십시오'); process.exit(1); }
const gasDir = path.join(__dirname, '..', 'gas');

function makeWorld(opts) {
  let NOW = new Date(opts.start).getTime();
  const RealDate = Date;
  class FakeDate extends RealDate { constructor(...a) { if (!a.length) super(NOW); else super(...a); } static now() { return NOW; } }
  const ctx = { console: { log: () => {}, error: console.error }, Date: FakeDate, Math, JSON, Object, Array, String, Number, RegExp, Error, isNaN, setTimeout, globalThis: null };
  ctx.globalThis = ctx; vm.createContext(ctx);
  ctx.MOCK_TODAY = '2099-12-31';
  vm.runInContext(fs.readFileSync(path.join(__dirname, 'shim.js'), 'utf8'), ctx);
  for (const f of fs.readdirSync(gasDir).filter(f => f.endsWith('.gs'))) vm.runInContext(fs.readFileSync(path.join(gasDir, f), 'utf8'), ctx, { filename: f });
  const pad = n => ('0' + n).slice(-2);
  const fmtD = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  // Utilities 보강
  ctx.Utilities.formatDate = (d, tz, f) => { const y = d.getFullYear(), m = pad(d.getMonth() + 1), dd = pad(d.getDate()), H = pad(d.getHours()), M = pad(d.getMinutes());
    return f === 'H' ? String(d.getHours()) : f === 'yyyyMMdd' ? `${y}${m}${dd}` : f === 'yyyy-MM-dd HH:mm' ? `${y}-${m}-${dd} ${H}:${M}` : f === 'MM-dd HH:mm' ? `${m}-${dd} ${H}:${M}` : `${y}-${m}-${dd}`; };
  ctx.Utilities.parseDate = (s) => new FakeDate(s.replace(' ', 'T') + ':00');
  // 트리거 레지스트리
  const trig = []; let tid = 0;
  ctx.ScriptApp = {
    getProjectTriggers: () => trig.map(t => ({ id: t.id, getHandlerFunction: () => t.fn })),
    deleteTrigger: x => { const i = trig.findIndex(t => t.id === x.id); if (i >= 0) trig.splice(i, 1); },
    newTrigger: fn => { const t = { fn, id: ++tid }; const b = { timeBased() { return b; }, after(ms) { t.at = NOW + ms; return b; }, at(d) { t.at = d.getTime(); return b; }, everyDays() { t.daily = true; return b; }, atHour() { return b; }, nearMinute() { return b; }, inTimezone() { return b; }, create() { if (!t.daily) trig.push(t); } }; return b; }
  };
  // 시장 모의: 휴장일 = 주말 + 2026 KRX 휴장일, 게시 = 다음 영업일 08:00 (지연 지정 가능)
  const HOL = new Set(['2026-01-01', '2026-02-16', '2026-02-17', '2026-02-18', '2026-03-02', '2026-05-01', '2026-05-05', '2026-05-25', '2026-06-03', '2026-07-17', '2026-08-17', '2026-09-24', '2026-09-25', '2026-10-05', '2026-10-09', '2026-12-25', '2026-12-31']);
  const open = ds => { const d = new RealDate(ds + 'T00:00:00'); return d.getDay() % 6 !== 0 && !HOL.has(ds); };
  const nextOpen = ds => { let d = new RealDate(ds + 'T00:00:00'); do { d.setDate(d.getDate() + 1); } while (!open(fmtD(d))); return fmtD(d); };
  const publishAt = ds => (opts.delay && opts.delay[ds]) ? new RealDate(opts.delay[ds]).getTime() : new RealDate(nextOpen(ds) + 'T08:00:00').getTime();
  const fetch0 = ctx.UrlFetchApp.fetch; const krxLog = [];
  ctx.UrlFetchApp.fetch = (url, o) => {
    const res = fetch0(url, o);
    if (url.includes('finance.yahoo.com') && url.includes('KS11')) {   // KOSPI 일봉: 개장일만, 당일은 09:00 이후
      const b = JSON.parse(res.getContentText()), r = b.chart.result[0], ts = [], cl = [];
      r.timestamp.forEach((t, i) => { const dd = fmtD(new RealDate(t * 1000)); if (open(dd) && NOW >= new RealDate(dd + 'T09:00:00').getTime()) { ts.push(t); cl.push(r.indicators.quote[0].close[i]); } });
      r.timestamp = ts; r.indicators.quote[0].close = cl; return { getResponseCode: () => 200, getContentText: () => JSON.stringify(b) };
    }
    if (!url.includes('etf_bydd_trd')) return res;
    const q = url.split('basDd=')[1].slice(0, 8), ds = `${q.slice(0, 4)}-${q.slice(4, 6)}-${q.slice(6, 8)}`;
    const body = JSON.parse(res.getContentText()); const avail = open(ds) && NOW >= publishAt(ds);
    krxLog.push(fmtD(new FakeDate()) + ' ' + ds + (avail ? ' ok' : ' -'));
    body.OutBlock_1 = body.OutBlock_1.map(r => Object.assign({}, r, avail ? {} : { INVSTASST_NETASST_TOTAMT: '0', ACC_TRDVAL: open(ds) && NOW > new RealDate(ds + 'T18:00:00').getTime() ? r.ACC_TRDVAL : '0' }));
    return { getResponseCode: () => 200, getContentText: () => JSON.stringify(body) };
  };
  const run = code => vm.runInContext(code, ctx);
  const props = () => run(`(()=>{ const p = PropertiesService.getScriptProperties(); return { last: p.getProperty('LAST_DAILY_DATE'), status: JSON.parse(p.getProperty('LOAD_STATUS') || 'null'), retry: p.getProperty('UNPUB_RETRY'), pendingAgg: p.getProperty('PENDING_AGG'), trimmed: p.getProperty('COLS_TRIMMED'), loading: p.getProperty('LOADING_SINCE') }; })()`);
  const events = [];
  // 스케줄러: until 까지 정기(08:31, 19:03) + 1회성 트리거를 시간 순으로 실행
  function advance(until) {
    const end = new RealDate(until).getTime();
    for (;;) {
      const nextTrig = trig.slice().sort((a, b) => a.at - b.at)[0];
      let reg = null; const d0 = new RealDate(NOW); d0.setSeconds(0, 0);
      for (let k = 0; k < 3 && !reg; k++) { const day = new RealDate(d0); day.setDate(day.getDate() + k); for (const [h, m] of [[8, 31], [19, 3]]) { const t = new RealDate(day); t.setHours(h, m, 0, 0); if (t.getTime() > NOW && (!reg || t.getTime() < reg)) reg = t.getTime(); } }
      const nt = nextTrig && nextTrig.at <= reg ? nextTrig.at : reg;
      if (nt > end) { NOW = end; return; }
      NOW = nt;
      let fn;
      if (nextTrig && nextTrig.at === nt) { fn = nextTrig.fn; trig.splice(trig.indexOf(nextTrig), 1); } else fn = 'loadDaily';
      const before = props().last;
      if (fn === 'cont_warmAll') { run('cont_warmAll()'); events.push([fmt(NOW), fn]); continue; }
      try { run(fn + '()'); } catch (e) { events.push([fmt(NOW), fn, 'ERROR ' + e.message]); continue; }
      const p = props();
      events.push([fmt(NOW), fn, p.last === before ? '' : 'LOADED→' + p.last, p.status && p.status.note || '']);
    }
  }
  const fmt = t => { const d = new RealDate(t); return `${fmtD(d)} ${pad(d.getHours())}:${pad(d.getMinutes())}`; };
  return { ctx, run, props, advance, events, trig, krxLog, setNow: t => { NOW = new RealDate(t).getTime(); } };
}

function check(name, cond, detail) { console.log((cond ? '  OK  ' : '  FAIL') + ' ' + name + (detail ? ' — ' + detail : '')); if (!cond) process.exitCode = 1; }
function base(opts) {
  const w = makeWorld(opts);
  w.run(`seedLegends([]); setupSheets(); PropertiesService.getScriptProperties().setProperty('KRX_AUTH_KEY','TEST');`);
  // 2026-01-02 ~ 09-22 까지 적재된 상태 만들기 (09-23 07:00 시점에 백필)
  w.setNow('2026-09-23T08:10:00');
  w.run(`backfillMonthly(); backfillDaily(); backfillKospi();`);
  w.trig.splice(0);
  return w;
}
const idx = w => w.ctx.MOCK_STORE['_index'].rows.slice(1).map(r => String(r[0]));
function integrity(w, label) {
  const d = idx(w); const sorted = d.slice().sort(); const uniq = new Set(d).size === d.length;
  check(label + ': _index 오름차순·중복 없음', uniq && d.join() === sorted.join(), d.slice(-4).join(','));
  const mm = w.run(`(()=>{ const sh = sheet_(CFG.SHEET.RAW_MONTHLY); const c = JSON.parse(PropertiesService.getScriptProperties().getProperty('MONTHLY_MAP')||'null'); PropertiesService.getScriptProperties().deleteProperty('MONTHLY_MAP'); const fresh = monthlyMap_(sh); return { cached: c && JSON.stringify(c.m), fresh: JSON.stringify(fresh), lr: sh.getLastRow(), clr: c && c.lr }; })()`);
  check(label + ': MONTHLY_MAP = 시트 실제 위치', !mm.cached || (mm.cached === mm.fresh && mm.clr === mm.lr), mm.cached ? '' : '(캐시 없음)');
  const last = d[d.length - 1];
  const snap = w.run(`(()=>{ const m = monthlyMap_(sheet_(CFG.SHEET.RAW_MONTHLY)); return m['${last.slice(0, 7)}'] && m['${last.slice(0, 7)}'][0]; })()`);
  check(label + ': 당월 월말 스냅샷 = 마지막 적재일', snap === last, snap + ' vs ' + last);
}

console.log('\n[A] 추석: 09-23분 09-28 08:00 게시');
{
  const w = base({ start: '2026-09-23T07:00:00' });
  check('백필 결과 LAST=09-22', w.props().last === '2026-09-22', w.props().last);
  w.advance('2026-09-24T09:00:00');
  let p = w.props();
  check('09-24 08:31 상태 note', p.status && p.status.note === '09-23(수)분 KRX 미게시 — 추석 연휴(09-24~09-25) 휴장, 09-28(월) 오전 게시 예상', p.status && p.status.note);
  check('휴장 기간 낮 재시도 예약 없음', !w.trig.some(t => t.fn === 'cont_loadDaily'), JSON.stringify(w.trig.map(t => t.fn)));
  w.advance('2026-09-26T12:00:00');
  p = w.props();
  check('빈 열 정리 1회 수행', !!p.trimmed && w.ctx.MOCK_STORE['raw_일별']._maxc === 8, 'raw_일별 열 ' + w.ctx.MOCK_STORE['raw_일별']._maxc + ', raw_월말 ' + w.ctx.MOCK_STORE['raw_월말']._maxc + ', agg_일별요약 ' + w.ctx.MOCK_STORE['agg_일별요약']._maxc);
  w.advance('2026-09-28T09:00:00');
  p = w.props();
  check('09-28 08:31 에 09-23 적재', p.last === '2026-09-23', p.last);
  check('09-24·25 는 적재 안 함', !idx(w).includes('2026-09-24') && !idx(w).includes('2026-09-25'));
  check('09-28 상태: 미게시 없음', p.status && !p.status.pending, JSON.stringify(p.status));
  w.advance('2026-09-29T09:30:00');
  p = w.props();
  check('09-29 08:31 에 09-28 적재', p.last === '2026-09-28', p.last);
  integrity(w, 'A');
  console.log('  실행 기록:'); w.events.filter(e => e[1] !== 'cont_warmAll').forEach(e => console.log('   ', e.filter(Boolean).join(' | ')));
  const warms = w.events.filter(e => e[1] === 'cont_warmAll').map(e => e[0].slice(5)); console.log('  예열 실행:', warms.join(', '));
  check('야간(22~08:30) 예열 없음', warms.length > 0 && warms.every(t => { const h = +t.slice(6, 8), m = +t.slice(9, 11); return !(h >= 22 || h < 8 || (h === 8 && m < 30)); }), warms.length + '회');
}

console.log('\n[B] 09-23분 게시가 09-29 10:00 로 지연');
{
  const w = base({ start: '2026-09-23T07:00:00', delay: { '2026-09-23': '2026-09-29T10:00:00' } });
  w.advance('2026-09-28T09:00:00');
  let p = w.props();
  check('09-28 08:31: 09-23 건너뛰지 않고 대기', p.last === '2026-09-22' && p.status.pending === '2026-09-23', p.last + ' / ' + p.status.note);
  check('09-28 상태 = 게시 지연', /게시 지연/.test(p.status.note), p.status.note);
  check('낮 재시도 예약됨', w.trig.some(t => t.fn === 'cont_loadDaily'));
  w.advance('2026-09-29T16:00:00');
  p = w.props();
  check('09-29 재시도에서 09-23 → 09-28 순서로 적재', p.last === '2026-09-28' && idx(w).slice(-2).join() === '2026-09-23,2026-09-28', idx(w).slice(-3).join(','));
  integrity(w, 'B');
  w.events.filter(e => e[1] !== 'cont_warmAll' && e[0] >= '2026-09-28').forEach(e => console.log('   ', e.filter(Boolean).join(' | ')));
}

console.log('\n[C] 목록에 없는 휴장(10-05 를 목록에서 제외)');
{
  const w = base({ start: '2026-09-23T07:00:00' });
  w.run(`delete CFG.KRX_HOLIDAYS['2026-10-05']`);
  w.advance('2026-10-06T09:00:00');
  let p = w.props();
  check('10-06 08:31: 10-05 대기(건너뛰지 않음)', p.last === '2026-10-02' && p.status.pending === '2026-10-05', p.last + ' / ' + (p.status && p.status.note));
  w.advance('2026-10-07T09:00:00');
  p = w.props();
  check('10-07 08:31: 10-06 게시 확인 → 10-05 휴장 판단, 10-06 적재', p.last === '2026-10-06' && !idx(w).includes('2026-10-05'), p.last);
  const warn = w.ctx.MOCK_STORE['_log'].rows.filter(r => /휴장으로 판단/.test(r[2])).map(r => r[2]);
  w.events.filter(e => e[1] !== 'cont_warmAll' && e[0] >= '2026-10-05').forEach(e => console.log('   ', e.filter(Boolean).join(' | ')));
  check('WARN 로그 남김', warn.length === 1, warn[0]);
  integrity(w, 'C');
}

console.log('\n[D] meta 응답에 상태 포함');
{
  const w = base({ start: '2026-09-23T07:00:00' });
  w.advance('2026-09-24T09:00:00');
  const m = JSON.parse(w.run(`api('meta', {})`)).data, m2 = JSON.parse(w.run(`api('meta', {})`)).data;
  check('meta.loadStatus.note', m.loadStatus && /추석/.test(m.loadStatus.note), m.loadStatus && m.loadStatus.note);
  w.advance('2026-09-28T09:00:00');
  const m3 = JSON.parse(w.run(`api('meta', {})`)).data;
  check('두 번째 호출도 상태 포함', !!(m2.loadStatus && m2.loadStatus.at === m.loadStatus.at), m2.loadStatus && m2.loadStatus.at);
  check('적재 뒤 meta: lastLoaded 09-23·미게시 없음', m3.lastLoaded === '2026-09-23' && m3.loadStatus && !m3.loadStatus.pending, m3.lastLoaded + ' ' + JSON.stringify(m3.loadStatus));
}
console.log(process.exitCode ? '\n실패 있음' : '\n모두 통과');
