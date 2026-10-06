/* TZ=Asia/Seoul node test/v34_funetf_test.js — v34 종목→ETF 찾기: FunETF 구성종목(해외 주식 포함) 반영·검색 점검(모의)
 *  A) ISIN 계산·주식 행 판정·응답 해석  B) 브라우저 버튼 반영(doPost start/put/end): 인증 · 순서 · 빈 응답·실패 ETF 는 KIS 보완 · 못 보낸 ETF · 실패 시 이전 자료 유지
 *  C) 월요일 KIS 자동 수집: FunETF 자료가 2주 이내면 건너뜀 · 메뉴 강제 수집  D) 검색: 해외 주식(한글·영문·티커) · 같은 ISIN 표기 통합 · 티커 없는 주식 · 현금·TRS 제외
 *  E) 즐겨찾기 버튼 코드(문법·주소·토큰) · 화면 문구(원천별) */
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
ctx.Utilities.sleep = () => {};
let __u = 0; ctx.Utilities.getUuid = () => 'aaaaaaaa-bbbb-cccc-dddd-' + String(1e11 + (++__u)).slice(-12);
ctx.ScriptApp.getService = () => ({ getUrl: () => 'https://script.google.com/macros/s/TESTDEPLOY/exec' });
ctx.ContentService = { MimeType: { JSON: 'json' }, createTextOutput: s => ({ setMimeType() { return this; }, getContent: () => s }) };
// 모의 자료의 ETF 코드(100137 …)는 끝자리가 0 이 아니라 ISIN 규칙 밖 → 시험용 고유 ISIN 부여(실제 ETF 코드는 끝자리 0)
R(`const __isin0 = isinKr_; isinKr_ = function (c) { return __isin0(c) || (/^1\\d{5}$/.test(String(c)) ? 'KRT' + c + '000' : ''); };`);

console.info('[A] ISIN · 주식 행 판정 · 응답 해석');
check('ETF ISIN(실제 값과 일치: 360750·069500·0234N0·133690)', J(`[isinKr_('360750'), isinKr_('069500'), isinKr_('0234N0'), isinKr_('133690')]`).join(',') === 'KR7360750004,KR7069500007,KR70234N0005,KR7133690008');
check('우선주 등 끝자리 0 아님 → ISIN 계산 안 함', R(`isinKr_('005935')`) === '' && R(`isinKr_('KRD010010001')`) === '');
const stock = J(`[funStock_('US67066G1040', '엔비디아/NVIDIA Corp'), funStock_('KR7005930003', '삼성전자'), funStock_('CNE100007960', 'SUZHOU INOVANCE AUTOMOTIVE-A'), funStock_('HK0000562659', 'GLOBAL X CHINA ELECTRIC -HKD')]`);
check('주식 행: 해외 ISIN·국내 KR7·티커 없는 주식·해외 ETF', stock.every(x => x === true), stock.join(','));
const notStock = J(`[funStock_('KRD010010001', '원화현금'), funStock_('CASH00000001', '설정현금액'), funStock_('KRYZTRSG1G04', '차이나전기차 TRS 260116-04'), funStock_('KRYZFXSG9B44', 'FX스왑 USD 260911-44'), funStock_('USDZZ0000001', '[USD] 예금'), funStock_('TYZ6', 'US 10YR NOTE FUT (CBOT) DEC 2026'), funStock_('KR103503GG60', '국고채권04250-3606(26-6)')]`);
check('제외: 원화현금·설정현금·TRS·FX스왑·외화예금·선물·국내 채권', notStock.every(x => x === false), notStock.join(','));
const SAMPLE = [
  { grpItmNo: 'US0378331005', ticker: 'AAPL', citmNm: '애플/Apple Inc', evAmt: 95000000, evP: 7.37 },
  { grpItmNo: 'US67066G1040', ticker: 'NVDA', citmNm: '엔비디아/NVIDIA Corp', evAmt: 108081514, evP: 8.38105855933253 },
  { grpItmNo: 'CNE100007960', ticker: '', citmNm: 'SUZHOU INOVANCE AUTOMOTIVE-A', evAmt: 100, evP: 0.85 },
  { grpItmNo: 'KRD010010001', ticker: '', citmNm: '원화현금', evAmt: 1, evP: 0.098 },
  { grpItmNo: 'CASH00000001', ticker: '', citmNm: '설정현금액', evAmt: 0, evP: 0 }];
