/* TZ=Asia/Seoul node test/v29_theme_test.js — v29 테마 맵 서버 점검(실제 gas/*.gs + 모의 시트 store.json)
 *  A) 분류 엔진: 키워드 문법(부분 일치·~단어·/정규식/·&·코드:·국내해외:) · 실데이터 표본 분류 · 채권·금리 판정
 *  B) 범례_테마: 없으면 기본 규칙으로 생성(머리글·메모) · 사용자가 고친 규칙·순서(중간 수) 반영 · 해석 불가 키워드 보고
 *  C) apiTheme_: 행 형식·합계(기준일·비교일 NAV) · 신규상장(비교 NAV 0)·상장폐지(기준일 NAV 0) · 번호 범위
 *  D) 캐시: 테마 맵 키에만 THEME_VER 반영 · 기준일 범위(DATE_SCOPED_) · 예열 목록 포함
 *  E) 기초지수명: 열이 없는 ETF마스터에 열 추가·채움, 바뀐 것만 다시 씀, fillIndexNames 보충 · 일별 적재 레코드에 idx
 *  F) 검수표 · 야간 점검(규칙 변경 → 테마 맵 캐시만 갱신) · 메뉴 · Api 파일 순서 무관(ACTIONS 래핑) */
const fs = require('fs'), path = require('path'), vm = require('vm');
const ctx = { console: { log: () => {} }, Date, Math, JSON, Object, Array, String, Number, RegExp, Error, isNaN, setTimeout, globalThis: null, __zlib: require('zlib'), __Buffer: Buffer };
ctx.globalThis = ctx; vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname, 'shim.js'), 'utf8'), ctx);
const gasDir = path.join(__dirname, '..', 'gas');
// Apps Script 는 파일 목록 순서대로 실행 — 새 파일(Theme.gs)이 맨 뒤에 있어도 동작해야 함 → Theme.gs 를 마지막에 로드
const files = fs.readdirSync(gasDir).filter(f => f.endsWith('.gs')).sort((a, b) => (a === 'Theme.gs') - (b === 'Theme.gs') || a.localeCompare(b));
for (const f of files) vm.runInContext(fs.readFileSync(path.join(gasDir, f), 'utf8'), ctx, { filename: f });
const st = JSON.parse(fs.readFileSync(path.join(__dirname, 'store.json'), 'utf8')); ctx.__s = st;
vm.runInContext(`(function(){ const ss = SpreadsheetApp.getActiveSpreadsheet(); Object.keys(__s.store).forEach(n => { const sh = ss.insertSheet(n); sh.rows = JSON.parse(JSON.stringify(__s.store[n])); }); Object.keys(__s.props).forEach(k => PropertiesService.getScriptProperties().setProperty(k, __s.props[k])); })()`, ctx);
const R = s => vm.runInContext(s, ctx);
let fails = 0; const check = (name, ok, info) => { if (!ok) fails++; console.info((ok ? '  OK   ' : '  FAIL ') + name + (info !== undefined ? ' — ' + info : '')); };
const api = (a, p) => { const r = JSON.parse(R(`api(${JSON.stringify(a)}, ${JSON.stringify(p || {})})`)); if (!r.ok) throw new Error(a + ': ' + r.error); return r.data; };
const S = ctx.MOCK_STORE;
const cls = (name, idx, dom, f2, bond) => JSON.parse(R(`JSON.stringify(classifyEtf_(compileThemeRules_(themeDefaultRows_()), themeEntry_('000000', ${JSON.stringify(name)}, ${JSON.stringify(idx)}, ${JSON.stringify(dom)}, ${JSON.stringify(f2)}, ${bond ? 'true' : 'false'})))`));

