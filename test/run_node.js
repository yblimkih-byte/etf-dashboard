/* node run_node.js — 서버 코드(.gs) 전체를 모의 환경에서 실행하고 API 결과를 점검 */
const fs = require('fs'), path = require('path'), vm = require('vm');
const gasDir = path.join(__dirname, '..', 'gas');
const ctx = { console, Date, Math, JSON, Object, Array, String, Number, RegExp, Error, isNaN, setTimeout, globalThis: null };
ctx.globalThis = ctx;
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname, 'shim.js'), 'utf8'), ctx);
for (const f of fs.readdirSync(gasDir).filter(f => f.endsWith('.gs'))) vm.runInContext(fs.readFileSync(path.join(gasDir, f), 'utf8'), ctx, { filename: f });

const t0 = Date.now();
vm.runInContext(`
  seedLegends([]);            // 범례_유형 비어있는 상태에서 시작 → 규칙 기반 유형 부여 경로 검증
  setupSheets();
  PropertiesService.getScriptProperties().setProperty('KRX_AUTH_KEY', 'TEST');
  backfillMonthly();
  backfillDaily();
  backfillKospi();
`, ctx);
console.log('backfill done in', ((Date.now() - t0) / 1000).toFixed(1), 's, fetch calls:', ctx.MOCK_CALLS);
const st = ctx.MOCK_STORE;
for (const n of Object.keys(st)) console.log(String(n).padEnd(16), st[n].rows.length - 1, 'rows');

const api = (a, p) => { const r = JSON.parse(vm.runInContext(`api(${JSON.stringify(a)}, ${JSON.stringify(p || {})})`, ctx)); if (!r.ok) throw new Error(a + ': ' + r.error); return r.data; };
const meta = api('meta');
console.log('\nmeta.defaultDate', meta.defaultDate, 'dates', meta.dates.length, 'months', meta.months.length, 'last', meta.lastLoaded);
const ov = api('overview', {}); console.log('overview yearly', ov.yearly.map(y => y.label + ':' + (y.nav / 1e12).toFixed(1)).join(' '), '| monthly', ov.monthly.length, 'ytd%', ov.monthly[ov.monthly.length - 1].ytd.pct.toFixed(2), 'kYtd', ov.monthly[ov.monthly.length - 1].kYtd);
const bm = api('byMgr', {}); console.log('byMgr', bm.rows.map(r => `${r.mgr} ${(r.nav / 1e12).toFixed(1)}조 ms${r.ms.toFixed(1)} ytd${r.ytd.pct && r.ytd.pct.toFixed(1)}`).join(' | '), 'trend', bm.trend.length);
const bt = api('byType', {}); console.log('byType', bt.rows.map(r => `${r.type} ${r.share.toFixed(1)}%`).join(' | '), 'dom', JSON.stringify(Object.keys(bt.dom)));
const sh = api('shares', { mgr: '키움' }); console.log('shares groups', Object.keys(sh.groups).join(','), 'mgrs', sh.mgrs.length);
const tp = api('topEtf', {}); console.log('top', tp.top.length, tp.top[0].name, tp.top[0].mgr, 'byMgr', JSON.stringify(tp.byMgr));
const rc = api('race', { n: 10 }); console.log('race frames', rc.frames.length, rc.frames[0].ym, rc.frames[rc.frames.length - 1].ym, rc.frames[0].rows.length);
const nl = api('newListings', {}); console.log('newListings', nl.year, nl.filter, nl.items.length, 'byMgr', nl.byMgr.length);
const ye = meta.months.filter(m=>m.ym<'2026-01').pop().date; const nl2 = api('newListings', { filter: 'all', year: '2025', date: ye }); console.log('newListings 2025 all', nl2.items.length);
const tv = api('turnover', {}); console.log('turnover', tv.from, tv.to, tv.days, 'days; top1', tv.top[0].name, (tv.top[0].sum / 1e8).toFixed(0), 'market', (tv.marketSum / 1e12).toFixed(2));
// 거래대금 검증: 누적 차분 = 일별 합
const daily = st['raw_일별'].rows.slice(1);
const code = tv.top[0].code;
const direct = daily.filter(r => r[1] === code && r[0] >= tv.from && r[0] <= tv.to).reduce((s, r) => s + r[5], 0);
console.log('turnover check direct sum', direct, 'vs api', tv.top[0].sum, direct === tv.top[0].sum ? 'OK' : 'MISMATCH');
// 월 걸침 구간
const tv2 = api('turnover', { from: '2026-03-10', to: '2026-04-20' });
const direct2 = daily.filter(r => r[1] === tv2.top[0].code && r[0] >= '2026-03-10' && r[0] <= '2026-04-20').reduce((s, r) => s + r[5], 0);
console.log('turnover mid-range check', direct2 === tv2.top[0].sum ? 'OK' : 'MISMATCH ' + direct2 + ' ' + tv2.top[0].sum);
// 일별 특정일 스냅샷
const bm2 = api('byMgr', { date: '2026-09-08' }); console.log('byMgr daily date ref', JSON.stringify(bm2.ref), 'total', (bm2.total / 1e12).toFixed(2));
// 재실행 idempotent
const before = st['raw_일별'].rows.length; vm.runInContext('loadDaily()', ctx); console.log('loadDaily rerun rows', before, '->', st['raw_일별'].rows.length);
console.log('범례_유형 rows', st['범례_유형'].rows.length - 1, 'sample', JSON.stringify(st['범례_유형'].rows[1]));
console.log('log tail:', st['_log'].rows.slice(-3).map(r => r[2]).join(' / '));
// 브라우저 테스트용 스냅샷 저장
fs.writeFileSync(path.join(__dirname, 'store.json'), JSON.stringify({ store: Object.fromEntries(Object.entries(st).map(([k, v]) => [k, v.rows])), props: vm.runInContext('(()=>{const p={};["KRX_AUTH_KEY","LAST_DAILY_DATE"].forEach(k=>p[k]=PropertiesService.getScriptProperties().getProperty(k));return p})()', ctx) }));
console.log('store.json written');
// repairZeroDays 검증: 임의 일자 0행 삽입 후 제거·인덱스 재작성 확인
vm.runInContext(`
  const shD = sheet_(CFG.SHEET.RAW_DAILY); const shM = sheet_(CFG.SHEET.RAW_MONTHLY);
  appendRows_(shD, [['2026-09-10','000001','X','삼성',0,0,0,0],['2026-09-10','000002','Y','삼성',0,0,0,0]]);
  sheet_(CFG.SHEET.META).appendRow(['2026-09-10', shD.getLastRow()-1, 2]);
  appendRows_(shM, [['2025-12-31','000001','X','삼성',0,0,'','']]);
`, ctx);
const before2 = st['raw_일별'].rows.length;
const rem = vm.runInContext('repairZeroDays()', ctx);
console.log('repair removed', JSON.stringify(rem), 'daily rows', before2, '->', st['raw_일별'].rows.length, 'index last', JSON.stringify(st['_index'].rows.slice(-1)), 'LAST', vm.runInContext("PropertiesService.getScriptProperties().getProperty('LAST_DAILY_DATE')", ctx));
const tv3 = api('turnover', { from: '2026-03-10', to: '2026-04-20' }); console.log('after repair turnover check', tv3.top[0].sum === tv2.top[0].sum ? 'OK' : 'MISMATCH');
