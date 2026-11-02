/* TZ=Asia/Seoul node test/v53_test.js — v53 유형 자동 분류 보강(기준안 2026-11-02) · 범례_유형 정비 · 범례 변경 시 일별 요약 재작성
 *  A) 종목명 규칙 R01~R14: 펀드유형(KOFIA)·유형최종2·국내해외·신규상장용·규칙·신뢰 — 사례는 사용자 분류 파일(KOFIA)과 v53 사용자 결정 기준
 *  B) 신규 종목 기록: 사용자 파일과 같은 열 형식(유형3 = 펀드유형, 유형4 = 유형C), 확인필요 열 = '확인필요(R13)' / '자동 분류(R11)', 기초자산 미사용
 *  C) 유형최종3: 파생형·기타 + 채권/금리 → 채권형   D) applyLegendFix53: 지정 칸 + 금·은·원자재 → 해외, 다시 실행하면 0칸
 *  E) 전체 재계산 뒤 일별 요약 재작성 예약 → 범례 변경이 일별 기준일 화면(유형별 NAV)에 반영   F) reviewLegend53: 확인필요 행 재판정 목록
 *  G) applyLegendFix53b: 과거 자동 추가분 정리(A19~A24) · navCheck53(원자료 NAV 검산, 읽기 전용)
 *  H) 리츠 ETF → 부동산·기타 일괄(applyLegendFix53c, 미리보기 previewReit53c) */
const fs = require('fs'), path = require('path'), vm = require('vm');
const ctx = { console: { log: () => {} }, Date, Math, JSON, Object, Array, String, Number, RegExp, Error, isNaN, setTimeout, globalThis: null, __zlib: require('zlib'), __Buffer: Buffer };
ctx.globalThis = ctx; vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname, 'shim.js'), 'utf8'), ctx);
for (const f of fs.readdirSync(path.join(__dirname, '..', 'gas')).filter(f => f.endsWith('.gs'))) vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'gas', f), 'utf8'), ctx, { filename: f });
const st = JSON.parse(fs.readFileSync(path.join(__dirname, 'store.json'), 'utf8')); ctx.__s = st;
vm.runInContext(`(function(){ const ss = SpreadsheetApp.getActiveSpreadsheet(); Object.keys(__s.store).forEach(n => { const sh = ss.insertSheet(n); sh.rows = JSON.parse(JSON.stringify(__s.store[n])); }); Object.keys(__s.props).forEach(k => PropertiesService.getScriptProperties().setProperty(k, __s.props[k])); })()`, ctx);
const R = s => vm.runInContext(s, ctx), J = s => JSON.parse(R('JSON.stringify(' + s + ')'));
let fails = 0; const check = (name, ok, info) => { if (!ok) fails++; console.log((ok ? '  OK   ' : '  FAIL ') + name + (info !== undefined ? ' — ' + info : '')); };
const S = ctx.MOCK_STORE, TL = () => S['범례_유형'];
const api = (a, p) => { const r = JSON.parse(R(`api(${JSON.stringify(a)}, ${JSON.stringify(p || {})})`)); if (!r.ok) throw new Error(a + ': ' + r.error); return r.data; };