console.log = console.info;
console.info('[A] 분류 엔진');
const m = (tok, name, idx, x) => R(`(() => { const f = themeMatcher_(${JSON.stringify(tok)}); return f ? f(themeEntry_('0000D0', ${JSON.stringify(name)}, ${JSON.stringify(idx || '')}, '국내', '파생형', false), ${x ? 'true' : 'false'}) : null; })()`);
check('부분 일치: 대소문자·띄어쓰기 무시 (S&P500 ↔ "S&P 500")', m('S&P500', '1Q 미국S&P 500') === true && m('nasdaq', 'TIGER 미국NASDAQ100') === true);
check('~단어: 한글 사이 AI 일치, TAIWAN 불일치', m('~AI', 'KODEX 미국AI소프트웨어') === true && m('~AI', 'TAIWAN TOP10') === false);
check('~단어: 숫자 이어져도 일치(TDF2045)', m('~TDF', 'TIGER TDF2045') === true);
check('/정규식/: 26-12 만기', m('/\\d{2}-\\d{2}/', 'HK 26-12 회사채') === true && m('/\\d{2}-\\d{2}/', 'KODEX 200') === false);
check('찾는 곳: 종목명만 vs 종목명·기초지수', m('반도체', 'TIGER 200 IT', '코스피 200 반도체', false) === false && m('반도체', 'TIGER 200 IT', '코스피 200 반도체', true) === true);
check('A & B: 둘 다 맞을 때만', m('~TOP10 & 국내해외:국내', 'SOL 코스닥TOP10') === true && m('~TOP10 & 국내해외:해외', 'SOL 코스닥TOP10') === false);
check('코드:·유형: 토큰', m('코드:0000D0', 'x') === true && m('유형:파생형', 'x') === true && m('유형:채권형', 'x') === false);
check('해석 불가 토큰 → null(규칙에서 제외)', m('/[/', 'x') === null);
check('쉼표 분리(정규식 안 쉼표 유지)', R(`JSON.stringify(themeTokens_('a, /x{1,2}/, b & c'))`) === '["a","/x{1,2}/","b & c"]');
const cases = [
  ['KODEX 200', '코스피 200', '국내', '국내주식형', 0, '국내 시장대표', '일반', '국내'],
  ['TIGER 미국나스닥100', 'NASDAQ 100', '해외', '해외주식형', 0, '미국 시장대표', '일반', '미국'],
  ['KODEX SK하이닉스단일종목레버리지', 'KRX SK하이닉스 지수', '국내', '파생형', 0, '반도체', '레버리지·인버스', '국내'],
  ['TIGER 엔비디아미국채커버드콜밸런스(합성)', 'KEDI 엔비디아미국채30년타겟커버드콜혼합지수(TR)', '해외', '파생형', 0, '반도체', '커버드콜·옵션', '미국'],
  ['RISE 삼성전자SK하이닉스채권혼합50', 'KAP 삼성전자SK하이닉스채권혼합50 지수', '국내', '혼합채권형', 0, '반도체', '채권혼합', '국내'],
  ['TIGER 200 IT', '코스피 200 정보기술', '국내', '국내주식형', 0, '반도체', '일반', '국내'],
  ['TIGER 머니마켓액티브', 'KIS-미래에셋 MMF지수', '국내', '채권형', 1, '단기자금·파킹', '액티브', '국내'],
  ['SOL 중단기회사채(A-이상)액티브', 'KIS 중단기크레딧플러스채권', '국내', '채권형', 1, '크레딧(회사채·금융채)', '액티브', '국내'],
  ['KODEX 27-12 회사채(AA-이상)액티브', 'KAP 27-12 회사채 총수익 지수', '국내', '채권형', 1, '만기매칭채권', '액티브', '국내'],
  ['ACE 미국10년국채액티브(H)', 'ICE U.S. Treasury 7-10 Year Bond Index', '해외', '채권형', 1, '장기채', '액티브', '미국'],
  ['KIWOOM 미국달러선물', '미국달러선물지수', '해외', '파생형', 1, '원자재·통화', '일반', '미국'],
  ['KODEX 골드선물(H)', 'S&P GSCI Gold Index(TR)', '해외', '파생형', 0, '금·은', '일반', '글로벌·기타'],
  ['KIWOOM 미국S&P500&GOLD', 'S&P500 & S&P GSCI 금현물 90/10 혼합지수', '해외', '해외주식형', 0, '미국 시장대표', '일반', '미국'],
  ['TIGER TDF2045 적격', 'S&P Korea Target Date 2045 Global Index', '해외', '기타', 0, 'TDF·자산배분', '일반', '글로벌·기타'],
  ['ACE 미국대형성장주액티브', 'CRSP US Large Cap Growth Index(PR)', '해외', '해외주식형', 0, '미국 시장대표', '액티브', '미국'],
  ['TIGER 코리아원자력', 'iSelect 코리아 원자력 지수', '국내', '국내주식형', 0, '전력·원자력', '일반', '국내'],
  ['KoAct 미국나스닥채권혼합50액티브', 'FnGuide 미국나스닥 금융채권혼합 지수', '해외', '혼합채권형', 0, '미국 시장대표', '채권혼합', '미국'],
  ['ACE 유럽방산TOP10', 'NYSE FactSet Europe Defense TOP10 Index', '해외', '해외주식형', 0, '방산·우주항공', '일반', '글로벌·기타'],
  ['TIGER 차이나글로벌리더스TOP3+', 'Solactive-KEDI 차이나글로벌리더스TOP3플러스 지수 (Price Return, CNH)', '해외', '해외주식형', 0, '해외 시장대표', '일반', '중국'],
  ['RISE 미국S&P500엔화노출(합성 H)', 'S&P500 Yen Hedged Index(PR)', '해외', '파생형', 0, '미국 시장대표', '일반', '미국'],
  ['ACE 고배당주Plus커버드콜액티브', 'KRX-Akros 고배당주 20 위클리 고정 30% 커버드콜 지수', '국내', '파생형', 0, '배당·인컴', '커버드콜·옵션', '국내'],
  ['KODEX 반도체타겟위클리커버드콜', 'KRX 반도체 타겟 9% 분배 위클리 커버드콜 지수', '국내', '파생형', 0, '반도체', '커버드콜·옵션', '국내']
];
let bad = [];
cases.forEach(c => { const r = cls(c[0], c[1], c[2], c[3], c[4]); if (r.theme !== c[5] || r.struct !== c[6] || r.region !== c[7]) bad.push(`${c[0]} → ${r.theme}/${r.struct}/${r.region}`); });
check(`실데이터 표본 ${cases.length}종목 분류(테마·상품구조·지역)`, !bad.length, bad.join(' · '));
// 실데이터 표본 파일(theme_sample.tsv, 397종목) — '기타 주식' 비율
const smp = fs.readFileSync(path.join(__dirname, 'theme_sample.tsv'), 'utf8').trim().split('\n').slice(1).map(l => l.split('\t'));
const etc = smp.filter(a => cls(a[1], a[2], a[5], a[4], a[6] === '채권/금리' || a[4] === '채권형').theme === '기타 주식');
check(`표본 ${smp.length}종목 중 '기타 주식' 2% 이하`, etc.length <= smp.length * 0.02, etc.length + '종목: ' + etc.map(a => a[1]).join(', '));
check('채권·금리 판정: 유형 범례(신규상장용 채권/금리 또는 채권형) 우선', R(`themeIsBond_({ neu: '채권/금리', f2: '파생형' }, 'X')`) === true && R(`themeIsBond_({ neu: '주식 등', f2: '혼합채권형' }, '국채혼합')`) === false);
check('채권·금리 판정: 범례에 없으면 종목명(혼합·밸런스 제외)', R(`themeIsBond_(null, 'KODEX 국고채3년')`) === true && R(`themeIsBond_(null, 'RISE 국채혼합')`) === false);

