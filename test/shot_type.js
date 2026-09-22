const { chromium } = require('playwright');
(async () => {
  const PAGE = process.argv[2], OUT = process.argv[3], W = +(process.argv[4] || 1440);
  const b = await chromium.launch({executablePath: process.env.CHROME_PATH}); const p = await b.newPage({ viewport: { width: W, height: 1100 } });
  const errs=[]; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type()==='error') errs.push(m.text()); });
  await p.goto('file://' + __dirname + '/' + PAGE); await p.waitForSelector('.tab');
  await p.evaluate(() => App.show('type'));
  await p.waitForFunction(() => document.querySelector('.tm-legend'), null, { timeout: 60000 }); await p.waitForTimeout(800);
  const h = await p.$('.treemap-host'); await h.screenshot({ path: OUT });
  const stats = await p.evaluate(() => ({ groups: document.querySelectorAll('.tm-group').length, mgrs: document.querySelectorAll('.tm-mgr').length, cells: document.querySelectorAll('.tm-cell').length, heads: [...document.querySelectorAll('.tm-mhead')].slice(0,12).map(e=>e.textContent) }));
  console.log(JSON.stringify(stats), errs.join(' | ') || 'no errors'); await b.close();
})();
