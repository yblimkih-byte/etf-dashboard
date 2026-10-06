/* TZ=Asia/Seoul node test/v29_kis_buzz_test.js — v29 종목→ETF 찾기(KIS 구성종목)·관심도(네이버) 서버 점검(모의 API)
 *  A) KIS 응답 해석·검색 일치 규칙  B) 수집: 키 없음 오류 · 토큰 재사용 · 동시 요청·한도 초과 재시도 · 이어서 실행 · 시트 교체 · 실패 시 이전 자료 유지 · meta 표시
 *  C) 검색: 별칭(한/영·티커)·코드·정확 일치 우선·후보 선택(pick)·현금 제외·보유 평가액 = NAV × 비중 · 많이 담긴 종목
 *  D) 관심도: 기준어 환산·4주 변화·단어 추출 · 수집 → 시트 · API(대상·뉴스·새 단어·사전 표시) · 메뉴/트리거 */
const fs = require('fs'), path = require('path'), vm = require('vm');
const ctx = { console: { log: () => {} }, Date, Math, JSON, Object, Array, String, Number, RegExp, Error, isNaN, setTimeout, globalThis: null, __zlib: require('zlib'), __Buffer: Buffer, encodeURIComponent, decodeURIComponent };
ctx.globalThis = ctx; vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname, 'shim.js'), 'utf8'), ctx);
const gasDir = path.join(__dirname, '..', 'gas');
for (const f of fs.readdirSync(gasDir).filter(f => f.endsWith('.gs')).sort((a, b) => (/^(Theme|Kis|Buzz)\.gs$/.test(a)) - (/^(Theme|Kis|Buzz)\.gs$/.test(b)) || a.localeCompare(b))) vm.runInContext(fs.readFileSync(path.join(gasDir, f), 'utf8'), ctx, { filename: f });
const st = JSON.parse(fs.readFileSync(path.join(__dirname, 'store.json'), 'utf8')); ctx.__s = st;
vm.runInContext(`(function(){ const ss = SpreadsheetApp.getActiveSpreadsheet(); Object.keys(__s.store).forEach(n => { const sh = ss.insertSheet(n); sh.rows = JSON.parse(JSON.stringify(__s.store[n])); }); Object.keys(__s.props).forEach(k => PropertiesService.getScriptProperties().setProperty(k, __s.props[k])); })()`, ctx);
const R = s => vm.runInContext(s, ctx);
let fails = 0; const check = (name, ok, info) => { if (!ok) fails++; console.info((ok ? '  OK   ' : '  FAIL ') + name + (info !== undefined ? ' — ' + info : '')); };
const api = (a, p) => { const r = JSON.parse(R(`api(${JSON.stringify(a)}, ${JSON.stringify(p || {})})`)); if (!r.ok) throw new Error(a + ': ' + r.error); return r.data; };
const S = ctx.MOCK_STORE, P = () => JSON.parse(R(`JSON.stringify(PropertiesService.getScriptProperties().getProperties())`));
const J = s => JSON.parse(R(`JSON.stringify(${s})`));