const fp = J(`funParsePdf_(200, ${JSON.stringify(JSON.stringify(SAMPLE))})`);
check('해석: 주식 3건만, 비중 내림차순, 비중 소수 4자리, 원 행 수 보존', fp.ok && fp.raw === 5 && fp.rows.length === 3 && fp.rows[0][0] === 'NVDA' && fp.rows[0][2] === 8.3811 && fp.rows[1][0] === 'AAPL', JSON.stringify(fp.rows[0]));
check('해석: 티커 없으면 구성종목코드 = ISIN, 5번째 값 = ISIN', fp.rows[2][0] === 'CNE100007960' && fp.rows[2][4] === 'CNE100007960' && fp.rows[0][4] === 'US67066G1040');
const many = Array.from({ length: 900 }, (_, i) => ({ grpItmNo: 'US' + String(1000000000 + i), ticker: 'T' + i, citmNm: 'S' + i, evAmt: 1, evP: 900 - i }));
check('해석: ETF 1개당 비중 상위 600행까지', J(`funParsePdf_(200, ${JSON.stringify(JSON.stringify(many))}).rows.length`) === 600);
const fe = J(`[funParsePdf_(500, ''), funParsePdf_(429, ''), funParsePdf_(404, ''), funParsePdf_(200, '<html>점검 중</html>'), funParsePdf_(200, '[]')]`);
check('오류: 5xx·429 재시도, 404·형식 오류는 재시도 안 함, 빈 배열 = 성공(원 행 0)', fe[0].retry && fe[1].retry && !fe[2].retry && !fe[2].ok && !fe[3].ok && !fe[3].retry && fe[4].ok && fe[4].raw === 0);

