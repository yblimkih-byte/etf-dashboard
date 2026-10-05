/* v24 화면 점검 (web.html = Vercel 빌드, index.html = Apps Script 화면) — CHROME_PATH=/opt/pw-browsers/chromium node v24_shot.js
 *  요약(핵심 요약 표·상단 문장 없음) · 첫 화면 묶음(boot)으로 서버 조회 생략 · 운용사별(폭·표 폭·기여도 제거·증감률 비교) ·
 *  유형별(폭·세로 배치·히트맵 띠) · 상위 ETF(폭·유형별 M/S 막대) · 상위 5개사 유형 비중(폭) · 신규상장(유형별) */
const { chromium } = require('playwright'), fs = require('fs');
const OUT = __dirname + '/shots_v24';
(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const b = await chromium.launch({ executablePath: process.env.CHROME_PATH });
  let fails = 0; const check = (name, ok, info) => { if (!ok) fails++; console.log((ok ? '  OK   ' : '  FAIL ') + name + (info !== undefined ? ' — ' + (typeof info === 'string' ? info : JSON.stringify(info)) : '')); };
  for (const [file, name] of [['web.html', 'web'], ['index.html', 'gas']]) {
    console.log(`[${name}]`);
    const p = await b.newPage({ viewport: { width: 1440, height: 900 } }); const errs = [];
    p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
    await p.route('**/*', r => /^https?:/.test(r.request().url()) ? r.fulfill({ status: 200, body: '' }) : r.continue());
    await p.goto('file://' + __dirname + '/' + file); await p.waitForSelector('.tab');
    const wait = () => p.waitForFunction(() => !document.querySelector('#view > .loading'), null, { timeout: 60000 }).then(() => p.waitForTimeout(500));
    const freeze = () => p.evaluate(() => App.charts.forEach(c => { c.options.animation = false; c.update('none'); }));   // 전체 화면 캡처 시 크기 변경으로 다시 그려지는 애니메이션 첫 장면이 찍히지 않게
    await wait();
    const first = await p.evaluate(() => ({ calls: window.MOCK.calls.slice(), tab: App.state.tab, kv: [...document.querySelectorAll('table.kv tr')].map(tr => tr.cells[0].textContent + ' | ' + tr.cells[1].textContent), sumLines: document.querySelectorAll('.sum-lines').length,
      lede: (document.getElementById('lede') || {}).className || '-', cards: document.querySelectorAll('.cards .cd').length, tiles: document.querySelectorAll('#view > .grid:first-child .tile').length, narrow: document.body.classList.contains('narrow-tab') }));
    check('첫 탭 = 요약, 폭 제한', first.tab === 'summary' && first.narrow);
    const bg = ['treemap', 'race', 'turnover'];   // 첫 화면을 그린 뒤 시작되는 선조회
    check('첫 화면: 서버 조회는 boot 1건(웹) / 없음(Apps Script, 페이지에 포함) — 그 밖에는 선조회만', name === 'web' ? first.calls[0] === 'boot' && first.calls.slice(1).every(a => bg.includes(a)) : first.calls.every(a => bg.includes(a)), first.calls.join(',') || '(없음)');
    check('핵심 요약 표 5행·설명 문장 목록 없음', first.kv.length === 5 && first.sumLines === 0, first.kv.map(x => x.split(' | ')[0]).join(' · '));
    console.log('     ' + first.kv.join('\n     '));
    if (name === 'web') check('웹: 상단 설명 줄 숨김·지표 카드 4개', first.lede.indexOf('empty') >= 0 && first.cards === 4, first.lede + ' / ' + first.cards);
    else check('Apps Script: 지표 4개', first.tiles === 4, first.tiles);
    await freeze(); await p.screenshot({ path: `${OUT}/${name}_summary.png`, fullPage: true });
    await p.waitForTimeout(2500);   // 선조회(히트맵·변천·거래대금)
    const pre = await p.evaluate(() => window.MOCK.calls.slice());
    check('선조회: 히트맵·변천·거래대금만 추가 조회(나머지 탭은 boot 자료)', ['treemap', 'race', 'turnover'].every(a => pre.includes(a)) && !pre.some(a => ['meta', 'byMgr', 'overview', 'byType', 'topEtf', 'newListings', 'shares'].includes(a)), pre.join(','));

    // 운용사별
    await p.evaluate(() => App.show('mgr')); await wait();
    const mgr = await p.evaluate(() => {
      const view = document.getElementById('view'), secs = [...view.querySelectorAll(':scope > .section')], t1 = secs[0].querySelector('table.tbl');
      return { narrow: document.body.classList.contains('narrow-tab'), viewW: Math.round(view.getBoundingClientRect().width), secW: Math.round(secs[0].getBoundingClientRect().width), tblW: Math.round(t1.getBoundingClientRect().width),
        titles: secs.map(s => s.querySelector('.h2').textContent), contrib: /점유율 효과|구성 효과|기여도/.test(view.textContent), gcols: secs[1] ? [...secs[1].querySelectorAll('table.tbl thead tr:last-child th')].map(th => th.textContent) : [],
        sub: secs[1] ? secs[1].querySelector('.h3').textContent : '', rows: secs[1] ? secs[1].querySelectorAll('table.tbl tbody tr').length : 0 };
    });
    check('운용사별: 폭 제한', mgr.narrow && mgr.viewW <= 1060, mgr.viewW + 'px');
    check('운용사별: 상위 5개사 표 폭 < 섹션 폭(내용 폭)', mgr.tblW < mgr.secW - 40, mgr.tblW + ' / ' + mgr.secW);
    check('운용사별: 점유율/구성 효과·기여도 표시 없음', !mgr.contrib);
    check('운용사별: M/S 변동 요인 표(v26: 유형별 M/S 기여 6열)', mgr.titles[1] && mgr.titles[1].indexOf('M/S 변동 요인') === 0 && mgr.gcols.length === 6, mgr.gcols.join('|'));
    console.log('     ' + mgr.sub);
    await p.evaluate(() => { const c = [...document.querySelectorAll('.chip-m')].find(b => b.dataset.k === '삼성'); c.click(); });
    const sub2 = await p.evaluate(() => [...document.querySelectorAll('#view > .section')][1].querySelector('.h3').textContent);
    check('운용사별: 칩 선택 → 삼성 증감률 비교', sub2.indexOf('삼성:') === 0, sub2);
    await p.evaluate(() => { const c = [...document.querySelectorAll('.chip-m')].find(b => b.dataset.k === '한투'); c.click(); });
    await freeze(); await p.screenshot({ path: `${OUT}/${name}_mgr.png`, fullPage: true });

    // 유형별
    await p.evaluate(() => App.show('type')); await wait();
    await p.waitForSelector('.tm-cell', { timeout: 60000 }); await p.waitForTimeout(400);
    const ty = await p.evaluate(() => {
      const view = document.getElementById('view'), cv = [...view.querySelectorAll(':scope > .section')][0].querySelectorAll('canvas'), host = view.querySelector('.treemap-host');
      const r = [...cv].map(c => c.getBoundingClientRect()), groups = [...host.querySelectorAll('.tm-group')].map(g => ({ l: parseFloat(g.style.left), t: parseFloat(g.style.top), w: parseFloat(g.style.width), h: parseFloat(g.style.height), k: g.querySelector('.tm-head').textContent.split(' ')[0] }));
      return { narrow: document.body.classList.contains('narrow-tab'), n: cv.length, stacked: r.length === 2 && r[1].top >= r[0].bottom - 2 && Math.abs(r[0].left - r[1].left) < 4, w0: Math.round(r[0].width), hostW: host.clientWidth, banded: host.classList.contains('tm-banded'), groups };
    });
    check('유형별: 폭 제한', ty.narrow);
    check('유형별: 상품유형별·국내/해외 막대를 위아래로', ty.stacked, ty.n + '개, 폭 ' + ty.w0);
    check('유형별: 히트맵 유형별 띠(전체 폭, 위에서 아래로)', ty.banded && ty.groups.length >= 4 && ty.groups.every(g => g.l <= 2 && g.w >= ty.hostW - 4) && ty.groups.every((g, i) => !i || g.t >= ty.groups[i - 1].t), ty.groups.map(g => g.k + ':' + Math.round(g.h)).join(' '));
    await freeze(); await p.screenshot({ path: `${OUT}/${name}_type.png`, fullPage: true });

    // 상위 5개사·시장 유형 비중
    await p.evaluate(() => App.show('shares')); await wait();
    check('유형 비중 탭: 폭 제한', await p.evaluate(() => document.body.classList.contains('narrow-tab')));

    // 상위 ETF
    await p.evaluate(() => App.show('top')); await wait();
    await p.waitForSelector('.race-ms', { timeout: 60000 }); await p.waitForTimeout(400);
    const top = await p.evaluate(() => {
      const bars = [...document.querySelectorAll('.race-ms')].map(x => ({ l: x.querySelector('.race-ms-l').textContent, segs: [...x.querySelectorAll('.race-ms-seg')].filter(s => s.style.display !== 'none').map(s => s.title.split(' · ')[0] + ' ' + s.textContent) }));
      return { narrow: document.body.classList.contains('narrow-tab'), bars };
    });
    check('상위 ETF: 폭 제한', top.narrow);
    check('상위 ETF: 운용사별 M/S 아래 유형별 M/S 막대', top.bars.length === 2 && /운용사별/.test(top.bars[0].l) && /유형별/.test(top.bars[1].l) && top.bars[1].segs.length >= 2, top.bars.map(x => x.l + ': ' + x.segs.join(', ')).join(' / '));
    const ym0 = await p.evaluate(() => document.querySelector('.race-ym').textContent);
    await p.evaluate(() => { const r = document.querySelector('.race-range'); r.value = '0'; r.dispatchEvent(new Event('input')); });
    const after = await p.evaluate(() => ({ ym: document.querySelector('.race-ym').textContent, t: [...document.querySelectorAll('.race-ms')][1].querySelector('.race-ms-seg').title }));
    check('상위 ETF: 슬라이더 이동 시 유형별 막대 갱신', after.ym !== ym0, ym0 + ' → ' + after.ym + ' (' + after.t + ')');
    await p.evaluate(() => { const r = document.querySelector('.race-range'); r.value = r.max; r.dispatchEvent(new Event('input')); });
    await p.evaluate(() => { const r = document.querySelector('.race'); window.scrollTo(0, r.getBoundingClientRect().top + window.scrollY - 220); }); await p.waitForTimeout(300);
    await p.screenshot({ path: `${OUT}/${name}_top.png`, fullPage: false });

    // 신규상장 (2025년 전체: 종목이 있는 연도)
    await p.evaluate(() => { App.state.year = '2025'; App.state.date = App.dateOptions().filter(o => o.value.slice(0, 4) === '2025').pop().value; App.state.filter = 'all'; App.show('new'); }); await wait();
    const nw = await p.evaluate(() => {
      const secs = [...document.querySelectorAll('#view > .section')], s = secs.find(x => /유형별/.test(x.querySelector('.h2').textContent));
      if (!s) return { ok: false, titles: secs.map(x => x.querySelector('.h2').textContent) };
      const rows = [...s.querySelectorAll('tbody tr')].map(tr => [...tr.cells].map(c => c.textContent.trim()).join(' / '));
      return { ok: true, idx: secs.indexOf(s), titles: secs.map(x => x.querySelector('.h2').textContent), canvas: !!s.querySelector('canvas'), grid: !!s.querySelector('.grid.grid-2'), rows };
    });
    check('신규상장: 운용사별 아래 유형별(막대+표, 같은 양식)', nw.ok && nw.idx === 1 && nw.canvas && nw.grid && nw.rows.length >= 5 && /^합계/.test(nw.rows[nw.rows.length - 1]) && ['국내주식형', '해외주식형', '채권형', '파생형'].every(t => nw.rows.some(r => r.indexOf(t) === 0)), (nw.titles || []).join(' | '));
    console.log('     ' + (nw.rows || []).join('\n     '));
    await freeze(); await p.screenshot({ path: `${OUT}/${name}_new.png`, fullPage: true });

    // 거래대금
    await p.evaluate(() => App.show('turnover')); await wait();
    check('거래대금: 표시', await p.evaluate(() => document.querySelectorAll('#view table.tbl').length > 0));
    const real = errs.filter(e => !/ERR_FILE_NOT_FOUND/.test(e));   // file:// 에서 웹폰트 파일(로컬에 없음) 404 는 제외
    check('페이지 오류 없음', real.length === 0, real.join(' | ') || 'none');
    await p.close();
  }
  // 첫 화면 묶음 없이(이전 서버·캐시 없음): meta 로 대체
  await b.close();
  console.log(fails ? `\n실패 ${fails}건` : '\n모두 통과');
  process.exit(fails ? 1 : 0);
})();
