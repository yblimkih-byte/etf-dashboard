/* TZ=Asia/Seoul node test/v24_test.js — v24 로딩 속도 개선 점검(실제 gas/*.gs + 모의 시트 store.json + 메모리 캐시)
 *  A) 캐시 압축·분할 저장/읽기·보존 연장   B) 월 단위 캐시 버전(바뀐 월 이후만 무효화)   C) 적재(새 일자) 뒤 지난 달 조회 캐시 유지
 *  D) boot(첫 화면 묶음)·doGet 삽입용 이스케이프   E) 예열: 보존 연장으로 만료 없음·바뀐 조회만 계산   F) 응답 축소(히트맵·변천)
 *  G) AGG_DIRTY(쓰는 월) 복구 시 해당 월만 무효화 */
const fs = require('fs'), path = require('path'), vm = require('vm');
const ctx = { console: { log: () => {} }, Date, Math, JSON, Object, Array, String, Number, RegExp, Error, isNaN, setTimeout, globalThis: null, __zlib: require('zlib'), __Buffer: Buffer };
ctx.globalThis = ctx; vm.createContext(ctx);
ctx.MOCK_CACHE = true; let NOW = Date.now(); ctx.MOCK_NOW = () => NOW;
vm.runInContext(fs.readFileSync(path.join(__dirname, 'shim.js'), 'utf8'), ctx);
for (const f of fs.readdirSync(path.join(__dirname, '..', 'gas')).filter(f => f.endsWith('.gs'))) vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'gas', f), 'utf8'), ctx, { filename: f });
const st = JSON.parse(fs.readFileSync(path.join(__dirname, 'store.json'), 'utf8'));
ctx.__s = st;
vm.runInContext(`(function(){ const ss = SpreadsheetApp.getActiveSpreadsheet(); Object.keys(__s.store).forEach(n => { const sh = ss.insertSheet(n); sh.rows = JSON.parse(JSON.stringify(__s.store[n])); }); Object.keys(__s.props).forEach(k => PropertiesService.getScriptProperties().setProperty(k, __s.props[k])); })()`, ctx);
const R = s => vm.runInContext(s, ctx);
let fails = 0; const check = (name, ok, info) => { if (!ok) fails++; console.log((ok ? '  OK   ' : '  FAIL ') + name + (info !== undefined ? ' — ' + info : '')); };
// 계산 횟수 집계(캐시 적중 여부 판단)
R(`var __calls = {}; Object.keys(ACTIONS).forEach(k => { const f = ACTIONS[k]; ACTIONS[k] = p => { __calls[k] = (__calls[k] || 0) + 1; return f(p); }; });`);
const calls = k => R(`__calls[${JSON.stringify(k)}] || 0`);
const api = (a, p) => { const r = JSON.parse(R(`api(${JSON.stringify(a)}, ${JSON.stringify(p || {})})`)); if (!r.ok) throw new Error(a + ': ' + r.error); return r.data; };
const mem = ctx.MOCK_CACHE_STORE;

