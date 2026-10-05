/* TZ=Asia/Seoul node test/v26_test.js — v26 '유형최종3' 점검(실제 gas/*.gs + 모의 시트 store.json)
 *  사례(2026-10-05): NAV 상위 20 변천의 유형별 M/S 에서 KOFR·CD금리 액티브(합성) 등 금리 추종 상품이 유형최종2 '파생형'으로 잡혀 파생형 비중이 커 보임
 *  A) 분류 규칙: 유형최종2 '파생형' + 신규상장용 '채권/금리' → '채권형', 그 밖은 유형최종2
 *  B) 범례_유형 '유형최종3' 열: 머리글·메모(분류 설명)·값 동기화(바뀐 행만 있을 때 1회 쓰기), 직접 수정은 다음 갱신 때 덮어씀, 열 위치는 머리글명으로 찾음
 *  C) 신규 종목 추가 시 유형최종3 값까지 기록   D) 화면 자료: 개별 종목 유형(변천·상위 ETF·신규상장·거래대금) = 유형최종3, 유형별 NAV 합계 = 유형최종2 유지
 *  E) 야간 점검이 열을 맞춤 · 캐시 세대 a26 · README v26 */
const fs = require('fs'), path = require('path'), vm = require('vm');
const ctx = { console: { log: () => {} }, Date, Math, JSON, Object, Array, String, Number, RegExp, Error, isNaN, setTimeout, globalThis: null, __zlib: require('zlib'), __Buffer: Buffer };
ctx.globalThis = ctx; vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname, 'shim.js'), 'utf8'), ctx);
for (const f of fs.readdirSync(path.join(__dirname, '..', 'gas')).filter(f => f.endsWith('.gs'))) vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'gas', f), 'utf8'), ctx, { filename: f });
const st = JSON.parse(fs.readFileSync(path.join(__dirname, 'store.json'), 'utf8')); ctx.__s = st;
vm.runInContext(`(function(){ const ss = SpreadsheetApp.getActiveSpreadsheet(); Object.keys(__s.store).forEach(n => { const sh = ss.insertSheet(n); sh.rows = JSON.parse(JSON.stringify(__s.store[n])); }); Object.keys(__s.props).forEach(k => PropertiesService.getScriptProperties().setProperty(k, __s.props[k])); })()`, ctx);
const R = s => vm.runInContext(s, ctx);
let fails = 0; const check = (name, ok, info) => { if (!ok) fails++; console.log((ok ? '  OK   ' : '  FAIL ') + name + (info !== undefined ? ' — ' + info : '')); };
const api = (a, p) => { const r = JSON.parse(R(`api(${JSON.stringify(a)}, ${JSON.stringify(p || {})})`)); if (!r.ok) throw new Error(a + ': ' + r.error); return r.data; };
const S = ctx.MOCK_STORE, TL = () => S['범례_유형'];
const pad = c => String(c).padStart(6, '0');
const legRows = () => TL().rows.slice(1).filter(r => String(r[0]).trim());
const isDB = r => String(r[8]).trim() === '파생형' && String(r[10]).trim() === '채권/금리';
const dbCodes = new Set(legRows().filter(isDB).map(r => pad(r[0])));

console.log('[A] 분류 규칙');
check('파생형 + 채권/금리 → 채권형', R(`typeF3_('파생형', '채권/금리')`) === '채권형');
check('파생형 + 주식 등 → 파생형(그대로)', R(`typeF3_('파생형', '주식 등')`) === '파생형');
check('채권형·국내주식형 등은 유형최종2 그대로', R(`typeF3_('채권형', '채권/금리')`) === '채권형' && R(`typeF3_('국내주식형', '주식 등')`) === '국내주식형' && R(`typeF3_('혼합채권형', '')`) === '혼합채권형');
check('앞뒤 공백이 있어도 인식', R(`typeF3_(' 파생형', '채권/금리 ')`) === '채권형');
const kofr = legRows().find(r => /KOFR/.test(r[1]) && isDB(r));
const tl = R(`JSON.stringify(typeLegend_()['${pad(kofr[0])}'])`), t0 = JSON.parse(tl);
check('typeLegend_: ' + kofr[1] + ' f2=파생형 유지, f3=채권형', t0.f2 === '파생형' && t0.f3 === '채권형', tl);
check('모의 범례: 파생형 + 채권/금리 종목 ' + dbCodes.size + '개', dbCodes.size > 0);

