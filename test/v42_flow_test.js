/* TZ=Asia/Seoul node test/v42_flow_test.js — v42 설정액(자금 유출입)·평가 증감 분리 점검(모의)
 *  A) 산식: 하루·두 시점 근사·신규상장·상장폐지·분할(배수 보정)·급락(분할 아님)
 *  B) 과거 보충(backfillFlowCols): 8열 시트 → 10열·머리글, 1좌당 NAV·상장좌수 채움, 이어서 실행·완료 표시·전체 계산 예약
 *  C) 전체 계산(rebuildFlows_): ETF·월 항등식(기말 − 기초 = 설정액 + 평가 증감), 시장 합계, 일별 'D'·월말 근사 'M', 분할 종목 보정
 *  D) 증분 갱신(flowUpdate_): 마지막 반영일 이후 월만 다시 계산 = 전체 계산과 같은 값, 앞 월 행 그대로
 *  E) API: flows(시계열 합계 일치)·flowTop(정렬·건수)·flowCheck(U = 시트 값) · 캐시 키(설정액 버전)
 *  F) 연결: 적재·야간 점검·전체 집계 뒤 요약·예열·메뉴 */
const fs = require('fs'), path = require('path'), vm = require('vm');
const ctx = { console: { log: () => {} }, Date, Math, JSON, Object, Array, String, Number, RegExp, Error, isNaN, setTimeout, globalThis: null, __zlib: require('zlib'), __Buffer: Buffer, encodeURIComponent, decodeURIComponent };
ctx.globalThis = ctx; vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname, 'shim.js'), 'utf8'), ctx);
const gasDir = path.join(__dirname, '..', 'gas');
for (const f of fs.readdirSync(gasDir).filter(f => f.endsWith('.gs')).sort()) vm.runInContext(fs.readFileSync(path.join(gasDir, f), 'utf8'), ctx, { filename: f });
const st = JSON.parse(fs.readFileSync(path.join(__dirname, 'store.json'), 'utf8')); ctx.__s = st;
vm.runInContext(`(function(){ const ss = SpreadsheetApp.getActiveSpreadsheet(); Object.keys(__s.store).forEach(n => { const sh = ss.insertSheet(n); sh.rows = JSON.parse(JSON.stringify(__s.store[n])); }); Object.keys(__s.props).forEach(k => PropertiesService.getScriptProperties().setProperty(k, __s.props[k])); })()`, ctx);
const R = s => vm.runInContext(s, ctx), J = s => JSON.parse(R(`JSON.stringify(${s})`));
let fails = 0; const check = (name, ok, info) => { if (!ok) fails++; console.info((ok ? '  OK   ' : '  FAIL ') + name + (info !== undefined ? ' — ' + (typeof info === 'string' ? info : JSON.stringify(info)) : '')); };
const S = ctx.MOCK_STORE, P = k => R(`PropertiesService.getScriptProperties().getProperty(${JSON.stringify(k)})`);
const near = (a, b, t) => Math.abs(a - b) <= (t === undefined ? 1 : t);
ctx.Utilities.sleep = () => {};

