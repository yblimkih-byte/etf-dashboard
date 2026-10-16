/* TZ=Asia/Seoul node test/v41_test.js — v41 서버·설정 점검(모의)
 *  A) FunETF 자동 수집 시작 신호(funDispatch_): GitHub workflow_dispatch 호출 형식 · 꺼진 작업 다시 켜기 · 토큰 오류 안내 · 일시 오류 1회 재시도 · 화·금 01:40 트리거
 *  B) 예열 목록: 관심도·종목→ETF 첫 화면 추가, 거래대금은 최근 영업일 구간만
 *  C) 설정액 분리 점검(checkFlowFields): 필드·정합·일별 합 vs 두 시점 근사(모의 NAV·상장좌수)
 *  D) 워크플로: 예약은 예비로 유지, clasp 자동 반영은 시크릿 없으면 건너뜀 · 메뉴 */
const fs = require('fs'), path = require('path'), vm = require('vm');
const ctx = { console: { log: () => {} }, Date, Math, JSON, Object, Array, String, Number, RegExp, Error, isNaN, setTimeout, globalThis: null, __zlib: require('zlib'), __Buffer: Buffer, encodeURIComponent, decodeURIComponent };
ctx.globalThis = ctx; vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname, 'shim.js'), 'utf8'), ctx);
const gasDir = path.join(__dirname, '..', 'gas'), root = path.join(__dirname, '..');
for (const f of fs.readdirSync(gasDir).filter(f => f.endsWith('.gs')).sort((a, b) => (/^(Theme|Kis|Buzz)\.gs$/.test(a)) - (/^(Theme|Kis|Buzz)\.gs$/.test(b)) || a.localeCompare(b))) vm.runInContext(fs.readFileSync(path.join(gasDir, f), 'utf8'), ctx, { filename: f });
const st = JSON.parse(fs.readFileSync(path.join(__dirname, 'store.json'), 'utf8')); ctx.__s = st;
vm.runInContext(`(function(){ const ss = SpreadsheetApp.getActiveSpreadsheet(); Object.keys(__s.store).forEach(n => { const sh = ss.insertSheet(n); sh.rows = JSON.parse(JSON.stringify(__s.store[n])); }); Object.keys(__s.props).forEach(k => PropertiesService.getScriptProperties().setProperty(k, __s.props[k])); })()`, ctx);
const R = s => vm.runInContext(s, ctx), J = s => JSON.parse(R(`JSON.stringify(${s})`));
let fails = 0; const check = (name, ok, info) => { if (!ok) fails++; console.info((ok ? '  OK   ' : '  FAIL ') + name + (info !== undefined ? ' — ' + (typeof info === 'string' ? info : JSON.stringify(info)) : '')); };
const setP = (k, v) => R(`PropertiesService.getScriptProperties().setProperty(${JSON.stringify(k)}, ${JSON.stringify(v)})`), getP = k => R(`PropertiesService.getScriptProperties().getProperty(${JSON.stringify(k)})`);
const delP = k => R(`PropertiesService.getScriptProperties().deleteProperty(${JSON.stringify(k)})`);
const logs = () => ctx.MOCK_STORE['_log'] ? ctx.MOCK_STORE['_log'].rows.slice(1).map(r => r[2]) : [];
ctx.SpreadsheetApp.getUi = () => ({ alert() {}, prompt: () => ({ getSelectedButton: () => 'OK', getResponseText: () => 'github_pat_TEST' }), ButtonSet: { OK_CANCEL: 1 }, Button: { OK: 'OK' } });

