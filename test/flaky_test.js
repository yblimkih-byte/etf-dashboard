/* v109 검증: /api/data 를 실제 GAS 코드(모의 시트)로 응답하되 50% 확률로 502 → 모든 탭이 오류 없이 뜨는지 */
const fs = require('fs'), vm = require('vm'), path = require('path'), { chromium } = require('playwright');
const ctx = { console, Date, Math, JSON, Object, Array, String, Number, RegExp, Error, isNaN, setTimeout }; ctx.globalThis = ctx; vm.createContext(ctx);
vm.runInContext(fs.readFileSync(__dirname + '/shim.js', 'utf8'), ctx);
for (const f of fs.readdirSync(__dirname + '/../gas').filter(f => f.endsWith('.gs'))) vm.runInContext(fs.readFileSync(__dirname + '/../gas/' + f, 'utf8'), ctx, { filename: f });
ctx.__s = JSON.parse(fs.readFileSync(__dirname + '/store.json', 'utf8'));
vm.runInContext('(function(){const ss=SpreadsheetApp.getActiveSpreadsheet();Object.keys(__s.store).forEach(n=>{const sh=ss.insertSheet(n);sh.rows=__s.store[n];});Object.keys(__s.props).forEach(k=>PropertiesService.getScriptProperties().setProperty(k,__s.props[k]));})()', ctx);
const pub = path.join(__dirname, '..', 'web', 'public');
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROME_PATH }); const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  let n = 0, fail = 0, maxConc = 0, conc = 0; const errs = [];
  p.on('pageerror', e => errs.push('PAGEERROR ' + e.message));
  await p.route('**/*', async route => {
    const u = new URL(route.request().url());
    if (u.pathname === '/api/data') {
      n++; conc++; maxConc = Math.max(maxConc, conc);
      await new Promise(r => setTimeout(r, 150));
      const bad = u.searchParams.get('action') !== 'meta' && Math.random() < 0.5;
      conc--;
      if (bad) { fail++; return route.fulfill({ status: 502, contentType: 'application/json', body: '{"ok":false,"error":"x"}' }); }
      const out = vm.runInContext(`api(${JSON.stringify(u.searchParams.get('action'))}, ${u.searchParams.get('p') || '{}'})`, ctx);
      return route.fulfill({ status: 200, contentType: 'application/json', body: out });
    }
    if (u.hostname === 'cdnjs.cloudflare.com') return route.fulfill({ path: __dirname + '/node_modules/chart.js/dist/chart.umd.js', contentType: 'application/javascript' });
    if (u.hostname !== 'test.local') return route.fulfill({ status: 200, body: '' });
    const f = path.join(pub, u.pathname === '/' ? 'index.html' : u.pathname);
    if (fs.existsSync(f) && fs.statSync(f).isFile()) return route.fulfill({ path: f });
    return route.continue();
  });
  await p.goto('http://test.local/'); await p.waitForSelector('.tab', { timeout: 30000 });
  const res = [];
  for (const t of ['overview', 'mgr', 'type', 'shares', 'top', 'new', 'turnover']) {
    await p.evaluate(id => App.show(id), t);
    await p.waitForFunction(() => !document.querySelector('#view .loading'), null, { timeout: 60000 }).catch(() => {});
    await p.waitForTimeout(t === 'type' ? 9000 : 600);
    res.push(t + ':' + await p.evaluate(() => { const e = document.querySelector('#view .error'); return e ? 'ERROR ' + e.textContent : 'ok'; }));
  }
  console.log(res.join('  '), `| requests ${n}, injected 502 ${fail}, max concurrent ${maxConc}`, errs.join(' ') || '');
  await b.close();
})();
