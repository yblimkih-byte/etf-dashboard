const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROME_PATH }); const p = await b.newPage({ viewport: { width: 1440, height: 800 } });
  await p.route('**/*', r => { const u = r.request().url(); if (u.includes('cdnjs.cloudflare.com')) return r.fulfill({ path: __dirname + '/node_modules/chart.js/dist/chart.umd.js', contentType: 'application/javascript' }); if (/^https?:/.test(u)) return r.fulfill({ status: 200, body: '' }); r.continue(); });
  for (const page of ['web.html', 'index.html']) {
    await p.goto('file://' + __dirname + '/' + page); await p.waitForSelector('.tab');
    await p.evaluate(() => { App.state.year = '2025'; App.show('new'); }); await p.waitForFunction(() => !document.querySelector('#view .loading'), null, { timeout: 60000 }); await p.waitForTimeout(500);
    const r = await p.evaluate(() => { const rows = document.querySelectorAll('.sticky-sec .tbl tbody tr'); rows[Math.min(rows.length - 1, 25)].scrollIntoView(); return new Promise(res => setTimeout(() => res({ hdrH: getComputedStyle(document.documentElement).getPropertyValue('--hdr-h'), secTop: document.querySelector('.sticky-sec .section-h').getBoundingClientRect().top, chipsTop: document.querySelector('.sticky-chips').getBoundingClientRect().top, scrollY: window.scrollY, rows: rows.length }), 300)); });
    await p.screenshot({ path: `/mnt/user-data/outputs/v110_sticky_${page.split('.')[0]}.png` });
    console.log(page, JSON.stringify(r));
  }
  await b.close();
})();