console.info('A) FunETF 자동 수집 시작 신호');
delP('GH_DISPATCH_TOKEN'); ctx.MOCK_GH_CALLS = [];
let err = ''; try { R(`funDispatch_({ limit: '0' }, '예약')`); } catch (e) { err = e.message; }
check('토큰 없으면 호출하지 않고 메뉴 안내', /GitHub 토큰 미설정/.test(err) && ctx.MOCK_GH_CALLS.length === 0, err);
setP('GH_DISPATCH_TOKEN', 'github_pat_TEST');
ctx.MOCK_GH = () => [204, ''];
let info = J(`funDispatch_({ limit: '0' }, '예약')`), c0 = ctx.MOCK_GH_CALLS[0];
check('호출: POST …/actions/workflows/funetf-collect.yml/dispatches', c0 && c0.url === 'https://api.github.com/repos/yblimkih-byte/etf-dashboard/actions/workflows/funetf-collect.yml/dispatches' && c0.opt.method === 'post', c0 && c0.url);
check('본문: ref main · inputs {limit:"0"} · JSON', c0 && c0.opt.contentType === 'application/json' && c0.opt.payload === JSON.stringify({ ref: 'main', inputs: { limit: '0' } }), c0 && c0.opt.payload);
check('머리글: Bearer 토큰 · GitHub API 버전', c0 && c0.opt.headers.Authorization === 'Bearer github_pat_TEST' && c0.opt.headers['X-GitHub-Api-Version'] === '2022-11-28' && /github\+json/.test(c0.opt.headers.Accept));
check('204 → 성공 기록(GH_DISPATCH_INFO)·로그', info.ok && JSON.parse(getP('GH_DISPATCH_INFO')).ok && logs().some(l => /시작 신호\(예약\): GitHub 실행 호출 완료/.test(l)));
// 꺼진 작업
ctx.MOCK_GH_CALLS = []; let n = 0;
ctx.MOCK_GH = (url, opt) => { if (/\/enable$/.test(url)) return [204, '']; n++; return n === 1 ? [422, '{"message":"Workflow does not have \'workflow_dispatch\' trigger or is disabled"}'] : [204, '']; };
info = J(`funDispatch_({ limit: '0' }, '예약')`);
const seq = ctx.MOCK_GH_CALLS.map(x => x.opt.method + ' ' + x.url.split('/').slice(-1)[0]);
check('꺼진 작업(422 disabled) → PUT enable 후 다시 호출', info.ok && info.enabled && seq.join(',') === 'post dispatches,put enable,post dispatches', seq.join(','));
// 토큰 오류
ctx.MOCK_GH = () => [401, '{"message":"Bad credentials"}'];
info = J(`funDispatch_({ limit: '0' }, '예약')`);
check('401 → 실패 기록 + 토큰 다시 입력 안내', !info.ok && info.code === 401 && /토큰 만료·오입력/.test(info.msg) && logs().some(l => /HTTP 401/.test(l)), info.msg);
ctx.MOCK_GH = () => [403, '{"message":"Resource not accessible by personal access token"}'];
info = J(`funDispatch_({ limit: '0' }, '예약')`);
check('403 → 권한 안내(Actions 읽기·쓰기)', !info.ok && /Actions 읽기·쓰기/.test(info.msg), info.msg);
// 트리거 진입점: 5xx 1회 재시도
ctx.MOCK_TRIGGERS.length = 0; delP('GH_DISPATCH_RETRY');
ctx.MOCK_GH = () => [502, 'Bad gateway'];
R(`funDispatch()`);
check('5xx → 5분 뒤 1회 재시도 예약(cont_funDispatch)', ctx.MOCK_TRIGGERS.length === 1 && ctx.MOCK_TRIGGERS[0].fn === 'cont_funDispatch' && ctx.MOCK_TRIGGERS[0].after === 5 * 60000, ctx.MOCK_TRIGGERS);
R(`funDispatch()`);
check('두 번째 실패는 더 재시도하지 않음', ctx.MOCK_TRIGGERS.length === 1 && !getP('GH_DISPATCH_RETRY'));
ctx.MOCK_TRIGGERS.length = 0; ctx.MOCK_GH = () => [401, '{"message":"Bad credentials"}'];
R(`funDispatch()`);
check('401(재시도해도 같음) → 재시도 없음', ctx.MOCK_TRIGGERS.length === 0);
// 메뉴: 토큰 저장 + 트리거
ctx.MOCK_TRIGGERS.length = 0; delP('GH_DISPATCH_TOKEN');
R(`setGhToken()`);
const tg = ctx.MOCK_TRIGGERS.map(t => `${t.fn}@${t.day} ${t.hour}:${t.minute}`);
check('메뉴 토큰 저장(사용자 입력값) → 화·금 01:40 트리거 2개', getP('GH_DISPATCH_TOKEN') === 'github_pat_TEST' && tg.join(',') === 'funDispatch@TUESDAY 1:40,funDispatch@FRIDAY 1:40', tg.join(','));
ctx.MOCK_GH_CALLS = []; ctx.MOCK_GH = () => [204, ''];
R(`menuFunDispatchTest()`);
check('시험 메뉴 → inputs {limit:"3", now:"true"}(시트 그대로 = dry)', ctx.MOCK_GH_CALLS.length === 1 && ctx.MOCK_GH_CALLS[0].opt.payload === JSON.stringify({ ref: 'main', inputs: { limit: '3', now: 'true' } }), ctx.MOCK_GH_CALLS[0] && ctx.MOCK_GH_CALLS[0].opt.payload);
const menu = fs.readFileSync(path.join(gasDir, 'Setup.gs'), 'utf8');
check('메뉴 항목 2개(토큰 설정·시험)', /addItem\('FunETF 자동 수집 시작 신호\(GitHub 토큰\) 설정', 'setGhToken'\)/.test(menu) && /addItem\('FunETF 자동 수집 시작 신호 시험\(3종목\)', 'menuFunDispatchTest'\)/.test(menu));
const kis = fs.readFileSync(path.join(gasDir, 'Kis.gs'), 'utf8');
check('토큰 값은 코드에 없음(스크립트 속성만)', !/github_pat_[A-Za-z0-9]/.test(kis) && /GH_DISPATCH_TOKEN/.test(kis));