console.log('[A] 종목명 규칙');
const CASES = [["KODEX 27-12 금융채(AA-이상)액티브", "채권형", "채권형", "국내", "채권/금리", "R11H"], ["ACE 29-11 회사채(AA-이상)액티브", "채권형", "채권형", "국내", "채권/금리", "R11H"], ["TIGER 23-12 국공채액티브", "채권형", "채권형", "국내", "채권/금리", "R11H"], ["KODEX 머니마켓액티브", "채권형", "채권형", "국내", "채권/금리", "R11H"], ["KODEX 국채선물10년인버스", "파생상품", "파생형", "국내", "주식 등", "R02H"], ["KODEX 국채선물10년", "파생상품", "파생형", "국내", "채권/금리", "R02H"], ["KODEX 미국달러선물", "파생상품", "파생형", "해외", "채권/금리", "R02H"], ["TIGER 미국달러선물레버리지", "파생상품", "파생형", "해외", "주식 등", "R02H"], ["TIGER 일본엔선물", "파생상품", "파생형", "해외", "채권/금리", "R02H"], ["KODEX KOFR금리액티브(합성)", "파생상품", "파생형", "국내", "채권/금리", "R03H"], ["KODEX 미국달러SOFR금리액티브(합성)", "파생상품", "파생형", "해외", "채권/금리", "R03H"], ["RISE 미국30년국채커버드콜(합성)", "파생상품", "파생형", "해외", "채권/금리", "R03H"], ["TIGER 엔비디아미국채커버드콜밸런스(합성)", "파생상품", "파생형", "해외", "주식 등", "R03H"], ["TIGER 미국S&P500타겟데일리커버드콜", "주식형", "해외주식형", "해외", "주식 등", "R04M"], ["KODEX 200타겟위클리커버드콜", "파생상품", "파생형", "국내", "주식 등", "R05M"], ["ACE KRX금현물", "특별자산", "기타", "해외", "주식 등", "R06H"], ["TIGER 은액티브", "재간접형", "기타", "해외", "주식 등", "R07L"], ["KODEX TDF2050액티브", "재간접형", "기타", "해외", "주식 등", "R01H"], ["KODEX 코리아TDF2065액티브 적격", "재간접형", "기타", "국내", "주식 등", "R01H"], ["KODEX 미국부동산리츠(H)", "부동산", "기타", "해외", "주식 등", "R08H"], ["RISE 글로벌데이터센터리츠(합성)", "부동산", "기타", "해외", "주식 등", "R08H"], ["TIGER 리츠부동산인프라10채권혼합액티브", "부동산", "기타", "국내", "주식 등", "R08H"], ["RISE 글로벌리얼티인컴", "부동산", "기타", "해외", "주식 등", "R10M"], ["TIGER 삼성전자SK하이닉스미국채혼합50", "혼합채권형", "혼합채권형", "해외", "주식 등", "R09H"], ["PLUS K리츠", "부동산", "기타", "국내", "주식 등", "R08H"], ["KODEX 200", "주식형", "국내주식형", "국내", "주식 등", "R14H"], ["TIGER 200커뮤니케이션서비스", "주식형", "국내주식형", "국내", "주식 등", "R14H"], ["HK S&P코리아로우볼", "주식형", "국내주식형", "국내", "주식 등", "R14H"], ["KODEX MSCI Korea TR", "주식형", "국내주식형", "국내", "주식 등", "R14H"], ["TIGER 미국S&P500", "주식형", "해외주식형", "해외", "주식 등", "R14H"], ["FOCUS 스페이스X밸류체인", "주식형", "해외주식형", "해외", "주식 등", "R14H"], ["TIGER 차이나CSI300", "주식형", "해외주식형", "해외", "주식 등", "R13L"], ["KODEX 인도Nifty50", "주식형", "해외주식형", "해외", "주식 등", "R13L"], ["TIGER 한중반도체(합성)", "파생상품", "파생형", "해외", "주식 등", "R03H"], ["KIWOOM 한국고배당&미국AI테크", "주식형", "해외주식형", "해외", "주식 등", "R14H"], ["SOL 한국형글로벌반도체액티브", "주식형", "해외주식형", "해외", "주식 등", "R13L"], ["KODEX 레버리지", "파생상품", "파생형", "국내", "주식 등", "R02H"], ["TIGER 단기선진하이일드(합성 H)", "파생상품", "파생형", "해외", "채권/금리", "R03H"], ["ACE 미국하이일드액티브(H)", "채권형", "채권형", "해외", "채권/금리", "R11H"], ["KODEX TRF3070", "혼합채권형", "혼합채권형", "해외", "주식 등", "R09H"], ["TIGER 리츠부동산인프라", "부동산", "기타", "국내", "주식 등", "R08H"], ["KODEX 미국S&P500버퍼3월액티브", "파생상품", "파생형", "해외", "주식 등", "R05M"], ["SOL 미국S&P500엔화노출(H)", "파생상품", "파생형", "해외", "주식 등", "R12M"], ["ACE 미국30년국채엔화노출액티브(H)", "채권형", "채권형", "해외", "채권/금리", "R11H"], ["KODEX 골드선물(H)", "파생상품", "파생형", "해외", "주식 등", "R02H"], ["PLUS 은채권혼합", "재간접형", "기타", "해외", "주식 등", "R07L"], ["WON K-글로벌수급상위", "주식형", "국내주식형", "국내", "주식 등", "R14H"], ["KoAct 코리아TOP5플러스채권혼합50액티브", "혼합채권형", "혼합채권형", "국내", "주식 등", "R09H"], ["IBK 한미대표기업TOP2+채권혼합50액티브", "혼합채권형", "혼합채권형", "해외", "주식 등", "R09H"]];
const bad = CASES.filter(([n, t3, f2, dom, neu, rc]) => { const x = J(`inferType_(${JSON.stringify(n)})`); return [x.t3, x.f2, x.dom, x.neu, x.rule + x.conf].join('|') !== [t3, f2, dom, neu, rc].join('|'); });
check(`대표 사례 ${CASES.length}건: 펀드유형·유형최종2·국내해외·신규상장용·규칙·신뢰 일치`, !bad.length, bad.map(b => b[0] + ' → ' + JSON.stringify(J(`inferType_(${JSON.stringify(b[0])})`))).join(' / ') || '');
const k = J(`inferType_('KODEX 27-12 금융채(AA-이상)액티브')`);
check("0254C0 사례: '금융채' → 채권형 · 열 형식(유형1·2 채권형, 유형3 채권형, 유형4 '채권', 유형최종1 채권형) · '자동 분류(R11)'", k.t1 === '채권형' && k.t2 === '채권형' && k.t3 === '채권형' && k.t4 === '채권' && k.f1 === '채권형' && k.check === '자동 분류(R11)', JSON.stringify(k));
const a = J(`inferType_('TIGER 차이나CSI300')`), g = J(`inferType_('ACE KRX금현물')`), sx = J(`inferType_('FOCUS 스페이스X밸류체인')`);
check("이름만으로 판정 불가(R13) → '확인필요(R13)' · KRX금현물 → 해외(v53 결정) · 스페이스X → 해외주식형", a.check === '확인필요(R13)' && g.dom === '해외' && sx.f2 === '해외주식형', [a.check, g.dom, sx.f2].join(' · '));
check('공백·빈 이름도 오류 없이 기본 규칙', J(`inferType_('  KODEX 200 ')`).f2 === '국내주식형' && J(`inferType_('')`).rule === 'R14');