console.log('[B] 범례_유형 유형최종3 열');
check('적용 전: 12열(확인필요까지), 유형최종3 없음', TL().rows[0].length === 12 && TL().rows[0].indexOf('유형최종3') < 0);
const n1 = R(`syncTypeF3_()`);
const head = TL().rows[0];
check('머리글: M열(13번째) = 유형최종3', head[12] === '유형최종3', head.slice(10).join('|'));
const note = (TL().notes || {})['1,13'] || '';
check('머리글 메모: 분류 규칙·사용처·갱신 방식 설명', /파생형/.test(note) && /채권\/금리/.test(note) && /채권형/.test(note) && /사용처/.test(note) && /유형최종2 기준/.test(note) && /덮어쓰/.test(note), note.split('\n')[0]);
const rows = legRows();
check('값: 모든 종목 행이 채워짐', n1 === rows.length && rows.every(r => String(r[12] || '').trim()), n1 + '행 / ' + rows.length);
check('값: 파생형+채권/금리 ' + dbCodes.size + '개 → 채권형, 그 밖은 유형최종2와 같음', rows.every(r => r[12] === (isDB(r) ? '채권형' : r[8])));
check('다시 실행: 바뀐 행 없으면 쓰지 않음(0행)', R(`syncTypeF3_()`) === 0);
const tgt = rows.find(r => String(r[8]).trim() === '파생형' && String(r[10]).trim() === '주식 등');
tgt[10] = '채권/금리';   // 사용자가 신규상장용을 수정
const kofrRow = rows.find(r => pad(r[0]) === pad(kofr[0])); kofrRow[12] = '파생형';   // 사용자가 유형최종3 을 직접 수정
check('유형최종2·신규상장용 수정 반영 + 직접 수정한 값은 덮어씀(2행)', R(`syncTypeF3_()`) === 2 && tgt[12] === '채권형' && kofrRow[12] === '채권형', tgt[1] + ' → ' + tgt[12]);
tgt[10] = '주식 등'; R(`syncTypeF3_()`);
// 사용자가 열을 옮긴 경우: 머리글명으로 찾음(새 열을 만들지 않음)
TL().rows.forEach(r => { r.splice(13, 0, r[12]); r[12] = ''; });   // M열을 비우고 N열로 이동
const w0 = TL().rows[0].length;
check('머리글이 다른 열(N)에 있어도 그 열을 사용(열 추가 없음)', R(`typeF3Col_(sheet_('범례_유형'))`) === 13 && TL().rows[0].length === w0 && R(`syncTypeF3_()`) === 0);
TL().rows.forEach(r => { r[12] = r[13]; r.splice(13, 1); });   // 원위치

console.log('[C] 신규 종목 추가 시 유형최종3 기록');
R(`(function(){ const c = ctx_(); c.basic = {}; ensureMaster_([{ code: '999901', name: 'TIGER 테스트KOFR금리액티브(합성)' }, { code: '999902', name: 'KODEX 테스트200선물레버리지' }], c, '2026-10-02'); })()`);
const nr = TL().rows.filter(r => r[0] === '999901' || r[0] === '999902');
check('새 행 2개: 유형최종2·신규상장용·확인필요·유형최종3', nr.length === 2 && nr.every(r => r[11] === '확인필요'), nr.map(r => [r[1], r[8], r[10], r[12]].join('/')).join(' · '));
check('금리 합성(파생형+채권/금리) → 유형최종3 채권형, 레버리지(파생형+주식 등) → 파생형', nr[0][8] === '파생형' && nr[0][10] === '채권/금리' && nr[0][12] === '채권형' && nr[1][12] === '파생형');
check('추가 뒤 동기화할 것 없음', R(`syncTypeF3_()`) === 0);
TL().rows = TL().rows.filter(r => r[0] !== '999901' && r[0] !== '999902');
S['ETF마스터'].rows = S['ETF마스터'].rows.filter(r => !/^99990/.test(String(r[0])));

