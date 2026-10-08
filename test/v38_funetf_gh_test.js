/* TZ=Asia/Seoul node test/v38_funetf_gh_test.js — v38 FunETF 구성종목 자동 수집(GitHub 예약 작업) 점검(모의)
 *  A) 서버(funImport_): 자동 수집·버튼 동시 실행 막기 · 버려진 상태 · 같은 기준일 건너뜀 · 대상 순서(구성종목 있는 ETF 먼저) · 못 받은 ETF 이전 자료 유지(rest)
 *  B) 수집 스크립트(scripts/funetf_collect.mjs) + 모의 웹앱: 02:00 까지 대기 · 1건씩·응답 뒤 10초 · 마감 05:50 · 막힘(403) 즉시 멈춤 · 끊긴 응답·잠금 재전송 · 시험(limit)
 *  C) 워크플로(.github/workflows/funetf-collect.yml) · 메뉴(A5 토큰) · KIS 자동 수집과의 관계 */
const fs = require('fs'), path = require('path'), vm = require('vm');
const ctx = { console: { log: () => {} }, Date, Math, JSON, Object, Array, String, Number, RegExp, Error, isNaN, setTimeout, globalThis: null, __zlib: require('zlib'), __Buffer: Buffer, encodeURIComponent, decodeURIComponent };
ctx.globalThis = ctx; vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname, 'shim.js'), 'utf8'), ctx);
const gasDir = path.join(__dirname, '..', 'gas'), root = path.join(__dirname, '..');
for (const f of fs.readdirSync(gasDir).filter(f => f.endsWith('.gs')).sort((a, b) => (/^(Theme|Kis|Buzz)\.gs$/.test(a)) - (/^(Theme|Kis|Buzz)\.gs$/.test(b)) || a.localeCompare(b))) vm.runInContext(fs.readFileSync(path.join(gasDir, f), 'utf8'), ctx, { filename: f });
const st = JSON.parse(fs.readFileSync(path.join(__dirname, 'store.json'), 'utf8')); ctx.__s = st;
vm.runInContext(`(function(){ const ss = SpreadsheetApp.getActiveSpreadsheet(); Object.keys(__s.store).forEach(n => { const sh = ss.insertSheet(n); sh.rows = JSON.parse(JSON.stringify(__s.store[n])); }); Object.keys(__s.props).forEach(k => PropertiesService.getScriptProperties().setProperty(k, __s.props[k])); })()`, ctx);
const R = s => vm.runInContext(s, ctx);
let fails = 0; const check = (name, ok, info) => { if (!ok) fails++; console.info((ok ? '  OK   ' : '  FAIL ') + name + (info !== undefined ? ' — ' + info : '')); };
const S = ctx.MOCK_STORE, P = () => JSON.parse(R(`JSON.stringify(PropertiesService.getScriptProperties().getProperties())`));
const J = s => JSON.parse(R(`JSON.stringify(${s})`));
const setP = (k, v) => R(`PropertiesService.getScriptProperties().setProperty(${JSON.stringify(k)}, ${JSON.stringify(v)})`);
ctx.Utilities.sleep = () => {};
let __u = 0; ctx.Utilities.getUuid = () => 'aaaaaaaa-bbbb-cccc-dddd-' + String(1e11 + (++__u)).slice(-12);
ctx.ContentService = { MimeType: { JSON: 'json' }, createTextOutput: s => ({ setMimeType() { return this; }, getContent: () => s }) };
R(`const __isin0 = isinKr_; isinKr_ = function (c) { return __isin0(c) || (/^1\\d{5}$/.test(String(c)) ? 'KRT' + c + '000' : ''); };`);
let lockBusy = 0; ctx.LockService = { getScriptLock: () => ({ tryLock: () => { if (lockBusy > 0) { lockBusy--; return false; } return true; }, releaseLock: () => {} }) };
const post = b => JSON.parse(R(`doPost({ postData: { contents: ${JSON.stringify(JSON.stringify(b))} } }).getContent()`));
R(`funBookmarklet_(false)`); const tok = P().FUN_IMPORT_TOKEN;
const date = J(`indexDates_()`).slice(-1)[0], targets = J(`holdingsTargets_(${JSON.stringify(date)})`), N = targets.length;
const nameOf = c => targets.find(t => t[0] === c)[1];
// 모의 FunETF 자료(v34 시험과 같은 규칙): 해외·국내·채권만·빈 응답
const US = [['US67066G1040', 'NVDA', '엔비디아/NVIDIA Corp'], ['US0378331005', 'AAPL', '애플/Apple Inc']];
const KRS = [['KR7005930003', '005930', '삼성전자'], ['KR7000660001', '000660', 'SK하이닉스']];
let ver = 'A';   // 자료 판(이전 자료 유지 확인용: B 판은 비중이 다름)
const pdf = (c, nm) => {
  if (/채권|국채|금리/.test(nm)) return [['KR103503GG60', '', '국고채권04250-3606(26-6)', 99, 1]];
  if (/고배당/.test(nm)) return [];
  const w = ver === 'A' ? 10 : 20;
  if (/미국|나스닥|S&P/.test(nm)) return US.map((u, i) => [u[0], u[1], u[2], w - i, 1000]);
  return KRS.map((k, i) => [k[0], k[1], k[2], w + 20 - i, 1000]);
};
const fullRun = (src, extra) => { const s = post(Object.assign({ k: tok, op: 'start', src }, extra || {})); if (!s.ok || s.data.skip) return s; for (let i = 0; i < N; i += 40) post({ k: tok, op: 'put', date, seq: i / 40 + 1, items: Object.fromEntries(s.data.targets.slice(i, i + 40).map(t => [t[0], pdf(t[0], nameOf(t[0]))])) }); return post({ k: tok, op: 'end', date }); };
R(`PropertiesService.getScriptProperties().deleteProperty(PROP.KIS_KEY)`);

