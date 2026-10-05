/* v26 화면 점검 (web.html = Vercel 빌드, index.html = Apps Script 화면) — CHROME_PATH=/opt/pw-browsers/chromium node v26_shot.js
 *  요약 'M/S 변동 요인' = 유형별 M/S 기여 상위 유형 · 운용사별 M/S 변동 요인 표(유형별 M/S 기여, 합계 = M/S 변동) ·
 *  상위 ETF 변천 유형별 M/S(유형최종3)와 막대 바로 아래 주석 · 신규상장 유형별 주석
 *  v28: 화면 문구에 내부 시트·열 이름(범례_유형·유형최종2/3·신규상장용·시트 메뉴) 없음 */
const { chromium } = require('playwright'), fs = require('fs');
const OUT = __dirname + '/shots_v26';
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
    const freeze = () => p.evaluate(() => App.charts.forEach(c => { c.options.animation = false; c.update('none'); }));
    await wait();

    // 요약
    const sm = await p.evaluate(async () => {
      const kv = [...document.querySelectorAll('table.kv tr')].map(tr => [tr.cells[0].textContent, tr.cells[1].textContent, tr.cells[1].innerHTML]);
      const row = kv.find(x => x[0] === 'M/S 변동 요인') || ['', '', ''];
      // 계산 점검: 유형별 기여 합계 = M/S 변동(행 자료 ms − msPy)
      const vals = await Promise.all(Object.values(App._memo).map(x => Promise.resolve(x).catch(() => null)));
      const d = vals.map(x => x && x.data ? x.data : x).find(x => x && x.mix && x.rows) || null;
      let chk = null;
      if (d) chk = d.rows.filter(r => r.mgr !== '기타').map(r => { const gr = growthRows(d, r.mgr), sc = gr.rows.reduce((s, x) => s + x.c, 0); return { mgr: r.mgr, sum: sc, dms: gr.dms, ms: r.ms - r.msPy }; });
      return { row, chk };
    });
    console.log('     M/S 변동 요인 | ' + sm.row[1]);
    check('요약: M/S 변동 요인 = NAV 증감률 비교 + 유형별 M/S 기여 상위 유형(시장 증가분 중 몫 vs 비교 기준 M/S)', /(하락|상승) 요인/.test(sm.row[1]) && /시장 증가분 중 한투 몫/.test(sm.row[1]) && /M\/S \d/.test(sm.row[1]) && /<br>/.test(sm.row[2]));
    check('요약: v24 문구(주력 유형 중 차이 최대) 없음', !/주력 유형/.test(sm.row[1]));
    if (sm.chk) {
      check('계산: 운용사별 유형별 M/S 기여 합계 = M/S 변동(5개사)', sm.chk.length === 5 && sm.chk.every(x => Math.abs(x.sum - x.dms) < 1e-9 && Math.abs(x.dms - x.ms) < 1e-6), sm.chk.map(x => `${x.mgr} ${x.sum.toFixed(3)}/${x.ms.toFixed(3)}`).join(' · '));
    } else check('계산: byMgr 자료 찾음', false);
    // v27: 반대 방향 최대 기여(상쇄 요인) — 실데이터 2025-06(전년말 대비) 한투 유형별 값으로 점검
    const off = await p.evaluate(() => {
      const mk = (type, c, cap) => ({ type, c, cap });
      const gr = { dms: 0.227, s0: 7.56, rows: [mk('국내주식형', -0.262, 3.3), mk('해외주식형', 0.200, 12.7), mk('채권형', -0.070, 6.3), mk('파생형', -0.025, 3.2), mk('혼합채권형', 0.118, 37.4), mk('기타', 0.265, 34.7)] };
      const g2 = { dms: -1.273, s0: 8.53, rows: [mk('국내주식형', -0.863, 3.9), mk('해외주식형', -0.090, 7.5), mk('채권형', -0.030, 3.5), mk('파생형', -0.312, 1.4), mk('혼합채권형', 0.016, 9.3), mk('기타', 0.007, 11.2)] };
      return [msDriverText(App, gr, '한투', '전년말').replace(/<[^>]+>/g, ''), msDriverText(App, g2, '한투', '전년말').replace(/<[^>]+>/g, '')];
    });
    console.log('     ' + off.join('\n     '));
    check('상쇄 요인: M/S 상승(+0.23%p)이어도 국내주식형 −0.26%p 표시', /^상승 요인 기타 \+0\.27%p · 해외주식형 \+0\.20%p .* · 상쇄 요인 국내주식형 -0\.26%p \(한투 몫 3\.3%\)$/.test(off[0]), off[0]);
    check('상쇄 요인: 반대 방향 0.1%p 미만이면 생략(09-30)', /^하락 요인 국내주식형 -0\.86%p · 파생형 -0\.31%p /.test(off[1]) && !/상쇄/.test(off[1]), off[1]);
    await freeze(); await p.screenshot({ path: `${OUT}/${name}_summary.png`, fullPage: true });

    // 운용사별
    await p.evaluate(() => App.show('mgr')); await wait();
    const mg = await p.evaluate(() => {
      const view = document.getElementById('view'), secs = [...view.querySelectorAll(':scope > .section')], s = secs[1];
      const cols = [...s.querySelectorAll('table.tbl thead tr:last-child th')].map(th => th.textContent);
      const body = [...s.querySelectorAll('table.tbl tbody tr')].map(tr => [...tr.cells].map(c => c.textContent.trim()));
      const tot = [...s.querySelectorAll('table.tbl tfoot tr, table.tbl tr.total')].map(tr => [...tr.cells].map(c => c.textContent.trim())).pop() || body[body.length - 1];
      return { title: s.querySelector('.h2').textContent, desc: (s.querySelector('.section-h .note') || {}).textContent || '', sub: s.querySelector('.h3').textContent, drv: (s.querySelector('.ms-drv') || {}).textContent || '', cols, body, tot,
        lede: (document.getElementById('lede') || {}).textContent || '' };
    });
    console.log('     ' + mg.title + '\n     ' + mg.sub + '\n     ' + mg.drv + '\n     ' + mg.cols.join(' | ') + '\n     ' + mg.body.map(r => r.join(' | ')).join('\n     '));
    check('운용사별: 제목·설명(기여 산식·합계 = M/S 변동)', /유형별 M\/S 기여/.test(mg.title) && /시장 증감액 × 전년말 M\/S/.test(mg.desc) && /합계 = M\/S 변동/.test(mg.desc), mg.desc);
    check('운용사별: 6열(유형·시장 증감액·한투 증감액·시장 증가분 중 한투 몫·M/S 기여·한투 내 비중)', mg.cols.length === 6 && mg.cols[3] === '시장 증가분 중 한투 몫' && mg.cols[4] === 'M/S 기여(%p)', mg.cols.join('|'));
    const ci = mg.cols.indexOf('M/S 기여(%p)'), last = mg.body[mg.body.length - 1];
    const sumC = mg.body.filter(r => r[0] !== '합계').reduce((s, r) => s + parseFloat(r[ci].replace('%p', '').replace('−', '-')), 0);
    check('운용사별: 합계 행 M/S 기여 = 소제목 M/S 변동, 유형 합(반올림 오차 이내)', last[0] === '합계' && mg.sub.indexOf('(' + last[ci] + ')') > 0 && Math.abs(sumC - parseFloat(last[ci])) < 0.03, last[ci] + ' / 유형 합 ' + sumC.toFixed(2));
    check('운용사별: 주요 유형 문구', /(하락|상승) 요인/.test(mg.drv), mg.drv);
    if (name === 'web') check('웹 상단 설명: 하락/상승 요인 유형', /(하락|상승) 요인 \S+ [+−-]\d/.test(mg.lede), mg.lede.slice(0, 200));
    await p.evaluate(() => { const c = [...document.querySelectorAll('.chip-m')].find(b => b.dataset.k === '삼성'); c.click(); });
    const sub2 = await p.evaluate(() => { const s = [...document.querySelectorAll('#view > .section')][1]; return s.querySelector('.h3').textContent + ' / ' + [...s.querySelectorAll('table.tbl thead tr:last-child th')].map(th => th.textContent)[3]; });
    check('운용사별: 칩 선택 → 삼성 기준 표', /^삼성:/.test(sub2) && /삼성 몫/.test(sub2), sub2);
    await p.evaluate(() => { const c = [...document.querySelectorAll('.chip-m')].find(b => b.dataset.k === '한투'); c.click(); });
    await freeze();
    await p.evaluate(() => { const s = [...document.querySelectorAll('#view > .section')][1]; window.scrollTo(0, s.getBoundingClientRect().top + window.scrollY - 80); }); await p.waitForTimeout(200);
    await p.screenshot({ path: `${OUT}/${name}_mgr.png`, fullPage: false });

    // 상위 ETF
    await p.evaluate(() => App.show('top')); await wait();
    await p.waitForSelector('.race-ms', { timeout: 60000 }); await p.waitForTimeout(400);
    const tp = await p.evaluate(() => {
      const ms = [...document.querySelectorAll('.race-ms')], nt = document.querySelector('.race-note');
      return { bars: ms.map(x => ({ l: x.querySelector('.race-ms-l').textContent, segs: [...x.querySelectorAll('.race-ms-seg')].filter(s => s.style.display !== 'none').map(s => s.title.split(' · ').slice(0, 1).concat(s.title.split(' · ').slice(-1)).join(' ')) })),
        note: nt ? nt.textContent : '', after: nt && nt.previousElementSibling === ms[ms.length - 1], listTypes: [...document.querySelectorAll('#view table.tbl tbody tr')].filter(tr => /KOFR|CD금리/.test(tr.textContent)).map(tr => tr.textContent).slice(0, 3) };
    });
    console.log('     ' + tp.bars.map(x => x.l + ': ' + x.segs.join(', ')).join('\n     '));
    const RAW = /범례|유형최종|신규상장용|시트/;   // v28: 화면에 내부 시트·열 이름 금지
    check('상위 ETF: 유형별 M/S 막대 바로 아래 주석(내부 용어 없음)', tp.after && !RAW.test(tp.note) && /채권·금리를 기초로 하는 합성\(파생\) 상품/.test(tp.note) && /채권형으로 분류/.test(tp.note), tp.note);
    check('상위 ETF 목록: 금리 합성 종목 유형 = 채권형', tp.listTypes.length > 0 && tp.listTypes.every(t => /채권형/.test(t) && !/파생형/.test(t)), tp.listTypes.length + '종목');
    await p.evaluate(() => { const r = document.querySelector('.race'); window.scrollTo(0, r.getBoundingClientRect().top + window.scrollY - 160); }); await p.waitForTimeout(300);
    await p.screenshot({ path: `${OUT}/${name}_top.png`, fullPage: false });

    // 신규상장 (2025년 전체)
    await p.evaluate(() => { App.state.year = '2025'; App.state.date = App.dateOptions().filter(o => o.value.slice(0, 4) === '2025').pop().value; App.state.filter = 'all'; App.show('new'); }); await wait();
    const nw = await p.evaluate(() => {
      const s = [...document.querySelectorAll('#view > .section')].find(x => /유형별/.test(x.querySelector('.h2').textContent));
      return s ? { desc: s.querySelector('.section-h .note').textContent, foot: [...s.querySelectorAll(':scope > .note')].map(x => x.textContent).join(' ') } : null;
    });
    check('신규상장 유형별: 설명·주석에 내부 용어 없음 · 주석 있음', !!nw && !RAW.test(nw.desc + nw.foot) && /채권형으로 분류/.test(nw.foot), nw && nw.desc + ' / ' + nw.foot);
    const raw = await p.evaluate(() => { const t = document.getElementById('view').innerText + ' ' + [...document.querySelectorAll('[title]')].map(e => e.title).join(' '); const m = t.match(/범례_\S+|유형최종\d|신규상장용|시트 메뉴/g); return m ? [...new Set(m)] : []; });
    check('신규상장 화면 전체(표 머리글 포함): 내부 용어 없음', raw.length === 0, raw.join(', ') || 'none');
    await freeze(); await p.screenshot({ path: `${OUT}/${name}_new.png`, fullPage: true });

    const real = errs.filter(e => !/ERR_FILE_NOT_FOUND/.test(e));
    check('페이지 오류 없음', real.length === 0, real.join(' | ') || 'none');
    await p.close();
  }
  await b.close();
  console.log(fails ? `\n실패 ${fails}건` : '\n모두 통과');
  process.exit(fails ? 1 : 0);
})();