console.log('[B] 범례_테마 시트');
check('적용 전: 범례_테마 없음', !S['범례_테마']);
const R0 = R(`(() => { const r = themeRules_(); return JSON.stringify({ t: r.theme.length, s: r.struct.length, g: r.region.length, bad: r.bad }); })()`);
const sh = S['범례_테마'];
check('없으면 기본 규칙으로 생성: 머리글 10열(관심도 검색어 포함)', sh && sh.rows[0].join('|') === '순서|구분|값|테마군|자산|키워드|제외 키워드|찾는 곳|메모|관심도 검색어', sh && sh.rows[0].join('|'));
check('기본 규칙 행 수 = THEME.DEFAULT, 순서 10 간격', sh.rows.length - 1 === R('THEME.DEFAULT.length') && sh.rows[1][0] === 10 && sh.rows[2][0] === 20, sh.rows.length - 1);
check('키워드 머리글 메모(쓰는 법)', /~AI/.test((sh.notes || {})['1,6'] || '') && /정규식/.test((sh.notes || {})['1,6'] || ''));
check('컴파일: 해석 불가 키워드 없음', JSON.parse(R0).bad.length === 0, R0);
check('테마군 6종 순서', R(`JSON.stringify(THEME.GROUPS)`) === '["시장대표","산업·테마","배당·스타일","채권·금리","대체·자산배분","기타"]');
// 사용자 수정: 순서 25(금·은 다음)에 '우주항공 특별' 테마 삽입 → 해당 종목이 반도체보다 먼저 그 테마로
sh.rows.push([25, '테마', '테스트테마', '산업·테마', '주식', '반도체', '', '종목명', '사용자 추가']);
R(`THEME_RULES_MEMO_ = null`);
const t1 = R(`(() => { const r = themeRules_(); return classifyEtf_(r, themeEntry_('1', 'KODEX 반도체', 'KRX 반도체', '국내', '국내주식형', false)).theme; })()`);
check('사용자 규칙: 순서 25 로 넣은 행이 뒤쪽 반도체 규칙보다 먼저 적용', t1 === '테스트테마', t1);
sh.rows.push([26, '테마', '잘못된', '기타', '주식', '/[/', '', '종목명', '']);
R(`THEME_RULES_MEMO_ = null`);
check('해석 불가 키워드는 보고(bad) 후 그 행 무시', R(`JSON.stringify(themeRules_().bad)`) === '["잘못된: /[/"]');
sh.rows.splice(sh.rows.length - 2, 2); R(`THEME_RULES_MEMO_ = null`);