console.log('[A] 캐시 압축·분할');
R(`var __c = CacheService.getScriptCache();`);
const small = '{"ok":true,"data":' + JSON.stringify({ a: '가'.repeat(1000) }) + '}';
R(`putCached_(__c, 'k:small', ${JSON.stringify(small)})`);
check('9만 자 미만은 그대로 저장', mem['k:small'].v === small);
const big = '{"ok":true,"data":' + JSON.stringify(Array.from({ length: 4000 }, (_, i) => ['KODEX 미국S&P500 ' + i, '삼성', '국내주식형', i * 1.1])) + '}';
R(`putCached_(__c, 'k:big', ${JSON.stringify(big)})`);
check('큰 응답은 gzip 압축 저장(z:)', mem['k:big'].v.slice(0, 2) === 'z:' && mem['k:big'].v.length < big.length / 3, big.length + '자 → ' + mem['k:big'].v.length + '자');
check('압축 저장값 읽기 = 원문', R(`getCached_(__c, 'k:big')`) === big);
// 분할: 압축 후에도 9.5만 자를 넘는 값(무작위 문자열)
const noise = require('crypto').randomBytes(150000).toString('base64');   // 압축이 거의 안 되는 값
const huge = '{"ok":true,"data":' + JSON.stringify(noise) + '}';
R(`putCached_(__c, 'k:huge', ${JSON.stringify(huge)})`);
const n = /^zc:(\d+)$/.exec(mem['k:huge'] ? mem['k:huge'].v : '');
check('압축 후에도 크면 여러 키로 분할(zc:n)', !!n && +n[1] >= 2 && Object.keys(mem).filter(k => k.indexOf('k:huge#') === 0).length === +n[1], n && n[0]);
check('분할 저장값 읽기 = 원문', R(`getCached_(__c, 'k:huge')`) === huge);
check('여러 키 한 번에 읽기(getCachedMany_)', R(`(function(){ const o = getCachedMany_(__c, ['k:small', 'k:big', 'k:none']); return o['k:small'] === ${JSON.stringify(small)} && o['k:big'] === ${JSON.stringify(big)} && !('k:none' in o); })()`));
delete mem['k:huge#1'];
check('조각 하나라도 없으면 null(다시 계산)', R(`getCached_(__c, 'k:huge')`) === null);
check('파라미터 키 순서와 무관한 캐시 키', R(`cacheKey_('byMgr', {ref:'py', date:'2026-08-31'}) === cacheKey_('byMgr', {date:'2026-08-31', ref:'py'}) && cacheKey_('byMgr', {date:'2026-08-31', ref:'py'}) !== cacheKey_('byMgr', {date:'2026-08-31', ref:'pm'})`));

console.log('[B] 월 단위 캐시 버전');
const meta0 = api('meta');
const AUG = meta0.months.find(m => m.ym === '2026-08').date, SEP = meta0.dates.filter(d => d.slice(0, 7) === '2026-09').pop();
console.log('    AUG', AUG, 'SEP', SEP);
R(`bumpCache_()`);
const kAug = () => R(`cacheKey_('byMgr', {date:'${AUG}', ref:'py'})`), kSep = () => R(`cacheKey_('byMgr', {date:'${SEP}', ref:'py'})`), kMeta = () => R(`cacheKey_('meta', {})`), kRace = () => R(`cacheKey_('race', {n:20})`), kTo = () => R(`cacheKey_('turnover', {from:'2026-01-02', to:'${AUG}'})`);
let a1 = kAug(), s1 = kSep(), m1 = kMeta(), r1 = kRace(), t1 = kTo();
NOW += 5; R(`bumpCache_(['2026-09'])`);
check('9월 변경: 8월 기준일 조회 키 유지', kAug() === a1);
check('9월 변경: 거래대금(to=8월) 키 유지', kTo() === t1);
check('9월 변경: 9월 기준일 조회 키 변경', kSep() !== s1);
check('9월 변경: meta·race 키 변경(전역 버전)', kMeta() !== m1 && kRace() !== r1);
a1 = kAug(); s1 = kSep();
R(`bumpCache_(['2026-07'])`);
check('7월 변경: 8월·9월 기준일 조회 모두 무효화(이전 월 변경은 이후 기준일에 영향)', kAug() !== a1 && kSep() !== s1);
a1 = kAug(); s1 = kSep();
R(`bumpCache_()`);
check('전체 무효화(월 지정 없음): 모두 변경', kAug() !== a1 && kSep() !== s1);
check('MONTH_VER 크기 유지(전체 무효화 시 월 목록 초기화)', R(`JSON.parse(PropertiesService.getScriptProperties().getProperty('MONTH_VER')).m`) && Object.keys(R(`JSON.parse(PropertiesService.getScriptProperties().getProperty('MONTH_VER')).m`)).length === 0);
check('기준일 없는 조회(기본 기준일)는 전역 버전', R(`cacheKey_('byMgr', {}).indexOf(PropertiesService.getScriptProperties().getProperty('CACHE_VER')) > 0`));