console.log('[B] 신규 종목 기록');
const before = TL().rows.length;
R(`(function(){ const c = ctx_(); ensureMaster_([{ code: '0999A0', name: 'KODEX 27-12 금융채(AA-이상)액티브', nav: 1e11, idx: 'KAP 27-12 금융채 총수익 지수(AA-이상)' }, { code: '0999B0', name: 'KODEX 인도Nifty미드캡100', nav: 1e10, idx: '' }], c, '2026-10-20'); })()`);
const added = TL().rows.slice(before), r1 = added.find(r => r[0] === '0999A0'), r2 = added.find(r => r[0] === '0999B0');
check('범례_유형 2행 추가', added.length === 2, added.length);
check("0999A0: 채권형·국내·채권/금리, 유형3 채권형·유형4 '채권', 확인필요 열 '자동 분류(R11)', 유형최종3 채권형", r1 && r1[8] === '채권형' && r1[9] === '국내' && r1[10] === '채권/금리' && r1[5] === '채권형' && r1[6] === '채권' && r1[11] === '자동 분류(R11)' && r1[12] === '채권형', r1 && r1.join('|'));
check("0999B0: 해외주식형(가정)·확인필요(R13)", r2 && r2[8] === '해외주식형' && r2[9] === '해외' && r2[11] === '확인필요(R13)', r2 && r2.join('|'));
const lg = S['_log'].rows.slice(-3).map(r => r[2]).join(' / ');
check('적재 기록: 신규 종목 2건, 유형 추가 2건', /신규 종목 2건, 유형 추가 2건/.test(lg), lg.slice(-120));

console.log('[C] 유형최종3');
check('파생형 + 채권/금리 → 채권형 · 기타 + 채권/금리 → 채권형(v53) · 기타 + 주식 등 → 기타 · 혼합채권형 그대로', R(`typeF3_('파생형', '채권/금리')`) === '채권형' && R(`typeF3_('기타', '채권/금리')`) === '채권형' && R(`typeF3_('기타', '주식 등')`) === '기타' && R(`typeF3_('혼합채권형', '주식 등')`) === '혼합채권형');
const note = R('TYPE_F3_NOTE');
check("머리글 메모: '파생형' 또는 '기타'(재간접형·특별자산) + 채권/금리 → 채권형", /'파생형' 또는 '기타'\(재간접형·특별자산\)/.test(note), note.split('\n')[1].slice(0, 80));