console.info('A) 산식');
let r = J(`flowStep_({nav:100, ps:10}, {nav:110, ps:11})`); check('설정 없음: NAV +10% → 평가 +10, 설정 0', near(r[0], 0, 1e-9) && near(r[1], 10, 1e-9), r);
r = J(`flowStep_({nav:100, ps:10}, {nav:132, ps:11})`); check('설정 있음: NAV 100→132, 1좌당 10→11 → 좌수 10→12, 설정 = 2좌 × 전일 NAV 10 = +20, 평가 = 12좌 × 1 = +12', near(r[0], 20, 1e-9) && near(r[1], 12, 1e-9), r);
r = J(`flowStep_(null, {nav:50, ps:10})`); check('신규상장 = 첫날 순자산 전액 설정', r[0] === 50 && r[1] === 0, r);
r = J(`flowStep_({nav:70, ps:9}, {nav:0, ps:0})`); check('상장폐지 = 직전 순자산 전액 해지', r[0] === -70 && r[1] === 0, r);
r = J(`flowStep_({nav:1000, ps:50000}, {nav:1010, ps:5050})`); check('1:10 분할(1좌당 NAV 1/10, 내재 좌수 10배) → 배수 보정: 평가 +10, 설정 0', near(r[0], 0, 1e-6) && near(r[1], 10, 1e-6), r);
r = J(`flowStep_({nav:1000, ps:1000}, {nav:1000, ps:5000})`); check('5:1 병합 → 보정(설정·평가 0)', near(r[0], 0, 1e-6) && near(r[1], 0, 1e-6), r);
r = J(`flowStep_({nav:1000, ps:10000}, {nav:500, ps:5000})`); check('레버리지 급락 −50%(좌수 그대로) → 분할 아님: 평가 −500', near(r[0], 0, 1e-6) && near(r[1], -500, 1e-6), r);
r = J(`flowStep_({nav:100, ps:0}, {nav:120, ps:0})`); check('1좌당 NAV 없음(보충 전) → 증감 전부 평가', r[0] === 0 && r[1] === 20, r);
r = J(`flowSpan_({nav:100, ps:10}, {nav:165, ps:11})`); check('월말 두 시점 근사: 내재 좌수 10→15 × 평균 NAV 10.5 = 설정 52.5, 평가 12.5', near(r[0], 52.5, 1e-9) && near(r[1], 12.5, 1e-9), r);
const m3 = J(`flowMonth_([{X:{nav:100, ps:10, name:'X', mgr:'m'}}, {X:{nav:132, ps:11, name:'X', mgr:'m'}}, {X:{nav:120, ps:10, name:'X', mgr:'m'}, Y:{nav:30, ps:10, name:'Y', mgr:'m'}}], 'D')`);
check('한 달 합: X 설정 +20 + (12좌 → 12좌 = 0), 평가 +12 −12 · Y 신규 +30 · 기말 NAV', near(m3.X.f, 20, 1e-9) && near(m3.X.v, 0, 1e-9) && m3.X.e === 120 && m3.Y.f === 30 && m3.Y.e === 30, m3);

console.info('B) 과거 보충(1좌당 NAV·상장좌수)');
const want = {};   // 보충 전 값(정답)
['raw_일별', 'raw_월말'].forEach(n => { const sh = S[n]; want[n] = sh.rows.map(x => [x[8], x[9]]); sh.rows = sh.rows.map((x, i) => i ? x.slice(0, 8) : x.slice(0, 8)); sh._maxc = 8; sh._strict = true; });
R(`Object.keys(SHEET_W_).forEach(k => delete SHEET_W_[k])`);
ctx.MOCK_TRIGGERS.length = 0;
let calls0 = ctx.MOCK_CALLS, runs = 0;
R(`const __fm = flowMap_; flowMap_ = () => { throw new Error('6분 한도(모의)'); }; try { backfillFlowCols(); } catch (e) {} flowMap_ = __fm;`);   // 실행 도중 끊김(6분 한도) 모의
check('도중에 끊겨도 이어서 실행(시작할 때 8분 뒤 감시 예약)', ctx.MOCK_TRIGGERS.some(t => t.fn === 'cont_backfillFlowCols' && t.after === 8 * 60 * 1000) && !P('FLOW_FILL'), ctx.MOCK_TRIGGERS.map(t => t.fn + ':' + t.after));
ctx.MOCK_TRIGGERS.length = 0; calls0 = ctx.MOCK_CALLS;
R(`FLOW.FILL_MS = 0`);   // 1회 실행에 1일자만 → 이어서 실행 경로 점검
R(`backfillFlowCols()`); runs++;
const p1 = JSON.parse(P('FLOW_FILL'));
check('8열 시트 → 10열 · 머리글(1좌당NAV·상장좌수)', S['raw_일별']._maxc === 10 && S['raw_월말']._maxc === 10 && S['raw_일별'].rows[0][8] === '1좌당NAV' && S['raw_월말'].rows[0][9] === '상장좌수', S['raw_일별'].rows[0].slice(8));
check('시한 도달 → 진행 상태 기록·1분 뒤 이어서 실행', p1 && p1.left > 0 && !p1.ok && ctx.MOCK_TRIGGERS.some(t => t.fn === 'cont_backfillFlowCols'), p1 && { done: p1.done, left: p1.left });
R(`FLOW.FILL_MS = 4.2 * 60 * 1000`);
for (let i = 0; i < 5 && !(JSON.parse(P('FLOW_FILL')) || {}).ok; i++) { R(`backfillFlowCols()`); runs++; }
const p2 = JSON.parse(P('FLOW_FILL'));
const nDates = Object.keys(J(`indexMap_()`)).length + Object.keys(J(`monthlyMap_(sheet_(CFG.SHEET.RAW_MONTHLY))`)).length;
check('완료 표시(ok) · 일자 수 = 일별 + 월말 블록 수 · KRX 호출 = 일자 수', p2 && p2.ok && p2.done === nDates && ctx.MOCK_CALLS - calls0 === nDates, { done: p2 && p2.done, nDates, calls: ctx.MOCK_CALLS - calls0, runs });
let same = true, bad = 0; ['raw_일별', 'raw_월말'].forEach(n => S[n].rows.forEach((x, i) => { if (i && (x[8] !== want[n][i][0] || x[9] !== want[n][i][1])) { same = false; bad++; } }));
check('채운 값 = 원래 값(모든 행)', same, bad + '행 다름');
check('완료 → 설정액 전체 계산 예약(cont_rebuildFlows)', ctx.MOCK_TRIGGERS.some(t => t.fn === 'cont_rebuildFlows'));
const c1 = ctx.MOCK_CALLS; R(`backfillFlowCols()`);
check('다시 실행해도 할 일 없음(KRX 호출 없음)', ctx.MOCK_CALLS === c1);