console.log('[C] 새 일자 적재 뒤 지난 달 조회는 캐시 유지');
api('byMgr', { date: AUG, ref: 'py' }); api('treemap', { date: AUG, ref: 'py' }); api('byMgr', { date: SEP, ref: 'py' });
const c0 = { bmA: calls('byMgr'), tmA: calls('treemap') };
api('byMgr', { date: AUG, ref: 'py' }); api('treemap', { date: AUG, ref: 'py' });
check('같은 조회 두 번째는 캐시 적중', calls('byMgr') === c0.bmA && calls('treemap') === c0.tmA);
ctx.MOCK_TODAY = '2026-09-10';
const lastBefore = R(`PropertiesService.getScriptProperties().getProperty('LAST_DAILY_DATE')`);
R(`loadDaily()`);
const lastAfter = R(`PropertiesService.getScriptProperties().getProperty('LAST_DAILY_DATE')`);
const mv = JSON.parse(R(`PropertiesService.getScriptProperties().getProperty('MONTH_VER')`));
check('09-10 적재', lastBefore === '2026-09-09' && lastAfter === '2026-09-10', lastBefore + ' → ' + lastAfter);
check('적재 뒤 MONTH_VER: 9월만 갱신(전체 무효화 아님)', mv.m['2026-09'] > mv.f && Object.keys(mv.m).length === 1, JSON.stringify(mv));
const c1 = { bm: calls('byMgr'), tm: calls('treemap'), meta: calls('meta') };
api('byMgr', { date: AUG, ref: 'py' }); api('treemap', { date: AUG, ref: 'py' });
check('적재 뒤 8월말 기준 운용사별·히트맵 조회: 캐시 적중(다시 계산 안 함)', calls('byMgr') === c1.bm && calls('treemap') === c1.tm);
api('byMgr', { date: SEP, ref: 'py' });
check('적재 뒤 9월 일자 기준 조회: 다시 계산', calls('byMgr') === c1.bm + 1);
const m2 = api('meta');
check('적재 뒤 meta: 다시 계산·새 일자 포함', calls('meta') === c1.meta + 1 && m2.dates.indexOf('2026-09-10') >= 0);

console.log('[D] boot(첫 화면 묶음)');
for (const k of Object.keys(mem)) delete mem[k];
check('캐시가 비면 doGet 용 boot 는 null(계산하지 않음)', R(`bootJson_(true)`) === null && R(`bootEmbed_()`) === 'null');
const b0 = JSON.parse(R(`api('boot', {})`));
check('Vercel 용 boot: meta 계산·첫 화면 자료는 캐시에 없어 빈 목록', b0.ok && b0.data.meta.defaultDate && b0.data.pre.length === 0, 'pre ' + b0.data.pre.length);
const cW = calls('byMgr') + calls('treemap'), wDates = [b0.data.meta.defaultDate, b0.data.meta.dates[b0.data.meta.dates.length - 1]].filter((d, i, a) => a.indexOf(d) === i);
R(`warmAll()`);
check('예열이 기본 기준일·최근 영업일 조회를 계산', calls('byMgr') + calls('treemap') === cW + 2 * wDates.length, wDates.join(', '));
const b1 = JSON.parse(R(`api('boot', {})`)).data;
const want = R(`JSON.stringify(bootList_(${JSON.stringify(b1.meta.defaultDate)}))`);
check('예열 뒤 boot: 요약 탭 6건 포함(파라미터 = bootList_)', b1.pre.length === 6 && JSON.stringify(b1.pre.map(x => [x[0], x[1]])) === want, b1.pre.map(x => x[0]).join(','));
const same = b1.pre.every(x => JSON.stringify(x[2]) === JSON.stringify(api(x[0], x[1])));
check('boot 자료 = 개별 조회 결과', same);
const clientKey = (a, p) => a + ':{' + Object.keys(p).sort().filter(k => p[k] !== undefined).map(k => JSON.stringify(k) + ':' + JSON.stringify(p[k])).join(',') + '}';
const s = { date: b1.meta.defaultDate, ref: 'py' };
const tabCalls = [['byMgr', { date: s.date, ref: s.ref }], ['overview', { date: s.date }], ['byType', { date: s.date, ref: s.ref }], ['topEtf', { date: s.date }], ['newListings', { date: s.date, year: s.date.slice(0, 4), filter: 'exBond' }], ['shares', { date: s.date, mgr: '' }]];
check('boot 키 = 화면(요약 탭) 조회 키(App._key 규칙)', tabCalls.every(([a, p]) => b1.pre.some(x => clientKey(x[0], x[1]) === clientKey(a, p))));
R(`(function(){ const sh = sheet_(CFG.SHEET.MASTER); })()`);
const emb = R(`bootEmbed_()`);
check('doGet 삽입용: < 없음·JSON 으로 복원 = boot 의 data({meta, pre})', emb.indexOf('<') < 0 && JSON.stringify(JSON.parse(emb)) === JSON.stringify(JSON.parse(R(`bootJson_(true)`)).data) && JSON.parse(emb).pre.length === 6, (emb.length / 1024).toFixed(0) + 'KB');
const injected = R(`(function(){ const j = '{"x":"</script><b>\\u2028"}'; return j.replace(/</g, '\\\\u003c').replace(/\\u2028/g, '\\\\u2028'); })()`);
check('이스케이프 규칙: </script>·U+2028 처리', injected.indexOf('</') < 0 && JSON.parse(injected).x === '</script><b> ', injected);

