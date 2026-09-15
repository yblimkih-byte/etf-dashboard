const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1360, height: 900 } });
  const errs = [];
  p.on('pageerror', e => errs.push('PAGEERROR ' + e.stack.split('\n').slice(0,4).join(' | ')));
  p.on('console', m => { if (m.type() === 'error') errs.push('CONSOLE ' + m.text()); });
  await p.goto('file://' + __dirname + '/index.html');
  await p.waitForSelector('.tab', { timeout: 30000 });
  const tabs = ['overview', 'mgr', 'type', 'shares', 'top', 'new', 'turnover'];
  for (const t of tabs) {
    await p.click(`.tab[data-id="${t}"]`);
    await p.waitForFunction(() => !document.querySelector('#view .loading'), null, { timeout: 60000 });
    await p.waitForTimeout(1200);
    if (t === 'shares') { await p.selectOption('#controls select:nth-of-type(1) >> nth=0', { index: 0 }).catch(() => {}); const sels = await p.$$('#controls select'); if (sels[1]) { await sels[1].selectOption('키움'); await p.waitForTimeout(1200); } }
    if (t === 'new') { const sels = await p.$$('#controls select'); await sels[0].selectOption('2025'); await p.waitForTimeout(2000); }
    if (t === 'top') { await p.waitForTimeout(1500); await p.click('.race-play').catch(() => {}); await p.waitForTimeout(2500); }
    const err = await p.$eval('#view', el => el.querySelector('.error') ? el.querySelector('.error').textContent : '');
    console.log(t, err ? 'ERROR: ' + err : 'ok', 'height', await p.evaluate(() => document.body.scrollHeight));
    const h = await p.evaluate(() => document.body.scrollHeight); await p.setViewportSize({ width: 1360, height: Math.min(h, 4500) }); await p.waitForTimeout(800); await p.screenshot({ path: `${__dirname}/shot_${t}.png` }); await p.setViewportSize({ width: 1360, height: 900 });
  }
  console.log(errs.length ? errs.join('\n') : 'no js errors');
  await b.close();
})();
