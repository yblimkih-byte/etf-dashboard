/* v39 화면 점검 (web.html = Vercel 빌드, index.html = Apps Script 화면) — node build_page.js && node build_web.js && CHROME_PATH=/opt/pw-browsers/chromium node v39_shot.js
 *  'ETF 상세'(이전 '상위 ETF'): 탭 이름 · 상단 범위 버튼(전체·상위 50개·상위 100개, 기본 상위 50) · 범위에 따라 카드 요약·NAV 막대·목록 변화 ·
 *  NAV 상위 20 변천(bar chart race)은 운용사별 NAV 탭 맨 아래로 · (v40) 운용사 선택 시 종목 수·행 간격 */
const { chromium } = require('playwright'), fs = require('fs');
const OUT = __dirname + '/shots_v39';
(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const b = await chromium.launch({ executablePath: process.env.CHROME_PATH });
  let fails = 0; const check = (name, ok, info) => { if (!ok) fails++; console.log((ok ? '  OK   ' : '  FAIL ') + name + (info !== undefined ? ' — ' + (typeof info === 'string' ? info : JSON.stringify(info)) : '')); };
  for (const [file, name] of [['web.html', 'web'], ['index.html', 'gas']]) {
    console.log(`[${name}]`);
    const p = await b.newPage({ viewport: { width: 1440, height: 900 } }); const errs = [];
    p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errs.push('console: ' + m.text()); });   // 글꼴 등 로컬에 없는 파일은 제외
    await p.route('**/*', r => /^https?:/.test(r.request().url()) ? r.fulfill({ status: 200, body: '' }) : r.continue());
    await p.goto('file://' + __dirname + '/' + file); await p.waitForSelector('.tab');
    const wait = () => p.waitForFunction(() => !document.querySelector('#view > .loading'), null, { timeout: 60000 }).then(() => p.waitForTimeout(500));
    const freeze = () => p.evaluate(() => App.charts.forEach(c => { c.options.animation = false; c.update('none'); }));
    await wait();
    const tabs = await p.evaluate(() => [...document.querySelectorAll('#tabs .tab')].map(t => t.textContent.trim()));
    check('탭 이름: ETF 상세(상위 ETF 없음)', tabs.includes('ETF 상세') && !tabs.includes('상위 ETF'), tabs.join(' · '));

    // ETF 상세 — 기본 상위 50
    await p.evaluate(() => App.show('top')); await wait();
    const snap = () => p.evaluate(name => {
      const view = document.getElementById('view'), secs = [...view.querySelectorAll(':scope > .section')], ch = App.charts[0];
      const seg = [...document.querySelectorAll('#controls .ctl')].find(c => /범위/.test(c.textContent));
      const tbls = secs[1] ? secs[1].querySelectorAll('table.tbl') : [];
      const tiles = [...view.querySelectorAll(':scope > .grid:first-child .tile')];
      const cards = [...document.querySelectorAll('#stats .cards .cd')];
      return {
        seg: seg ? [...seg.querySelectorAll('button')].map(x => x.textContent + (x.classList.contains('on') ? '*' : '')) : [],
        segFirst: (() => { const c = [...document.querySelectorAll('#controls .ctl')]; return c.map(x => x.querySelector('label') ? x.querySelector('label').textContent : x.textContent.trim()); })(),
        titles: secs.map(s => s.querySelector('.h2').textContent), bars: ch ? ch.data.labels.length : 0, cvH: ch ? Math.round(ch.canvas.parentNode.getBoundingClientRect().height) : 0,
        sumRows: tbls[0] ? tbls[0].querySelectorAll('tbody tr:not(.total)').length : 0, sumHead: tbls[0] ? [...tbls[0].querySelectorAll('thead th')].map(t => t.textContent) : [], sumTotal: tbls[0] ? tbls[0].querySelector('tr.total').textContent : '',
        list: tbls[1] ? tbls[1].querySelectorAll('tbody tr').length : 0, tiles: tiles.map(t => t.querySelector('.k').textContent + '|' + t.querySelector('.v').textContent), tilesShown: tiles.length ? getComputedStyle(tiles[0].parentNode).display !== 'none' : false,
        cards: cards.map(c => c.querySelector('.cd-k').textContent + '|' + c.querySelector('.cd-v').textContent + '|' + c.querySelector('.l2').textContent), lede: (document.getElementById('lede') || {}).textContent || '',
        race: !!view.querySelector('.race-bar, .race'), title: (document.getElementById('topTitle') || {}).textContent || '' };
    }, name);
    const s50 = await snap();
    console.log('     ' + JSON.stringify({ seg: s50.seg, ctl: s50.segFirst, titles: s50.titles, bars: s50.bars, list: s50.list }));
    check('범위 버튼: 전체·상위 50개·상위 100개, 기본 = 상위 50개', s50.seg.join(',') === '전체,상위 50개*,상위 100개', s50.seg.join(','));
    check('범위 버튼은 상단 컨트롤 줄(기준일자 옆)', s50.segFirst.includes('범위') && s50.segFirst.indexOf('범위') === s50.segFirst.indexOf('기준일자') + 1, s50.segFirst.join(' · '));
    check('상위 50: 막대 50개·목록 50행·운용사 요약 6행', s50.bars === 50 && s50.list === 50 && s50.sumRows === 6 && /상위50 내 종목수/.test(s50.sumHead.join('|')), `${s50.bars}/${s50.list}/${s50.sumRows}`);
    check('상위 50: 제목(상위 50 ETF · NAV 상위 50 ETF), 변천 없음', s50.titles[0] === '상위 50 ETF' && s50.titles[1] === 'NAV 상위 50 ETF' && s50.titles.length === 2 && !s50.race, s50.titles.join(' / '));
    check('막대 높이: 50개 → 1,000px 안팎', s50.cvH >= 950 && s50.cvH <= 1100, s50.cvH + 'px');
    if (name === 'web') {
      check('웹: 상단 카드 6개(운용사별 · 상위 50개 합계의 %) · 문장 상위 50개', s50.cards.length === 6 && s50.cards.every(c => /상위 50개 합계의/.test(c)) && /상위 50개 ETF/.test(s50.lede), s50.cards[0] + ' / ' + s50.lede.slice(0, 60));
      check('웹: 화면 안 카드(타일) 줄은 숨김(상단 카드와 중복 방지)', !s50.tilesShown);
      check('웹: 상단 제목 = ETF 상세', s50.title === 'ETF 상세', s50.title);
    } else check('Apps Script: 카드 요약 7개(상위 50 합계 + 운용사 6)', s50.tiles.length === 7 && /^상위 50 합계\|50종목$/.test(s50.tiles[0]) && s50.tilesShown, s50.tiles.slice(0, 3).join(' · '));
    await freeze(); await p.screenshot({ path: `${OUT}/${name}_top50.png`, fullPage: true });

    // 상위 100
    await p.evaluate(() => [...document.querySelectorAll('#controls .seg button')].find(x => x.textContent === '상위 100개').click()); await wait();
    const s100 = await snap();
    check('상위 100: 버튼 표시·막대 100개·목록 100행', s100.seg.join(',') === '전체,상위 50개,상위 100개*' && s100.bars === 100 && s100.list === 100, `${s100.bars}/${s100.list}`);
    check('상위 100: 제목·요약 머리글·합계', s100.titles[0] === '상위 100 ETF' && s100.titles[1] === 'NAV 상위 100 ETF' && /상위100 내 종목수/.test(s100.sumHead.join('|')) && /100/.test(s100.sumTotal), s100.titles.join(' / '));
    check('막대 높이: 100개 → 1,900px 안팎', s100.cvH >= 1850 && s100.cvH <= 2050, s100.cvH + 'px');
    if (name === 'web') check('웹: 카드·문장이 상위 100개 기준으로', s100.cards.every(c => /상위 100개 합계의/.test(c)) && /상위 100개 ETF/.test(s100.lede) && s100.cards.join() !== s50.cards.join(), s100.cards[0]);
    else check('Apps Script: 카드 요약 상위 100 기준', /^상위 100 합계\|100종목$/.test(s100.tiles[0]) && s100.tiles.join() !== s50.tiles.join(), s100.tiles.slice(0, 2).join(' · '));
    await freeze(); await p.screenshot({ path: `${OUT}/${name}_top100.png`, fullPage: true });

    // 전체
    await p.evaluate(() => [...document.querySelectorAll('#controls .seg button')].find(x => x.textContent === '전체').click()); await wait();
    const sAll = await snap(), nAll = await p.evaluate(() => App.call('topEtf', { date: App.state.date, n: 'all' }).then(d => d.count));
    check('전체: 목록 = NAV>0 전 종목, 막대는 상위 100개까지(안내 문구)', sAll.list === nAll && sAll.bars === Math.min(100, nAll) && /전체 [\d,]+종목 중/.test(sAll.titles[0]), `${sAll.bars}/${sAll.list}/${nAll} · ${sAll.titles[0]}`);
    check('전체: 목록 제목·요약 머리글(전체 내 종목수)', /^전체 ETF \([\d,]+종목\)$/.test(sAll.titles[1]) && /전체 내 종목수/.test(sAll.sumHead.join('|')), sAll.titles[1]);
    if (name === 'web') check('웹: 카드·문장이 전체 기준으로(전체 합계의 %, 시장 순자산)', sAll.cards.every(c => /전체 합계의/.test(c)) && /전체 [\d,]+종목 · 시장 순자산/.test(sAll.lede), sAll.lede.slice(0, 70));
    else check('Apps Script: 카드 요약 전체 기준(시장 전체의 100.0%)', /^전체 합계\|/.test(sAll.tiles[0]) && sAll.tiles.length === 7, sAll.tiles[0]);
    await freeze(); await p.screenshot({ path: `${OUT}/${name}_all.png`, fullPage: true });
    // 운용사 칩: 목록 필터 동작
    const chip = await p.evaluate(() => { const c = [...document.querySelectorAll('.sticky-chips .chip-m')].find(b => b.dataset.k === '한투'); c.click(); const t = [...document.querySelectorAll('#view > .section')][1].querySelectorAll('table.tbl')[1]; return { shown: [...t.querySelectorAll('tbody tr')].filter(r => !r.classList.contains('fold')).length }; });
    const hanN = await p.evaluate(() => App.call('topEtf', { date: App.state.date, n: 'all' }).then(d => d.byMgr.find(x => x.top === '한투').n));
    check('전체: 운용사 칩(한투) → 목록이 한투 종목만', chip.shown === hanN, chip.shown + ' / ' + hanN);
    // v40: 운용사를 고르면 제목·소제목에 그 운용사 종목 수, 보이는 행 사이 간격이 모두 같음(숨긴 행이 자리를 차지하지 않음)
    const v40 = await p.evaluate(async () => {
      await new Promise(r => setTimeout(r, 500));
      const s3 = [...document.querySelectorAll('#view > .section')][1], t = s3.querySelectorAll('table.tbl')[1];
      const vis = [...t.querySelectorAll('tbody tr')].filter(r => getComputedStyle(r).display !== 'none'), tops = vis.map(r => r.getBoundingClientRect().top), gaps = tops.slice(1).map((y, i) => Math.round((y - tops[i]) * 10) / 10);
      const hid = [...t.querySelectorAll('tbody tr.fold')].map(r => r.getBoundingClientRect().height);
      const out = { title: s3.querySelector('.h2').textContent, sub: [...s3.querySelectorAll('.sub-h')][1].textContent, gapMin: Math.min(...gaps), gapMax: Math.max(...gaps), hidMax: Math.max(0, ...hid) };
      const q = s3.querySelector('.tbl-q'); q.value = 'ACE'; q.dispatchEvent(new Event('input')); out.cnt = s3.querySelector('.tbl-cnt').textContent; q.value = ''; q.dispatchEvent(new Event('input'));
      [...document.querySelectorAll('.sticky-chips .chip-m')].find(b => b.dataset.k === '').click();
      out.title0 = s3.querySelector('.h2').textContent; out.sub0 = [...s3.querySelectorAll('.sub-h')][1].textContent;
      return out;
    });
    const NA = (await p.evaluate(() => App.call('topEtf', { date: App.state.date, n: 'all' }).then(d => d.count))).toLocaleString('ko-KR');
    check('운용사 선택 → 제목·소제목 = 그 운용사 종목 수', v40.title === `전체 ETF (${NA}종목 중 한투 ${hanN}종목)` && v40.sub === `종목 목록 (한투 ${hanN}종목)`, v40.title + ' / ' + v40.sub);
    check('운용사 선택 → 보이는 행 간격 동일·숨긴 행 높이 0', v40.gapMax - v40.gapMin < 1 && v40.hidMax === 0, `간격 ${v40.gapMin}~${v40.gapMax}px · 숨긴 행 최대 ${v40.hidMax}px`);
    check('운용사 선택 + 검색 → 건수는 보이는 행만', /^\d+행$/.test(v40.cnt) && +v40.cnt.replace('행', '') <= hanN, v40.cnt);
    check('초기화 → 제목·소제목 원래대로', v40.title0 === `전체 ETF (${NA}종목)` && v40.sub0 === `종목 목록 (${NA}종목)`, v40.title0 + ' / ' + v40.sub0);

    // 다른 탭에 갔다 와도 범위 유지 · 요약 탭은 영향 없음
    await p.evaluate(() => App.show('summary')); await wait();
    await p.evaluate(() => App.show('top')); await wait();
    const back = await snap();
    check('탭 전환 후 범위 유지(전체)', back.seg.join(',') === '전체*,상위 50개,상위 100개' && back.list === nAll);

    // 운용사별 NAV — 맨 아래 변천
    await p.evaluate(() => App.show('mgr')); await wait();
    await p.waitForSelector('.race-bar, .race-row, .race', { timeout: 60000 }).catch(() => {}); await p.waitForTimeout(800);
    const mg = await p.evaluate(() => { const secs = [...document.querySelectorAll('#view > .section')]; const last = secs[secs.length - 1]; return { titles: secs.map(s => s.querySelector('.h2').textContent), raceInLast: !!last.querySelector('.race-ms-bar') && !!last.querySelector('input[type=range], .race-bar'), msBars: last.querySelectorAll('.race-ms-bar').length }; });
    check('운용사별 NAV: 맨 아래 = NAV 상위 20 변천(운용사별·유형별 M/S 막대 포함)', /NAV 상위 20 변천/.test(mg.titles[mg.titles.length - 1]) && mg.raceInLast && mg.msBars === 2, mg.titles.join(' / '));
    check('운용사별 NAV: 변천 위의 기존 섹션 순서 유지(상위 5개사 → M/S 변동 요인 → 월별 M/S 추이)', /상위 5개사 NAV/.test(mg.titles[0]) && /M\/S 변동 요인/.test(mg.titles[1]) && /월별 M\/S 추이/.test(mg.titles[2]), mg.titles.slice(0, 3).join(' / '));
    await freeze(); await p.screenshot({ path: `${OUT}/${name}_mgr.png`, fullPage: true });
    check('스크립트 오류 없음', errs.length === 0, errs.slice(0, 3).join(' | '));
    await p.close();
  }
  await b.close();
  console.log(fails ? `\n실패 ${fails}건` : '\n전부 통과');
  process.exit(fails ? 1 : 0);
})();