console.info('C) 전체 계산');
// 분할 주입: 한 종목의 일정 일자부터 1좌당 NAV 1/10 · 좌수 10배(순자산 그대로) — 보정되면 설정액은 분할 전과 같아야 함
const before = J(`rebuildFlows_()`);
const rowsA = S['agg_설정액월별'].rows.slice(1);
check('ETF × 월 행 · 일별 구간 D · 월말 구간 M', rowsA.length > 1000 && rowsA.some(x => x[7] === 'D') && rowsA.some(x => x[7] === 'M') && rowsA.filter(x => x[7] === 'D').every(x => x[0] >= '2026-01') && rowsA.filter(x => x[7] === 'M').every(x => x[0] < '2026-01' && x[0] >= '2021-02'), before.msg);
const rawD = S['raw_일별'].rows.slice(1), rawM = S['raw_월말'].rows.slice(1);
const navAt = {}; rawD.forEach(x => { (navAt[x[0]] = navAt[x[0]] || {})[x[1]] = +x[4] || 0; }); rawM.forEach(x => { (navAt[x[0]] = navAt[x[0]] || {})[x[1]] = navAt[x[0]][x[1]] === undefined ? (+x[4] || 0) : navAt[x[0]][x[1]]; });
const mEnd = {}; rawM.forEach(x => { const k = x[0].slice(0, 7); if (!mEnd[k] || x[0] > mEnd[k]) mEnd[k] = x[0]; }); rawD.forEach(x => { const k = x[0].slice(0, 7); if (!mEnd[k] || x[0] > mEnd[k]) mEnd[k] = x[0]; });
const ks = Object.keys(mEnd).sort(), prevEnd = k => mEnd[ks[ks.indexOf(k) - 1]];
let idBad = 0, idN = 0;
rowsA.forEach(x => { const s0 = (navAt[prevEnd(x[0])] || {})[x[1]] || 0, e0 = (navAt[mEnd[x[0]]] || {})[x[1]] || 0; idN++; if (!near(e0 - s0, x[4] + x[5], 3) || !near(+x[6], e0, 1)) idBad++; });
check('항등식: ETF·월마다 기말 NAV − 기초 NAV = 설정액 + 평가 증감(반올림 ±3원)', idBad === 0, `${idBad}/${idN}`);
const mk = {}; rowsA.forEach(x => { mk[x[0]] = (mk[x[0]] || 0) + x[4] + x[5]; });
const mkBad = Object.keys(mk).filter(k => { const tot = d => Object.values(navAt[d] || {}).reduce((a, b) => a + b, 0); return !near(mk[k], tot(mEnd[k]) - tot(prevEnd(k)), 1000); });
check('시장 합계: 월별 설정액 + 평가 증감 = 시장 NAV 증감', !mkBad.length, mkBad.slice(0, 3).join(','));
// 일별 독립 계산(한 종목·한 달): Σ (NAV_t − NAV_t−1 × ps_t/ps_t−1)
const code = rawD[0][1], ds = [...new Set(rawD.map(x => x[0]))].filter(d => d.slice(0, 7) === '2026-03').sort();
const rec = d => rawD.find(x => x[0] === d && x[1] === code), pe = rawD.filter(x => x[0] === mEnd['2026-02'] && x[1] === code)[0];
let fx = 0, a = pe; ds.forEach(d => { const b = rec(d); fx += (b[4] / b[8] - a[4] / a[8]) * a[8]; a = b; });   // Σ 좌수 증감 × 전일 NAV
const got = rowsA.find(x => x[0] === '2026-03' && x[1] === code);
check('독립 계산(한 종목 3월 일별 합)과 같음', got && near(got[4], fx, 1), { got: got && got[4], fx: Math.round(fx) });
// 분할 주입 후 다시 계산
const sc = rawD.find(x => x[0] >= '2026-05-11')[1], sd = '2026-05-11';
S['raw_일별'].rows.forEach((x, i) => { if (i && x[1] === sc && x[0] >= sd) { x[8] = Math.round(x[8] / 10 * 100) / 100; x[9] = x[9] * 10; } });
S['raw_월말'].rows.forEach((x, i) => { if (i && x[1] === sc && x[0] >= sd) { x[8] = Math.round(x[8] / 10 * 100) / 100; x[9] = x[9] * 10; } });
J(`rebuildFlows_()`);
const rowsB = S['agg_설정액월별'].rows.slice(1), fA = rowsA.filter(x => x[1] === sc && x[0] >= '2026-05').map(x => x[4]), fB = rowsB.filter(x => x[1] === sc && x[0] >= '2026-05').map(x => x[4]);
const maxDiff = Math.max(...fA.map((v, i) => Math.abs(v - fB[i]) / Math.max(1, Math.abs(v), 1e8)));
check('1:10 분할 종목: 분할 전 자료와 설정액 같음(1좌당 NAV 반올림 차 이내)', fA.length && fA.length === fB.length && maxDiff < 0.01, { sc, months: fA.length, maxDiff });
S['raw_일별'].rows.forEach((x, i) => { if (i && x[1] === sc && x[0] >= sd) { x[8] = want['raw_일별'][i][0]; x[9] = want['raw_일별'][i][1]; } });
S['raw_월말'].rows.forEach((x, i) => { if (i && x[1] === sc && x[0] >= sd) { x[8] = want['raw_월말'][i][0]; x[9] = want['raw_월말'][i][1]; } });
J(`rebuildFlows_()`);
const sum = S['agg_설정액요약'].rows.slice(1);
const sf = sum.reduce((a, x) => a + x[5], 0), ef = S['agg_설정액월별'].rows.slice(1).reduce((a, x) => a + x[4], 0);
check('요약 시트 합계 = ETF × 월 합계(설정액)', near(sf, ef, 10), { sf, ef });
check('요약 시트: 상위구분 = 상위 5개사 + 기타, 산출 열', sum.every(x => ['삼성', '미래', 'KB', '한투', '신한', '기타'].includes(x[2])) && sum.some(x => x[9] === 'D') && sum.some(x => x[9] === 'M'));
const fst = JSON.parse(P('FLOW_STATE')), lastD = Object.keys(J(`indexMap_()`)).sort().pop();
check('상태: 마지막 반영일 = 최종 적재일, 설정액 버전 기록', fst.last === lastD && +P('FLOW_VER') > 0, fst);

