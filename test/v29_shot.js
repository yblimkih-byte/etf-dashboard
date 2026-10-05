/* v29 테마 맵 화면 점검 (web.html = Vercel 빌드, index.html = Apps Script 화면) — CHROME_PATH=/opt/pw-browsers/chromium node v29_shot.js
 *  탭 추가·선택 막대(보기·자산·지역·레버리지 제외)·사분면 버블·표(증감 순, 합계)·상세(운용사 2행 막대·종목 목록)·클릭 연동 · 집계 검산 · 내부 시트·열 이름 미노출 · 오류 없음 */
const { chromium } = require('playwright'), fs = require('fs');
const OUT = __dirname + '/shots_v29';
const INTERNAL = /범례_|유형최종|신규상장용|ETF마스터|agg_|raw_|테마_분류검토|_index/;
(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const b = await chromium.launch({ executablePath: process.env.CHROME_PATH });
  let fails = 0; const check = (name, ok, info) => { if (!ok) fails++; console.log((ok ? '  OK   ' : '  FAIL ') + name + (info !== undefined ? ' — ' + (typeof info === 'string' ? info : JSON.stringify(info)) : '')); };
  for (const [file, name] of [['web.html', 'web'], ['index.html', 'gas']]) {
    console.log(`[${name}]`);
    for (const vw of [1440, 390]) {
      const p = await b.newPage({ viewport: { width: vw, height: 900 } }); const errs = [];
      p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error' && !/favicon/.test(JSON.stringify(m.location()))) errs.push('console: ' + m.text()); });   // 테스트 환경의 favicon 경로 제외
      await p.route('**/*', r => /^https?:/.test(r.request().url()) ? r.fulfill({ status: 200, body: '' }) : r.continue());
      await p.goto('file://' + __dirname + '/' + file + '#theme'); await p.waitForSelector('.tab');
      const wait = () => p.waitForFunction(() => !document.querySelector('#view > .loading'), null, { timeout: 60000 }).then(() => p.waitForTimeout(600));
      const freeze = () => p.evaluate(() => App.charts.forEach(c => { c.options.animation = false; c.update('none'); }));
      await wait();
      const info = await p.evaluate(() => {
        const v = document.getElementById('view'), secs = [...v.querySelectorAll(':scope > .section, :scope > div > .section')];
        const tab = [...document.querySelectorAll('#tabs .tab')].map(t => t.textContent.trim());
        const bar = [...v.querySelectorAll('.th-bar .ctl')].map(c => c.querySelector('label').textContent + ':' + [...c.querySelectorAll('button')].map(x => x.textContent + (x.classList.contains('on') ? '*' : '')).join('/'));
        const bub = App.charts.find(c => c.config.type === 'bubble');
        const tbl = secs[1] && secs[1].querySelector('table.tbl');
        const head = tbl ? [...tbl.querySelectorAll('thead tr:last-child th')].map(th => th.textContent) : [];
        const body = tbl ? [...tbl.querySelectorAll('tbody tr.clk')].map(tr => [...tr.cells].map(c => c.textContent.trim())) : [];
        const tot = tbl ? [...tbl.querySelectorAll('tr.total td')].map(c => c.textContent.trim()) : [];
        const det = secs.find(s => /상세/.test(s.querySelector('.h2').textContent));
        return { tab, bar, active: (document.querySelector('#tabs .tab.active') || {}).textContent, bubN: bub ? bub.data.datasets[0].data.length : 0,
          titles: secs.map(s => s.querySelector('.h2').textContent), head, body: body.slice(0, 40), tot, det: det ? det.querySelector('.h2').textContent : '', detRows: det ? det.querySelectorAll('table.tbl tbody tr').length : 0,
          detBars: App.charts.filter(c => c.config.type === 'bar').length, text: v.innerText + ' ' + (document.getElementById('lede') || {}).innerText + ' ' + (document.getElementById('stats') || {}).innerText,
          lede: (document.getElementById('lede') || {}).innerText || '', cards: [...document.querySelectorAll('#stats .cd')].map(c => c.innerText.replace(/\s+/g, ' ')),
          ovf: document.documentElement.scrollWidth - window.innerWidth };
      });
      if (vw === 1440) {
        console.log('     탭: ' + info.tab.join(' · ') + '\n     막대: ' + info.bar.join(' | ') + '\n     섹션: ' + info.titles.join(' / ') + '\n     표: ' + info.head.join(' | '));
        info.body.slice(0, 6).forEach(r => console.log('       ' + r.join(' | ')));
        console.log('       합계: ' + info.tot.join(' | ') + '\n     상세: ' + info.det + ' (' + info.detRows + '행)');
        if (name === 'web') console.log('     머리글: ' + info.lede.replace(/\n/g, ' / ') + '\n     카드: ' + info.cards.join(' ‖ '));
        check('탭 "테마 맵" 추가·선택됨', info.tab.indexOf('테마 맵') >= 0 && /테마 맵/.test(info.active));
        check('선택 막대: 보기(테마*/상품구조)·자산(주식 등*)·지역(전체*)·레버리지 제외', info.bar.length === 4 && /보기:테마\*\/상품구조/.test(info.bar[0]) && /자산:주식 등\*/.test(info.bar[1]) && /지역:전체\*/.test(info.bar[2]) && /레버리지·인버스 제외/.test(info.bar[3]), info.bar.join(' | '));
        check('사분면 버블 = 표 행 수(NAV>0 테마)', info.bubN > 0 && info.bubN === info.body.length, info.bubN + ' / ' + info.body.length);
        check('표 머리글: 증감액·증감률·1위 운용사·한투 점유율/변동/순위·신규·구분', ['NAV(조원)', '증감액', '증감률', '1위 운용사', '점유율', '변동', '순위', '구분'].every(h => info.head.indexOf(h) >= 0), info.head.join('|'));
        const chg = info.body.map(r => +r[info.head.indexOf('증감액')].replace(/[^\d.+-]/g, ''));
        check('표 정렬: 증감액 내림차순', chg.every((v, i) => !i || v <= chg[i - 1] + 1e-9), chg.slice(0, 8).join(','));
        check('상세 섹션(기본 = 기회 구간 1위 또는 증감 1위) + 운용사 2행 막대 + 종목 목록', /상세 — /.test(info.det) && info.detRows > 0 && info.detBars >= 1, info.det);
        check('내부 시트·열 이름 없음', !INTERNAL.test(info.text), (info.text.match(INTERNAL) || [''])[0]);
        if (name === 'web') check('웹 머리글 문장·카드 4개', /증감 1위/.test(info.lede) && info.cards.length === 4, info.cards.length);
        // 집계 검산: 화면 모델 합계 = 원자료 합계(주식 등)
        const sumChk = await p.evaluate(async () => {
          const d = await App.call('theme', { date: App.state.date, ref: App.state.ref });
          const M = themeModel(App, d, { lens: 'theme', asset: 'S', region: '', exLev: false });
          const raw = d.rows.filter(r => !r[8]).reduce((s, r) => s + r[3], 0) * d.unit, rawB = d.rows.filter(r => !r[8]).reduce((s, r) => s + r[4], 0) * d.unit;
          const fRaw = d.rows.filter(r => !r[8] && d.mgrs[r[2]][1] === App.FOCUS).reduce((s, r) => s + r[3], 0) * d.unit;
          const MA = themeModel(App, d, { lens: 'theme', asset: 'A', region: '', exLev: false }), MS = themeModel(App, d, { lens: 'struct', asset: 'A', region: '', exLev: false });
          const MB = themeModel(App, d, { lens: 'theme', asset: 'B', region: '', exLev: false });
          const share = M.list.every(g => Math.abs(g.fShare - (g.nav ? g.fNav / g.nav * 100 : 0)) < 1e-9 && g.fShare <= 100.0000001);
          const quad = M.list.every(g => g.nav <= 0 || g.quad === (g.chg >= M.xSplit ? (g.fShare >= M.ySplit ? 'a' : 'b') : (g.fShare >= M.ySplit ? 'c' : 'd')));
          const lev = themeModel(App, d, { lens: 'struct', asset: 'A', region: '', exLev: true }).list.every(g => g.key !== d.lev);
          return { tot: M.tot, raw, totB: M.totB, rawB, f: M.fTot, fRaw, all: MA.tot, allS: MS.tot, allB: MA.totB, allSB: MS.totB, bond: MB.list.every(g => g.group === '채권·금리' || g.group === '대체·자산배분'), share, quad, lev };
        });
        check('검산: 주식 등 NAV·비교 NAV·한투 NAV 합계 = 원자료', Math.abs(sumChk.tot - sumChk.raw) < 1 && Math.abs(sumChk.totB - sumChk.rawB) < 1 && Math.abs(sumChk.f - sumChk.fRaw) < 1);
        check('검산: 전체 자산 — 테마 보기 합계 = 상품구조 보기 합계', Math.abs(sumChk.all - sumChk.allS) < 1 && Math.abs(sumChk.allB - sumChk.allSB) < 1);
        check('검산: 채권·금리 보기는 채권·금리/대체 테마만', sumChk.bond);
        check('검산: 한투 점유율·사분면 판정', sumChk.share && sumChk.quad);
        check('레버리지·인버스 제외 → 상품구조 보기에서 해당 구조 없음', sumChk.lev);
        await freeze(); await p.screenshot({ path: `${OUT}/${name}_theme.png`, fullPage: true });
        // 표 행 클릭 → 상세 전환
        const clicked = await p.evaluate(() => { const tr = [...document.querySelectorAll('#view tr.clk')][2]; tr.click(); return tr.dataset.key; });
        await p.waitForTimeout(400);
        const det2 = await p.evaluate(() => { const s = [...document.querySelectorAll('#view .section')].find(x => /상세 — /.test(x.querySelector('.h2').textContent)); return { h: s.querySelector('.h2').textContent, sel: (document.querySelector('#view tr.sel') || {}).dataset ? document.querySelector('#view tr.sel').dataset.key : '' }; });
        check('표 행 클릭 → 상세가 그 테마로 바뀌고 행 강조', det2.h.indexOf(clicked) >= 0 && det2.sel === clicked, det2.h);
        // 버블 클릭 → 상세 전환
        await p.evaluate(() => { const ch = App.charts.find(c => c.config.type === 'bubble'); ch.canvas.scrollIntoView({ block: 'center' }); }); await p.waitForTimeout(800);
        const bub = await p.evaluate(() => { const ch = App.charts.find(c => c.config.type === 'bubble'), meta = ch.getDatasetMeta(0), k = meta.data.map((e, i) => i).sort((i, j) => meta.data[j].options.radius - meta.data[i].options.radius)[0], el = meta.data[k], r = ch.canvas.getBoundingClientRect(); return { x: r.left + el.x, y: r.top + el.y, key: ch.data.datasets[0].data[k].p.key }; });
        await p.mouse.click(bub.x, bub.y); await p.waitForTimeout(400);
        const det3 = await p.evaluate(() => [...document.querySelectorAll('#view .section')].find(x => /상세 — /.test(x.querySelector('.h2').textContent)).querySelector('.h2').textContent);
        check('버블 클릭 → 상세 전환', det3.indexOf(bub.key) >= 0, det3 + ' / ' + bub.key);
        // 선택 막대: 상품구조 보기 · 채권·금리 · 미국
        await p.evaluate(() => [...document.querySelectorAll('.th-bar .ctl')][0].querySelectorAll('button')[1].click()); await wait();
        const sv = await p.evaluate(() => ({ head: [...document.querySelectorAll('#view .section')][1].querySelector('thead tr:last-child th').textContent, rows: [...document.querySelectorAll('#view tr.clk')].map(tr => tr.dataset.key), st: JSON.stringify(App.state.th) }));
        check('보기 → 상품구조: 표 첫 열 = 상품구조, 행 = 구조 값', sv.head === '상품구조' && sv.rows.length > 0 && sv.rows.every(k => ['레버리지·인버스', '커버드콜·옵션', '채권혼합', '액티브', '일반'].indexOf(k) >= 0), sv.rows.join(','));
        await freeze(); await p.screenshot({ path: `${OUT}/${name}_struct.png`, fullPage: false });
        await p.evaluate(() => { [...document.querySelectorAll('.th-bar .ctl')][0].querySelectorAll('button')[0].click(); }); await wait();
        await p.evaluate(() => [...document.querySelectorAll('.th-bar .ctl')][1].querySelectorAll('button')[1].click()); await wait();
        const bv = await p.evaluate(() => [...document.querySelectorAll('#view tr.clk')].map(tr => tr.dataset.key));
        check('자산 → 채권·금리: 채권 테마', bv.length > 0 && bv.some(k => /단기자금|채권|장기채|만기/.test(k)), bv.join(','));
        await freeze(); await p.screenshot({ path: `${OUT}/${name}_bond.png`, fullPage: true });
        await p.evaluate(() => [...document.querySelectorAll('.th-bar .ctl')][1].querySelectorAll('button')[0].click()); await wait();
        await p.evaluate(() => { const b = [...[...document.querySelectorAll('.th-bar .ctl')][2].querySelectorAll('button')].find(x => x.textContent === '미국'); b.click(); }); await wait();
        const us = await p.evaluate(async () => { const d = await App.call('theme', { date: App.state.date, ref: App.state.ref }); const M = themeModel(App, d, App.state.th); return { n: M.list.length, ok: M.list.every(g => g.items.every(r => r.region === '미국')), keys: M.list.map(g => g.key).join(',') }; });
        check('지역 → 미국: 미국 종목만 집계', us.n > 0 && us.ok, us.keys);
        // 기준일·비교 기준 변경 → 재조회
        await p.evaluate(() => { const se = [...document.querySelectorAll('#controls select')][1]; se.value = 'pm'; se.onchange(); }); await wait();
        const rl = await p.evaluate(() => [...document.querySelectorAll('#view .section')][1].querySelector('.section-h .note').textContent);
        check('비교 기준 → 전월말 반영', /전월말/.test(rl), rl);
        await p.evaluate(() => { App.state.th = null; App.state.ref = 'py'; });
      } else {
        check('모바일(390px): 가로 넘침 없음 · 버블 표시', info.ovf <= 1 && info.bubN > 0, 'overflow ' + info.ovf);
        await freeze(); await p.screenshot({ path: `${OUT}/${name}_theme_m.png`, fullPage: false });
      }
      check(`페이지 오류 없음 (${vw}px)`, !errs.length, errs.slice(0, 3).join(' | '));
      await p.close();
    }
  }
  await b.close();
  console.log(fails ? `\n${fails}건 실패` : '\n전부 통과');
  process.exit(fails ? 1 : 0);
})();
