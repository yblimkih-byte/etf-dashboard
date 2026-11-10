/* v54 점검 — 운용사별 NAV 순위가 바뀌면(예: 2026-11-09 한투 30.84조 > KB 30.83조) 화면 순서도 기준일 NAV 순위를 따르는지
 *  (v53 까지: 상위 5개사 순서가 삼성·미래·KB·한투·신한 고정 → 한투가 3위여도 카드·막대·표에서 4번째)
 *  ① 기본 자료(시험 자료는 한투 > KB): 카드·막대·표 순서 = 기준일 NAV 큰 순(기타 끝), 한투 3번째  ② KB NAV 를 한투 + 0.01조로 바꾼 자료: KB 3번째·한투 4번째, 결론 줄 '4위'
 *  ③ 요약 탭 막대도 같은 순서  ④ 테마 상세 막대 순서 함수(RANKED)  ⑤ 색은 운용사별 고정
 *  V29B=1 node build_page.js && V29B=1 node build_web.js && CHROME_PATH=/opt/pw-browsers/chromium node v54_shot.js */
const { chromium } = require('playwright'), fs = require('fs');
const OUT = __dirname + '/shots_v54';
(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const b = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/opt/pw-browsers/chromium' });
  let fails = 0; const check = (name, ok, info) => { if (!ok) fails++; console.log((ok ? '  OK   ' : '  FAIL ') + name + (info !== undefined ? ' — ' + (typeof info === 'string' ? info : JSON.stringify(info)) : '')); };
  for (const [file, name, vw] of [['index.html', 'gas', { width: 1568, height: 900 }], ['web.html', 'web', { width: 1920, height: 1000 }]]) {
    console.log(`[${name}]`);
    const p = await b.newPage({ viewport: vw }); const errs = [];
    p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errs.push('console: ' + m.text()); });
    await p.route('**/*', r => /^https?:/.test(r.request().url()) ? r.fulfill({ status: 200, body: '' }) : r.continue());
    await p.goto('file://' + __dirname + '/' + file); await p.waitForSelector('.tab');
    const wait = () => p.waitForFunction(() => !document.querySelector('#view > .loading'), null, { timeout: 90000 }).then(() => p.waitForTimeout(600));
    await wait();
    // byMgr 결과를 바꿔 끼우는 장치: __swap = true 이면 KB NAV = 한투 + 0.01조(차이는 기타에서 빼서 시장 합계 유지)
    await p.evaluate(() => {
      const o = App.call.bind(App); window.__swap = false;
      App.call = (a, q) => o(a, q).then(r => {
        if (a !== 'byMgr' || !window.__swap) return r;
        const x = JSON.parse(JSON.stringify(r)), f = k => x.rows.find(z => z.mgr === k), H = f('한투'), K = f('KB'), E = f('기타');
        const nv = H.nav + 0.01e12; E.nav -= nv - K.nav; K.nav = nv; [K, E].forEach(z => z.ms = z.nav / x.total * 100); return x;
      });
    });
    const read = () => p.evaluate(() => {
      const cards = [...document.querySelectorAll('#view > .head .tile, #stats .cd')].map(t => (t.querySelector('.kt, .cd-k') || {}).textContent.trim().replace(/\s*M\/S.*$/, ''));
      const lede = [...document.querySelectorAll('#view > .head .ld, #lede .ld')].map(x => x.textContent.trim()).join(' / ');
      const sec = [...document.querySelectorAll('#view > .section')].find(s => /상위 5개사 NAV 및 M\/S/.test(s.textContent));
      const bar = App.charts.find(c => c.config.type === 'bar' && c.canvas.isConnected && sec && sec.contains(c.canvas));
      const tb = sec && sec.querySelector('table.tbl'), tbl = tb ? [...tb.tBodies[0].rows].map(r => r.cells[0].textContent.trim()).filter(t => t !== '시장 전체') : [];
      return { cards, lede, stack: bar ? bar.data.datasets.map(z => z.label) : [], colors: bar ? bar.data.datasets.map(z => [z.label, z.backgroundColor]) : [], tbl };
    });
    const expOrder = sw => p.evaluate(async sw => { window.__swap = sw; const g = await App.call('byMgr', { date: App.state.date, ref: App.state.ref || 'py' }); window.__swap = false;
      return g.rows.filter(r => r.mgr !== '기타').sort((a, b) => b.nav - a.nav).map(r => [r.mgr, +(r.nav / 1e12).toFixed(2)]); }, sw);
    for (const sw of [false, true]) {
      const E = await expOrder(sw), ek = E.map(x => x[0]);
      await p.evaluate(sw => { window.__swap = sw; App.show('mgr'); }, sw); await wait();
      const r = await read(); await p.evaluate(() => { window.__swap = false; });
      const tag = sw ? 'KB = 한투 + 0.01조' : '기본 자료';
      check(`운용사별 NAV(${tag}) 카드 순서 = 기준일 NAV 순위`, JSON.stringify(r.cards) === JSON.stringify(ek), `${r.cards.join('·')} / 기대 ${E.map(x => x.join(' ')).join('·')}`);
      check(`운용사별 NAV(${tag}) 막대 순서 = 순위 + 기타 끝`, JSON.stringify(r.stack) === JSON.stringify(ek.concat(['기타'])), r.stack.join('·'));
      check(`운용사별 NAV(${tag}) 표 행 순서 = 순위 + 기타 끝`, JSON.stringify(r.tbl) === JSON.stringify(ek.concat(['기타'])), r.tbl.join('·'));
      check(sw ? 'KB 3번째 · 한투 4번째' : '한투 3번째 · KB 4번째(2026-11-09 와 같은 순위)', sw ? r.cards[2] === 'KB' && r.cards[3] === '한투' : r.cards[2] === '한투' && r.cards[3] === 'KB', r.cards.join('·'));
      check("결론 줄 '상위 5개사 중 n위' = 카드 위치", new RegExp(`상위 5개사 중 ${r.cards.indexOf('한투') + 1}위`).test(r.lede), r.lede.slice(0, 120));
      if (sw) {
        const cl = await p.evaluate(() => Object.fromEntries(['삼성', '미래', 'KB', '한투', '신한', '기타'].map(k => [k, App.color(k)])));
        check('막대 색 = 운용사별 고정 색(순서만 바뀜)', r.colors.every(([k, c]) => c === cl[k]), r.colors.map(x => x.join(' ')).join(' · '));
        await p.screenshot({ path: `${OUT}/${name}_mgr_swap.png` });
      }
      // ③ 요약 탭
      await p.evaluate(sw => { window.__swap = sw; App.show('summary'); }, sw); await wait();
      const s = await read(); await p.evaluate(() => { window.__swap = false; });
      check(`요약(${tag}) 막대 순서 = 순위 + 기타 끝`, JSON.stringify(s.stack) === JSON.stringify(ek.concat(['기타'])), s.stack.join('·'));
    }
    // ④ 테마 상세(같은 막대) — 순서 함수: NAV 큰 순, 같으면 기본 순서, 기타 끝
    const rk = await p.evaluate(() => [RANKED(k => ({ 삼성: 5, 미래: 9, KB: 1, 한투: 2, 신한: 0 })[k]), RANKED(() => 0), RANKED(k => k === '기타' ? 99 : 1)]);
    check('RANKED: NAV 큰 순 · 같으면 기본 순서 · 기타는 값과 무관하게 끝', JSON.stringify(rk) === JSON.stringify([['미래', '삼성', '한투', 'KB', '신한', '기타'], ['삼성', '미래', 'KB', '한투', '신한', '기타'], ['삼성', '미래', 'KB', '한투', '신한', '기타']]), JSON.stringify(rk));
    check('오류 없음', !errs.length, errs.slice(0, 3).join(' | '));
    await p.close();
  }
  await b.close();
  console.log(fails ? `FAIL ${fails}` : 'ALL OK'); process.exit(fails ? 1 : 0);
})();