// 나눠 실행(월 단위로 끊어 이어서 — 실자료는 6분 초과) = 한 번에 계산. 이전 계산이 더 길었던 경우(남는 행)·도중 끊김(상태 되돌림)·진행 중 증분 갱신 보류
const live = rows => JSON.stringify(rows.filter(x => x && x[0] !== '' && x[0] !== undefined && x[0] !== null));
const one = live(S['agg_설정액월별'].rows), oneSum = live(S['agg_설정액요약'].rows);
S['agg_설정액월별'].rows = S['agg_설정액월별'].rows.concat(S['agg_설정액월별'].rows.slice(1, 50).map(x => x.slice()));
let nRun = 0, rr, saved = null, busy = null;
do {
  rr = J(`rebuildFlows_(1)`); nRun++;
  if (nRun === 3) busy = J(`flowUpdate_()`).state;
  if (nRun === 5) saved = P('FLOW_JOB');
  if (nRun === 7) R(`PropertiesService.getScriptProperties().setProperty(PROP.FLOW_JOB, ${JSON.stringify(saved)})`);   // 6·7번째 실행이 끊겨 상태가 저장되지 않은 경우
} while (rr.cont && nRun < 500);
{ const a1 = JSON.parse(live(S['agg_설정액월별'].rows)), b1 = JSON.parse(one); var dbg = { nRun, cont: rr.cont, job: !!P('FLOW_JOB'), n: [a1.length, b1.length], sum: live(S['agg_설정액요약'].rows) === oneSum, firstDiff: a1.findIndex((x, i) => JSON.stringify(x) !== JSON.stringify(b1[i])) }; dbg.at = dbg.firstDiff >= 0 ? [a1[dbg.firstDiff], b1[dbg.firstDiff]] : null; }
check('나눠 실행(월마다 끊고 이어서·도중 끊김 포함) = 한 번에 계산 · 남는 행 정리 · 작업 상태 삭제', !rr.cont && nRun > 60 && live(S['agg_설정액월별'].rows) === one && live(S['agg_설정액요약'].rows) === oneSum && !P('FLOW_JOB'), dbg);
check('전체 계산 진행 중에는 증분 갱신 보류(busy)', busy === 'busy', busy);
ctx.MOCK_TRIGGERS.length = 0; R(`rebuildFlows()`);
check('메뉴 실행: 감시 예약 후 끝나면(한 번에 끝나는 크기) 상태 정리', !P('FLOW_JOB') && ctx.MOCK_TRIGGERS.some(t => t.fn === 'cont_rebuildFlows' && t.after === 8 * 60 * 1000), ctx.MOCK_TRIGGERS.map(t => t.fn + ':' + t.after));