console.log('[D] applyLegendFix53');
const row = (code, name, t1, f2, dom, neu, chk) => { const r = [code, name, '2026-01-02', t1, t1, '', '', '', f2, dom, neu, chk || '']; TL().rows.push(r); return r; };
row('261110', 'TIGER 미국달러선물레버리지', '파생형', '파생형', '국내', '주식 등');
row('0072R0', 'TIGER KRX금현물', '특별자산', '기타', '국내', '주식 등');
row('0255D0', 'FOCUS 스페이스X밸류체인', '국내주식형', '국내주식형', '국내', '주식 등', '확인필요');
row('0888G0', 'XYZ 골드선물(H)', '파생형', '파생형', '국내', '주식 등', '확인필요');
const f1 = J('applyLegendFix53()');
const get = c => TL().rows.find(r => r[0] === c);
check('지정 칸 반영: 달러선물레버리지·KRX금현물 → 해외, 스페이스X → 해외주식형·수기 수정', get('261110')[9] === '해외' && get('0072R0')[9] === '해외' && get('0255D0')[8] === '해외주식형' && get('0255D0')[9] === '해외' && get('0255D0')[11] === '수기 수정', JSON.stringify(f1));
check('금·은·원자재 이름 규칙: 목록에 없는 XYZ 골드선물(H)도 해외', get('0888G0')[9] === '해외');
check('시트에 없는 종목은 건너뛰고 목록으로 보고', f1.miss.length > 0 && f1.miss.indexOf('261110') < 0, f1.miss.length + '종목');
const f2 = J('applyLegendFix53()');
check('다시 실행하면 바뀌는 칸 0', f2.cells === 0, JSON.stringify(f2));

console.log('[E] 범례 변경 → 일별 요약 재작성');
const D = '2026-09-09';
const t0 = api('byType', { date: D }), b0 = (t0.rows.find(r => r.type === '채권형') || { nav: 0 }).nav;
const kd = TL().rows.find(r => /KODEX 200$/.test(String(r[1]).trim()));
kd[8] = '채권형';   // 인위적 변경: KODEX 200 을 채권형으로
ctx.MOCK_TRIGGERS.length = 0;
R('rebuildAggregates()');
const trg = ctx.MOCK_TRIGGERS.map(t => t.fn);
check('전체 재계산 뒤 일별 요약 재작성 예약(cont_rebuildDailySummary)', trg.indexOf('cont_rebuildDailySummary') >= 0, trg.join(','));
R('rebuildDailySummary()');
R('Object.keys(SNAPROWS_MEMO_).forEach(k => delete SNAPROWS_MEMO_[k])');   // 모의 환경은 실행 간 메모가 남음(Apps Script 는 실행마다 새로)
const t1 = api('byType', { date: D }), b1 = (t1.rows.find(r => r.type === '채권형') || { nav: 0 }).nav;
const kodex = S['raw_일별'].rows.find(r => r[0] === D && r[2] === 'KODEX 200');
check('일별 기준일 유형별 NAV: 채권형 증가분 = KODEX 200 NAV (범례 변경 반영)', kodex && Math.abs((b1 - b0) - kodex[4]) < 1, [b0, b1, kodex && kodex[4]].join(' / '));
kd[8] = '국내주식형';

console.log('[F] reviewLegend53');
const rv = J('reviewLegend53()');
check('확인필요 행 재판정: 행 수·다른 행 수 반환', rv.rows > 0 && rv.diff >= 0 && rv.diff <= rv.rows, JSON.stringify(rv));

