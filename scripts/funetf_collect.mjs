// scripts/funetf_collect.mjs — v38 FunETF 구성종목 자동 수집(GitHub Actions 예약 작업, .github/workflows/funetf-collect.yml)
//  · FunETF 공개 구성종목 PDF(https://www.funetf.co.kr/api/public/product/view/etfpdf, robots.txt 허용 경로)를 ETF 1건씩, 응답 뒤 10초 쉬고 받음
//  · 받은 자료는 Apps Script 웹앱(doPost → Kis.gs funImport_)에 40종목 묶음으로 보냄 — 브라우저 버튼(v34)과 같은 start/put/end 흐름
//  · 시간: KST 02:00 시작(일찍 깨면 기다림) · 05:50 넘으면 새 요청을 멈추고 받은 데까지 반영, 못 받은 ETF 는 이전 자료 유지(end.rest)
//  · FunETF 가 막으면(403·429·Cloudflare 확인 화면) 우회하지 않고 즉시 멈춤
//  · 새로 받은 ETF 가 이전 자료 유지분보다 적으면(초반에 막힘 등) 서버가 반영하지 않고 이전 자료를 그대로 둠(기준일도 그대로)
//  · 환경 변수: FUN_IMPORT_TOKEN(필수, 저장소 시크릿) · EXEC_URL · LIMIT(시험: 앞에서 N개만 받고 시트는 바꾸지 않음) · NOW=1(기다리지 않고 바로, 마감 = 시작 + 3시간 50분)
import { appendFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export const DEF = {
  exec: 'https://script.google.com/macros/s/AKfycbwF4iZ_1BilAMgSFAySTPrS8gaEOVdTQdMPE3QaVhEd--A38x1l9sQXJWIk_RXuHbO0dA/exec',
  base: 'https://www.funetf.co.kr', pdf: '/api/public/product/view/etfpdf',
  ua: 'etf-dashboard-personal/1.0 (+https://github.com/yblimkih-byte/etf-dashboard)',
  gapMs: 10000,          // FunETF 응답 뒤 다음 요청까지 쉬는 시간
  start: '02:00', deadline: '05:50', finish: '05:58',   // KST. finish = 시트 반영(묶음·끝내기) 재시도 한도
  timeoutMs: 30000, postTimeoutMs: 6.5 * 60 * 1000,
  maxFail: 10,           // FunETF 연속 실패(5xx·형식 오류 등) 이 횟수면 멈춤(사이트 장애)
};
const KST = 9 * 3600 * 1000;
/** nowMs 의 KST 날짜에서 'HH:mm' 시각(ms) */
export function kstAt(nowMs, hm) {
  const d = new Date(nowMs + KST), [h, m] = hm.split(':').map(Number);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), h, m) - KST;
}
export const kstStr = ms => new Date(ms + KST).toISOString().slice(0, 16).replace('T', ' ');

/** FunETF 응답 분류 → {items}|{fail}|{blocked} */
export function classify(status, headers, text) {
  const h = k => (headers && (typeof headers.get === 'function' ? headers.get(k) : headers[k])) || '';
  if (status === 403 || status === 429 || h('cf-mitigated')) return { blocked: status + (h('cf-mitigated') ? ' ' + h('cf-mitigated') : '') };
  if (status !== 200) return { fail: 'HTTP ' + status };
  let j; try { j = JSON.parse(text); } catch (e) { return { fail: '형식 오류' + (/<html/i.test(text || '') ? '(HTML)' : '') }; }
  if (!Array.isArray(j)) return { fail: '형식 오류(배열 아님)' };
  return { items: j.filter(x => x).map(x => [x.grpItmNo, x.ticker, x.citmNm, x.evP, x.evAmt]) };
}

