/* v48 화면 점검 — 테마 맵 사분면: 세로 = 상대 점유율(한투 NAV ÷ 최대 경쟁사 NAV, 로그 눈금), 기준선 1배 = 한투 1위
 *  V29B=1 node build_page.js && V29B=1 node build_web.js && CHROME_PATH=/opt/pw-browsers/chromium node v48_shot.js */
const { chromium } = require('playwright'), fs = require('fs');
const OUT = __dirname + '/shots_v48';
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
    const wait = () => p.waitForFunction(() => !document.querySelector('#view > .loading'), null, { timeout: 90000 }).then(() => p.waitForTimeout(700));
    await wait();
    for (const [lens, region] of [['theme', ''], ['struct', '국내']]) {
      await p.evaluate(([l, r]) => { App.state.th = { lens: l, asset: 'S', region: r, exLev: false, sel: null }; App.show('theme'); }, [lens, region]); await wait();
      await p.evaluate(() => App.charts.forEach(c => { c.options.animation = false; c.update('none'); }));
      const r = await p.evaluate(() => {
        const ch = App.charts.find(c => c.config.type === 'bubble'), y = ch.scales.y, a = ch.chartArea, meta = ch.getDatasetMeta(0);
        const pts = ch.data.datasets[0].data.map((q, i) => ({ k: q.p.key, rel: q.p.y, py: meta.data[i].y }));
        const ticks = y.ticks.map(t => y.getLabelForValue ? y.options.ticks.callback(t.value) : '');
        const h = a.bottom - a.top, low = pts.filter(q => q.py > a.bottom - h * 0.2).length / pts.length;
        const onePx = y.getPixelForValue(0);
        const sec = [...document.querySelectorAll('#view > .section')], s1 = sec.find(s => /사분면/.test(s.querySelector('.h2').textContent)), s2 = sec.find(s => /점유율$/.test(s.querySelector('.h2').textContent));
        const th = [...s2.querySelectorAll('thead tr:last-child th')].map(x => x.textContent), ri = th.indexOf('상대 점유율');
        const rows = [...s2.querySelectorAll('tbody tr.clk')].map(tr => ({ k: tr.dataset.key, rel: tr.cells[ri] ? tr.cells[ri].textContent : null, q: tr.cells[tr.cells.length - 1].textContent }));
        const lede = (document.getElementById('lede') || document.querySelector('#view > .head')).textContent;
        const det = (document.querySelector('#view .kv') || {}).textContent || '';
        return { pts, ticks, low, onePx, top: a.top, bottom: a.bottom, note: s1.innerText, sub: s1.querySelector('.h2').nextElementSibling ? s1.innerText.slice(0, 200) : '', ri, rows, lede, det };
      });
      const model = await p.evaluate(async () => { const st = App.state.th, T = App.tabs.find(t => t.id === 'theme'), d = await App.call('theme', T.params(App.state)); if (!d) return null; const M = themeModel(App, d, st);
        return M.list.filter(g => g.nav > 0).map(g => { const comp = Math.max(0, ...Object.values(g.mg)); const rel = g.fNav <= 0 ? 0 : comp ? g.fNav / comp : Infinity; return { k: g.key, rel: g.rel, exp: rel, q: g.quad, chgUp: g.chg >= M.xSplit, rank: g.fRank }; }); });
      const tag = `${lens}${region ? '·' + region : ''}`;
      if (model) {
        check(`${tag}: 상대 점유율 = 한투 NAV ÷ 최대 경쟁사 NAV · 1배 이상 ⇔ 한투 1위`, model.every(m => (m.rel === m.exp || Math.abs(m.rel - m.exp) < 1e-9) && ((m.rel >= 1) === (m.rank === 1) || m.rel === 1)), model.filter(m => m.rel >= 1).map(m => m.k + ' ' + (m.rel === Infinity ? '단독' : m.rel.toFixed(2))).join(', ') || '1위 없음');
        check(`${tag}: 사분면 — 수성·점검 = 한투 1위만, 기회·관망 = 1위 아님`, model.every(m => ['a', 'c'].includes(m.q) === (m.rel >= 1) && ['a', 'b'].includes(m.q) === m.chgUp));
      } else check(`${tag}: 자료 캐시 접근`, false);
      check(`${tag}: 세로축 로그 눈금(배) · 1배 눈금 · 기준선 1배`, r.ticks.includes('1배') && r.ticks.every(t => /배$|상품 없음/.test(t)) && r.onePx > r.top && r.onePx < r.bottom, r.ticks.join(' '));
      check(`${tag}: 원이 아래 20% 구간에 몰리지 않음(60% 미만)`, r.low < 0.6, (r.low * 100).toFixed(0) + '%');
      check(`${tag}: '상품 없음' 줄 — 한투 상품 없는 항목이 있을 때만`, r.pts.some(q => !(q.rel > 0)) === r.ticks.includes('상품 없음'), r.pts.filter(q => !(q.rel > 0)).map(q => q.k).join(', ') || '없음');
      check(`${tag}: 설명 — 상대 점유율 정의·1배 기준선·로그 눈금`, /상대 점유율: 한투 NAV ÷ 최대 경쟁사 NAV — 1배 이상이면 한투가 1위/.test(r.note) && /가로 점선 = 1배/.test(r.note) && /로그 눈금/.test(r.note), r.note.slice(0, 120));
      check(`${tag}: 표 '상대 점유율' 열(배·'-'·단독) · 구분 열 = 판정`, r.ri > 0 && r.rows.every(x => /^[\d.]+배$|^-$|^단독$|^0\.01배 미만$/.test(x.rel)) && model && r.rows.every(x => { const m = model.find(y => y.k === x.k); return !m || x.q === { a: '수성', b: '기회', c: '점검', d: '관망' }[m.q]; }), r.rows.slice(0, 4).map(x => x.k + ':' + x.rel + ':' + x.q).join(' | '));
      check(`${tag}: 상세 '상대 점유율 x배 (최대 경쟁사 …)' · 결론 줄 '1위 아님'`, (/상대 점유율 [\d.]+배|상대 점유율 단독|상품 없음/.test(r.det)) && (!/기회 구간/.test(r.lede) || /한투 1위 아님/.test(r.lede)), r.det.slice(0, 120));
      const s = await p.evaluate(() => { const c = App.charts.find(c => c.config.type === 'bubble').canvas.closest('.section'); c.scrollIntoView({ block: 'start' }); return true; });
      await p.waitForTimeout(300); await p.screenshot({ path: `${OUT}/${name}_${lens}${region ? '_dom' : ''}.png` });
    }
    // 경계값: 한투 1위(2.89배)·단독(Infinity)·상품 없음(0)·아주 작은 값(0.004배)
    const e = await p.evaluate(() => {
      const host = document.createElement('div'); host.style.cssText = 'width:900px'; document.getElementById('view').appendChild(host);
      const pts = [['1위', 2.89, 3e12], ['단독', Infinity, 1e12], ['없음', 0, 2e12], ['작음', 0.004, 5e12], ['보통', 0.12, 9e12]].map(([k, y, x]) => ({ key: k, label: k, x: x, y: y, size: 1e12, color: '#1863dc' }));
      const ch = App.bubble(App.canvas(host, 'tall'), pts, { xSplit: 3e12, ySplit: 1, yLog: true, quads: { a: '수성', b: '기회', c: '점검', d: '관망' } }); ch.options.animation = false; ch.update('none');
      const y = ch.scales.y, a = ch.chartArea, meta = ch.getDatasetMeta(0), py = k => meta.data[pts.findIndex(p => p.key === k)].y;
      const labels = y.ticks.map(t => y.options.ticks.callback(t.value));
      const r = { labels, inArea: meta.data.every(el => el.y >= a.top - 1 && el.y <= a.bottom + 1), order: py('단독') < py('1위') && py('1위') < y.getPixelForValue(0) && y.getPixelForValue(0) < py('보통') && py('보통') < py('작음') && py('작음') < py('없음') };
      ch.destroy(); App.charts = App.charts.filter(c => c !== ch); host.remove(); return r;
    });
    check('경계값: 단독(맨 위) > 1위(2.89배) > 1배 기준선 > 0.12배 > 0.004배(0.01배 줄) > 상품 없음(맨 아래) · 모두 그림 안', e.inArea && e.order && e.labels.includes('상품 없음') && e.labels.includes('5배'), e.labels.join(' '));
    check('스크립트 오류 없음', !errs.length, errs.slice(0, 3).join(' | '));
    await p.close();
  }
  await b.close();
  console.log(fails ? `FAIL ${fails}` : '전부 통과'); process.exit(fails ? 1 : 0);
})();