console.log('[C] apiTheme_');
const meta = api('meta');
const d = api('theme', { date: meta.defaultDate, ref: 'py' });
check('행 열 정의', d.cols.join(',') === 'code,name,mgr,nav,base,theme,struct,region,bond,listDd' && d.unit === 1e8, d.cols.join(','));
const curS = JSON.parse(R(`JSON.stringify(snapshot_(${JSON.stringify(d.date)}).map(r => [r.code, r.nav]))`)), refS = JSON.parse(R(`JSON.stringify(snapshot_(${JSON.stringify(d.ref.py)}).map(r => [r.code, r.nav]))`));
const sumCur = curS.reduce((a, r) => a + r[1], 0), sumRows = d.rows.reduce((a, r) => a + r[3], 0) * 1e8;
check('기준일 NAV 합계 = 스냅샷 합계(억원 반올림 오차 이내)', Math.abs(sumRows - sumCur) < d.rows.length * 0.05e8 && Math.abs(d.total - sumCur) < 1, `${(sumRows / 1e12).toFixed(2)} vs ${(sumCur / 1e12).toFixed(2)}조`);
const curC = new Set(curS.filter(r => r[1] > 0).map(r => r[0])), refC = new Set(refS.filter(r => r[1] > 0).map(r => r[0]));
const all = new Set([...curC, ...refC]);
check('행 = 기준일 NAV>0 ∪ 비교일 NAV>0 종목', d.rows.length === all.size, d.rows.length + ' vs ' + all.size);
const ldOf = c => R(`listDdOf_(${JSON.stringify(c)}, ctx_())`);
const news = d.rows.filter(r => !refC.has(r[0]));
check('비교일에 없는 종목(신규상장) → 비교 NAV 0 (있는 경우)', news.every(r => r[4] === 0), news.length + '종목');
const ye = meta.months.filter(x => x.ym === '2025-12')[0].date, d25 = api('theme', { date: ye, ref: 'py' });
const ref25 = new Set(JSON.parse(R(`JSON.stringify(snapshot_(${JSON.stringify(d25.ref.py)}).filter(r => r.nav > 0).map(r => r.code))`)));
const new25 = d25.rows.filter(r => !ref25.has(r[0])), lst25 = d25.rows.filter(r => r[9] && r[9] > d25.ref.py);
check('2025년말 기준(전년말 대비): 2025년 상장 종목 비교 NAV 0, 증감 = 기준일 NAV', new25.length > 0 && new25.every(r => r[4] === 0) && lst25.every(r => r[4] === 0), new25.length + '종목 · 상장일 표시 ' + lst25.length);
const inRange = d.rows.filter(r => r[9]);
check('상장일은 최근 1년 이내만', inRange.every(r => r[9] > String(+d.date.slice(0, 4) - 1) + d.date.slice(4) && r[9] <= d.date), inRange.length + '종목');
check('번호 범위: 테마·상품구조·지역·운용사', d.rows.every(r => r[5] < d.themes.length && r[6] < d.structs.length && r[7] < d.regions.length && r[2] < d.mgrs.length));
check('테마 목록 [이름, 테마군], 테마군은 6종 중', d.themes.every(t => Array.isArray(t) && d.groups.indexOf(t[1]) >= 0));
check('레버리지 표식 = 레버리지·인버스', d.lev === '레버리지·인버스' && d.structs.indexOf(d.lev) >= 0);
const tc = {}; d.rows.forEach(r => tc[d.themes[r[5]][0]] = (tc[d.themes[r[5]][0]] || 0) + 1);
console.info('     테마 분포(모의): ' + Object.keys(tc).map(k => k + ' ' + tc[k]).join(' · '));
check('모의 자료: 주요 테마 분류됨(국내·미국 시장대표, 반도체, 단기자금·파킹, 금·은)', ['국내 시장대표', '미국 시장대표', '반도체', '단기자금·파킹', '금·은'].every(k => tc[k] > 0));
check('모의 자료: 기타 주식 0', !tc['기타 주식'], tc['기타 주식']);
// 상장폐지: 비교일에만 있는 종목 만들기 — 기준일 스냅샷에서 한 종목 제거한 것처럼 확인(직접 계산)
const gone = [...refC].filter(c => !curC.has(c));
check('비교일에만 있는 종목(상장폐지) → 기준일 NAV 0 (있는 경우)', gone.every(c => d.rows.find(r => r[0] === c)[3] === 0), gone.length + '종목');
const d2 = api('theme', { date: meta.defaultDate, ref: 'pm' });
check('비교 기준 전월말: 비교일·라벨', d2.ref.mode === 'pm' && d2.refLabel === '전월말' && d2.ref.py === d2.ref.pm, JSON.stringify(d2.ref));
const len = JSON.stringify(d).length;
check('응답 크기 < 100KB (모의 320종목)', len < 100 * 1024, (len / 1024).toFixed(0) + 'KB');