console.info('[A] KIS 응답 해석 · 일치 규칙');
const ok1 = J(`kisParsePdf_(200, JSON.stringify({ rt_cd: '0', output1: { etf_cnfg_issu_cnt: '3' }, output2: [{ stck_shrn_iscd: '005930', hts_kor_isnm: '삼성전자', etf_cnfg_issu_rlim: '25.5', etf_vltn_amt: '100' }, { stck_shrn_iscd: '', hts_kor_isnm: '', etf_cnfg_issu_rlim: '0' }] }))`);
check('정상 응답: 구성종목·비중·ETF 측 구성 수, 빈 행 제외', ok1.ok && ok1.rows.length === 1 && ok1.rows[0][2] === 25.5 && ok1.n === 3, JSON.stringify(ok1));
const ok2 = J(`kisParsePdf_(200, JSON.stringify({ rt_cd: '0', output2: [{ stck_shrn_iscd: 'A', hts_kor_isnm: 'a', etf_cnfg_issu_rlim: '', etf_vltn_amt: '300' }, { stck_shrn_iscd: 'B', hts_kor_isnm: 'b', etf_vltn_amt: '100' }] }))`);
check('비중 없으면 평가금액 비율로 계산(75/25)', ok2.rows[0][2] === 75 && ok2.rows[1][2] === 25, JSON.stringify(ok2.rows));
const pm = J(`kisParsePdf_(200, JSON.stringify({ rt_cd: '0', output1: { etf_cnfg_issu_cnt: '21', etf_cu_unit_scrt_cnt: '50000', nav: '8771.45' }, output2: [{ stck_shrn_iscd: '005930', hts_kor_isnm: '삼성전자', etf_cnfg_issu_rlim: '100.00', etf_vltn_amt: '10212000' }] }))`);
check('v31 비중 = 평가금액 ÷ (CU 증권수 × NAV): 해외 21종목 중 국내 1종목 ETF 의 삼성전자 2.33%(rlim 100% 아님)·일부 표시', Math.abs(pm.rows[0][2] - 2.33) < 0.01 && pm.part === true, JSON.stringify(pm));
const pk = J(`kisParsePdf_(200, JSON.stringify({ rt_cd: '0', output1: { etf_cnfg_issu_cnt: '202', etf_cu_unit_scrt_cnt: '50000', nav: '111776.19' }, output2: [{ stck_shrn_iscd: '005930', hts_kor_isnm: '삼성전자', etf_cnfg_issu_rlim: '34.43', etf_vltn_amt: '1923444000' }] }))`);
check('v31 국내 전용 ETF(KODEX 200 실측값): 계산 비중 ≈ rlim (34.42 vs 34.43)', Math.abs(pk.rows[0][2] - 34.42) < 0.02, pk.rows[0][2]);
const pz = J(`kisParsePdf_(200, JSON.stringify({ rt_cd: '0', output1: { etf_cnfg_issu_cnt: '5' }, output2: [{ stck_shrn_iscd: 'A', hts_kor_isnm: 'a', etf_vltn_amt: '300' }] }))`);
check('CU 금액·rlim 모두 없고 일부만 왔으면 평가금액 비율(100%)로 부풀리지 않음', pz.rows[0][2] === 0, JSON.stringify(pz.rows));
check('v31 캐시 키: 길이가 같은 한글 검색어도 다른 키(삼성전자 ≠ 엔비디아), 이전 방식은 충돌', R(`cacheKey_('holders', { q: '삼성전자' }) !== cacheKey_('holders', { q: '엔비디아' }) && md5_('{"q":"삼성전자"}', true) === md5_('{"q":"엔비디아"}', true)`) === true);
const e1 = J(`kisParsePdf_(500, JSON.stringify({ rt_cd: '1', msg_cd: 'EGW00201', msg1: '초당 거래건수를 초과하였습니다.' }))`);
check('초당 한도 초과 → 재시도 대상', !e1.ok && e1.retry && !e1.expired, JSON.stringify(e1));
const e2 = J(`kisParsePdf_(500, JSON.stringify({ rt_cd: '1', msg_cd: 'EGW00123', msg1: '기간이 만료된 token 입니다.' }))`);
check('토큰 만료 → 재발급 후 재시도', !e2.ok && e2.retry && e2.expired);
const e3 = J(`kisParsePdf_(200, JSON.stringify({ rt_cd: '7', msg_cd: 'OPSQ0001', msg1: '조회할 자료가 없습니다' }))`);
check('업무 오류 → 재시도하지 않음', !e3.ok && !e3.retry);
check('현금성 행 판정(원화예금·KRD 코드)', R(`kisCash_('KRD010010001', '원화예금') && kisCash_('', '설정현금액') && !kisCash_('005930', '삼성전자')`) === true);
check('일치: 티커는 단어 단위(MU ≠ MULTI), 이름 부분 일치, 코드 일치', R(`holdMatch_(['MU'], 'MU', 'MICRON TECHNOLOGY') && !holdMatch_(['MU'], 'X1', 'MULTI ASSET') && holdMatch_(['NVIDIA'], 'NVDA', 'NVIDIA CORP') && holdMatch_(['005930'], '005930', '삼성전자') && holdMatch_(['삼성전자'], '005935', '삼성전자우')`) === true);
check('KST 만료 시각 해석', R(`kisKst_('2026-10-06 09:00:00')`) === Date.parse('2026-10-06T00:00:00Z'));