console.info('[B] 브라우저 버튼 반영(doPost)');
const post = b => JSON.parse(R(`doPost({ postData: { contents: ${JSON.stringify(JSON.stringify(b))} } }).getContent()`));
const code = R(`funBookmarklet_(false)`), tok = P().FUN_IMPORT_TOKEN;
check('버튼 만들 때 비밀 토큰 생성(40자)', /^[0-9a-f]{40}$/.test(tok || ''), tok && tok.length);
check('토큰 없음·틀림 → 거부(시트 변화 없음)', !post({ op: 'start' }).ok && /인증 실패/.test(post({ k: 'x', op: 'start' }).error) && !S['구성종목_수집중']);
const s0 = post({ k: tok, op: 'start' });
const date = J(`indexDates_()`).slice(-1)[0], targets = J(`holdingsTargets_(${JSON.stringify(date)})`);
check('start: 기준일·대상(ETF ISIN)·묶음 크기, 수집중 시트 생성', s0.ok && s0.data.date === date && s0.data.ymd === date.replace(/-/g, '') && s0.data.targets.length === targets.length && s0.data.targets.every(t => t[1]) && s0.data.chunk === 20 && !!S['구성종목_수집중'], JSON.stringify(s0.data && { date: s0.data.date, n: s0.data.targets.length }));
check('put 전 다른 기준일 → 거부', /반영 상태가 없습니다/.test(post({ k: tok, op: 'put', date: '2000-01-01', items: {} }).error));
// 브라우저가 받은 FunETF 응답을 흉내 — 해외(미국·나스닥·S&P) / 국내 / 채권만 / 빈 응답(→ KIS 보완) / 받기 실패(null → KIS 보완) / 일부는 보내지 않음(창 닫힘)
const US = [['US67066G1040', 'NVDA', '엔비디아/NVIDIA Corp'], ['US0378331005', 'AAPL', '애플/Apple Inc'], ['US5949181045', 'MSFT', '마이크로소프트/MICROSOFT CORP'], ['US5951121038', 'MU', '마이크론/Micron Technology Inc']];
const KRS = [['KR7005930003', '005930', '삼성전자'], ['KR7000660001', '000660', 'SK하이닉스'], ['KR7005931001', '005935', '삼성전자우']];
const pdf = (c, nm) => {
  if (/채권|국채|금리/.test(nm)) return [['KR103503GG60', '', '국고채권04250-3606(26-6)', 99, 1], ['KRD010010001', '', '원화현금', 1, 1]];
  if (/고배당/.test(nm)) return [];          // FunETF 빈 응답 → KIS 보완
  if (/은행/.test(nm)) return null;          // 받기 실패 → KIS 보완
  if (/미국|나스닥|S&P/.test(nm)) return US.map((u, i) => [u[0], u[1], /KODEX/.test(nm) && u[1] === 'NVDA' ? 'NVIDIA CORP' : u[2], 10 - i, 1000 - i])
    .concat([['CNE100007960', '', 'SUZHOU INOVANCE AUTOMOTIVE-A', 0.5, 5], ['KRYZTRSG1G04', '', '해외 TRS 260116-04', 0.4, 5], ['KRD010010001', '', '원화현금', 0.1, 1]]);
  return KRS.map((k, i) => [k[0], k[1], k[2], 30 - i * 5, 1000 - i]).concat([['KRD010010001', '', '원화현금', 0.1, 1]]);
};
const skip = targets.slice(-3).map(t => t[0]);   // 마지막 3종목은 보내지 않음
let puts = 0;
for (let i = 0; i < targets.length - 3; i += 20) {
  const items = {}; targets.slice(i, Math.min(i + 20, targets.length - 3)).forEach(t => { items[t[0]] = pdf(t[0], t[1]); });
  const r = post({ k: tok, op: 'put', date: date, items: items }); if (r.ok) puts++; else { check('put 오류', false, r.error); break; }
}
check('put: 묶음마다 수집중 시트에 추가(이전 구성종목은 그대로)', puts === Math.ceil((targets.length - 3) / 20) && S['구성종목_수집중'].rows.length > 1, puts);
R(`PropertiesService.getScriptProperties().deleteProperty(PROP.KIS_KEY); PropertiesService.getScriptProperties().deleteProperty(PROP.KIS_SECRET)`);
const e0 = post({ k: tok, op: 'end', date: date });
let info = JSON.parse(P().KIS_PDF_INFO || '{}');
check('end(KIS 키 없음): 교체 완료, 출처 F, 빈 응답·실패·못 보낸 ETF 는 구성종목 없음', e0.ok && !info.failed && info.src === 'F' && !!S['구성종목'] && !S['구성종목_수집중'] && info.k === 0 && info.ok + info.empty + info.err === info.n && info.n === targets.length && info.err === 0, JSON.stringify({ ok: info.ok, empty: info.empty, err: info.err, f: info.f, n: info.n }));
check('end 뒤 상태 삭제 → 같은 기준일 put 거부', !P().FUN_IMPORT_STATE && /반영 상태가 없습니다/.test(post({ k: tok, op: 'put', date: date, items: {} }).error));
let rows = S['구성종목'].rows;
check('시트 머리글 8열(ISIN·출처)', rows[0].join('|') === 'ETF코드|ETF명|구성종목코드|구성종목명|비중(%)|평가금액(원)|ISIN|출처');
check('저장 행: 주식만(현금·TRS·채권 없음), 출처 F, ISIN 채움, ETF명 서버 기준', rows.slice(1).every(r => r[7] === 'F' && /^[A-Z]{2}[A-Z0-9]{9}\d$/.test(r[6]) && !/현금|TRS|국고채/.test(r[3]) && r[1] === targets.find(t => t[0] === r[0])[1]), rows.length - 1 + '행');
check('해외 주식 행(엔비디아 ISIN·티커)·티커 없는 주식(코드 = ISIN)', rows.some(r => r[2] === 'NVDA' && r[6] === 'US67066G1040') && rows.some(r => r[2] === 'CNE100007960'));
check('못 보낸 ETF·채권만 ETF 는 행 없음', skip.every(c => !rows.some(r => r[0] === c)) && targets.filter(t => /채권|국채|금리/.test(t[1])).every(t => !rows.some(r => r[0] === t[0])));
check('meta: holdingsDate = 반영 기준일', api('meta').holdingsDate === date);
// KIS 키가 있으면 빈 응답·실패 ETF 를 KIS 로 보완
R(`PropertiesService.getScriptProperties().setProperty(PROP.KIS_KEY, 'K'); PropertiesService.getScriptProperties().setProperty(PROP.KIS_SECRET, 'S')`);
post({ k: tok, op: 'start' });
const kis0 = ctx.MOCK_KIS_CALLS || 0;
for (let i = 0; i < targets.length; i += 20) { const items = {}; targets.slice(i, i + 20).forEach(t => { items[t[0]] = pdf(t[0], t[1]); }); post({ k: tok, op: 'put', date: date, items: items }); }
post({ k: tok, op: 'end', date: date });
info = JSON.parse(P().KIS_PDF_INFO || '{}');
const needN = targets.filter(t => /고배당|은행/.test(t[1])).length, kisN = (ctx.MOCK_KIS_CALLS || 0) - kis0;
check('KIS 보완: 빈 응답·받기 실패 ETF 만 KIS 조회, 출처 K 행', info.k > 0 && kisN >= needN && kisN <= needN + 1 && S['구성종목'].rows.some(r => r[7] === 'K') && info.ok + info.empty + info.err === info.n, JSON.stringify({ k: info.k, kisCalls: kisN, need: needN }));
check('KIS 행 ISIN: 보통주는 계산, 우선주는 빈칸', S['구성종목'].rows.filter(r => r[7] === 'K').every(r => r[2] === '005935' ? r[6] === '' : (!/^\d{5}0$/.test(r[2]) || r[6] === J(`isinKr_(${JSON.stringify(r[2])})`))));
// 받은 것이 하나도 없으면(예: FunETF 형식 변경) 실패 → 이전 자료 유지
const prev = S['구성종목'].rows.length;
R(`PropertiesService.getScriptProperties().deleteProperty(PROP.KIS_KEY)`);
post({ k: tok, op: 'start' }); post({ k: tok, op: 'put', date: date, items: Object.fromEntries(targets.slice(0, 20).map(t => [t[0], []])) });
const ef = post({ k: tok, op: 'end', date: date });
check('전부 빈 응답 → 실패 기록, 이전 구성종목 유지', ef.ok && ef.data.failed === true && S['구성종목'].rows.length === prev && JSON.parse(P().KIS_PDF_INFO).failed === true);
// 다시 정상 반영
post({ k: tok, op: 'start' });
for (let i = 0; i < targets.length; i += 20) { const items = {}; targets.slice(i, i + 20).forEach(t => { items[t[0]] = pdf(t[0], t[1]); }); post({ k: tok, op: 'put', date: date, items: items }); }
post({ k: tok, op: 'end', date: date });
info = JSON.parse(P().KIS_PDF_INFO || '{}');
check('다시 반영 → 정상 교체', !info.failed && info.src === 'F' && !S['구성종목_수집중']);
// v36: 응답이 끊겨 다시 보낸 경우 — 같은 묶음 번호(seq) put 은 무시, end 는 방금 결과를 다시 돌려줌
post({ k: tok, op: 'start' });
const it1 = Object.fromEntries(targets.slice(0, 20).map(t => [t[0], pdf(t[0], t[1])]));
const p1 = post({ k: tok, op: 'put', date: date, seq: 1, items: it1 }).data, n1 = S['구성종목_수집중'].rows.length;
const p1b = post({ k: tok, op: 'put', date: date, seq: 1, items: it1 }).data;
check('같은 묶음 다시 보냄(seq 같음) → 중복 추가 안 함', p1b.dup === true && S['구성종목_수집중'].rows.length === n1 && p1b.got === p1.got, n1);
for (let i = 20, q = 2; i < targets.length; i += 20, q++) post({ k: tok, op: 'put', date: date, seq: q, items: Object.fromEntries(targets.slice(i, i + 20).map(t => [t[0], pdf(t[0], t[1])])) });
const e1 = post({ k: tok, op: 'end', date: date }), e2 = post({ k: tok, op: 'end', date: date });
check('끝내기 다시 보냄 → 같은 결과(오류 아님)', e1.ok && e2.ok && e2.data.ok === e1.data.ok && e2.data.rows === e1.data.rows && e1.data.n === targets.length, JSON.stringify({ ok: e2.data && e2.data.ok, err: e2.error }));
check('다른 기준일 끝내기 → 거부', !post({ k: tok, op: 'end', date: '2000-01-01' }).ok);