console.info('D) 증분 갱신');
const full = JSON.stringify(S['agg_설정액월별'].rows), fullSum = JSON.stringify(S['agg_설정액요약'].rows);
R(`PropertiesService.getScriptProperties().setProperty(PROP.FLOW_STATE, JSON.stringify({ last: '2026-08-20' }))`);
S['agg_설정액월별'].rows.forEach((x, i) => { if (i && x[0] >= '2026-08') x[4] = 999; });   // 다시 계산되어야 할 월을 일부러 망가뜨림
const early = JSON.stringify(S['agg_설정액월별'].rows.filter((x, i) => i && x[0] < '2026-08'));
const u = J(`flowUpdate_()`);
check('8월 20일 이후 → 8·9월만 다시 계산', u.state === 'inc' && /2026-08,2026-09/.test(u.msg), u);
check('다시 계산한 결과 = 전체 계산과 같음(ETF × 월·요약)', JSON.stringify(S['agg_설정액월별'].rows) === full && JSON.stringify(S['agg_설정액요약'].rows) === fullSum);
check('앞 월(7월까지) 행은 그대로', JSON.stringify(S['agg_설정액월별'].rows.filter((x, i) => i && x[0] < '2026-08')) === early);
check('최신이면 할 일 없음', J(`flowUpdate_()`).state === 'none');
const fsv = P('FLOW_STATE'); R(`PropertiesService.getScriptProperties().deleteProperty(PROP.FLOW_STATE)`); ctx.MOCK_TRIGGERS.length = 0;
const fu = J(`flowUpdate_()`);
check('계산 기록 없음 → 전체 계산을 별도 실행으로 예약(적재 실행 안에서 돌리지 않음)', fu.state === 'full' && ctx.MOCK_TRIGGERS.some(t => t.fn === 'cont_rebuildFlows' && t.after === 60000), fu);
R(`PropertiesService.getScriptProperties().setProperty(PROP.FLOW_STATE, ${JSON.stringify(fsv)})`);
R(`PropertiesService.getScriptProperties().setProperty(PROP.FLOW_FILL, JSON.stringify({ left: 3 }))`);
check('과거 보충 전이면 건너뜀', J(`flowUpdate_()`).state === 'notready');
R(`PropertiesService.getScriptProperties().setProperty(PROP.FLOW_FILL, JSON.stringify({ ok: 'x' }))`);