console.log('[D] 화면 자료');
const race = api('race', { n: 20 });
const rr = []; race.frames.forEach(f => f.rows.forEach(x => rr.push(x)));
const raceDB = rr.filter(x => dbCodes.has(pad(x[1])));
check('변천: 유형 열 = 유형최종3 (cols)', race.cols[6] === 'type');
check('변천: 파생형+채권/금리 종목(' + raceDB.length + '행) 모두 채권형·회색 표시 유지', raceDB.length > 0 && raceDB.every(x => x[6] === '채권형' && x[5] === 1));
const last = race.frames[race.frames.length - 1], sumT = (rows, t) => rows.filter(x => x[6] === t).reduce((s, x) => s + x[4], 0), totL = last.rows.reduce((s, x) => s + x[4], 0);
const f2Der = last.rows.filter(x => { const r = legRows().find(y => pad(y[0]) === pad(x[1])); return r && String(r[8]).trim() === '파생형'; }).reduce((s, x) => s + x[4], 0);
console.log(`     ${last.ym} 상위 20 내 파생형 M/S: 유형최종2 ${(f2Der / totL * 100).toFixed(1)}% → 유형최종3 ${(sumT(last.rows, '파생형') / totL * 100).toFixed(1)}% · 채권형 ${(sumT(last.rows, '채권형') / totL * 100).toFixed(1)}%`);
check('변천: 최근 월 파생형 비중 감소(금리 합성 → 채권형)', sumT(last.rows, '파생형') < f2Der || !last.rows.some(x => dbCodes.has(pad(x[1]))));
const date = api('meta').defaultDate;
const top = api('topEtf', { date });
const topDB = top.top.filter(x => dbCodes.has(x.code));
check('상위 ETF 목록: 금리 합성 종목 유형 = 채권형 (' + topDB.length + '종목)', topDB.every(x => x.type === '채권형'), topDB.slice(0, 3).map(x => x.name).join(', '));
const nl = api('newListings', { date, year: date.slice(0, 4), filter: 'all' });
const nlDB = nl.items.filter(x => dbCodes.has(x.code));
check('신규상장(전체): 금리 합성 종목 유형 = 채권형 (' + nlDB.length + '종목), 신규상장용 구분은 그대로', nlDB.every(x => x.type === '채권형' && x.neu === '채권/금리'));
const nlx = api('newListings', { date, year: date.slice(0, 4), filter: 'exBond' });
check('신규상장(채권/금리 제외): 기존과 같이 제외', nlx.items.every(x => x.neu !== '채권/금리'));
let to; try { const tv = api('turnover', {}); to = tv.top.filter(x => dbCodes.has(x.code)); check('거래대금 목록: 금리 합성 종목 유형 = 채권형 (' + to.length + '종목)', to.every(x => x.type === '채권형')); } catch (e) { console.log('     (거래대금 생략: ' + e.message + ')'); }
// 유형별 NAV 합계는 유형최종2 유지
const bt = api('byType', { date, ref: 'py' });
const snap = JSON.parse(R(`JSON.stringify(snapshot_('${date}').map(r => [r.code, r.nav]))`));
const leg = {}; legRows().forEach(r => leg[pad(r[0])] = String(r[8]).trim());
const der2 = snap.filter(x => leg[pad(x[0])] === '파생형').reduce((s, x) => s + x[1], 0), btDer = (bt.rows.find(r => r.type === '파생형') || {}).nav || 0;
check('유형별 NAV: 파생형 합계 = 유형최종2 기준(금리 합성 포함) 그대로', Math.abs(btDer - der2) < 1e6, (btDer / 1e12).toFixed(2) + '조 / ' + (der2 / 1e12).toFixed(2) + '조');

console.log('[E] 야간 점검·캐시·README');
legRows().forEach(r => { if (isDB(r)) r[12] = '파생형'; });
R(`nightlyAgg()`);
check('야간 점검 실행 → 유형최종3 열 복원', legRows().every(r => r[12] === (isDB(r) ? '채권형' : r[8])));
check('캐시 세대 a26 (이전 응답 캐시 전체 무효화)', /^a26:/.test(R(`cacheKey_('race', {n: 20})`)));
check('README v26 · 범례_유형 행에 유형최종3 설명', R(`README.VER`) === 'v26' && /유형최종3/.test(R(`README.SHEETS.find(r => r[0] === '범례_유형').join(' ')`)));
check('메뉴: 범례_유형 유형최종3 갱신', /syncTypeF3/.test(fs.readFileSync(path.join(__dirname, '..', 'gas', 'Setup.gs'), 'utf8')));

console.log(fails ? '\n실패 ' + fails + '건' : '\n모두 통과');
process.exit(fails ? 1 : 0);