console.info('[B] 구성종목 수집');
check('meta: 수집 전 holdingsDate 없음(탭 숨김)', api('meta').holdingsDate === null);
check('검색 API: 수집 전 ready=false', api('holders', { q: '삼성전자' }).ready === false);
let err = ''; try { R(`collectHoldings()`); } catch (e) { err = e.message; }
check('키 없음 → 안내 오류', /KIS Open API 키 미설정/.test(err), err);
R(`PropertiesService.getScriptProperties().setProperty(PROP.KIS_KEY, 'K'); PropertiesService.getScriptProperties().setProperty(PROP.KIS_SECRET, 'S'); PropertiesService.getScriptProperties().deleteProperty(PROP.KIS_RUN)`);
// 이어서 실행: 실행 시한을 매우 짧게 → 1배치씩
R(`KIS.RUN_MS = 1; KIS.GAP_MS = 0`); ctx.Utilities.sleep = () => {};
R(`collectHoldings()`);
const s1 = JSON.parse(P().KIS_PDF_STATE || '{}');
check('시한 초과 → 진행 상태 저장(이어서 실행)', s1.i === R('KIS.BATCH') && !!S['구성종목_수집중'] && !S['구성종목'], JSON.stringify({ i: s1.i, ok: s1.ok }));
check('토큰 1회 발급 후 재사용', ctx.MOCK_KIS_TOKENS === 1);
check('한도 초과 1건 → 재시도로 성공(오류 0)', s1.err === 0 && ctx.MOCK_KIS_LIMITED === 1, JSON.stringify(s1));
R(`KIS.RUN_MS = 4 * 60 * 1000`);
R(`collectHoldings()`);
const info = JSON.parse(P().KIS_PDF_INFO || '{}');
const targets = J(`holdingsTargets_(${JSON.stringify(info.date)}).length`);
check('완료: 구성종목 시트로 교체·수집중 시트 제거·상태 삭제', !!S['구성종목'] && !S['구성종목_수집중'] && !P().KIS_PDF_STATE && P().KIS_PDF_DATE === info.date, JSON.stringify(info));
check('대상 = 기준일 NAV>0 전 종목, 성공+구성 없음+오류 = 대상', info.n === targets && info.ok + info.empty + info.err === targets && info.ok > 0, `${info.ok}+${info.empty}+${info.err}=${targets}`);
check('토큰은 여전히 1회 발급(같은 날 재사용)', ctx.MOCK_KIS_TOKENS === 1);
check('구성종목 시트 머리글(v34 ISIN·출처)', S['구성종목'].rows[0].join('|') === 'ETF코드|ETF명|구성종목코드|구성종목명|비중(%)|평가금액(원)|ISIN|출처');
const top = JSON.parse(P().KIS_PDF_TOP || '[]');
check('많이 담긴 종목(보유액 순) — 1위 삼성전자, 현금 제외', top.length > 3 && top[0][0] === '삼성전자' && !top.some(t => /원화예금/.test(t[0])), top.slice(0, 4).map(t => t[0] + ' ' + t[2] + '억').join(', '));
const m = api('meta');
check('meta: holdingsDate = 수집 기준일(탭 표시)', m.holdingsDate === info.date, m.holdingsDate);
// 실패 시 이전 자료 유지: 모든 종목 오류
ctx.MOCK_KIS_FAIL = () => true;
const prevRows = S['구성종목'].rows.length;
R(`collectHoldings()`);
check('절반 이상 실패 → 이전 구성종목 유지, 실패 기록', S['구성종목'].rows.length === prevRows && JSON.parse(P().KIS_PDF_INFO).failed === true && !!S['구성종목_수집중']);
ctx.MOCK_KIS_FAIL = null;
R(`collectHoldings()`);
check('다시 수집 → 정상 교체', !S['구성종목_수집중'] && !JSON.parse(P().KIS_PDF_INFO).failed);

