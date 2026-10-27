/* v47 화면 점검 (index.html = Apps Script, web.html = Vercel) — ① 용어 '순증 M/S' 통일 ② 설정·해지 상위 ETF 표: 운용사·설정액·NAV 오른쪽 고정, 종목명만 가로 스크롤
 *  V29B=1 node build_page.js && V29B=1 node build_web.js && CHROME_PATH=/opt/pw-browsers/chromium node v47_shot.js */
const { chromium } = require('playwright'), fs = require('fs');
const OUT = __dirname + '/shots_v47';
(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const b = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/opt/pw-browsers/chromium' });
  let fails = 0; const check = (name, ok, info) => { if (!ok) fails++; console.log((ok ? '  OK   ' : '  FAIL ') + name + (info !== undefined ? ' — ' + (typeof info === 'string' ? info : JSON.stringify(info)) : '')); };
  for (const [file, name, vw] of [['index.html', 'gas', { width: 1100, height: 800 }], ['web.html', 'web', { width: 1280, height: 900 }], ['web.html', 'mob', { width: 390, height: 844 }]]) {
    console.log(`[${name}]`);
    const p = await b.newPage({ viewport: vw }); const errs = [];
    p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errs.push('console: ' + m.text()); });
    await p.route('**/*', r => /^https?:/.test(r.request().url()) ? r.fulfill({ status: 200, body: '' }) : r.continue());
    await p.goto('file://' + __dirname + '/' + file); await p.waitForSelector('.tab');
    const wait = () => p.waitForFunction(() => !document.querySelector('#view > .loading') && ![...document.querySelectorAll('#view .empty')].some(e => /불러오는 중/.test(e.textContent)), null, { timeout: 90000 }).then(() => p.waitForTimeout(600));
    await wait();
    // ① 순증 M/S — 요약 'M/S 변동 요인' 행
    await p.evaluate(() => App.show('summary')); await wait();
    const sm = await p.evaluate(() => { const tr = [...document.querySelectorAll('#view table.kv tr, #view .kv tr')].find(r => /M\/S 변동 요인/.test(r.textContent)); return tr ? tr.textContent : ''; });
    check("요약 M/S 변동 요인: '(순증 M/S x%)' · 정의 줄 '순증 M/S = 한투 증감액 ÷ 시장 증감액' · '몫' 없음", /\(순증 M\/S [\d.]+%\)/.test(sm) && /순증 M\/S = 한투 증감액 ÷ 시장 증감액/.test(sm) && !/몫/.test(sm), sm.slice(0, 160));
    await p.evaluate(() => App.show('mgr')); await wait();
    const ms = await p.evaluate(() => {
      const sec = [...document.querySelectorAll('#view > .section')].find(x => /^M\/S 변동 요인/.test(x.querySelector('.h2').textContent));
      const th = [...sec.querySelectorAll('table.tbl thead tr:last-child th')].map(x => x.textContent), tot = sec.querySelector('tr.total');
      return { th, tot: tot ? [...tot.cells].map(c => c.textContent) : [], text: sec.innerText };
    });
    const ci = ms.th.indexOf('순증 M/S');
    check("M/S 변동 요인 표: 열 이름 '순증 M/S' · 합계 행 = 한투 증감액 ÷ 시장 증감액 · 화면에 '증가분 중'·'몫' 없음",
      ci === 3 && Math.abs(parseFloat(ms.tot[ci]) - parseFloat(ms.tot[2]) / parseFloat(ms.tot[1]) * 100) < 0.06 && !/증가분 중|몫/.test(ms.text) && /순증 M\/S: 한투 증감액 ÷ 시장 증감액/.test(ms.text), { th: ms.th, tot: ms.tot });
    // ② 설정·해지 상위 ETF 표 — 넘치게 만들려고 긴 종목명으로 바꾼 뒤 고정 열 다시 계산(실데이터 긴 이름 재현)
    const st = await p.evaluate(async () => {
      const ws = [...document.querySelectorAll('.flow-topt .tbl-scroll')]; if (!ws.length) return { n: 0 };
      ws.forEach(w => w.querySelectorAll('tbody tr').forEach((tr, i) => { if (i % 3 === 0) tr.cells[0].textContent = 'ACE 미국빅테크7+데일리타겟커버드콜(합성) 아주 긴 종목명 예시'; }));
      await new Promise(r => setTimeout(r, 300));
      const out = [];
      for (const w of ws) {
        const t = w.querySelector('table'), hr = t.tHead.rows[0], N = hr.cells.length, wr = w.getBoundingClientRect();
        const pos = () => [...hr.cells].map(c => Math.round(c.getBoundingClientRect().left)), row = t.tBodies[0].rows[1];
        const a = pos(), ra = [...row.cells].map(c => Math.round(c.getBoundingClientRect().left));
        const inView = [1, 2, 3].every(i => hr.cells[i].getBoundingClientRect().right <= wr.right + 1 && hr.cells[i].getBoundingClientRect().left >= wr.left);
        const over = w.scrollWidth > w.clientWidth + 1;
        w.scrollLeft = w.scrollWidth; await new Promise(r => setTimeout(r, 100));
        const b = pos(), rb = [...row.cells].map(c => Math.round(c.getBoundingClientRect().left));
        // 고정 열 바로 왼쪽까지 종목명 끝이 보이는지(스크롤 끝)
        const nameEnd = Math.round(row.cells[0].getBoundingClientRect().right), fixL = Math.round(row.cells[1].getBoundingClientRect().left);
        w.scrollLeft = 0;
        const cs = getComputedStyle(row.cells[3]);
        out.push({ over, inView, fixedSame: [1, 2, 3].every(i => Math.abs(a[i] - b[i]) <= 1 && Math.abs(ra[i] - rb[i]) <= 1)   /* 소수 픽셀 반올림 1px 허용(실데이터 확인) */, nameMoved: rb[0] < ra[0], nameEnd, fixL, pos: cs.position, bg: cs.backgroundColor, stk: row.cells[1].classList.contains('stk-edge') });
      }
      return { n: ws.length, out };
    });
    check('설정·해지 상위 표 2개 · 넘침 발생(긴 종목명) · 처음 화면에서 운용사·설정액·NAV 모두 보임', st.n === 2 && st.out.every(o => o.over && o.inView), st.out);
    check('가로 스크롤해도 운용사·설정액·NAV 제자리, 종목명만 이동 · 스크롤 끝에서 종목명 끝 = 고정 열 왼쪽', st.n === 2 && st.out.every(o => o.fixedSame && o.nameMoved && Math.abs(o.nameEnd - o.fixL) <= 2), st.out.map(o => [o.fixedSame, o.nameMoved, o.nameEnd, o.fixL]));
    check('고정 열: sticky · 불투명 배경 · 경계 그림자 열 표시', st.n === 2 && st.out.every(o => o.pos === 'sticky' && o.bg !== 'rgba(0, 0, 0, 0)' && o.stk), st.out.map(o => o.pos + ' ' + o.bg));
    // 흐린 행(강조 선택 외)에서도 고정 열은 불투명(밑의 종목명이 비치지 않음)
    const dim = await p.evaluate(() => { const w = document.querySelector('.flow-topt'), tr = w.querySelector('tbody tr'); tr.classList.add('dim'); const c = tr.cells[2], o = getComputedStyle(c).opacity, a = getComputedStyle(c, '::after').content; tr.classList.remove('dim'); return { o, a }; });
    check('흐린 행: 고정 열 투명도 1 + 흰 덮개(::after)', dim.o === '1' && dim.a !== 'none', dim);
    await p.evaluate(() => { const s = [...document.querySelectorAll('.flow-topt')][0]; s.scrollIntoView({ block: 'center' }); }); await p.waitForTimeout(300);
    await p.screenshot({ path: `${OUT}/${name}_flowtop.png` });
    await p.evaluate(() => document.querySelectorAll('.flow-topt .tbl-scroll').forEach(w => { w.scrollLeft = w.scrollWidth; })); await p.waitForTimeout(200);
    await p.screenshot({ path: `${OUT}/${name}_flowtop_scrolled.png` });
    check('가로 넘침(페이지) 없음', await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    check('스크립트 오류 없음', !errs.length, errs.slice(0, 3).join(' | '));
    await p.close();
  }
  await b.close();
  console.log(fails ? `FAIL ${fails}` : '전부 통과'); process.exit(fails ? 1 : 0);
})();