console.log('[D] 캐시');
const P = () => JSON.parse(R(`JSON.stringify(PropertiesService.getScriptProperties().getProperties())`));
const k1 = R(`cacheKey_('theme', { date: '2026-08-31', ref: 'py' })`), o1 = R(`cacheKey_('byMgr', { date: '2026-08-31', ref: 'py' })`);
R(`bumpThemeCache_()`);
const k2 = R(`cacheKey_('theme', { date: '2026-08-31', ref: 'py' })`), o2 = R(`cacheKey_('byMgr', { date: '2026-08-31', ref: 'py' })`);
check('테마 규칙 반영(bumpThemeCache_) → 테마 맵 키만 바뀜', k1 !== k2 && o1 === o2, k2);
check('테마 맵은 기준일 범위 캐시(DATE_SCOPED_.theme = date)', R(`DATE_SCOPED_.theme`) === 'date');
check('캐시 세대 유지(a26 — 기존 탭 캐시 보존)', R('CACHE_GEN_') === 'a26');
check('예열 목록에 테마 맵(기본 기준일·전년말)', R(`JSON.stringify(warmParams_('2026-08-31', ['2026-01-02','2026-09-09'], aggMarket_()).filter(x => x[0] === 'theme'))`) === '[["theme",{"date":"2026-08-31","ref":"py"}]]');
check('ACTIONS.theme 는 함수 래핑(파일 순서 무관)', /apiTheme_\(p\)/.test(R(`String(ACTIONS.theme)`)));