console.log('[E] 예열: 보존 연장·바뀐 조회만 계산');
const keyTm = R(`cacheKey_('treemap', {date:'${b1.meta.defaultDate}', ref:'py'})`);
const exp0 = mem[keyTm] && mem[keyTm].exp;
NOW += 5 * 3600 * 1000;   // 5시간 뒤
const cE = calls('treemap') + calls('byMgr');
R(`warmAll()`);
check('5시간 뒤 예열: 다시 계산 없이 보존 연장', calls('treemap') + calls('byMgr') === cE && mem[keyTm].exp > exp0, ((mem[keyTm].exp - exp0) / 3600000).toFixed(1) + '시간 연장');
NOW += 5 * 3600 * 1000;   // 처음 넣은 뒤 10시간(연장 없으면 만료)
check('처음 넣은 뒤 10시간: 캐시 유지(연장 덕분)', R(`getCached_(CacheService.getScriptCache(), ${JSON.stringify(keyTm)})`) !== null);
NOW += 7 * 3600 * 1000;
check('예열 없이 7시간 더 지나면 만료(보존 6시간)', R(`getCached_(CacheService.getScriptCache(), ${JSON.stringify(keyTm)})`) === null);

console.log('[F] 응답 축소');
const tm = api('treemap', { date: AUG, ref: 'py' }), rc = api('race', { n: 20 });
check('히트맵: 행 배열(7열)·단위 1억', Array.isArray(tm.rows) && tm.rows[0].length === 7 && tm.unit === 1e8 && !tm.items);
const navSum = tm.rows.reduce((a, r) => a + r[4] * 1e8, 0);
check('히트맵: 행 NAV 합 ≈ 합계(억원 반올림 오차 이내)', Math.abs(navSum - tm.total) / tm.total < 1e-6, (navSum / 1e12).toFixed(3) + ' vs ' + (tm.total / 1e12).toFixed(3) + '조');
check('변천: 행 배열(유형 포함)', Array.isArray(rc.frames[0].rows[0]) && typeof rc.frames[0].rows[0][6] === 'string' && rc.frames[0].rows.length === 20, JSON.stringify(rc.frames[0].rows[0]));
check('거래대금: dailyDates 제외', !('dailyDates' in api('turnover', {})));

console.log('[G] 집계 쓰기 중단 복구: 쓰는 월만 무효화');
R(`bumpCache_()`); a1 = kAug(); s1 = kSep();
R(`PropertiesService.getScriptProperties().setProperty('AGG_DIRTY', '2026-09')`);
R(`healAgg_(Date.now(), () => ctx_(), null)`);
check('AGG_DIRTY=2026-09 → 9월 이후만 무효화', kAug() === a1 && kSep() !== s1 && !R(`PropertiesService.getScriptProperties().getProperty('AGG_DIRTY')`));
a1 = kAug();
R(`PropertiesService.getScriptProperties().setProperty('AGG_DIRTY', '1790551860000')`);
R(`healAgg_(Date.now(), () => ctx_(), null)`);
check('v23 형식(시각) → 전체 무효화', kAug() !== a1);

console.log('[H] 검토 지적: 월이 바뀌면 meta(기본 기준일) 새로 계산');
R(`bumpCache_()`);
const mk1 = kMeta(), ak1 = kAug();
R(`var __ym0 = curYm_; curYm_ = () => '2099-01';`);
check('현재 월이 바뀌면 meta 키 변경(기준일 조회 키는 유지)', kMeta() !== mk1 && kAug() === ak1);
R(`curYm_ = __ym0;`);
check('같은 월이면 meta 키 동일', kMeta() === mk1);

