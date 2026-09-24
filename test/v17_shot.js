/* v17 적재 상태 표시 확인: node v17_shot.js → shots_v17/{web,gas}.png */
const { chromium } = require('playwright'), fs = require('fs');
(async () => {
  fs.mkdirSync(__dirname + '/shots_v17', { recursive: true });
  const b = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined });
  for (const [page, name, w] of [['web.html', 'web', 1280], ['index.html', 'gas', 1280], ['web.html', 'web_narrow', 900]]) {
    const p = await b.newPage({ viewport: { width: w, height: 800 } }); const errs = [];
    p.on('pageerror', e => errs.push(e.message));
    await p.route('**/*', r => { const u = r.request().url(); if (/^https?:/.test(u)) return r.fulfill({ status: 200, body: '' }); r.continue(); });
    await p.goto('file://' + __dirname + '/' + page); await p.waitForSelector('.tab'); await p.waitForTimeout(1500);
    const info = await p.evaluate(() => { const m = document.getElementById('hdrMeta'), f = m.closest('.side-foot'); return { meta: m.innerText, foot: f ? f.innerText : null, warn: f ? f.classList.contains('warn') : !!m.querySelector('.ld-note.warn'), title: f ? f.title : null }; });
    await p.screenshot({ path: `${__dirname}/shots_v17/${name}.png` });
    console.log(name, JSON.stringify(info), errs.join(' | ') || 'no errors'); await p.close();
  }
  await b.close();
})();