console.info('[C] 검색');
const h1 = api('holders', { q: '엔비디아' });
check('별칭(엔비디아 → NVIDIA CORP) 일치', h1.sel && h1.sel.name === 'NVIDIA CORP' && h1.items.length > 0, h1.sel && h1.sel.name + ' ' + h1.items.length + 'ETF');
check('결과: 비중 내림차순, 보유 평가액 = NAV × 비중', h1.items.every((x, i) => !i || x.w <= h1.items[i - 1].w) && h1.items.every(x => Math.abs(x.amt - x.nav * x.w / 100) < 1));
check('결과 행: 운용사·상위구분·유형', h1.items.every(x => x.mgr && x.top && x.type));
const h2 = api('holders', { q: 'nvda' });
check('티커(소문자) → 같은 종목', h2.sel && h2.sel.key === h1.sel.key);
const h3 = api('holders', { q: '삼성전자' });
check('정확 일치 우선: 삼성전자(삼성전자우는 후보로)', h3.sel.name === '삼성전자' && h3.cands.some(c => c.name === '삼성전자우'), h3.cands.map(c => c.name).join(','));
const pick = h3.cands.find(c => c.name === '삼성전자우').key;
const h4 = api('holders', { q: '삼성전자', pick: pick });
check('후보 선택(pick) → 삼성전자우 보유 ETF', h4.sel.name === '삼성전자우' && h4.items.length > 0 && h4.items.length < h3.items.length, h4.items.length + ' vs ' + h3.items.length);
const h5 = api('holders', { q: '005930' });
check('종목코드 검색', h5.sel && h5.sel.name === '삼성전자');
const h6 = api('holders', { q: '원화예금' });
check('현금성 행은 검색되지 않음', h6.cands.length === 0 && h6.items.length === 0);
const h7 = api('holders', { q: '없는종목XYZ' });
check('없는 종목 → 빈 결과(오류 아님)', h7.ready && h7.cands.length === 0);
check('별칭 시트 자동 생성(대표 표기·검색어)', !!S['범례_종목별칭'] && S['범례_종목별칭'].rows.length > 20);
check('빈 검색어 → 많이 담긴 종목·수집 정보만', (() => { const h = api('holders', {}); return h.ready && h.top.length > 0 && !h.items; })());

