/* TZ=Asia/Seoul node test/v25_index_test.js — v25 지수 누락 복구 점검(실제 gas/*.gs + 모의 시트 store.json)
 *  사례(2026-10-05 확인): 10-01 지수 행에 S&P500·NASDAQ100 만 있고 KOSPI 가 비어 개관 탭 10-01 기준에 09-30 KOSPI 표시.
 *  v24 까지: 지수 시트 마지막 일자(10-01) ≥ 최종 적재일 → '최신'으로 판단해 다시 받지 않음, 집계 점검도 같은(빠진) 지수 기준이라 불일치 없음
 *  A) 마지막 적재일 KOSPI 누락 재현 → 새 자료 없는 적재 실행 → Yahoo 재조회로 채움 → 해당 월 집계·캐시 갱신
 *  B) Yahoo 가 마지막 1일 KOSPI 를 계속 빠뜨리면 KRX API 로 그 일자만 보완
 *  C) 지수가 온전하면 다시 받지 않음 */
const fs = require('fs'), path = require('path'), vm = require('vm');
const ctx = { console: { log: () => {} }, Date, Math, JSON, Object, Array, String, Number, RegExp, Error, isNaN, setTimeout, globalThis: null, __zlib: require('zlib'), __Buffer: Buffer };
ctx.globalThis = ctx; vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname, 'shim.js'), 'utf8'), ctx);
for (const f of fs.readdirSync(path.join(__dirname, '..', 'gas')).filter(f => f.endsWith('.gs'))) vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'gas', f), 'utf8'), ctx, { filename: f });
const st = JSON.parse(fs.readFileSync(path.join(__dirname, 'store.json'), 'utf8')); ctx.__s = st;
vm.runInContext(`(function(){ const ss = SpreadsheetApp.getActiveSpreadsheet(); Object.keys(__s.store).forEach(n => { const sh = ss.insertSheet(n); sh.rows = JSON.parse(JSON.stringify(__s.store[n])); }); Object.keys(__s.props).forEach(k => PropertiesService.getScriptProperties().setProperty(k, __s.props[k])); })()`, ctx);
const R = s => vm.runInContext(s, ctx);
let fails = 0; const check = (name, ok, info) => { if (!ok) fails++; console.log((ok ? '  OK   ' : '  FAIL ') + name + (info !== undefined ? ' — ' + info : '')); };
const S = ctx.MOCK_STORE, IDX = () => S['지수'].rows, AGG = () => S['agg_시장월별'].rows;
const last = R(`PropertiesService.getScriptProperties().getProperty('LAST_DAILY_DATE')`), ym = last.slice(0, 7);
ctx.MOCK_TODAY = last;   // 다음 영업일 자료는 아직 미게시 → '새 자료 없는' 적재 실행
const idxRow = d => IDX().find(r => String(r[0]) === d);
const aggK = () => { const r = AGG().find(x => String(x[0]) === ym); return r ? +r[4] : null; };
// Yahoo 호출 집계(지수별)
R(`var __yh = []; var __f0 = UrlFetchApp.fetch; UrlFetchApp.fetch = function (url, o) { if (url.indexOf('finance.yahoo.com') >= 0) __yh.push(decodeURIComponent(url.split('/chart/')[1].split('?')[0])); return __f0(url, o); };`);
const yh = () => R(`__yh.length`);

