/* v46 화면 점검 — 조원 금액 소수 둘째 자리(셋째 자리에서 반올림) 전면 적용 (index.html = Apps Script, web.html = Vercel)
 *  V29B=1 node build_page.js && V29B=1 node build_web.js && CHROME_PATH=/opt/pw-browsers/chromium node v46_shot.js
 *  ① 포맷 함수(eok·jo·signed 기본 2자리, 반올림·0 처리) ② 모든 탭 글자(머리 카드·결론 줄·표·설명): '숫자.한자리 조' 없음
 *  ③ 표 '(조원)' 열 = 소수 2자리 ④ 그림 위 글자(캔버스 fillText 기록: 막대·선 끝 레이블, 눈금) · 툴팁: '숫자.한자리 조' 없음, 설정액 그림 숫자 2자리 */
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/opt/pw-browsers/chromium' });
  let fails = 0; const check = (name, ok, info) => { if (!ok) fails++; console.log((ok ? '  OK   ' : '  FAIL ') + name + (info !== undefined ? ' — ' + (typeof info === 'string' ? info : JSON.stringify(info)) : '')); };
  const ONE = /(^|[^\d.,])[+\-−]?[\d,]*\d\.\d(?!\d)\s*조/;   // 소수 한 자리 + 조(원)
  for (const [file, name, vw] of [['index.html', 'gas', { width: 1568, height: 751 }], ['web.html', 'web', { width: 1920, height: 919 }]]) {
    console.log(`[${name}]`);
    const p = await b.newPage({ viewport: vw }); const errs = [];
    p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errs.push('console: ' + m.text()); });
    await p.route('**/*', r => /^https?:/.test(r.request().url()) ? r.fulfill({ status: 200, body: '' }) : r.continue());
    await p.addInitScript(() => {   // 캔버스에 그린 글자 기록(차트 레이블·눈금)
      window.__ft = []; const f = CanvasRenderingContext2D.prototype.fillText;
      CanvasRenderingContext2D.prototype.fillText = function (t) { try { window.__ft.push({ t: String(t), flow: (() => { let e = this.canvas && this.canvas.parentElement; for (let k = 0; e && k < 5; k++, e = e.parentElement) if (e.querySelector(':scope > .flow-ct')) return true; return false; })() }); } catch (e) {} return f.apply(this, arguments); };
    });
    await p.goto('file://' + __dirname + '/' + file); await p.waitForSelector('.tab');
    const wait = () => p.waitForFunction(() => !document.querySelector('#view > .loading'), null, { timeout: 90000 }).then(() => p.waitForTimeout(500));
    await wait();
    // ① 포맷 함수
    const f = await p.evaluate(() => ({ a: App.eok(1.2345e12), b: App.eok(1.235e12), c: App.jo(12.3e12), d: App.signed(0.004e12), e: App.signed(-0.006e12), g: App.signed(2.5e12), h: App.eok(1.2345e12, 0), i: App.eok(1234.567e12) }));
    check('포맷: eok 1.2345조→1.23 · 1.235조→1.24 · jo 12.3→12.30조 · signed 0.004→0.00 · −0.006→-0.01 · +2.50 · 자리 지정(0)은 그대로 · 천 단위 쉼표',
      f.a === '1.23' && f.b === '1.24' && f.c === '12.30조' && f.d === '0.00' && f.e === '-0.01' && f.g === '+2.50' && f.h === '1' && f.i === '1,234.57', f);
    const ids = await p.evaluate(() => App.tabs.map(t => t.id));
    let two = 0, flowNums = [], tipN = 0;
    for (const id of ids) {
      await p.evaluate(() => { window.__ft = []; }); await p.evaluate(i => App.show(i), id); await wait();
      // 설정액 섹션은 접혀 있거나 아래에 있을 수 있음 → 열린 상태로 그려진 것만 대상
      const r = await p.evaluate(ONE_SRC => {
        const ONE = new RegExp(ONE_SRC), out = { bad: [], badCell: [], two: 0 };
        const root = document.getElementById('view'), extra = [...document.querySelectorAll('#stats, #lede')];
        const walk = el => { const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT); let n; const xs = []; while ((n = w.nextNode())) xs.push(n.textContent); return xs; };
        const texts = [root].concat(extra).flatMap(walk).concat([...document.querySelectorAll('[title], [data-tip]')].map(e => (e.getAttribute('title') || '') + ' ' + (e.getAttribute('data-tip') || '')));
        texts.forEach(t => { if (ONE.test(t)) out.bad.push(t.trim().slice(0, 80)); if (/\d\.\d{2}\s*조/.test(t)) out.two++; });
        // 조원 열(머리글에 '조원')
        document.querySelectorAll('#view table').forEach(tb => {
          const hs = [...tb.querySelectorAll('thead tr:last-child th')].map(h => h.textContent);
          const top = [...tb.querySelectorAll('thead tr:first-child th')];
          tb.querySelectorAll('tbody tr, tfoot tr').forEach(tr => [...tr.children].forEach((td, i) => {
            const h = hs[i] || ''; if (!/조원/.test(h)) return;
            const v = td.textContent.trim().split(/\s/)[0]; if (v === '-' || v === '') return;
            if (!/^[+\-−]?[\d,]+\.\d{2}$/.test(v) && !/^[+\-−]?0\.00\d$/.test(v)) out.badCell.push(h + ':' + v);   // 0.00으로 반올림되는 작은 값은 셋째 자리(navSmall, v39~ 설계)
          }));
        });
        return out;
      }, ONE.source);
      const ft = await p.evaluate(() => window.__ft);
      const badFt = ft.filter(x => ONE.test(x.t)).map(x => x.t);
      const fl = ft.filter(x => x.flow && /^[+\-−]?[\d,]*\.\d+$/.test(x.t)).map(x => x.t);
      flowNums = flowNums.concat(fl);
      // 툴팁: 차트마다 첫 값 하나
      const tips = await p.evaluate(() => {
        const out = [];
        App.charts.forEach(ch => { try {
          if (!ch.canvas || !ch.canvas.isConnected) return;
          const di = ch.data.datasets.findIndex(d => (d.data || []).some(v => v !== null && v !== undefined)); if (di < 0) return;
          const ix = ch.data.datasets[di].data.findIndex(v => v !== null && v !== undefined);
          const el = ch.getDatasetMeta(di).data[ix]; if (!el) return;
          ch.tooltip.setActiveElements([{ datasetIndex: di, index: ix }], { x: el.x, y: el.y }); ch.update('none');
          (ch.tooltip.body || []).forEach(b => b.lines.forEach(l => out.push(l)));
          ch.tooltip.setActiveElements([], { x: 0, y: 0 }); ch.update('none');
        } catch (e) {} });
        return out;
      });
      tipN += tips.length;
      const badTip = tips.filter(t => ONE.test(t));
      two += r.two;
      check(`${id}: 글자·표·그림·툴팁에 '숫자.한자리 조' 없음 · 조원 열 소수 2자리`, !r.bad.length && !r.badCell.length && !badFt.length && !badTip.length,
        r.bad.length || r.badCell.length || badFt.length || badTip.length ? { text: r.bad.slice(0, 4), cell: r.badCell.slice(0, 4), canvas: badFt.slice(0, 4), tip: badTip.slice(0, 4) } : `2자리 조 ${r.two}건 · 툴팁 ${tips.length}건`);
    }
    check('2자리 조 표기 확인(전 탭 합계 > 0) · 툴팁 점검 수 > 0', two > 0 && tipN > 0, `${two}건 · 툴팁 ${tipN}`);
    const flowBad = flowNums.filter(t => !/\.\d{2}$/.test(t));
    check('설정액 그림(누적 선 끝·월별 막대 레이블·눈금): 소수가 붙은 숫자는 모두 2자리', !flowBad.length, flowBad.length ? flowBad.slice(0, 6) : `${flowNums.length}건`);
    check('스크립트 오류 없음', !errs.length, errs.slice(0, 3).join(' | '));
    await p.close();
  }
  await b.close();
  console.log(fails ? `FAIL ${fails}` : 'ALL OK'); process.exit(fails ? 1 : 0);
})();