console.info('[C] 월요일 KIS 자동 수집');
R(`PropertiesService.getScriptProperties().setProperty(PROP.KIS_KEY, 'K'); PropertiesService.getScriptProperties().deleteProperty(PROP.KIS_RUN)`);
const fRows = S['구성종목'].rows.length, kc = ctx.MOCK_KIS_CALLS;
ctx.MOCK_TODAY_MS = null;
R(`collectHoldings()`);
check('FunETF 자료가 2주 이내 → 자동 수집 건너뜀(자료 유지)', ctx.MOCK_KIS_CALLS === kc && S['구성종목'].rows.length === fRows && JSON.parse(P().KIS_PDF_INFO).src === 'F');
R(`menuCollectHoldings = menuCollectHoldings; PropertiesService.getScriptProperties().setProperty('KIS_PDF_FORCE', '1'); KIS.RUN_MS = 4 * 60 * 1000`);
R(`collectHoldings()`);
info = JSON.parse(P().KIS_PDF_INFO || '{}');
check('메뉴 강제 수집 → KIS 자료로 교체(출처 K, 강제 표시 해제)', info.src === 'K' && !info.failed && S['구성종목'].rows.slice(1).every(r => r[7] === 'K') && !P().KIS_PDF_FORCE, JSON.stringify({ src: info.src, ok: info.ok }));
const kc2 = ctx.MOCK_KIS_CALLS; R(`collectHoldings()`);
check('출처가 KIS 면 자동 수집 그대로 진행', ctx.MOCK_KIS_CALLS > kc2);
R(`PropertiesService.getScriptProperties().setProperty(PROP.KIS_INFO, JSON.stringify(Object.assign(JSON.parse(PropertiesService.getScriptProperties().getProperty(PROP.KIS_INFO)), { src: 'F', date: '2026-01-02' })))`);
const kc3 = ctx.MOCK_KIS_CALLS; R(`collectHoldings()`);
check('FunETF 자료가 2주 넘게 지나면 자동 수집 진행', ctx.MOCK_KIS_CALLS > kc3);
// 다시 FunETF 로(검색 시험용)
post({ k: tok, op: 'start' });
for (let i = 0; i < targets.length; i += 20) { const items = {}; targets.slice(i, i + 20).forEach(t => { items[t[0]] = pdf(t[0], t[1]); }); post({ k: tok, op: 'put', date: date, items: items }); }
post({ k: tok, op: 'end', date: date });