console.info('E) API');
const fl = J(`JSON.parse(api('flows', {})).data`);
const mi = fl.months.length, last = mi - 1;
check('flows: 준비됨 · 월 목록 · 산출(M → D) · 단위 억원', fl.ready && fl.months[0] === '2021-02' && fl.method[0] === 'M' && fl.method[last] === 'D' && fl.unit === 1e8 && fl.last === lastD, { first: fl.months[0], last: fl.months[last], n: mi });
const g = fl.groups, tops = ['삼성', '미래', 'KB', '한투', '신한', '기타'];
const sumTop = i => tops.reduce((a, t) => a + g[t].f[i], 0), sumType = i => Object.keys(fl.types).reduce((a, t) => a + fl.types[t].f[i], 0);
check('시장 전체 = 상위 5개사 + 기타 = 유형 합(반올림 ±0.1억)', fl.months.every((k, i) => near(g['시장 전체'].f[i], sumTop(i), 0.1) && near(g['시장 전체'].f[i], sumType(i), 0.1)));
check('운용사 × 유형 합 = 운용사', tops.every(t => fl.months.every((k, i) => near(Object.keys(fl.mt[t] || {}).reduce((a, x) => a + fl.mt[t][x].f[i], 0), g[t].f[i], 0.1))));
check('설정액 + 평가 증감 = 기말 NAV 증감(시장, 2개월째부터)', fl.months.slice(1).every((k, j) => near(g['시장 전체'].f[j + 1] + g['시장 전체'].v[j + 1], g['시장 전체'].e[j + 1] - g['시장 전체'].e[j], 0.2)));
const ftRaw = R(`api('flowTop', { ym: '2026-09' })`); if (!/"ok":true/.test(ftRaw)) console.info(ftRaw.slice(0, 300)); const ft = JSON.parse(ftRaw).data;
check('flowTop: 설정 상위(내림차순, 양수)·해지 상위(오름차순, 음수) 각 15 이하, 건수', ft.ym === '2026-09' && ft.inflow.length <= 15 && ft.inflow.every((x, i, a) => x[4] > 0 && (!i || a[i - 1][4] >= x[4])) && ft.outflow.every((x, i, a) => x[4] < 0 && (!i || a[i - 1][4] <= x[4])) && ft.n > 0 && ft.method === 'D', { n: ft.n, in1: ft.inflow[0], out1: ft.outflow[0] });
const ftK = JSON.parse(R(`api('flowTop', { ym: '2026-09', top: '한투', f2: '해외주식형' })`)).data;
check('flowTop: 운용사·유형 선택 → 그 종목만', ftK.top === '한투' && ftK.n > 0 && ftK.n < ft.n && ftK.inflow.concat(ftK.outflow).every(x => x[2] === '한투' && x[3] === '해외주식형'), { n: ftK.n });
check('flowTop: 월 없으면 최근 월', J(`JSON.parse(api('flowTop', {})).data`).ym === fl.months[last]);
const fc = J(`JSON.parse(api('flowCheck', {})).data`);
const sheetU = {}; S['agg_설정액월별'].rows.slice(1).filter(x => x[7] === 'D').forEach(x => { (sheetU[x[1]] = sheetU[x[1]] || {})[x[0]] = Math.round(x[4] / 1e6); });
const uBad = Object.keys(sheetU).filter(c => Object.keys(sheetU[c]).some(k => (fc.U[c] || {})[k] !== sheetU[c][k] && sheetU[c][k] !== 0));
check('flowCheck: U(화면 산식) = 시트 값(백만원), 일별 월 목록, S1(상장좌수) 제공', fc.months.join() === fl.months.filter((k, i) => fl.method[i] === 'D').join() && !uBad.length && Object.keys(fc.S1).length > 100, { bad: uBad.length, months: fc.months.length });
const k1 = R(`cacheKey_('flows', {})`); R(`PropertiesService.getScriptProperties().setProperty(PROP.FLOW_VER, '123')`); const k2 = R(`cacheKey_('flows', {})`);
ctx.MOCK_CACHE = true; R(`PropertiesService.getScriptProperties().setProperty(PROP.FLOW_STATE, '')`); const nr1 = JSON.parse(R(`api('flows', {})`)).data; R(`PropertiesService.getScriptProperties().setProperty(PROP.FLOW_FILL, JSON.stringify({ done: 9, left: 1 }))`); const nr2 = JSON.parse(R(`api('flows', {})`)).data;
ctx.MOCK_CACHE = false;
check('준비 전 응답은 캐시하지 않음(진행률이 바로 바뀜)', nr1.ready === false && nr2.ready === false && nr2.fill.done === 9, { nr2: nr2.fill });
R(`PropertiesService.getScriptProperties().setProperty(PROP.FLOW_FILL, JSON.stringify({ ok: 'x' }))`);
check('캐시 키에 설정액 버전(계산할 때마다 새 응답)', k1 !== k2 && /\.f123:flows:/.test(k2) && !/\.f/.test(R(`cacheKey_('byMgr', { date: '2026-09-09', ref: 'py' })`)));

