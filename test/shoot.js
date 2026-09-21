const { chromium } = require('playwright');
(async () => {
  const PAGE = process.argv[2] || 'index.html', OUT = process.argv[3] || '.', W = +(process.argv[4] || 1360);
  require('fs').mkdirSync(__dirname + '/' + OUT, { recursive: true });
  const b = await chromium.launch({executablePath: process.env.CHROME_PATH || undefined}); const p = await b.newPage({ viewport: { width: W, height: 900 } });
  const errs = [];
  p.on('pageerror', e => errs.push('PAGEERROR ' + e.stack.split('\n').slice(0,4).join(' | ')));
  p.on('console', m => { if (m.type() === 'error') errs.push('CONSOLE ' + m.text()); });
  await p.goto('file://' + __dirname + '/' + PAGE);
  await p.waitForSelector('.tab', { timeout: 30000 });
  const tabs = ['overview', 'mgr', 'type', 'shares', 'top', 'new', 'turnover'];
  for (const t of tabs) {
    if (W > 900) await p.click(`.tab[data-id="${t}"]`); else await p.evaluate(id => App.show(id), t);   // 좁은 화면에서는 탭이 서랍 안에 있음
    await p.waitForFunction(() => !document.querySelector('#view .loading'), null, { timeout: 60000 });
    await p.waitForTimeout(1200);
    if (t === 'shares') { await p.selectOption('#controls select:nth-of-type(1) >> nth=0', { index: 0 }).catch(() => {}); const sels = await p.$$('#controls select'); if (sels[1]) { await sels[1].selectOption('키움'); await p.waitForTimeout(1200); } }
    if (t === 'new') { const sels = await p.$$('#controls select'); await sels[0].selectOption('2025'); await p.waitForTimeout(2000); }
    if (t === 'top') { await p.waitForTimeout(1500); await p.click('.race-play').catch(() => {}); await p.waitForTimeout(2500); }
    const err = await p.$eval('#view', el => el.querySelector('.error') ? el.querySelector('.error').textContent : '');
    console.log(t, err ? 'ERROR: ' + err : 'ok', 'height', await p.evaluate(() => document.body.scrollHeight));
    const h = await p.evaluate(() => document.body.scrollHeight); await p.setViewportSize({ width: W, height: Math.min(h, 4500) }); await p.waitForTimeout(800); await p.screenshot({ path: `${__dirname}/${OUT}/shot_${t}.png` }); await p.setViewportSize({ width: W, height: 900 });
  }
  console.log(errs.length ? errs.join('\n') : 'no js errors');
  await b.close();
})();