console.log('[I] 검토 지적: 상장일 등 범례·마스터 수정 → 야간 점검에서 화면 캐시 전체 무효화');
R(`PropertiesService.getScriptProperties().setProperty(PROP.AGG_HASH, legendHash_(ctx_()))`);
R(`nightlyAgg()`);
check('처음 야간 점검: 지문만 기록(무효화 없음)', !!R(`PropertiesService.getScriptProperties().getProperty(PROP.CTX_HASH)`));
const nlP = { date: AUG, year: '2026', filter: 'all' };
const nl0 = api('newListings', nlP), cN = calls('newListings');
api('newListings', nlP);
check('신규상장 조회 캐시 적중', calls('newListings') === cN);
const code = R(`(function(){ const sh = sheet_(CFG.SHEET.MASTER), C = masterCols_(sh), rows = sh.rows; for (let i = 1; i < rows.length; i++) { if (String(rows[i][C.LIST_DD] || '') < '2025-01-01') { rows[i][C.LIST_DD] = '2026-03-16'; return padCode_(rows[i][C.CODE]); } } return null; })()`);
const mvBefore = R(`PropertiesService.getScriptProperties().getProperty('MONTH_VER')`);
R(`nightlyAgg()`);
const mvAfter = R(`PropertiesService.getScriptProperties().getProperty('MONTH_VER')`);
const nl1 = api('newListings', nlP);
check('상장일 수정(' + code + ' → 2026-03-16) 뒤 야간 점검: 전체 무효화·다시 계산·결과 반영', mvBefore !== mvAfter && calls('newListings') === cN + 1 && nl1.items.some(i => i.code === code) && !nl0.items.some(i => i.code === code), nl0.items.length + ' → ' + nl1.items.length + '종목');
R(`nightlyAgg()`);
check('변경 없으면 다시 무효화하지 않음', R(`PropertiesService.getScriptProperties().getProperty('MONTH_VER')`) === mvAfter);

console.log('[J] 검토 지적: 캐시 한도는 바이트 기준 — 한글이 많은 응답(변천)도 압축해 캐시');
R(`bumpCache_()`);
const rc1 = R(`api('race', {n:20})`), cR = calls('race');
const rawRace = mem[R(`cacheKey_('race', {n:20})`)];
const bytes = Buffer.byteLength(rc1, 'utf8');
check('변천 응답(글자 수 < 9만, 바이트 > 9만)도 캐시 저장(z: 압축)', !!rawRace && (bytes < 90000 || rawRace.v.slice(0, 2) === 'z:'), rc1.length + '자 / ' + bytes + '바이트 → ' + (rawRace ? rawRace.v.slice(0, 2) + ' ' + rawRace.v.length + '자' : '저장 안 됨'));
R(`api('race', {n:20})`);
check('두 번째 변천 조회는 캐시 적중', calls('race') === cR);

console.log('[K] 검토 지적: 예열이 강제 종료돼도 다음 예열 예약 유지');
R(`var __sched = [], __phase = 'init', __sc0 = scheduleContinue_, __wo0 = warmOne_; scheduleContinue_ = (fn, min) => { __sched.push([fn, min, __phase]); }; warmOne_ = function () { __phase = 'warming'; return __wo0.apply(null, arguments); };`);
R(`warmAll()`);
const sched = R(`JSON.stringify(__sched)`);
check('예열 시작 시 5시간 뒤 정기 예열을 먼저 예약', /^\[\["warmAll",300,"init"\]/.test(sched), sched);
R(`scheduleContinue_ = __sc0; warmOne_ = __wo0;`);

console.log('[L] 검토 지적: 캐시 버전 갱신 전 시트 쓰기 확정(flush)');
const f0 = ctx.MOCK_FLUSH || 0; R(`bumpCache_(['2026-09'])`);
check('bumpCache_ 가 SpreadsheetApp.flush 호출', (ctx.MOCK_FLUSH || 0) === f0 + 1);

console.log(fails ? '\n실패 ' + fails + '건' : '\n모두 통과');
process.exit(fails ? 1 : 0);