console.info('B) 예열 목록');
const m = J(`JSON.parse(api('meta', {})).data`), dv = m.dates.filter(d => d >= m.dailyFrom), latest = dv[dv.length - 1];
setP('BUZZ_DATE', '2026-10-16'); setP('KIS_PDF_DATE', latest);
const warmed = []; const api0 = ctx.api;
ctx.api = (a, p) => { warmed.push([a, p]); return api0(a, p); };
R(`warmAll()`); ctx.api = api0;
const has = (a, f) => warmed.some(x => x[0] === a && (!f || f(x[1] || {})));
check('관심도 첫 화면(buzz {}) 예열', has('buzz', p => !Object.keys(p).length));
check('종목→ETF 첫 화면(holders q·pick 빈 값) 예열', has('holders', p => p.q === '' && p.pick === ''));
const turns = warmed.filter(x => x[0] === 'turnover').map(x => x[1].to);
check('거래대금 예열 = 최근 영업일 구간만(화면 기본 구간과 같음)', turns.length >= 1 && turns.every(t => t === latest), turns.join(','));
check('전월말 기준일 조회는 그대로 예열(byMgr)', has('byMgr', p => p.date === m.defaultDate));

console.info('C) 설정액 분리 점검(모의 NAV·상장좌수)');
const fc = J(`checkFlowFields()`);
check('필드: NAV · LIST_SHRS 응답에 있음', fc.fields.NAV && fc.fields.LIST_SHRS, fc.fields.all);
check('기간: 전월말 ~ 최근 영업일', fc.from && fc.to === latest && fc.from < fc.to && fc.days >= 2, `${fc.from}~${fc.to} ${fc.days}일`);
check('정합: 순자산총액 ≈ NAV × 같은 날 좌수(모의 = 거의 전부 0.1% 이내)', fc.fit && fc.fit.same.n > 0 && fc.fit.same.w01 / fc.fit.same.n > 0.95, fc.fit && fc.fit.same);
check('항등식: 설정액 + 평가 증감 = NAV 증감', Math.abs(fc.market.flowDailyShares + fc.market.valuation - fc.market.dNav) <= 1, fc.market);
check('운용사·유형별 합계 = 시장 합계(반올림 오차 내)', Math.abs(Object.values(fc.byTop).reduce((a, b) => a + b, 0) - fc.market.flowDailyShares) <= Object.keys(fc.byTop).length && Object.keys(fc.byType).length >= 3, fc.byTop);
check('결과 저장(FLOW_CHECK, 9KB 미만)', (getP('FLOW_CHECK') || '').length > 100 && (getP('FLOW_CHECK') || '').length < 9000);

console.info('D) 워크플로');
const wf = fs.readFileSync(path.join(root, '.github/workflows/funetf-collect.yml'), 'utf8');
check('FunETF 작업: 예약(cron) 예비 유지 + workflow_dispatch(limit·now)', /cron: '41 16 \* \* 1,4'/.test(wf) && /workflow_dispatch:/.test(wf) && /limit:/.test(wf) && /now:/.test(wf) && /Apps Script 시간 트리거/.test(wf));
const pw = fs.readFileSync(path.join(root, '.github/workflows/push-to-apps-script.yml'), 'utf8');
check('clasp 자동 반영: 시크릿 없으면 건너뜀(실패 알림 없음)', /id: chk/.test(pw) && (pw.match(/if: steps\.chk\.outputs\.has == '1'/g) || []).length >= 5 && /clasp push -f\n\s+if: steps\.chk/.test(pw));

console.info(fails ? `\n${fails}건 실패` : '\n모두 통과');
process.exit(fails ? 1 : 0);
