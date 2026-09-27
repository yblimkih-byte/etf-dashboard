/* v18 화면 점검: 상위 ETF(M/S 막대·고정 제목/칩·문구 삭제) · 신규상장 NAV 표기 */
const { chromium } = require('playwright'), fs = require('fs');
(async () => {
  fs.mkdirSync(__dirname + '/shots_v18', { recursive: true });
  const b = await chromium.launch({ executablePath: process.env.CHROME_PATH });
  for (const [page, name] of [['web.html', 'web'], ['index.html', 'gas']]) {
    const p = await b.newPage({ viewport: { width: 1280, height: 900 } }); const errs = [];
    p.on('pageerror', e => errs.push(e.message));
    await p.route('**/*', r => /^https?:/.test(r.request().url()) ? r.fulfill({ status: 200, body: '' }) : r.continue());
    await p.goto('file://' + __dirname + '/' + page); await p.waitForSelector('.tab');
    await p.evaluate(() => App.show('top'));
    await p.waitForSelector('.race-ms-seg', { timeout: 60000 }); await p.waitForTimeout(800);
    const top = await p.evaluate(() => {
      const segs = () => [...document.querySelectorAll('.race-ms-seg')].filter(e => e.style.display !== 'none').map(e => e.textContent + '|' + (+e.style.flexGrow).toFixed(1));
      const before = { ym: document.querySelector('.race-ym').textContent, segs: segs() };
      const rg = document.querySelector('.race-range'); rg.value = 0; rg.dispatchEvent(new Event('input'));
      const after = { ym: document.querySelector('.race-ym').textContent, segs: segs(), sum: [...document.querySelectorAll('.race-ms-seg')].reduce((s, e) => s + (+e.style.flexGrow || 0), 0).toFixed(2) };
      rg.value = rg.max; rg.dispatchEvent(new Event('input'));
      const txt = document.getElementById('view').innerText;
      const s3 = [...document.querySelectorAll('.section')].find(s => /NAV 상위 [0-9]+ ETF$/.test(s.querySelector('.h2').textContent.trim()));
      const order = (() => { const bar = document.querySelector('.race-bar'), ms = document.querySelector('.race-ms'), st = document.querySelector('.race-stage'); return bar.compareDocumentPosition(ms) & 4 && ms.compareDocumentPosition(st) & 4; })();
      return { before, after, order: !!order, hint: /재생 또는 슬라이더/.test(txt), pct100: /합계 = 100%/.test(txt), s3: s3 && { sticky: s3.classList.contains('sticky-sec'), chips: !!s3.querySelector('.sticky-chips'), subs: [...s3.querySelectorAll('.sub-h')].map(e => e.textContent), tables: s3.querySelectorAll('table').length, secH: s3.style.getPropertyValue('--sec-h') }, oldList: /상위 [0-9]+ ETF 목록/.test([...document.querySelectorAll('.h2')].map(h => h.textContent).join('|')) };
    });
    await (await p.$('.race')).screenshot({ path: `${__dirname}/shots_v18/${name}_race.png` });
    // 스크롤 고정 확인: 목록 중간까지 내린 뒤 제목·칩 위치
    const stick = await p.evaluate(async () => {
      const s3 = document.querySelector('.section.sticky-sec'); const rows = s3.querySelectorAll('table')[1].querySelectorAll('tbody tr');
      rows[30].scrollIntoView({ block: 'center' }); await new Promise(r => setTimeout(r, 300));
      const h = s3.querySelector('.section-h').getBoundingClientRect(), c = s3.querySelector('.sticky-chips').getBoundingClientRect(), hdr = (document.querySelector('.top, .hdr-wrap')).getBoundingClientRect();
      return { hdrBottom: Math.round(hdr.bottom), titleTop: Math.round(h.top), titleBottom: Math.round(h.bottom), chipsTop: Math.round(c.top) };
    });
    await p.screenshot({ path: `${__dirname}/shots_v18/${name}_top_scrolled.png` });
    await p.evaluate(() => { window.scrollTo(0, 0); App.state.year = '2025'; App.show('new'); });
    await p.waitForFunction(() => !document.querySelector('#view .loading'), null, { timeout: 60000 }); await p.waitForTimeout(600);
    const nl = await p.evaluate(() => { const t = [...document.querySelectorAll('.sticky-sec table tbody tr')].map(tr => tr.cells[tr.cells.length - 1].innerText); return { n: t.length, sample: t.slice(0, 3).concat(t.slice(-3)) }; });
    console.log(name, JSON.stringify({ top, stick, nl }, null, 0), errs.join(' | ') || 'no errors'); await p.close();
  }
  await b.close();
})();
