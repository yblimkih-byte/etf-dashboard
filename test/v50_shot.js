/* v50 화면 점검 — 유형별 NAV 탭: ① 히트맵 접기(기본 접힘, 펼칠 때 그림, 바로가기 누르면 펼침)
 *  (② 운용사별 유형별 M/S 는 v51 에서 '유형별 NAV·비중' 종합표로 합침 → v51_shot.js 에서 점검)
 *  V29B=1 node build_page.js && V29B=1 node build_web.js && CHROME_PATH=/opt/pw-browsers/chromium node v50_shot.js */
const { chromium } = require('playwright'), fs = require('fs');
const OUT = __dirname + '/shots_v50';
(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const b = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/opt/pw-browsers/chromium' });
  let fails = 0; const check = (name, ok, info) => { if (!ok) fails++; console.log((ok ? '  OK   ' : '  FAIL ') + name + (info !== undefined ? ' — ' + (typeof info === 'string' ? info : JSON.stringify(info)) : '')); };
  for (const [file, name, vw] of [['index.html', 'gas', { width: 1568, height: 900 }], ['web.html', 'web', { width: 1920, height: 1000 }], ['web.html', 'mob', { width: 390, height: 844 }]]) {
    console.log(`[${name}]`);
    const p = await b.newPage({ viewport: vw }); const errs = [];
    p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errs.push('console: ' + m.text()); });
    await p.route('**/*', r => /^https?:/.test(r.request().url()) ? r.fulfill({ status: 200, body: '' }) : r.continue());
    await p.goto('file://' + __dirname + '/' + file); await p.waitForSelector('.tab');
    const wait = () => p.waitForFunction(() => !document.querySelector('#view > .loading'), null, { timeout: 90000 }).then(() => p.waitForTimeout(800));
    await wait(); await p.evaluate(() => App.show('type')); await wait();
    const sec = q => `[...document.querySelectorAll('#view > .section')].find(x => ${q}.test(x.querySelector('.h2').textContent))`;
    const st = await p.evaluate(s => { const secs = [...document.querySelectorAll('#view > .section')].map(x => x.querySelector('.h2').textContent); const h = eval(s); const body = h.querySelector('.sec-body'), btn = h.querySelector('.sec-tg');
      return { secs, collapsed: h.classList.contains('collapsed'), hidden: body.hidden, cells: h.querySelectorAll('.tm-cell').length, btn: btn.textContent, toc: [...document.querySelectorAll('.toc-a')].map(x => x.textContent) }; }, sec('/히트맵/'));
    check('섹션 순서: … 설정액 → 히트맵(마지막)', st.secs.length >= 3 && /설정액/.test(st.secs[st.secs.length - 2]) && /히트맵/.test(st.secs[st.secs.length - 1]), st.secs.join(' | '));
    check("히트맵 기본 접힘: 본문 숨김 · 그림 없음 · 버튼 '펼치기 ▾'", st.collapsed && st.hidden && st.cells === 0 && st.btn === '펼치기 ▾', st);
    await p.evaluate(s => eval(s).querySelector('.sec-tg').click(), sec('/히트맵/'));
    await p.waitForFunction(s => eval(s).querySelectorAll('.tm-cell').length > 0, sec('/히트맵/'), { timeout: 60000 }).catch(() => {});
    const op = await p.evaluate(s => { const h = eval(s); return { hidden: h.querySelector('.sec-body').hidden, cells: h.querySelectorAll('.tm-cell').length, btn: h.querySelector('.sec-tg').textContent, w: h.querySelector('.treemap-host').clientWidth }; }, sec('/히트맵/'));
    check("펼치기 → 히트맵 그림(칸 > 0, 폭 > 0) · 버튼 '접기 ▴'", !op.hidden && op.cells > 0 && op.w > 0 && op.btn === '접기 ▴', op);
    await p.evaluate(s => eval(s).querySelector('.sec-tg').click(), sec('/히트맵/'));
    const cl = await p.evaluate(s => { const h = eval(s); return { hidden: h.querySelector('.sec-body').hidden, cells: h.querySelectorAll('.tm-cell').length }; }, sec('/히트맵/'));
    check('접기 → 다시 숨김(그린 내용 유지)', cl.hidden && cl.cells === op.cells, cl);
    if (st.toc.length) { await p.evaluate(() => { const b = [...document.querySelectorAll('.toc-a')].find(x => /히트맵/.test(x.textContent)); b.click(); }); await p.waitForTimeout(300);
      check('바로가기 히트맵 → 펼침', await p.evaluate(s => !eval(s).querySelector('.sec-body').hidden, sec('/히트맵/')), st.toc.join(' · ')); }
    check('가로 넘침(페이지) 없음', await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    check('스크립트 오류 없음', !errs.length, errs.slice(0, 3).join(' | '));
    await p.close();
  }
  await b.close();
  console.log(fails ? `FAIL ${fails}` : '전부 통과'); process.exit(fails ? 1 : 0);
})();