console.log('[G] applyLegendFix53b (A19~A24) · navCheck53');
row('299070', 'KINDEX 국채선물10년인버스', '파생형', '파생형', '국내', '채권/금리', '확인필요');
row('469580', 'KBSTAR KP달러채권액티브', '채권형', '채권형', '국내', '채권/금리', '확인필요');
row('433850', 'ARIRANG TDF2030액티브', '국내주식형', '국내주식형', '국내', '주식 등', '확인필요');
row('315480', 'KBSTAR 200커뮤니케이션서비스', '해외주식형', '해외주식형', '해외', '주식 등', '확인필요');
row('0777A0', 'KODEX 200', '국내주식형', '국내주식형', '국내', '주식 등', '확인필요');            // 새 규칙과 같음 → 확인 완료
row('0777B0', 'TIGER 차이나CSI300', '파생형', '파생형', '해외', '주식 등', '확인필요');          // 새 규칙과 다름·지정 없음 → 그대로
const g1 = J('applyLegendFix53b()');
const td = get('433850');
check('A19 국채선물10년인버스 신규상장용 주식 등 · A20 KP달러채권 해외 · 둘 다 수기 수정', get('299070')[10] === '주식 등' && get('299070')[11] === '수기 수정' && get('469580')[9] === '해외' && get('469580')[11] === '수기 수정');
check('A22 TDF: 유형1~3 재간접형 · 유형4 기타 · 유형최종1·2 기타 · 해외 · 주식 등 · 유형최종3 기타', td[3] === '재간접형' && td[5] === '재간접형' && td[6] === '기타' && td[7] === '기타' && td[8] === '기타' && td[9] === '해외' && td[10] === '주식 등' && td[12] === '기타', td.join('|'));
check("A21·A23 315480 지금 값 유지(해외주식형·해외)·확인 완료 · A24 새 규칙과 같은 행 → '확인 완료' · 다른 행은 확인필요 유지", get('315480')[8] === '해외주식형' && get('315480')[9] === '해외' && get('315480')[11] === '확인 완료' && get('0777A0')[11] === '확인 완료' && get('0777B0')[11] === '확인필요' && g1.left.join() === '0777B0', JSON.stringify(g1.left));
const g2 = J('applyLegendFix53b()');
check('다시 실행하면 바뀌는 칸 0 · 확인 완료 0', g2.cells === 0 && g2.done === 0, JSON.stringify({ cells: g2.cells, done: g2.done }));
S['raw_월말'].rows.push(['2021-05-31', '315480', 'KBSTAR 200커뮤니케이션서비스', 12200000000, 0, 0, 0, 0, 12200, 1000000]);
const nc = J('navCheck53()');
check('navCheck53: 읽기 전용 · 종목별 원자료 건수', nc[0] === '315480 1' && nc.length === 3, nc.join(' · '));

console.log('[H] 리츠 → 부동산·기타 (applyLegendFix53c)');
const rr = (code, name, t3, t2, f2, dom, chk) => { const r = [code, name, '2020-01-02', t2, t2, t3, '', '', f2, dom, '주식 등', chk || '']; TL().rows.push(r); return r; };
rr('0666A0', 'XYZ 미국부동산리츠(H)', '파생상품', '파생형', '파생형', '해외', '');
rr('0666B0', 'XYZ 리츠부동산인프라', '혼합자산', '혼합자산', '기타', '국내', '');
rr('0666C0', 'XYZ K리츠', '부동산', '부동산', '기타', '국내', '');
rr('0666D0', 'XYZ 리츠레버리지', '파생상품', '파생형', '파생형', '국내', '');
const pv = J('previewReit53c()');
check('미리보기(읽기 전용): 이름에 리츠(레버리지·인버스 제외) 대상 · 바뀔 행 수', pv.rows >= 3 && get('0666A0')[8] === '파생형', JSON.stringify(pv));
const h1 = J('applyLegendFix53c()'), ra = get('0666A0'), rb = get('0666B0'), rc = get('0666C0'), lv = get('0666D0');
check('파생상품 리츠 → 유형1~3 부동산 · 유형4·유형최종1·2 기타 · 국내해외 그대로 · 확인필요 열에 이전 유형3', ra[3] === '부동산' && ra[4] === '부동산' && ra[5] === '부동산' && ra[6] === '기타' && ra[7] === '기타' && ra[8] === '기타' && ra[9] === '해외' && ra[11] === '수기 수정(리츠 → 부동산, 이전 유형3: 파생상품)' && ra[12] === '기타', ra.join('|'));
check('혼합자산 리츠 → 부동산·기타(이전 유형3: 혼합자산) · 이미 부동산이면 확인필요 열 그대로 · 리츠 레버리지는 대상 아님', rb[5] === '부동산' && rb[8] === '기타' && /이전 유형3: 혼합자산/.test(rb[11]) && rc[11] === '' && lv[8] === '파생형', [rb[11], rc[11], lv[8]].join(' / '));
const h2 = J('applyLegendFix53c()');
check('다시 실행하면 바뀌는 칸 0', h2.cells === 0, JSON.stringify(h2));

console.log(fails ? `FAIL ${fails}` : '전부 통과'); process.exit(fails ? 1 : 0);