console.info('F) 연결');
const load = fs.readFileSync(path.join(gasDir, 'Load.gs'), 'utf8'), agg = fs.readFileSync(path.join(gasDir, 'Aggregate.gs'), 'utf8'), setup = fs.readFileSync(path.join(gasDir, 'Setup.gs'), 'utf8');
check('일별 적재 뒤 설정액 갱신(시한 부족 시 이어서 실행)', /flowUpdate_\(\)/.test(load) && /scheduleContinue_\('flowUpdateRun', 1\)/.test(load));
check('야간 점검에서도 갱신 · 전체 집계(범례 변경) 뒤 요약 다시 쓰기', /nightlyAgg[\s\S]*flowUpdate_\(\)/.test(agg) && /fullAggFinished_[\s\S]{0,400}flowSummary_\(\)/.test(agg));
check('예열 목록: flows · flowTop(기본 기준일 월·최근 월)', /\['flows', \{\}\], \['flowTop', \{ ym: ym_\(m\.defaultDate/.test(agg));
check('메뉴: 설정액 자료 보충·다시 계산', /'backfillFlowCols'/.test(setup) && /'rebuildFlows'/.test(setup));
// 새 적재 행에 1좌당 NAV·상장좌수
const rows9 = J(`buildDailyRows_(fetchEtfDaily_('2026-09-09'), null, '2026-09-09', ctx_())`);
check('일별 적재 행 10열(1좌당 NAV·상장좌수 포함)', rows9[0].length === 10 && rows9[0][8] > 0 && rows9[0][9] > 0, rows9[0].slice(8));

// Vercel 프록시(api/data.js) 허용 목록 = 화면이 부르는 action 전부(v42 배포 직후 flows·flowTop 누락 → 웹 화면 400)
const used = new Set(); ['gas/Tabs.html', 'gas/App.html', 'web/src/shell.js'].forEach(f => { const t = fs.readFileSync(path.join(__dirname, '..', f), 'utf8'); for (const m of t.matchAll(/A\.call\('([A-Za-z]+)'|\['([A-Za-z]+)', \{/g)) used.add(m[1] || m[2]); });
const proxy = fs.readFileSync(path.join(__dirname, '..', 'api', 'data.js'), 'utf8'), allow = JSON.parse(proxy.match(/const ACTIONS = (\[[^\]]*\])/)[1].replace(/'/g, '"'));
const actionsGs = J(`Object.keys(ACTIONS)`);
const miss = [...used].filter(a => !allow.includes(a)), notApi = [...used].filter(a => !actionsGs.includes(a) && a !== 'boot');
check('웹 프록시 허용 목록에 화면이 부르는 action 모두 포함(flowCheck 는 제외)', !miss.length && !notApi.length && !allow.includes('flowCheck') && allow.includes('flows') && allow.includes('flowTop'), { miss, notApi });

console.info(fails ? `\n${fails}건 실패` : '\n모두 통과');
process.exit(fails ? 1 : 0);