console.info('[D] 검색');
const h1 = api('holders', { q: '엔비디아' });
check('한글 이름으로 해외 주식 검색', h1.sel && /엔비디아/.test(h1.sel.name) && h1.items.length > 0, h1.sel && h1.sel.name + ' ' + h1.items.length + 'ETF');
const nvEtfs = new Set(S['구성종목'].rows.filter(r => r[6] === 'US67066G1040').map(r => r[0]));
check('같은 ISIN 다른 표기(NVIDIA CORP) → 한 종목으로 묶여 담은 ETF 전부 표시, 대표 표기 = 한글 표기', h1.items.length === nvEtfs.size && h1.cands.filter(c => /NVIDIA|엔비디아/i.test(c.name)).length === 1 && h1.sel.name === '엔비디아/NVIDIA Corp', h1.items.length + ' vs ' + nvEtfs.size);
const h2 = api('holders', { q: 'nvda' }), h3 = api('holders', { q: 'NVIDIA' });
check('티커(소문자)·영문명 → 같은 종목', h2.sel && h3.sel && h2.sel.key === h1.sel.key && h3.sel.key === h1.sel.key);
const h4 = api('holders', { q: '애플' });
check('정확 일치(이름의 한글 부분) 우선: 애플', h4.sel && h4.sel.name === '애플/Apple Inc');
const h5 = api('holders', { q: 'MU' });
check('짧은 티커(MU) → 마이크론', h5.sel && /마이크론/.test(h5.sel.name));
const h6 = api('holders', { q: 'SUZHOU INOVANCE' });
check('티커 없는 주식도 이름으로 검색(코드 = ISIN)', h6.sel && h6.sel.comp === 'CNE100007960' && h6.items.length > 0);
check('현금·TRS 는 검색되지 않음', api('holders', { q: '원화현금' }).items.length === 0 && api('holders', { q: 'TRS' }).items.length === 0);
const h7 = api('holders', { q: '삼성전자' });
check('국내 주식: 삼성전자 정확 일치, 삼성전자우는 후보', h7.sel.name === '삼성전자' && h7.cands.some(c => c.name === '삼성전자우'));
const top = api('holders', {}).top;
check('많이 담긴 종목에 해외 주식 포함(한글 대표 표기)', top.some(t => t[0] === '엔비디아/NVIDIA Corp') && !top.some(t => t[0] === 'NVIDIA CORP'), top.slice(0, 5).map(t => t[0]).join(', '));

