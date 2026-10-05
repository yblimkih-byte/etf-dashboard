/* 요약 시안(web/preview.html, React + shadcn/ui) 점검 — CHROME_PATH=/opt/pw-browsers/chromium TZ=Asia/Seoul node test/preview_shot.js
 *  모의 시트(store.json)로 실제 gas/*.gs API 를 돌리는 로컬 서버(/api/data) + 정적 preview.html → 화면 캡처·오류·주요 문구 점검 */
const fs = require('fs'), path = require('path'), vm = require('vm'), http = require('http');
const { chromium } = require('playwright');
const ctx = { console: { log: () => {} }, Date, Math, JSON, Object, Array, String, Number, RegExp, Error, isNaN, setTimeout, globalThis: null, __zlib: require('zlib'), __Buffer: Buffer };
ctx.globalThis = ctx; vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname, 'shim.js'), 'utf8'), ctx);
for (const f of fs.readdirSync(path.join(__dirname, '..', 'gas')).filter(f => f.endsWith('.gs'))) vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'gas', f), 'utf8'), ctx, { filename: f });
ctx.__s = JSON.parse(fs.readFileSync(path.join(__dirname, 'store.json'), 'utf8'));
vm.runInContext(`(function(){ const ss = SpreadsheetApp.getActiveSpreadsheet(); Object.keys(__s.store).forEach(n => { const sh = ss.insertSheet(n); sh.rows = JSON.parse(JSON.stringify(__s.store[n])); }); Object.keys(__s.props).forEach(k => PropertiesService.getScriptProperties().setProperty(k, __s.props[k])); })()`, ctx);
const OUT = path.join(__dirname, 'shots_preview'); fs.mkdirSync(OUT, { recursive: true });
const html = fs.readFileSync(path.join(__dirname, '..', 'web', 'preview.html'));
const calls = [];
const srv = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  if (u.pathname === '/api/data') {
    const a = u.searchParams.get('action'), p = JSON.parse(u.searchParams.get('p') || '{}'); calls.push(a + ' ' + JSON.stringify(p));
    ctx.__a = a; ctx.__p = p;
    const body = vm.runInContext(`api(__a, __p)`, ctx);
    res.writeHead(200, { 'content-type': 'application/json' }); return res.end(body);
  }
  if (u.pathname === '/' || u.pathname === '/preview') { res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); return res.end(html); }
  res.writeHead(404); res.end('');
});
(async () => {
  await new Promise(r => srv.listen(0, r)); const port = srv.address().port;
  const b = await chromium.launch({ executablePath: process.env.CHROME_PATH });
  let fails = 0; const check = (name, ok, info) => { if (!ok) fails++; console.log((ok ? '  OK   ' : '  FAIL ') + name + (info !== undefined ? ' — ' + info : '')); };
  for (const [w, h, name] of [[1440, 900, 'desktop'], [390, 844, 'mobile']]) {
    const p = await b.newPage({ viewport: { width: w, height: h } }); const errs = [];
    p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
    await p.route(/^https:\/\//, r => r.fulfill({ status: 200, body: '' }));
    await p.goto(`http://localhost:${port}/preview`);
    await p.waitForSelector('text=유형별 M/S 기여', { timeout: 60000 }); await p.waitForTimeout(800);
    const info = await p.evaluate(() => ({ hero: document.querySelector('.text-5xl')?.textContent, kv: [...document.querySelectorAll('dl > div')].map(d => d.textContent), seg: document.querySelectorAll('.recharts-bar-rectangle').length,
      overflowX: document.documentElement.scrollWidth > window.innerWidth + 1, raw: (document.body.innerText.match(/범례_\S*|유형최종\d|신규상장용|시트 메뉴/g) || []) }));
    console.log(`[${name}] hero ${info.hero}`); if (name === 'desktop') console.log('     ' + info.kv.join('\n     '));
    check(name + ': 핵심 요약 5행', info.kv.length === 5);
    check(name + ': 상위 5개사 막대(2행 × 6칸)', info.seg === 12, info.seg);
    check(name + ': 가로 스크롤 없음', !info.overflowX);
    check(name + ': 내부 용어 없음', info.raw.length === 0, info.raw.join(','));
    const real = errs.filter(e => !/404/.test(e));   // 로컬 서버에 favicon 없음
    check(name + ': 페이지 오류 없음', real.length === 0, real.join(' | ') || 'none');
    await p.screenshot({ path: `${OUT}/${name}.png`, fullPage: true });
    if (name === 'desktop') {
      await p.hover('ul[aria-label="유형별 M/S 기여"] li:first-child button'); await p.waitForTimeout(300);
      check('기여 막대 툴팁', await p.locator('[data-slot=tooltip-content]').count() > 0);
      await p.screenshot({ path: `${OUT}/desktop_tooltip.png`, clip: { x: 240, y: 60, width: 760, height: 700 } });
      await p.click('[role=radio]:has-text("전월말")'); await p.waitForTimeout(1200);
      const pm = await p.evaluate(() => document.querySelector('dl')?.textContent || '');
      check('비교 기준 전월말 전환 → 문구 갱신', /전월말 대비/.test(pm), pm.slice(0, 80));
      await p.click('[data-slot=select-trigger]'); await p.waitForTimeout(300);
      check('기준일 선택 목록(Radix Select) 열림', await p.locator('[data-slot=select-item]').count() > 5, await p.locator('[data-slot=select-item]').count());
      await p.screenshot({ path: `${OUT}/desktop_select.png`, clip: { x: 700, y: 0, width: 740, height: 520 } });
    }
    await p.close();
  }
  console.log('     API 호출: ' + [...new Set(calls.map(c => c.split(' ')[0]))].join(', '));
  await b.close(); srv.close();
  console.log(fails ? `\n실패 ${fails}건` : '\n모두 통과'); process.exit(fails ? 1 : 0);
})();
