const { chromium } = require('playwright');
(async () => {
  const PAGE = process.argv[2], OUT = process.argv[3], W = +(process.argv[4] || 1440);
  const b = await chromium.launch({ executablePath: process.env.CHROME_PATH }); const p = await b.newPage({ viewport: { width: W, height: 1000 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error' && !/ERR_|Failed to load/.test(m.text())) errs.push(m.text()); });
  await p.route('**/*', r => { const u = r.request().url(); if (u.includes('cdnjs.cloudflare.com')) return r.fulfill({ path: __dirname + '/node_modules/chart.js/dist/chart.umd.js', contentType: 'application/javascript' }); if (/^https?:/.test(u)) return r.fulfill({ status: 200, body: '' }); r.continue(); });
  await p.goto('file://' + __dirname + '/' + PAGE); await p.waitForSelector('.tab');
  const out = {};
  for (const t of ['overview', 'mgr', 'type', 'new']) {
    await p.evaluate(id => App.show(id), t);
    await p.waitForFunction(() => !document.querySelector('#view .loading'), null, { timeout: 60000 });
    if (t === 'type') await p.waitForFunction(() => document.querySelector('.tm-legend'), null, { timeout: 60000 });
    await p.waitForTimeout(800);
    out[t] = await p.evaluate(() => ({ lede: (document.getElementById('lede') || {}).innerText, mainW: (document.querySelector('.web main') || document.querySelector('main')).getBoundingClientRect().width, err: (document.querySelector('#view .error') || {}).textContent || null, pos: !!document.querySelector('.pos'), fold: document.querySelectorAll('.fold-item').length, foldHidden: [...document.querySelectorAll('.fold-item')].filter(e => e.hidden).length, cellSample: [...document.querySelectorAll('.tm-c')].slice(0, 3).map(e => e.textContent), tip: (document.querySelector('.tm-cell') || {}).getAttribute && document.querySelector('.tm-cell').getAttribute('data-tip') }));
    await p.screenshot({ path: `${OUT}_${t}.png`, fullPage: false });
  }
  // fold toggle test
  await p.evaluate(() => { App.state.year = '2025'; App.show('new'); }); await p.waitForFunction(() => !document.querySelector('#view .loading'), null, { timeout: 60000 }); await p.waitForTimeout(800); out.new2 = await p.evaluate(() => ({ fold: document.querySelectorAll('.fold-item').length, hidden: [...document.querySelectorAll('.fold-item')].filter(e => e.hidden).length, rows: [...document.querySelectorAll('.grid-2 .tbl tbody tr')].filter(tr=>!tr.hidden).map(tr => tr.cells[0].innerText.trim()) })); await p.screenshot({ path: OUT + '_new2025.png' });
  const fh = await p.$('.fold-head'); if (fh) { await fh.click(); await p.waitForTimeout(300); out.foldAfterClick = await p.evaluate(() => [...document.querySelectorAll('.fold-item')].filter(e => e.hidden).length); }
  console.log(JSON.stringify(out, null, 1), errs.join(' | ') || 'no errors'); await b.close();
})();
