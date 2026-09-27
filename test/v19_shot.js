/* v19 화면 점검: ACE 강조·비교 기준·표 도구·히트맵·요약 탭 (web.html / index.html) */
const { chromium } = require('playwright'), fs = require('fs');
(async () => {
  fs.mkdirSync(__dirname + '/shots_v19', { recursive: true });
  const b = await chromium.launch({ executablePath: process.env.CHROME_PATH });
  for (const [page, name] of [['web.html', 'web'], ['index.html', 'gas']]) {
    const p = await b.newPage({ viewport: { width: 1400, height: 900 } }); const errs = [];
    p.on('pageerror', e => errs.push(e.message));
    await p.route('**/*', r => /^https?:/.test(r.request().url()) ? r.fulfill({ status: 200, body: '' }) : r.continue());
    await p.goto('file://' + __dirname + '/' + page); await p.waitForSelector('.tab');
    const wait = () => p.waitForFunction(() => !document.querySelector('#view > .loading'), null, { timeout: 60000 }).then(() => p.waitForTimeout(700));
    await wait();
    const r = {};
    r.firstTab = await p.evaluate(() => App.state.tab);
    r.sumLines = await p.evaluate(() => document.querySelectorAll('.sum-lines li').length);
    // 비교 기준 → 전분기말
    await p.evaluate(() => App.show('mgr')); await wait();
    await p.evaluate(() => { const se = [...document.querySelectorAll('#controls select')].find(s => [...s.options].some(o => o.value === 'pq')); se.value = 'pq'; se.dispatchEvent(new Event('change')); }); await wait();
    r.refText = await p.evaluate(() => document.querySelector('.grp-row').textContent.trim().slice(0, 40) + ' | ' + document.querySelector('.section .note').textContent);
    r.contribTables = await p.evaluate(() => document.querySelectorAll('.section table').length);
    // ACE 강조 토글
    await p.click('.seg-one'); await wait();
    r.focus = await p.evaluate(() => ({ body: document.body.classList.contains('focus-on'), colors: App.charts[0].data.datasets.map(d => d.backgroundColor).slice(0, 4), dimRows: [...document.querySelectorAll('tr[data-top]')].filter(tr => getComputedStyle(tr.cells[1]).opacity !== '1').length }));
    await p.screenshot({ path: `${__dirname}/shots_v19/${name}_mgr_focus.png`, fullPage: false });
    // 상위 ETF: 표 도구 (검색·정렬·CSV 버튼)
    await p.evaluate(() => App.show('top')); await wait(); await p.waitForTimeout(1500);
    r.tools = await p.evaluate(() => { const t = [...document.querySelectorAll('.tbl-tools')]; const q = t[t.length - 1].querySelector('.tbl-q'); q.value = 'KODEX'; q.dispatchEvent(new Event('input')); const tb = t[t.length - 1].nextElementSibling.querySelector('table'); const th = tb.querySelector('th[data-sort="5"]'); th.click(); th.click(); const first = tb.tBodies[0].querySelector('tr:not(.q-hide)'); return { tools: t.length, cnt: t[t.length - 1].querySelector('.tbl-cnt').textContent, firstAfterSort: first && first.cells[2].textContent + ' ' + first.cells[5].textContent, sortCls: th.className }; });
    r.raceDim = await p.evaluate(() => [...document.querySelectorAll('.race-fill')].slice(0, 3).map(e => e.style.background));
    // 히트맵 (강조)
    await p.evaluate(() => App.show('type')); await wait(); await p.waitForSelector('.tm-cell', { timeout: 60000 }); await p.waitForTimeout(500);
    r.tm = await p.evaluate(() => { const c = [...document.querySelectorAll('.tm-cell')]; return { cells: c.length, named: c.filter(x => x.querySelector('.tm-n')).length, shortNames: c.filter(x => x.querySelector('.tm-n') && x.querySelector('.tm-n').textContent.length < 6).length, focus: c.filter(x => x.dataset.top === '한투').length, legend: document.querySelector('.tm-legend').textContent.slice(0, 12) }; });
    await p.screenshot({ path: `${__dirname}/shots_v19/${name}_type_focus.png`, fullPage: true });
    // 거래대금 로딩 문구 · 회전율
    await p.evaluate(() => App.show('turnover')); r.loadMsg = await p.evaluate(() => (document.querySelector('#view > .loading') || {}).textContent || '(이미 로드)'); await wait();
    r.turn = await p.evaluate(() => { const th = [...document.querySelectorAll('.section table th')].map(t => t.textContent); return th.filter(t => /회전율|NAV/.test(t)); });
    // 신규상장 막대 수
    await p.evaluate(() => { App.state.year = '2025'; App.show('new'); }); await wait();
    r.newBars = await p.evaluate(() => App.charts[0].data.labels);
    await p.evaluate(() => App.show('summary')); await wait();
    await p.screenshot({ path: `${__dirname}/shots_v19/${name}_summary.png`, fullPage: true });
    console.log(name, JSON.stringify(r), '\n  errors:', errs.join(' | ') || 'none'); await p.close();
  }
  await b.close();
})();