// v32: 검색 색인 — 한 번 만들면 다른 검색어도 시트·범례를 다시 읽지 않음, 압축·분할 캐시 한도 안
ctx.MOCK_CACHE = true;
R(`var __hr = 0, __cx = 0; const __o1 = holdingsRows_, __o2 = ctx_; holdingsRows_ = function () { __hr++; return __o1.apply(this, arguments); }; ctx_ = function () { __cx++; return __o2.apply(this, arguments); };`);
const x1 = J(`apiHolders_({ q: '삼성전자' })`), x2 = J(`apiHolders_({ q: 'NVIDIA' })`), x3 = J(`apiHolders_({ q: '000660' })`);
check('v32 색인: 검색 3회에 구성종목 시트·범례 읽기 각 1회', R('__hr') === 1 && R('__cx') === 1 && x1.items.length > 0 && x2.items.length > 0 && x3.items.length > 0, R('__hr') + '/' + R('__cx'));
const ixLen = R(`JSON.stringify(holdingsIndex_(PropertiesService.getScriptProperties().getProperty(PROP.KIS_DATE))).length`);
check('v32 색인 캐시 저장(압축·분할)·다시 읽기 일치', R(`(function(){ const d = PropertiesService.getScriptProperties().getProperty(PROP.KIS_DATE); const c = CacheService.getScriptCache(); return !!getCached_(c, holdingsIndexKey_(d)); })()`) === true, Math.round(ixLen / 1024) + 'KB');
R(`bumpCache_(['9999-12'])`); J(`apiHolders_({ q: '삼성전자우' })`);
check('v32 캐시 버전이 바뀌면(적재·집계) 색인 다시 만듦', R('__hr') === 2, R('__hr'));
R(`holdingsRows_ = __o1; ctx_ = __o2;`); ctx.MOCK_CACHE = false;
console.info('[D] 관심도');
const sc = J(`buzzScale_({ results: [{ title: 'ETF', data: [{ period: 'a', ratio: 50 }, { period: 'b', ratio: 100 }] }, { title: 'X', data: [{ period: 'a', ratio: 5 }, { period: 'b', ratio: 5 }] }] }, 'ETF')`);
check('기준어 환산: ETF=100 기준(5/50 → 10, 5/100 → 5)', sc.X[0][1] === 10 && sc.X[1][1] === 5, JSON.stringify(sc));
const tr = J(`buzzTrend_([[1,1],[2,1],[3,1],[4,1],[5,2],[6,2],[7,2],[8,2]])`);
check('최근 4주 vs 직전 4주 변화율 +100%', tr.s4 === 2 && tr.p4 === 1 && tr.chg === 100);
const ws = J(`buzzWords_('<b>반도체</b> ETF에 개인 순매수… 스테이블코인 관련주로 자금 몰려 1조원')`.replace('<b>', '').replace('</b>', ''));
check('단어 추출: 조사 제거·불용어(ETF·개인·순매수·자금)·숫자 제외', ws.indexOf('반도체') >= 0 && ws.indexOf('스테이블코인') >= 0 && ws.indexOf('관련주') >= 0 && !ws.some(w => /ETF|개인|순매수|자금|1조원/.test(w)), ws.join(','));
check('제목 정리(태그·엔터티)', R(`buzzTitle_('<b>A</b> &quot;B&quot; &amp; C')`) === 'A "B" & C');
let err2 = ''; try { R(`collectBuzz()`); } catch (e) { err2 = e.message; }
check('키 없음 → 안내 오류', /네이버 API 키 미설정/.test(err2), err2);
R(`PropertiesService.getScriptProperties().setProperty(PROP.NAVER_ID, 'I'); PropertiesService.getScriptProperties().setProperty(PROP.NAVER_SECRET, 'S')`);
const tg = J(`buzzTargets_()`);
check('대상: 범례_테마의 관심도 검색어(테마·상품구조, 빈 칸 제외)', tg.length >= 25 && tg.some(t => t[0] === '반도체' && t[1] === 'theme') && tg.some(t => t[1] === 'struct') && !tg.some(t => t[0] === '기타 주식'), tg.length);
check('범례_테마 머리글 10열(관심도 검색어)', S['범례_테마'].rows[0][9] === '관심도 검색어' && S['범례_테마'].rows.find(r => r[2] === '반도체')[9] === '반도체 ETF');
R(`collectBuzz()`);
check('NAVER API HUB 주소·인증 헤더(401 없음)', !ctx.MOCK_NAVER_401 && /naverapihub\.apigw\.ntruss\.com\/search-trend\/v1\/search/.test(R('BUZZ.DATALAB')) && /naverapihub\.apigw\.ntruss\.com\/search\/v1\/news/.test(R('BUZZ.NEWS')), ctx.MOCK_NAVER_401 || 0);
check('DataLab 요청 수 = ⌈대상/4⌉ (기준어 포함 5그룹)', ctx.MOCK_NAVER_DL === Math.ceil(tg.length / 4), ctx.MOCK_NAVER_DL + ' / ' + tg.length);
const BS = S['관심도'];
check('관심도 시트: 검색·뉴스·단어 행', BS && BS.rows[0].join('|') === '구분|대상|기간|값' && ['검색', '뉴스', '단어'].every(k => BS.rows.some(r => r[0] === k)), BS && BS.rows.length);
check('meta: buzzDate(탭 표시)', !!api('meta').buzzDate);
const bz = api('buzz');
const semi = bz.items.find(x => x.key === '반도체');
check('API: 대상별 26주 지수·4주 변화·뉴스 7일', bz.ready && semi && semi.s.length >= 25 && semi.chg !== null && semi.news7 > 0 && semi.newsP > 0, semi && JSON.stringify({ n: semi.s.length, s4: semi.s4.toFixed(2), chg: semi.chg.toFixed(1), news7: semi.news7, newsP: semi.newsP }));
check('뉴스: 하루 n건 × 7일(중복 제거, 검색어 최대 3개 합산)', bz.items.every(x => x.news7 > 0));
const sw = bz.words.find(w => w.w === '스테이블코인'), sd = bz.words.find(w => w.w === '반도체');
check('새 단어: 스테이블코인 = 사전에 없음, 반도체 = 사전에 있음', sw && !sw.dict && sd && sd.dict, JSON.stringify([sw, sd]));
check('새 단어: 최근 7일 많은 순', bz.words.every((w, i) => !i || w.n7 <= bz.words[i - 1].n7));
const H = 3600000, D = 24 * H, now0 = Date.now(), ts0 = []; for (let i = 0; i < 14 * 24; i++) ts0.push(now0 - i * H - 1);   // 시간당 1건, 14일
const c1 = J(`buzzNewsCount_(${JSON.stringify(ts0)}, ${now0 - 14 * D}, ${now0}, ${now0 - 7 * D}, ${now0 - 14 * D})`);
check('뉴스 집계: 14일을 다 덮으면 그대로(168/168, 추정 아님)', c1.n7 === 168 && c1.nP === 168 && !c1.est, JSON.stringify(c1));
const c2 = J(`buzzNewsCount_(${JSON.stringify(ts0.filter(t => t >= now0 - 10 * D))}, ${now0 - 10 * D}, ${now0}, ${now0 - 7 * D}, ${now0 - 14 * D})`);
check('뉴스 집계: 10일만 덮으면 이전 7일을 3일분에서 환산(≈168, 추정)', c2.n7 === 168 && Math.abs(c2.nP - 168) <= 1 && c2.est, JSON.stringify(c2));
const c3 = J(`buzzNewsCount_(${JSON.stringify(ts0.filter(t => t >= now0 - 3 * D))}, ${now0 - 3 * D}, ${now0}, ${now0 - 7 * D}, ${now0 - 14 * D})`);
check('뉴스 집계: 3일만 덮으면 최근 7일 환산·이전 7일 없음(null)', Math.abs(c3.n7 - 168) <= 1 && c3.nP === null && c3.est, JSON.stringify(c3));
ctx.MOCK_NEWS_PERDAY = { 'ETF': 200, '반도체 ETF': 100 }; ctx.MOCK_NAVER_NEWS = 0;
R(`collectBuzz()`);
const bz2 = api('buzz'), semi2 = bz2.items.find(x => x.key === '반도체');
check('기사가 많은 검색어(500건 상한): 최근 7일 환산·이전 7일 비교 생략·추정 표시', semi2 && Math.abs(semi2.news7 - 700) <= 15 && semi2.newsP === null && semi2.newsChg === null && semi2.newsEst, semi2 && JSON.stringify({ n7: semi2.news7, nP: semi2.newsP, est: semi2.newsEst }));
check("새 단어: 'ETF' 1,000건 상한 → 덮은 5일을 반으로(2.5일 vs 2.5일)", bz2.info.wordDays === 2.5 && bz2.titles.n7 + bz2.titles.nP === 1000 && Math.abs(bz2.titles.n7 - bz2.titles.nP) <= 12, JSON.stringify({ d: bz2.info.wordDays, t: bz2.titles }));
check('뉴스 요청: 상한(검색어 5쪽·ETF 10쪽) 안에서만', ctx.MOCK_NAVER_NEWS <= tg.reduce((n, t) => n + Math.min(t[3].length, 3), 0) * 5 + 10, ctx.MOCK_NAVER_NEWS);
ctx.MOCK_NEWS_PERDAY = null;
const setup = fs.readFileSync(path.join(gasDir, 'Setup.gs'), 'utf8');
check('메뉴: 연결 테스트·지금 수집(KIS·네이버)', ['menuTestKis', 'menuCollectHoldings', 'menuTestNaver', 'menuCollectBuzz'].every(f => setup.indexOf(`'${f}'`) >= 0 && R(`typeof ${f}`) === 'function'));
check('키 저장 → 수집 트리거 설치·첫 수집 예약(코드 경로)', /installHoldingsTrigger_\(\); scheduleContinue_\('collectHoldings', 1\)/.test(setup) && /installBuzzTrigger_\(\); scheduleContinue_\('collectBuzz', 1\)/.test(setup));
check('ACTIONS: holders·buzz 함수 래핑', /apiHolders_\(p\)/.test(R('String(ACTIONS.holders)')) && /apiBuzz_\(p\)/.test(R('String(ACTIONS.buzz)')));

R(`PropertiesService.getScriptProperties().setProperty(PROP.AGG_HASH, legendHash_(ctx_(), true)); PropertiesService.getScriptProperties().deleteProperty(PROP.FULL_AGG)`);
const legacyH = P().AGG_LEGEND_HASH; R(`nightlyAgg()`);
check('v31 야간 점검: 범례 지문이 이전 방식 값이면 재계산 없이 새 방식으로만 갱신', P().AGG_LEGEND_HASH === R('legendHash_(ctx_())') && P().AGG_LEGEND_HASH !== legacyH && !R('fullAggState_()'), P().AGG_LEGEND_HASH);

console.info(fails ? `\n${fails}건 실패` : '\n전부 통과');
process.exit(fails ? 1 : 0);