console.log('[A] 마지막 적재일(' + last + ') KOSPI 누락 재현 → 새 자료 없는 적재 실행에서 복구');
R(`(function(){ const sh = sheet_(CFG.SHEET.INDEX); if (!sh.rows.some(r => String(r[0]) === '${last}')) loadIndices_('${last}'); })()`);
const kOld = +idxRow(last)[1], kPrev = (() => { const rows = IDX().filter(r => String(r[0]) < last && +r[1]); return +rows[rows.length - 1][1]; })();
idxRow(last)[1] = '';   // KOSPI 만 비움(S&P500·NASDAQ100 은 유지)
R(`aggregateMonths_(['${ym}'], ctx_(), null, null)`);
check('재현: ' + ym + ' 집계 KOSPI = 전일 값(누락으로 대체)', aggK() === kPrev && kPrev !== kOld, aggK() + ' (누락 전 ' + kOld + ')');
check('지수 시트에 ' + last + ' 행 있음(미국 지수 값) → v24 기준(마지막 일자 비교)이면 최신으로 판단', String(IDX()[IDX().length - 1][0]) >= last && !!idxRow(last)[2]);
check('v25 indexBehind_: KOSPI 빈 행을 뒤처짐으로 판단', R(`indexBehind_('${last}')`) === true);
const mv0 = JSON.parse(R(`PropertiesService.getScriptProperties().getProperty('MONTH_VER') || 'null'`) || 'null');
const y0 = yh();
R(`loadDaily()`);
check('새 자료 없는 적재 실행이 지수를 다시 받음(Yahoo 3건)', yh() - y0 === 3, (yh() - y0) + '건');
const kNew = +idxRow(last)[1];
check('지수 시트 ' + last + ' KOSPI 채워짐', kNew > 0, kNew);
check(ym + ' 집계 KOSPI 복구(지수 시트 값과 일치, 전일 값 아님)', aggK() === kNew && aggK() !== kPrev, aggK());
const mv1 = JSON.parse(R(`PropertiesService.getScriptProperties().getProperty('MONTH_VER')`));
check('캐시: ' + ym + ' 이후 기준일 조회만 무효화', !!mv1 && (!mv0 || mv1.f === mv0.f) && mv1.m[ym] > ((mv0 && mv0.m[ym]) || 0), JSON.stringify(mv1));
const ov = JSON.parse(R(`api('overview', {date: '${last}'})`)).data;
check('개관 조회(' + last + ') KOSPI = ' + kNew, ov.monthly[ov.monthly.length - 1].k === kNew);

console.log('[B] Yahoo 가 마지막 1일 KOSPI 를 계속 빠뜨리면 KRX API 로 보완');
idxRow(last)[1] = '';
R(`var __f1 = UrlFetchApp.fetch; UrlFetchApp.fetch = function (url, o) { const r = __f1(url, o); if (url.indexOf('%5EKS11') < 0 && url.indexOf('^KS11') < 0) return r; const b = JSON.parse(r.getContentText()), res = b.chart.result[0]; const last = '${last}'; const keep = res.timestamp.map(t => Utilities.formatDate(new Date(t * 1000), 'Asia/Seoul', 'yyyy-MM-dd') !== last); res.timestamp = res.timestamp.filter((t, i) => keep[i]); res.indicators.quote[0].close = res.indicators.quote[0].close.filter((v, i) => keep[i]); const txt = JSON.stringify(b); return { getResponseCode: () => 200, getContentText: () => txt }; };`);
R(`var __krx = 0; var __fk = fetchKospi_; fetchKospi_ = function (d) { __krx++; return __fk(d); };`);
R(`loadIndices_('${last}')`);
const kKrx = +idxRow(last)[1];
check('Yahoo 응답에 ' + last + ' KOSPI 없음 → KRX API 1건으로 채움', R(`__krx`) === 1 && kKrx > 0, 'KRX 호출 ' + R(`__krx`) + '건, 값 ' + kKrx);
R(`UrlFetchApp.fetch = __f1;`);

console.log('[C] 지수가 온전하면 다시 받지 않음');
R(`loadIndices_('${last}')`);
check('v25 indexBehind_: 온전한 행은 최신', R(`indexBehind_('${last}')`) === false);
const y1 = yh(); R(`loadDaily()`);
check('새 자료 없는 적재 실행: 지수 재조회 없음', yh() === y1, (yh() - y1) + '건');

console.log(fails ? '\n실패 ' + fails + '건' : '\n모두 통과');
process.exit(fails ? 1 : 0);
