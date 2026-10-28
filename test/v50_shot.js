/* v50 화면 점검 — 유형별 NAV 탭: ① 히트맵 접기(기본 접힘, 펼칠 때 그림, 바로가기 누르면 펼침) ② 운용사별 유형별 M/S(1~5위 + 기타 소계 펼치기) · 잔고·M/S 변동
 *  V29B=1 node build_page.js && V29B=1 node build_web.js && CHROME_PATH=/opt/pw-browsers/chromium node v50_shot.js */
const { chromium } = require('playwright'), fs = require('fs');
const OUT = __dirname + '/shots_v50';
(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const b = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/opt/pw-browsers/chromium' });
  let fails = 0; const check = (name, ok, info) => { if (!ok) fails++; console.log((ok ? '  OK   ' : '  FAIL ') + name + (info !== undefined ? ' — ' + (typeof info === 'string' ? info : JSON.stringify(info)) : '')); };
  for (const [file, name, vw] of [['index.html', 'gas', { width: 1568, height: 900 }], ['web.html', 'web', { width: 1920, height: 1000 }], ['web.html', 'mob', { width: 390, height: 844 }]]) {
    console.log(`[${name}]`);
    const p = await b.newPage({ viewport: vw }); const errs = [];
    p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errs.push('console: ' + m.text()); });
    await p.route('**/*', r => /^https?:/.test(r.request().url()) ? r.fulfill({ status: 200, body: '' }) : r.continue());
    await p.goto('file://' + __dirname + '/' + file); await p.waitForSelector('.tab');
    const wait = () => p.waitForFunction(() => !document.querySelector('#view > .loading'), null, { timeout: 90000 }).then(() => p.waitForTimeout(800));
    await wait(); await p.evaluate(() => App.show('type')); await wait();
    const sec = q => `[...document.querySelectorAll('#view > .section')].find(x => ${q}.test(x.querySelector('.h2').textContent))`;
    const st = await p.evaluate(s => { const secs = [...document.querySelectorAll('#view > .section')].map(x => x.querySelector('.h2').textContent); const h = eval(s); const body = h.querySelector('.sec-body'), btn = h.querySelector('.sec-tg');
      return { secs, collapsed: h.classList.contains('collapsed'), hidden: body.hidden, cells: h.querySelectorAll('.tm-cell').length, btn: btn.textContent, toc: [...document.querySelectorAll('.toc-a')].map(x => x.textContent) }; }, sec('/히트맵/'));
    check('섹션 순서: … 설정액 → 운용사별 유형별 M/S → 히트맵(마지막)', st.secs.length >= 4 && /운용사별 유형별 M\/S/.test(st.secs[st.secs.length - 2]) && /히트맵/.test(st.secs[st.secs.length - 1]), st.secs.join(' | '));
    check("히트맵 기본 접힘: 본문 숨김 · 그림 없음 · 버튼 '펼치기 ▾'", st.collapsed && st.hidden && st.cells === 0 && st.btn === '펼치기 ▾', st);
    await p.evaluate(s => eval(s).querySelector('.sec-tg').click(), sec('/히트맵/'));
    await p.waitForFunction(s => eval(s).querySelectorAll('.tm-cell').length > 0, sec('/히트맵/'), { timeout: 60000 }).catch(() => {});
    const op = await p.evaluate(s => { const h = eval(s); return { hidden: h.querySelector('.sec-body').hidden, cells: h.querySelectorAll('.tm-cell').length, btn: h.querySelector('.sec-tg').textContent, w: h.querySelector('.treemap-host').clientWidth }; }, sec('/히트맵/'));
    check("펼치기 → 히트맵 그림(칸 > 0, 폭 > 0) · 버튼 '접기 ▴'", !op.hidden && op.cells > 0 && op.w > 0 && op.btn === '접기 ▴', op);
    await p.evaluate(s => eval(s).querySelector('.sec-tg').click(), sec('/히트맵/'));
    const cl = await p.evaluate(s => { const h = eval(s); return { hidden: h.querySelector('.sec-body').hidden, cells: h.querySelectorAll('.tm-cell').length }; }, sec('/히트맵/'));
    check('접기 → 다시 숨김(그린 내용 유지)', cl.hidden && cl.cells === op.cells, cl);
    if (st.toc.length) { await p.evaluate(() => { const b = [...document.querySelectorAll('.toc-a')].find(x => /히트맵/.test(x.textContent)); b.click(); }); await p.waitForTimeout(300);
      check('바로가기 히트맵 → 펼침', await p.evaluate(s => !eval(s).querySelector('.sec-body').hidden, sec('/히트맵/')), st.toc.join(' · ')); }
    // ② 운용사별 유형별 M/S
    const m = await p.evaluate(async s => {
      const h = eval(s), d = await App.call('byType', { date: App.state.date, ref: App.state.ref }), dm = await App.call('byMgr', { date: App.state.date, ref: App.state.ref });
      const tbs = [...h.querySelectorAll('.mgr-type table')];
      const rd = tb => [...tb.tBodies[0].rows].map(tr => ({ cls: tr.className, hidden: tr.hidden, top: tr.dataset.top, c: [...tr.cells].map(c => c.textContent.trim()) }));
      const r1 = rd(tbs[0]), r2 = rd(tbs[1]), heads1 = [...tbs[0].querySelectorAll('thead tr:last-child th')].map(x => x.textContent);
      return { n: tbs.length, r1, r2, heads1, types: d.rows.map(r => r.type), mk: d.rows.map(r => [r.type, r.nav, r.navPy]), total: d.total, totalPy: d.totalPy, mt: d.mgrTypes, bm: dm.rows.map(r => [r.mgr, r.nav, r.navPy, r.ms, r.msPy]), RL: App.refLabel(d) };
    }, sec('/운용사별 유형별 M\\/S/'));
    const vis = m.r2.filter(r => !r.hidden && !/total/.test(r.cls)), tops = vis.filter(r => !/fold-head/.test(r.cls));
    const navOf = mg => { const x = m.mt.filter(y => (y.top === '기타' ? y.mgr : y.top) === mg); return x.reduce((s, y) => s + Object.values(y.t).reduce((a, v) => a + v[0], 0), 0); };
    check('표 2개(유형별 M/S · 잔고·M/S 변동) · 처음 화면 = 1~5위 + 기타 1행, 개별 운용사는 숨김', m.n === 2 && tops.length === 5 && tops.map(r => +r.c[0]).join() === '1,2,3,4,5' && vis.filter(r => /fold-head/.test(r.cls)).length === 1 && m.r2.filter(r => /fold-item/.test(r.cls)).every(r => r.hidden), tops.map(r => r.c[0] + r.c[1]).join(' '));
    const all = m.mt.map(y => ({ k: y.top === '기타' ? y.mgr : y.top, nav: Object.values(y.t).reduce((a, v) => a + v[0], 0) })).sort((a, b) => b.nav - a.nav);
    check('1~5위 = 기준일 NAV 큰 순 (상위 5개사 그룹 합계 · 그 밖은 개별 운용사)', tops.map(r => r.c[1]).join() === all.slice(0, 5).map(x => x.k).join(), all.slice(0, 7).map(x => x.k + ' ' + (x.nav / 1e12).toFixed(2)).join(', '));
    const g = (mg, i) => { const r = m.bm.find(x => x[0] === mg); return r ? r[i] : null; };
    const okMgr = tops.filter(r => m.bm.some(x => x[0] === r.c[1])).every(r => Math.abs(parseFloat(r.c[3].replace(/,/g, '')) - g(r.c[1], 1) / 1e12) < 0.006 && Math.abs(parseFloat(r.c[2].replace(/,/g, '')) - g(r.c[1], 2) / 1e12) < 0.006 && Math.abs(parseFloat(r.c[6]) - g(r.c[1], 3)) < 0.006 && Math.abs(parseFloat(r.c[5]) - g(r.c[1], 4)) < 0.006);
    check(`잔고(${m.RL}·기준일)·전체 M/S = 운용사별 NAV 탭과 같음(상위 5개사)`, okMgr, tops.map(r => r.c.slice(1, 8).join(' ')).slice(0, 2).join(' / '));
    const tot = m.r2.find(r => /total/.test(r.cls)) || { c: [] };
    check('합계 행 = 시장 전체 잔고', Math.abs(parseFloat((tot.c[3] || '').replace(/,/g, '')) - m.total / 1e12) < 0.006 && Math.abs(parseFloat((tot.c[2] || '').replace(/,/g, '')) - m.totalPy / 1e12) < 0.006, tot.c.join(' '));
    // 유형별 M/S 검산: 행별 = 운용사 유형 NAV ÷ 시장 유형 NAV, 열 합 = 100%
    const sumOk = m.types.every((t, j) => { const col = m.mt.reduce((s, y) => s + ((y.t[t] || [0])[0]), 0), mk = m.mk.find(x => x[0] === t)[1]; return !mk || Math.abs(col / mk - 1) < 1e-9; });
    const cellOk = tops.every(r => m.types.every((t, j) => { const x = m.mt.filter(y => (y.top === '기타' ? y.mgr : y.top) === r.c[1]).reduce((s, y) => s + ((y.t[t] || [0])[0]), 0), mk = m.mk.find(z => z[0] === t)[1]; const row = m.r1.find(q => q.c[1] === r.c[1]); const v = parseFloat(row.c[2 + j]); return !mk || Math.abs(v - x / mk * 100) < 0.051; }));
    check('유형별 M/S = 운용사 유형 NAV ÷ 시장 유형 NAV · 유형별 운용사 합 = 시장(100%)', sumOk && cellOk && m.heads1.slice(2).join() === m.types.join(), m.heads1.join('|'));
    // 기타 펼치기
    await p.evaluate(s => eval(s).querySelector('.mgr-type .fold-head').click(), sec('/운용사별 유형별 M\\/S/'));
    const ex = await p.evaluate(s => { const tb = eval(s).querySelector('.mgr-type table'); const items = [...tb.querySelectorAll('tr.fold-item')]; const head = tb.querySelector('tr.fold-head');
      return { shown: items.every(tr => !tr.hidden), n: items.length, head: [...head.cells].map(c => c.textContent.trim()), items: items.map(tr => [...tr.cells].map(c => c.textContent.trim())), btn: head.querySelector('.fold-btn').textContent }; }, sec('/운용사별 유형별 M\\/S/'));
    const etcN = all.length - 5;
    const subOk = m.types.every((t, j) => Math.abs(ex.items.reduce((s, c) => s + (parseFloat(c[2 + j]) || 0), 0) - (parseFloat(ex.head[2 + j]) || 0)) < 0.05 * Math.max(1, ex.items.length));
    check(`기타 누르면 개별 운용사 ${etcN}곳 표시 · 순위 6위부터 · 소계 ≈ 개별 합(반올림 오차 이내)`, ex.shown && ex.n === etcN && ex.btn === '▾' && +ex.items[0][0] === 6 && /기타 \d+개사/.test(ex.head[1]) && subOk, ex.head.join(' ') + ' / ' + ex.items.slice(0, 2).map(c => c.slice(0, 4).join(' ')).join(', '));
    await p.evaluate(s => { const x = eval(s); x.scrollIntoView({ block: 'start' }); window.scrollBy(0, -60); }, sec('/운용사별 유형별 M\\/S/')); await p.waitForTimeout(300);
    await p.screenshot({ path: `${OUT}/${name}_mgrtype.png` });
    check('가로 넘침(페이지) 없음', await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    check('스크립트 오류 없음', !errs.length, errs.slice(0, 3).join(' | '));
    await p.close();
  }
  await b.close();
  console.log(fails ? `FAIL ${fails}` : '전부 통과'); process.exit(fails ? 1 : 0);
})();