export async function run(o = {}) {
  const env = o.env || process.env, fetch = o.fetch || globalThis.fetch, now = o.now || Date.now;
  const sleep = o.sleep || (ms => new Promise(r => setTimeout(r, Math.max(0, ms))));
  const log = o.log || (s => console.log(s)), C = Object.assign({}, DEF, o.cfg || {});
  const tok = String(env.FUN_IMPORT_TOKEN || '').trim(), exec = env.EXEC_URL || C.exec, limit = +(env.LIMIT || 0) || 0;
  const S = { started: now(), req: 0, fail: 0, retry: 0, stop: '', puts: 0, lost: [] };
  if (!/^[0-9a-f]{40}$/.test(tok)) throw new Error('FUN_IMPORT_TOKEN 시크릿이 없거나 형식이 다릅니다(스프레드시트 구성종목_버튼 시트 A5 값)');

  // ── 시간 창 ──
  let t0 = now(), startAt, deadline, finish;
  if (env.NOW === '1' || env.NOW === 'true') { startAt = t0; deadline = t0 + (kstAt(t0, C.deadline) - kstAt(t0, C.start)); finish = deadline + (kstAt(t0, C.finish) - kstAt(t0, C.deadline)); }
  else { startAt = kstAt(t0, C.start); deadline = kstAt(t0, C.deadline); finish = kstAt(t0, C.finish); }
  if (t0 >= deadline) { log('마감(' + kstStr(deadline) + ') 이후 시작 — 이번 회차는 건너뜀'); return Object.assign(S, { skip: 'late' }); }
  if (t0 < startAt) { log(kstStr(startAt) + ' KST 까지 기다림'); await sleep(startAt - t0); }

  // ── 웹앱 호출(응답이 HTML·끊김이면 다시, '진행 중'은 patient 일 때 until 까지 30초 간격) ──
  const post = async (body, until) => {
    let last = '';
    for (let a = 0; ; a++) {
      try {
        const ctl = new AbortController(), tm = setTimeout(() => ctl.abort(), C.postTimeoutMs);
        let tx;
        try { const r = await fetch(exec, { method: 'POST', body: JSON.stringify(Object.assign({ k: tok }, body)), headers: { 'Content-Type': 'text/plain;charset=utf-8' }, signal: ctl.signal }); tx = await r.text(); }
        finally { clearTimeout(tm); }
        let j; try { j = JSON.parse(tx); } catch (e) { throw new Error('웹앱 응답 형식 오류'); }
        if (j.ok) return j.data;
        if (/인증 실패/.test(j.error || '')) { const e = new Error('웹앱 인증 실패 — FUN_IMPORT_TOKEN 시크릿이 스프레드시트 토큰과 다릅니다'); e.fatal = true; throw e; }
        if (!/진행 중/.test(j.error || '')) { const e = new Error(j.error || '웹앱 오류'); e.fatal = true; throw e; }
        last = j.error;
      } catch (e) { if (e.fatal) throw e; last = e.message; }
      const wait = until ? 30000 : 3000 * (a + 1);
      if (until ? now() + wait > until : a >= 3) throw new Error('웹앱 응답 없음(' + last + ')');
      await sleep(wait);
    }
  };

  // ── 시작 ──
  const s = await post({ op: 'start', src: 'gh', skipSame: true }, Math.min(finish, now() + 10 * 60 * 1000));
  if (s.skip) { log('기준일 ' + s.date + ' FunETF 자료가 이미 있어 건너뜀'); return Object.assign(S, { skip: 'same', date: s.date }); }
  const T = limit > 0 ? s.targets.slice(0, limit) : s.targets, all = s.targets;
  log('기준일 ' + s.date + ' · 대상 ' + all.length + '종목' + (limit ? ' (시험: 앞 ' + T.length + '종목만)' : '') + ' · 마감 ' + kstStr(deadline) + ' KST');

  // ── 묶음 전송(순서 유지, 실패하면 다음 기회에) ──
  const queue = []; let seq = 0;
  const flush = async until => {
    while (queue.length) {
      try { await post({ op: 'put', date: s.date, seq: queue[0].seq, items: queue[0].items }, until); S.puts++; queue.shift(); }
      catch (e) { if (e.fatal) throw e; log('묶음 ' + queue[0].seq + ' 전송 보류: ' + e.message); return false; }
    }
    return true;
  };

  // ── FunETF 받기: 1건씩, 응답 뒤 gapMs 쉼 ──
  let B = {}, done = 0, nextAt = 0, fails = 0;
  const get = async isin => {
    const ctl = new AbortController(), tm = setTimeout(() => ctl.abort(), C.timeoutMs);
    try {
      S.req++;
      const r = await fetch(C.base + C.pdf + '?itemId=' + isin + '&etfPdfYmd=' + s.ymd, { headers: { 'User-Agent': C.ua, 'Accept': 'application/json' }, signal: ctl.signal });
      return classify(r.status, r.headers, await r.text());
    } catch (e) { return { fail: e.name === 'AbortError' ? '시간 초과' : e.message }; }
    finally { clearTimeout(tm); nextAt = now() + C.gapMs; }
  };
  for (; done < T.length; done++) {
    const t = T[done];
    if (t[1]) {
      await sleep(nextAt - now());
      if (now() >= deadline) { S.stop = 'deadline'; break; }
      let r = await get(t[1]);
      if (r.fail) { S.retry++; await sleep(nextAt - now()); if (now() >= deadline) { S.stop = 'deadline'; break; } r = await get(t[1]); }
      if (r.blocked) { S.stop = 'blocked ' + r.blocked; log('FunETF 가 요청을 막음(' + r.blocked + ') — 우회하지 않고 멈춤'); break; }
      if (r.fail) { S.fail++; fails++; } else fails = 0;
      B[t[0]] = r.items || null;
      if (fails >= C.maxFail) { done++; S.stop = 'fail'; log('FunETF 연속 실패 ' + fails + '회(' + r.fail + ') — 멈춤'); break; }
    } else B[t[0]] = null;   // ISIN 규칙 밖(우선주 형식 등) → 서버가 KIS 로 보완
    if (Object.keys(B).length >= s.chunk) { queue.push({ seq: ++seq, items: B }); B = {}; await flush(0); }
    if ((done + 1) % 100 === 0) log((done + 1) + ' / ' + T.length + ' · ' + kstStr(now()) + ' KST');
  }
  if (!S.stop && T.length < all.length) S.stop = 'limit';
  if (Object.keys(B).length) queue.push({ seq: ++seq, items: B });
  if (!(await flush(finish))) { queue.forEach(q => S.lost.push(...Object.keys(q.items))); queue.length = 0; }   // 끝내 못 보낸 묶음 → 이전 자료 유지 대상으로

  // ── 끝내기: 못 받은·못 보낸 ETF 는 이전 자료 유지(시험 실행은 시트를 바꾸지 않음) ──
  const rest = all.slice(done).map(t => t[0]).concat(S.lost);
  const e = await post(limit > 0 ? { op: 'end', date: s.date, dry: true } : { op: 'end', date: s.date, rest: rest }, finish + 60 * 1000);
  return Object.assign(S, { date: s.date, n: all.length, done: done, rest: rest.length, info: e, ended: now() });
}