(async () => {
  console.info('[A] 서버(funImport_)');
  const r0 = fullRun('bm'); let info = JSON.parse(P().KIS_PDF_INFO || '{}');
  check('기준 자료: 버튼 반영 완료(출처 F, carry 0)', r0.ok && info.src === 'F' && !info.failed && info.carry === 0, JSON.stringify({ ok: info.ok, n: info.n, rows: info.rows }));
  const base = S['구성종목'].rows.length, had = new Set(S['구성종목'].rows.slice(1).map(r => r[0]));
  const sk = post({ k: tok, op: 'start', src: 'gh', skipSame: true });
  check('같은 기준일 FunETF 자료가 온전히 있으면 자동 수집 건너뜀(시트 그대로)', sk.ok && sk.data.skip === true && sk.data.date === date && !S['구성종목_수집중'] && !P().FUN_IMPORT_STATE);
  const g1 = post({ k: tok, op: 'start', src: 'gh' });
  const order = g1.data.targets.map(t => t[0]), firstNo = order.findIndex(c => !had.has(c));
  check('대상 순서: 지금 구성종목이 있는 ETF 먼저, 각 무리 안은 코드 순', g1.ok && order.length === N && firstNo > 0 && order.slice(firstNo).every(c => !had.has(c)) && order.slice(0, firstNo).every((c, i, a) => !i || a[i - 1] < c), `${firstNo}/${N}`);
  const bmBlocked = post({ k: tok, op: 'start' });
  check('자동 수집 진행 중 → 버튼 시작 거부(진행 중 안내)', !bmBlocked.ok && /다른 구성종목 반영이 진행 중/.test(bmBlocked.error) && /자동 수집/.test(bmBlocked.error), bmBlocked.error);
  const ghAgain = post({ k: tok, op: 'start', src: 'gh' });
  check('같은 쪽(자동 수집)이 다시 시작 → 허용(새로 시작)', ghAgain.ok && !ghAgain.data.skip);
  // 앞 200종목만 받고(B 판) 나머지는 rest 로 → 이전 자료(A 판) 유지
  const putN = (Tx, n, from) => { for (let i = 0; i < n; i += 40) post({ k: tok, op: 'put', date, seq: i / 40 + 1, items: Object.fromEntries(Tx.slice(i, Math.min(i + 40, n)).map(t => [t[0], pdf(t[0], nameOf(t[0]))])) }); };
  ver = 'B'; const T = ghAgain.data.targets, got = T.slice(0, 200);
  putN(T, 200);
  const prevRows = S['구성종목'].rows.slice(1);
  const e1 = post({ k: tok, op: 'end', date, rest: T.slice(200).map(t => t[0]) });
  info = JSON.parse(P().KIS_PDF_INFO || '{}'); const now1 = S['구성종목'].rows.slice(1);
  const restHad = T.slice(200).filter(t => had.has(t[0])).length;
  check('end(rest): 받은 200종목은 새 자료, 나머지는 이전 자료 그대로(info.carry)', e1.ok && !info.failed && info.carry === restHad && restHad > 0 && info.ok + info.empty + info.err === info.n && info.n === N, JSON.stringify({ carry: info.carry, restHad, ok: info.ok, empty: info.empty }));
  const sameRows = c => JSON.stringify(prevRows.filter(r => r[0] === c)) === JSON.stringify(now1.filter(r => r[0] === c));
  check('이전 자료 유지 행 = 이전 시트 행과 같음(출처·ISIN 포함), 받은 종목은 B 판 비중', T.slice(200).every(t => sameRows(t[0])) && got.filter(t => had.has(t[0]) && !/채권|국채|금리|고배당/.test(nameOf(t[0]))).every(t => now1.some(r => r[0] === t[0] && (r[4] === 20 || r[4] === 19 || r[4] === 40 || r[4] === 39))), now1.length + '행');
  check('행 수 합계 일치(info.rows = 시트 행)', info.rows === now1.length, info.rows + ' vs ' + now1.length);
  const sk2 = post({ k: tok, op: 'start', src: 'gh', skipSame: true });
  check('이전 자료를 섞은 반영 뒤에는 같은 기준일이라도 다시 받음(건너뛰지 않음)', sk2.ok && !sk2.data.skip);
  // 새로 받은 것이 이전 자료 유지분보다 적으면(초반에 막힘 등) 반영하지 않음 — 기준일만 새것처럼 보이는 일 방지
  ver = 'A'; putN(sk2.data.targets, 30);
  const before = JSON.stringify(S['구성종목'].rows), kd = P().KIS_PDF_DATE;
  const e2 = post({ k: tok, op: 'end', date, rest: sk2.data.targets.slice(30).map(t => t[0]) });
  info = JSON.parse(P().KIS_PDF_INFO || '{}');
  check('새로 받은 ETF < 이전 자료 유지분 → 반영 안 함(시트·기준일 그대로), 마지막 성공 원천·기준일 기록', e2.ok && info.failed === true && JSON.stringify(S['구성종목'].rows) === before && P().KIS_PDF_DATE === kd && info.okSrc === 'F' && info.okDate === date, JSON.stringify({ okSrc: info.okSrc, okDate: info.okDate }));
  R(`PropertiesService.getScriptProperties().setProperty(PROP.KIS_KEY, 'K'); PropertiesService.getScriptProperties().setProperty(PROP.KIS_SECRET, 'S'); PropertiesService.getScriptProperties().deleteProperty(PROP.KIS_RUN); PropertiesService.getScriptProperties().deleteProperty('FUN_IMPORT_STATE')`);
  const kc0 = ctx.MOCK_KIS_CALLS || 0; R(`collectHoldings()`);
  check('반영 실패 뒤에도 시트의 FunETF 자료가 2주 이내면 월요일 KIS 수집이 덮어쓰지 않음', (ctx.MOCK_KIS_CALLS || 0) === kc0 && S['구성종목'].rows.slice(1).some(r => r[7] === 'F'));
  R(`PropertiesService.getScriptProperties().deleteProperty(PROP.KIS_KEY)`);
  const sk3 = post({ k: tok, op: 'start', src: 'gh', skipSame: true });
  check('반영 실패 뒤 다음 회차는 같은 기준일이라도 다시 받음', sk3.ok && !sk3.data.skip);
  // 시험 실행(dry): 흐름만 확인, 시트·기준일 그대로
  putN(sk3.data.targets, 10); const before2 = JSON.stringify(S['구성종목'].rows), inf2 = P().KIS_PDF_INFO;
  const dr = post({ k: tok, op: 'end', date, dry: true });
  check('시험 실행 끝내기(dry) → 받은 수만 알려주고 시트·정보 그대로, 수집중 시트·상태 정리', dr.ok && dr.data.dry && dr.data.got === 10 && dr.data.rows > 0 && JSON.stringify(S['구성종목'].rows) === before2 && P().KIS_PDF_INFO === inf2 && !S['구성종목_수집중'] && !P().FUN_IMPORT_STATE, JSON.stringify(dr.data));
  // 버려진 상태(30분 넘게 활동 없음) → 다른 쪽 시작 허용
  post({ k: tok, op: 'start', src: 'gh' });
  const stt = JSON.parse(P().FUN_IMPORT_STATE); stt.t = Date.now() - 31 * 60 * 1000; setP('FUN_IMPORT_STATE', JSON.stringify(stt));
  const bm2 = post({ k: tok, op: 'start' });
  check('버려진 자동 수집 상태(30분 넘게 활동 없음) → 버튼 시작 허용', bm2.ok && JSON.parse(P().FUN_IMPORT_STATE).src === 'bm');
  // 이미 받은 ETF 를 rest 에 넣어도 중복 행 없음
  ver = 'A'; const T2 = bm2.data.targets;
  putN(T2, 200);
  const e4 = post({ k: tok, op: 'end', date, rest: T2.slice(190).map(t => t[0]) });
  const dup = S['구성종목'].rows.slice(1).reduce((m, r) => { const k = r[0] + '|' + r[6]; m[k] = (m[k] || 0) + 1; return m; }, {});
  check('rest 에 이번에 받은 ETF 가 섞여도 행 중복 없음', e4.ok && !e4.data.failed && Object.values(dup).every(v => v === 1));
  // KIS 월요일 자동 수집과의 관계
  R(`PropertiesService.getScriptProperties().setProperty(PROP.KIS_KEY, 'K'); PropertiesService.getScriptProperties().setProperty(PROP.KIS_SECRET, 'S'); PropertiesService.getScriptProperties().deleteProperty(PROP.KIS_RUN)`);
  setP('FUN_IMPORT_STATE', JSON.stringify({ date, src: 'gh', t: Date.now(), start: '2026-10-09 02:00' }));
  setP('KIS_PDF_FORCE', '1'); const kc = ctx.MOCK_KIS_CALLS || 0; R(`collectHoldings()`);
  check('FunETF 반영이 진행 중(활동 30분 안) → KIS 수집 보류', (ctx.MOCK_KIS_CALLS || 0) === kc);
  setP('FUN_IMPORT_STATE', JSON.stringify({ date, src: 'gh', t: Date.now() - 40 * 60 * 1000, start: '2026-10-09 02:00' }));
  setP('KIS_PDF_FORCE', '1'); R(`collectHoldings()`);
  check('버려진 반영 상태는 KIS 수집을 막지 않음(이전엔 영구 보류)', (ctx.MOCK_KIS_CALLS || 0) > kc);
  R(`PropertiesService.getScriptProperties().deleteProperty('FUN_IMPORT_STATE'); PropertiesService.getScriptProperties().deleteProperty(PROP.KIS_KEY)`);
  ver = 'A'; fullRun('bm');

  console.info('[B] 수집 스크립트 + 모의 웹앱');
  const mod = await import(path.join(root, 'scripts', 'funetf_collect.mjs'));
  const kst = (d, hm) => Date.parse(d + 'T' + hm + ':00+09:00');
  const sim = (opt = {}) => {
    let clock = opt.t0 || kst('2026-10-09', '01:41');
    const ev = [], logs = [];
    let htmlOnce = opt.htmlOnce || 0;
    const fetch = async (url, o) => {
      if (url.startsWith(mod.DEF.exec)) {
        const b = JSON.parse(o.body); ev.push({ t: clock, k: 'post', op: b.op, seq: b.seq, n: b.items ? Object.keys(b.items).length : undefined, rest: b.rest && b.rest.length });
        clock += 1500;
        if (b.op === 'put' && htmlOnce > 0) { htmlOnce--; post(b); return { status: 200, text: async () => '<html><title>404 페이지를 찾을 수 없음</title></html>' }; }   // 서버는 반영했는데 응답이 HTML(v36 현상)
        if (b.op === 'put' && opt.lockPuts) { opt.lockPuts--; lockBusy = 1; }
        return { status: 200, text: async () => JSON.stringify(post(b)) };
      }
      const q = new URL(url).searchParams, isin = q.get('itemId'), c = isin.slice(3, 9).replace(/^T/, '');
      ev.push({ t: clock, k: 'fun', isin, ua: o.headers['User-Agent'] });
      const code = targets.find(t => J(`isinKr_(${JSON.stringify(t[0])})`) === isin)[0];
      clock += opt.latency || 400; ev[ev.length - 1].end = clock;
      if (opt.block && ev.filter(e => e.k === 'fun').length >= opt.block) return { status: 403, headers: new Map([['cf-mitigated', 'challenge']]), text: async () => '<html>Just a moment...</html>' };
      if (opt.fail5xx && ev.filter(e => e.k === 'fun').length === opt.fail5xx) return { status: 502, headers: new Map(), text: async () => 'bad gateway' };
      return { status: 200, headers: new Map(), text: async () => JSON.stringify(pdf(code, nameOf(code)).map(x => ({ grpItmNo: x[0], ticker: x[1], citmNm: x[2], evP: x[3], evAmt: x[4] }))) };
    };
    return { ev, logs, fetch, now: () => clock, sleep: async ms => { clock += Math.max(0, ms); }, log: s => logs.push(s), env: Object.assign({ FUN_IMPORT_TOKEN: tok }, opt.env || {}), cfg: opt.cfg };
  };
  ver = 'B'; setP('KIS_PDF_INFO', JSON.stringify(Object.assign(JSON.parse(P().KIS_PDF_INFO), { carry: 3 })));   // 직전 반영이 이전 자료를 섞었다고 가정 → 이번 회차는 전부 받음
  let m = sim(); let r = await mod.run(m);
  const fun = m.ev.filter(e => e.k === 'fun'), gaps = fun.slice(1).map((e, i) => e.t - fun[i].end);
  info = JSON.parse(P().KIS_PDF_INFO || '{}');
  check('02:00 KST 전에는 요청 없음(01:41 에 깨어 기다림)', m.ev[0].t >= kst('2026-10-09', '02:00') && m.logs.some(l => /02:00 KST 까지 기다림/.test(l)), new Date(m.ev[0].t).toISOString());
  check('FunETF 1건씩: 응답 뒤 다음 요청까지 10초 이상, 동시 요청 없음', gaps.length === N - 1 && gaps.every(g => g >= 10000), 'min ' + Math.min(...gaps) + 'ms');
  check('정직한 User-Agent(저장소 주소 포함)', fun.every(e => /etf-dashboard-personal\/1\.0 \(\+https:\/\/github\.com\/yblimkih-byte\/etf-dashboard\)/.test(e.ua)));
  check('전체 반영: start(gh·skipSame) → 40종목 묶음 put → end(rest 0), 출처 F, carry 0', r.done === N && r.rest === 0 && !r.stop && info.src === 'F' && info.carry === 0 && !info.failed && m.ev.filter(e => e.op === 'put').every(e => e.n <= 40), JSON.stringify({ done: r.done, puts: r.puts, rows: info.rows }));
  const endT = m.ev[m.ev.length - 1].t, est = (N * 10.4) / 60;
  check(`소요: ${N}종목 × (10초 + 응답) ≈ ${est.toFixed(0)}분`, endT - kst('2026-10-09', '02:00') < (N * 10.4 + 120) * 1000, Math.round((endT - kst('2026-10-09', '02:00')) / 60000) + '분');
  check('실제 규모 계산: 1,171종목 × 10.4초 ≈ 3시간 23분 → 05:50 마감 안', 1171 * 10.4 / 60 < 230, (1171 * 10.4 / 3600).toFixed(2) + '시간');
  const sm = mod.summary(r);
  check('요약(작업 화면): 기준일·건수·소요, 토큰 없음', /기준일/.test(sm) && /FunETF 요청/.test(sm) && !sm.includes(tok), sm.split('\n')[2]);
  // 같은 기준일 → 건너뜀
  m = sim(); r = await mod.run(m);
  check('다음 회차가 같은 기준일 → FunETF 요청 없이 건너뜀', r.skip === 'same' && !m.ev.some(e => e.k === 'fun'));
  // 마감: 02:40 으로 줄여 일부만 → 나머지는 이전 자료 유지
  ver = 'A'; setP('KIS_PDF_INFO', JSON.stringify(Object.assign(JSON.parse(P().KIS_PDF_INFO), { carry: 1 })));
  const prev2 = S['구성종목'].rows.slice(1);
  m = sim({ cfg: { deadline: '02:40', finish: '02:48' } }); r = await mod.run(m);
  info = JSON.parse(P().KIS_PDF_INFO || '{}'); const lastFun = m.ev.filter(e => e.k === 'fun').slice(-1)[0];
  check('마감 시각 이후 새 요청 없음 → 받은 데까지 반영, 나머지는 rest 로 이전 자료 유지', r.stop === 'deadline' && lastFun.t < kst('2026-10-09', '02:40') && r.rest === N - r.done && info.carry > 0 && !info.failed && info.ok + info.empty + info.err === N, JSON.stringify({ done: r.done, carry: info.carry }));
  check('마감으로 못 받은 ETF 행 = 이전 시트 행 그대로', (() => { const nowR = S['구성종목'].rows.slice(1), doneSet = new Set(m.ev.filter(e => e.k === 'fun').map(e => e.isin)); return targets.filter(t => !doneSet.has(J(`isinKr_(${JSON.stringify(t[0])})`))).every(t => JSON.stringify(prev2.filter(x => x[0] === t[0])) === JSON.stringify(nowR.filter(x => x[0] === t[0]))); })());
  // 막힘(403·Cloudflare) → 즉시 멈춤, 재시도·우회 없음, 실행 실패 표시
  const before3 = JSON.stringify(S['구성종목'].rows);
  m = sim({ block: 5 }); r = await mod.run(m);
  const f5 = m.ev.filter(e => e.k === 'fun');
  check('FunETF 막힘(403 cf-mitigated) → 그 즉시 멈춤(같은 요청 재시도 없음)', /^blocked 403/.test(r.stop) && f5.length === 5 && r.done === 4 && m.ev.some(e => e.op === 'end'), r.stop);
  check('초반에 막혀 새로 받은 자료가 적음 → 반영 안 함(시트 그대로), 요약에 표시', r.info.failed === true && JSON.stringify(S['구성종목'].rows) === before3 && /반영 안 함/.test(mod.summary(r)));
  // 일시 오류(502) → 10초 쉬고 1번만 다시
  m = sim({ fail5xx: 3, env: { LIMIT: '6' } }); r = await mod.run(m);
  const f6 = m.ev.filter(e => e.k === 'fun');
  check('일시 오류(502) → 10초 뒤 같은 ETF 1회 재요청, 시험(limit 6) = 6종목만', r.retry === 1 && f6.length === 7 && f6[2].isin === f6[3].isin && f6[3].t - f6[2].end >= 10000 && r.done === 6 && r.stop === 'limit', JSON.stringify({ req: r.req, retry: r.retry }));
  // 시험 실행(limit) — 시트·기준일 그대로
  const before4 = JSON.stringify(S['구성종목'].rows), inf4 = P().KIS_PDF_INFO;
  const m0 = sim({ env: { LIMIT: '80', NOW: '1' }, t0: kst('2026-10-08', '15:00') }), rd = await mod.run(m0);
  check('NOW=1: 기다리지 않고 바로 시작(낮 시험 실행)', m0.ev[0].t < kst('2026-10-08', '15:01'));
  check('시험 실행(limit 80): 앞 80종목만 받고 시트·기준일 그대로(dry), 요약 = 시험', rd.info.dry && rd.info.got === 80 && rd.req === 80 && JSON.stringify(S['구성종목'].rows) === before4 && P().KIS_PDF_INFO === inf4 && /시험 실행/.test(mod.summary(rd)), JSON.stringify(rd.info));
  // 웹앱 응답이 HTML(서버는 반영) → 같은 묶음 번호로 다시 보내 중복 없음
  m = sim({ htmlOnce: 1, env: { LIMIT: '80', NOW: '1' }, t0: kst('2026-10-08', '15:00') }); r = await mod.run(m);
  const p1 = m.ev.filter(e => e.op === 'put');
  check('웹앱 응답이 HTML 로 끊겨도 같은 묶음 번호로 다시 보냄 → 행 중복 없음(행 수 = 정상 실행과 같음)', p1[0].seq === 1 && p1[1].seq === 1 && r.info.rows === rd.info.rows && r.info.got === 80 && !r.lost.length, p1.map(e => e.seq).join(',') + ' · ' + r.info.rows + '/' + rd.info.rows);
  // 잠금(다른 작업 진행 중) → 묶음 보류, 받기는 계속, 나중에 순서대로 전송
  m = sim({ lockPuts: 1, env: { LIMIT: '120', NOW: '1' }, t0: kst('2026-10-08', '15:00') }); r = await mod.run(m);
  const seqs = m.ev.filter(e => e.op === 'put').map(e => e.seq);
  check('웹앱 잠금(진행 중) → 묶음 보류 후 재전송, 순서 유지·누락 없음', r.puts === 3 && seqs.join(',').startsWith('1,1') && !r.lost.length && seqs.filter((v, i, a) => a.indexOf(v) === i).join(',') === '1,2,3', seqs.join(','));
  // 늦게 시작(GitHub 지연으로 마감 이후) → 건너뜀
  m = sim({ t0: kst('2026-10-09', '05:52') }); r = await mod.run(m);
  check('GitHub 예약 지연으로 마감 이후 시작 → 요청 없이 건너뜀', r.skip === 'late' && !m.ev.length);
  // 토큰 없음·틀림
  let e3 = ''; try { await mod.run(Object.assign(sim(), { env: {} })); } catch (e) { e3 = e.message; }
  check('시크릿 없음 → 바로 오류(요청 없음)', /FUN_IMPORT_TOKEN/.test(e3));
  e3 = ''; try { const mm = sim({ env: { NOW: '1' } }); mm.env.FUN_IMPORT_TOKEN = 'f'.repeat(40); await mod.run(mm); } catch (e) { e3 = e.message; }
  check('시크릿 값이 다름 → 인증 실패 안내(재시도 안 함)', /인증 실패/.test(e3), e3);
  check('KST 시각 계산(01:41 → 같은 날 02:00·05:50)', mod.kstAt(kst('2026-10-09', '01:41'), '02:00') === kst('2026-10-09', '02:00') && mod.kstAt(kst('2026-10-09', '01:41'), '05:50') === kst('2026-10-09', '05:50'));
  check('응답 분류: 200 JSON 배열 / 403·429·cf-mitigated = 막힘 / 5xx·HTML = 일시 오류', (() => { const c = mod.classify; return c(200, {}, '[]').items.length === 0 && c(403, {}, '').blocked && c(429, {}, '').blocked && c(200, { 'cf-mitigated': 'challenge' }, '').blocked && c(502, {}, '').fail && c(200, {}, '<html>').fail; })());

  console.info('[C] 워크플로 · 메뉴');
  const wf = fs.readFileSync(path.join(root, '.github', 'workflows', 'funetf-collect.yml'), 'utf8');
  check('예약: UTC 월·목 16:41 = KST 화·금 01:41(정각 회피)', /cron: '41 16 \* \* 1,4'/.test(wf));
  check('시크릿으로만 토큰 전달 · 읽기 권한만 · 동시 실행 1개 · 시간 한도 300분', /FUN_IMPORT_TOKEN: \$\{\{ secrets\.FUN_IMPORT_TOKEN \}\}/.test(wf) && /contents: read/.test(wf) && /group: funetf-collect/.test(wf) && /timeout-minutes: 300/.test(wf));
  check('수동 실행(시험 limit·now) 지원', /workflow_dispatch/.test(wf) && /limit:/.test(wf) && /now:/.test(wf));
  const wfDays = [1, 4].map(d => (d + 1) % 7);   // UTC 16:41 + 9h = 다음 날
  check('KST 요일 = 화(2)·금(5)', wfDays.join(',') === '2,5');
  R(`menuFunButton()`);
  const bs = S['구성종목_버튼'].rows;
  check('메뉴: A3 = 버튼 코드, A4 = 시크릿 등록 안내, A5 = 토큰', /^javascript:/.test(bs[2][0]) && /FUN_IMPORT_TOKEN/.test(bs[3][0]) && /New repository secret/.test(bs[3][0]) && bs[4][0] === P().FUN_IMPORT_TOKEN);
  check('스크립트에 토큰·비밀 값 하드코딩 없음', !/[0-9a-f]{40}/.test(fs.readFileSync(path.join(root, 'scripts', 'funetf_collect.mjs'), 'utf8').replace(/AKfycb[\w-]+/g, '')) && !/[0-9a-f]{40}/.test(wf));

  console.info(fails ? `\n실패 ${fails}건` : '\n전부 통과');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