console.info('[E] 즐겨찾기 버튼 · 화면 문구');
check('버튼: javascript: 주소, 웹앱 주소·토큰 포함, 해독하면 문법 정상', /^javascript:/.test(code) && (() => { const js = decodeURIComponent(code.slice(11)); try { new Function(js); } catch (e) { return false; } return js.includes('AKfycbwF4iZ_1BilAMgSFAySTPrS8gaEOVdTQdMPE3QaVhEd--A38x1l9sQXJWIk_RXuHbO0dA/exec') && js.includes(tok) && js.includes('/api/public/product/view/etfpdf?itemId=') && /funetf/.test(js); })());
R(`menuFunButton()`);
check('메뉴: 구성종목_버튼 시트 A3 = 버튼 코드(대화상자 없음 → 권한 범위 그대로)', S['구성종목_버튼'] && S['구성종목_버튼'].rows[2][0] === code && !/HtmlService|getService/.test(fs.readFileSync(path.join(gasDir, 'Setup.gs'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '') + fs.readFileSync(path.join(gasDir, 'Kis.gs'), 'utf8').replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, '')));
check('버튼 다시 만들기(기존 토큰 유지) · 새 토큰은 renew 일 때만', R(`funBookmarklet_(false)`) === code && R(`funBookmarklet_(true)`) !== code && P().FUN_IMPORT_TOKEN !== tok);
const tabs = fs.readFileSync(path.join(gasDir, 'Tabs.html'), 'utf8'), shell = fs.readFileSync(path.join(__dirname, '..', 'web', 'src', 'shell.js'), 'utf8');
check('화면 문구: 원천별(FunETF = 해외 포함 · KIS = 국내 상장 상위 30)', /hdF\(info\) \? '해외 주식 포함' : '국내 상장 종목'/.test(tabs) && /엔비디아, NVDA/.test(tabs) && /상위 30종목까지/.test(tabs) && /info\.src === 'F'/.test(shell));
check('출처 표기: FunETF·한국투자증권', /FunETF 공개 자료/.test(tabs) && /FunETF 공개 자료 · 한국투자증권 Open API/.test(shell));
check('화면에 내부 시트명 노출 없음', !/범례_|유형최종|구성종목_수집중/.test(tabs.split('/* 9. 종목→ETF 찾기')[1].split('/* 10.')[0].replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, '')));

console.info(fails ? `\n실패 ${fails}건` : '\n전부 통과');
process.exit(fails ? 1 : 0);