export function summary(S) {
  const m = ms => Math.round(ms / 60000) + '분', i = S.info || {};
  const lines = ['### FunETF 구성종목 자동 수집', ''];
  if (S.skip) lines.push(S.skip === 'same' ? `- 기준일 ${S.date} 자료가 이미 있어 건너뜀` : '- 마감 시각 이후에 시작되어 건너뜀(GitHub 예약 지연)');
  else if (i.dry) lines.push(`- 시험 실행(시트·기준일 그대로): 기준일 ${S.date} · 앞 ${S.done}종목 · FunETF 요청 ${S.req}건(재시도 ${S.retry}, 실패 ${S.fail}) · 웹앱 수신 ${i.got}종목 · 주식 구성종목 확인 ${i.f}종목 · ${i.rows}행 · 소요 ${m((S.ended || 0) - S.started)}`);
  else lines.push(`- 기준일 **${S.date}** · 대상 ${S.n}종목 · 처리 ${S.done} · FunETF 요청 ${S.req}건(재시도 ${S.retry}, 실패 ${S.fail})`,
    `- 반영: 구성종목 확인 ${i.ok}/${i.n}종목 · ${i.rows}행 · FunETF ${i.f} · KIS 보완 ${i.k} · 이전 자료 유지 ${i.carry || 0}` + (i.failed ? ' · **반영 안 함(새로 받은 자료 부족 등) — 이전 자료·기준일 그대로**' : ''),
    `- 소요 ${m((S.ended || 0) - S.started)}` + (S.stop ? ` · 중단 사유: ${S.stop === 'deadline' ? '마감 시각' : S.stop === 'limit' ? '시험(일부만)' : S.stop}` : '') + (S.lost.length ? ` · 전송 실패 ${S.lost.length}종목(이전 자료 유지)` : ''));
  return lines.join('\n') + '\n';
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  run().then(S => {
    const out = summary(S); console.log(out);
    if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, out);
    if (/^blocked|^fail/.test(S.stop) || (S.info && S.info.failed)) process.exitCode = 1;   // 막힘·장애·반영 실패 → 실행 실패로 표시(알림)
  }).catch(e => {
    console.error('오류: ' + e.message);
    if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, '### FunETF 구성종목 자동 수집\n\n- **오류**: ' + e.message + '\n');
    process.exitCode = 1;
  });
}