console.log('[E] 기초지수명');
const MS = S['ETF마스터'];
check('ETF마스터 머리글에 기초지수(신규 설치)', R(`CFG.MASTER_HEADER.join('|')`).endsWith('기초지수'));
// 기존 시트 상황 재현: 기초지수 열 없음
MS.rows = MS.rows.map(r => r.slice(0, 8));
R(`(() => { const m = master_(); return Object.keys(m).length; })()`);
check('기존 시트: 기초지수 열 없음 → master_().idx 빈 값', R(`(() => { const m = master_(); return Object.keys(m).every(c => m[c].idx === ''); })()`) === true);
const calls0 = ctx.MOCK_CALLS;
const fr = JSON.parse(R(`JSON.stringify(fillIndexNames())`));
check('fillIndexNames: 열 추가 + 빈칸 채움(최근 영업일 1회 조회로 전 종목)', MS.rows[0][8] === '기초지수' && fr.left === 0 && fr.updated === MS.rows.length - 1 && ctx.MOCK_CALLS - calls0 === 1, JSON.stringify(fr) + ' calls ' + (ctx.MOCK_CALLS - calls0));
const recs = JSON.parse(R(`JSON.stringify(fetchEtfDaily_('2026-09-09').slice(0, 3))`));
check('일별 레코드에 기초지수명(idx)', recs.every(r => typeof r.idx === 'string' && r.idx.length > 0), recs.map(r => r.idx).join(' / '));
const n0 = R(`syncIndexNames_(fetchEtfDaily_('2026-09-09'), ctx_())`);
check('같은 값이면 쓰지 않음(0행)', n0 === 0, n0);
const code1 = MS.rows[1][0];
const n1 = R(`syncIndexNames_([{ code: ${JSON.stringify(String(code1))}, idx: '바뀐 지수명' }], ctx_())`);
check('바뀐 종목만 반영', n1 === 1 && MS.rows[1][8] === '바뀐 지수명', MS.rows[1][8]);
check('loadDaily: 마스터 확인 뒤 기초지수명 갱신(코드 경로)', /syncIndexNames_\(recs, ctx\)/.test(fs.readFileSync(path.join(gasDir, 'Load.gs'), 'utf8')));

console.log('[F] 검수표 · 야간 점검 · 메뉴');
const rv = JSON.parse(R(`JSON.stringify(buildThemeReview())`));
const RV = S['테마_분류검토'];
check('검수표: 최근 영업일 전 종목(NAV>0) 행', RV && RV.rows.length - 1 === rv.n && rv.n === curS.length || rv.n > 0, JSON.stringify(rv));
check('검수표 머리글', RV.rows[0].join('|') === '테마군|테마|상품구조|지역|자산|종목코드|종목명|기초지수|운용사|NAV(억원)');
const ord = R('JSON.stringify(THEME.GROUPS)'), g = RV.rows.slice(1).map(r => JSON.parse(ord).indexOf(r[0]));
check('검수표 정렬: 테마군 순', g.every((v, i) => !i || v >= g[i - 1]));
R(`(() => { const p = PropertiesService.getScriptProperties(), c = ctx_(); p.setProperty(PROP.AGG_HASH, legendHash_(c)); p.setProperty(PROP.CTX_HASH, ctxHash_(c)); p.deleteProperty(PROP.FULL_AGG); })()`);   // 범례 변경 없음 상태
const tv0 = P().THEME_VER;
R(`nightlyAgg()`);
const h1 = P().THEME_HASH;
check('야간 점검: 테마 지문 처음 기록(캐시 갱신 없음)', !!h1 && P().THEME_VER === tv0);
sh.rows[sh.rows.length - 1][5] = '*, 추가키워드';
R(`nightlyAgg()`);
check('야간 점검: 범례_테마 수정 감지 → 테마 맵 캐시만 갱신', P().THEME_HASH !== h1 && P().THEME_VER !== tv0);
const setup = fs.readFileSync(path.join(gasDir, 'Setup.gs'), 'utf8');
check('메뉴: 테마 분류 검수표·기초지수명 채우기·KIS/네이버 키 설정', ['menuThemeReview', 'menuFillIndexNames', 'setKisKey', 'setNaverKey'].every(f => setup.indexOf(`'${f}'`) >= 0 && R(`typeof ${f}`) === 'function'));
check('키 입력은 스크립트 속성에만 저장(시트에 쓰지 않음)', /props\.setProperty\(k, vals\[k\]\)/.test(setup) && R(`[PROP.KIS_KEY, PROP.KIS_SECRET, PROP.NAVER_ID, PROP.NAVER_SECRET].join(',')`) === 'KIS_APP_KEY,KIS_APP_SECRET,NAVER_CLIENT_ID,NAVER_CLIENT_SECRET');

console.info(fails ? `\n${fails}건 실패` : '\n전부 통과');
process.exit(fails ? 1 : 0);
