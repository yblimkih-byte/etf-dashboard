/* v42 화면 점검 — NAV 증감 요인(설정액·평가 증감) 섹션 (index.html = Apps Script 화면, web.html = Vercel 빌드)
 *  V29B=1 node build_page.js && V29B=1 node build_web.js && CHROME_PATH=/opt/pw-browsers/chromium node v42_shot.js
 *  운용사별 NAV: 월별 막대(설정액·평가 증감 + NAV 증감 선)·월별 표·운용사별 표(합계 = 위 NAV 표 증감액)·설정/해지 상위 ETF, 운용사 칩·기간 버튼
 *  유형별 NAV: 유형·운용사 칩, 유형별 표(합계 = 위 유형 표 증감액) · 요약: '자금 유출입' 행 · 준비 전 문구 · 오류 없음 */
const { chromium } = require('playwright'), fs = require('fs');
const OUT = __dirname + '/shots_v42';
const num = t => { const m = String(t || '').replace(/,/g, '').match(/[-+−]?\d+(\.\d+)?/); return m ? +m[0].replace('−', '-') : NaN; };
(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const b = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/opt/pw-browsers/chromium' });
  let fails = 0; const check = (name, ok, info) => { if (!ok) fails++; console.log((ok ? '  OK   ' : '  FAIL ') + name + (info !== undefined ? ' — ' + (typeof info === 'string' ? info : JSON.stringify(info)) : '')); };
  for (const [file, name, vw] of [['index.html', 'gas', { width: 1568, height: 751 }], ['web.html', 'web', { width: 1920, height: 919 }]]) {
    console.log(`[${name}]`);
    const p = await b.newPage({ viewport: vw }); const errs = [];
    p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errs.push('console: ' + m.text()); });
    await p.route('**/*', r => /^https?:/.test(r.request().url()) ? r.fulfill({ status: 200, body: '' }) : r.continue());
    await p.goto('file://' + __dirname + '/' + file); await p.waitForSelector('.tab');
    const wait = () => p.waitForFunction(() => !document.querySelector('#view > .loading') && ![...document.querySelectorAll('#view .empty')].some(e => /불러오는 중/.test(e.textContent)), null, { timeout: 90000 }).then(() => p.waitForTimeout(400));
    const freeze = () => p.evaluate(() => App.charts.forEach(c => { c.options.animation = false; c.update('none'); }));
    const sec = t => p.evaluate(t => { const s = [...document.querySelectorAll('#view .section')].find(x => (x.querySelector('.h2') || {}).textContent.indexOf(t) === 0); if (!s) return null;
      const tbls = [...s.querySelectorAll('table.tbl')].map(tb => ({ head: [...tb.querySelectorAll('thead tr:last-child th')].map(x => x.textContent.trim()), rows: [...tb.querySelectorAll('tbody tr:not(.total)')].map(tr => [...tr.children].map(td => td.textContent.trim())), total: tb.querySelector('tr.total') ? [...tb.querySelector('tr.total').children].map(td => td.textContent.trim()) : null }));
      return { subs: [...s.querySelectorAll('.h3')].map(x => x.textContent.trim()), tbls, chips: [...s.querySelectorAll('.chip-m')].map(x => x.textContent.trim()), rng: [...s.querySelectorAll('.flow-rng button')].map(x => x.textContent + (x.classList.contains('on') ? '*' : '')), canv: s.querySelectorAll('canvas').length, notes: [...s.querySelectorAll('.note')].map(x => x.textContent), txt: s.textContent }; }, t);
    const chartDs = t => p.evaluate(t => { const s = [...document.querySelectorAll('#view .section')].find(x => (x.querySelector('.h2') || {}).textContent.indexOf(t) === 0); const c = s && s.querySelector('canvas'); const ch = c && App.charts.find(x => x.canvas === c); return ch ? { n: ch.data.labels.length, ds: ch.data.datasets.map(d => [d.type || 'bar', d.label]), last: ch.data.labels[ch.data.labels.length - 1], sum: ch.data.datasets[0].data.slice(-3).map((x, i) => Math.abs(x - ch.data.datasets[1].data.slice(-3)[i] - ch.data.datasets[2].data.slice(-3)[i]) < 1) } : null; }, t);
    const click = (t, label) => p.evaluate(([t, label]) => { const s = [...document.querySelectorAll('#view .section')].find(x => (x.querySelector('.h2') || {}).textContent.indexOf(t) === 0); const btn = [...s.querySelectorAll('.chip-m, .flow-rng button')].find(x => x.textContent.trim() === label); btn.click(); return !!btn; }, [t, label]);
    await wait();

    // ① 운용사별 NAV
    await p.evaluate(() => App.show('mgr')); await wait();
    const T = 'NAV 증감 요인';
    let s = await sec(T);
    check('운용사별 NAV: 섹션(위 NAV 표 바로 다음) · 막대 1개 · 운용사 칩(시장 전체 + 6) · 기간 3개(기본 최근 24개월)', !!s && s.canv === 1 && s.chips.length === 7 && s.chips[0] === '시장 전체' && s.rng.join() === '올해,최근 24개월*,2021년 이후'
      && await p.evaluate(() => { const hs = [...document.querySelectorAll('#view .section .h2')].map(x => x.textContent); return hs[1] && hs[1].indexOf('NAV 증감 요인') === 0; }), s && { chips: s.chips, rng: s.rng });
    let cd = await chartDs(T);
    check('막대: NAV 증감(선) · 설정액 · 평가 증감, 24개월, 끝 = 기준월, 선 = 막대 합', cd && cd.ds.map(x => x[0] + ':' + x[1]).join() === 'line:NAV 증감,bar:설정액(자금 유출입),bar:평가 증감' && cd.n === 24 && cd.sum.every(Boolean), cd);
    const ym = await p.evaluate(() => App.state.date.slice(0, 7));
    check('월별 표: 24행, 최근 월부터(첫 행 = 기준월) · 산출(일별 합/월말 근사)', s.tbls[0].rows.length === 24 && s.tbls[0].rows[0][0] === ym && cd.last === ym && s.tbls[0].rows.some(r => r[5] === '일별 합') && s.tbls[0].rows.some(r => r[5] === '월말 근사'), { first: s.tbls[0].rows[0], last: s.tbls[0].rows[23] });
    check('월별 표: NAV 증감 = 설정액 + 평가 증감(±0.01)', s.tbls[0].rows.every(r => Math.abs(num(r[1]) + num(r[2]) - num(r[3])) <= 0.011));
    // 운용사별 표 합계 = 위 NAV 표 증감액(전년말 대비) — 1자리 반올림 차
    const top = await p.evaluate(() => { const s = document.querySelector('#view .section'); const tb = s.querySelector('table.tbl'); return { rows: [...tb.querySelectorAll('tbody tr:not(.total)')].map(tr => [...tr.children].map(td => td.textContent.trim())), total: [...tb.querySelector('tr.total').children].map(td => td.textContent.trim()) }; });
    const ct = s.tbls[1];
    check('운용사별 표: 6개사 + 시장 전체 합계 · 머리글(비교 기준 이후·기준월)', ct.rows.length === 6 && ct.total[0] === '시장 전체' && ct.head.join() === '운용사,NAV 증감,설정액,평가 증감,설정액 점유율,설정액,평가 증감', ct.head);
    const navChg = Object.fromEntries(top.rows.map(r => [r[0], num(r[2])]));
    const bad = ct.rows.filter(r => Math.abs(num(r[1]) - navChg[r[0]]) > 0.051);
    check('운용사별 NAV 증감(설정액 + 평가) = 위 표 증감액(전년말 대비) — 6개사·시장', !bad.length && Math.abs(num(ct.total[1]) - num(top.total[2])) <= 0.051, { bad, mkt: [ct.total[1], top.total[2]] });
    check('운용사별 표: 설정액 + 평가 증감 = NAV 증감, 점유율 합 100%', ct.rows.every(r => Math.abs(num(r[2]) + num(r[3]) - num(r[1])) <= 0.011) && (ct.total[4] === '-' || Math.abs(ct.rows.reduce((a, r) => a + num(r[4]), 0) - 100) < 0.6));
    check('설정 상위·해지 상위 ETF 표(기준월) · 설정액 부호', s.tbls.length === 4 && s.tbls[2].rows.length > 0 && s.tbls[2].rows.every(r => num(r[2]) > 0) && s.tbls[3].rows.every(r => num(r[2]) < 0) && s.subs.some(x => x.indexOf(ym + ' 설정 상위·해지 상위 ETF — 시장 전체') === 0), s.subs);
    check('설명: 산식·산출 방법(일별 합·월말 근사)·내부 이름 없음', /설정액 = 좌수 변화 × 전일 1좌당 NAV/.test(s.txt) && /분배금은 유출이 아닌 평가로 봄/.test(s.txt) && s.notes.some(n => /영업일별 합/.test(n) && /월말 두 시점 근사/.test(n)) && !/agg_|raw_|유형최종|FLOW|flows/.test(s.txt));
    await freeze(); await p.evaluate(() => [...document.querySelectorAll('#view .section')].find(x => x.querySelector('.h2').textContent.indexOf('NAV 증감 요인') === 0).scrollIntoView());
    await p.screenshot({ path: `${OUT}/${name}_mgr_flow.png` });
    // 운용사 선택 → 한투
    await click(T, '한투'); await wait(); s = await sec(T); cd = await chartDs(T);
    check('한투 선택 → 제목·막대·ETF 표가 한투, 운용사 표 강조', s.subs[0].indexOf('한투:') === 0 && s.subs.some(x => /ETF — 한투/.test(x)) && s.tbls[2].rows.concat(s.tbls[3].rows).every(r => r[1] === '한투')
      && await p.evaluate(() => !!document.querySelector('#view tr.hl[data-top="한투"]')), s.subs);
    const hRow = ct.rows.find(r => r[0] === '한투');
    check('한투 월별 표 기간 합계 = 운용사별 표 한투 행(비교 기준 이후 설정액)', Math.abs(s.tbls[0].rows.filter(r => r[0] > (top.base || '') && r[0].slice(0, 4) === ym.slice(0, 4)).reduce((a, r) => a + num(r[1]), 0) - num(hRow[2])) <= 0.1, { sum: s.tbls[0].rows.filter(r => r[0].slice(0, 4) === ym.slice(0, 4)).reduce((a, r) => a + num(r[1]), 0), row: hRow[2] });
    await click(T, '2021년 이후'); await wait(); cd = await chartDs(T); s = await sec(T);
    check('기간 2021년 이후 → 2021-02부터 기준월까지(표 전체 보기 포함)', cd.n > 24 && s.tbls[0].rows[s.tbls[0].rows.length - 1][0] === '2021-02' && s.rng[2] === '2021년 이후*', { n: cd.n });
    await click(T, '올해'); await wait(); cd = await chartDs(T);
    check('기간 올해 → 1월~기준월', cd.n === +ym.slice(5, 7), cd.n);
    await click(T, '최근 24개월'); await wait();

    // ② 유형별 NAV
    await p.evaluate(() => App.show('type')); await wait();
    const TT = '유형별 NAV 증감 요인';
    s = await sec(TT);
    const tTop = await p.evaluate(() => { const tb = document.querySelector('#view .section table.tbl'); return { rows: [...tb.querySelectorAll('tbody tr:not(.total)')].map(tr => [...tr.children].map(td => td.textContent.trim())), total: [...tb.querySelector('tr.total').children].map(td => td.textContent.trim()) }; });
    check('유형별 NAV: 섹션 · 유형 칩(전체 유형 + 유형) · 운용사 칩(시장 전체 + 6)', !!s && s.chips[0] === '전체 유형' && s.chips.includes('해외주식형') && s.chips.includes('시장 전체') && s.chips.length >= 13, s && s.chips);
    const tt = s.tbls[1], tChg = Object.fromEntries(tTop.rows.map(r => [r[0], num(r[2])]));
    const badT = tt.rows.filter(r => tChg[r[0]] !== undefined && Math.abs(num(r[1]) - tChg[r[0]]) > 0.051);
    check('유형별 표: 유형 + 국내/해외 행 · NAV 증감 = 위 유형 표 증감액 · 합계 = 시장', tt.rows.some(r => r[0] === '국내') && tt.rows.some(r => r[0] === '해외') && !badT.length && Math.abs(num(tt.total[1]) - num(tTop.total[2])) <= 0.051, { badT, tot: [tt.total[1], tTop.total[2]] });
    await click(TT, '해외주식형'); await wait(); await click(TT, '한투'); await wait(); s = await sec(TT);
    check('해외주식형 · 한투 선택 → 제목 · ETF 표(운용사 열 = 한투) · 유형 표(한투 기준, 국내/해외 행 없음)', s.subs[0].indexOf('해외주식형 · 한투:') === 0 && s.tbls[1].total[0] === '한투 합계' && !s.tbls[1].rows.some(r => r[0] === '국내') && s.tbls.slice(2).every(tb => tb.rows.every(r => r[1] === '한투')), s.subs);
    await freeze(); await p.evaluate(() => [...document.querySelectorAll('#view .section')].find(x => x.querySelector('.h2').textContent.indexOf('유형별 NAV 증감 요인') === 0).scrollIntoView());
    await p.screenshot({ path: `${OUT}/${name}_type_flow.png` });

    // ③ 요약 — 자금 유출입 행
    await p.evaluate(() => App.show('summary')); await wait();
    const kv = await p.evaluate(() => [...document.querySelectorAll('#view table.kv tr')].map(tr => [tr.children[0].textContent, tr.children[1].textContent]));
    const fr = kv.find(r => r[0] === '자금 유출입');
    check('요약: 자금 유출입 행(M/S 변동 요인 다음) — 한투 설정액·평가 증감·시장 중 몫·1위 운용사', !!fr && kv[kv.indexOf(fr) - 1][0] === 'M/S 변동 요인' && /한투 설정액 [-+]?\d/.test(fr[1]) && /평가 증감/.test(fr[1]) && /설정액 1위/.test(fr[1]), fr);
    const hS = hRow[2];
    check('요약 한투 설정액 = 운용사별 표 한투 설정액', fr && fr[1].indexOf('한투 설정액 ' + hS + '조원') === 0, [fr && fr[1].slice(0, 30), hS]);

    // ④ 준비 전(과거 자료 보충 중) 문구
    await p.evaluate(() => { const orig = App.call.bind(App); App.call = (a, q) => a === 'flows' ? Promise.resolve({ ready: false, fill: { done: 60, left: 180 } }) : orig(a, q); App.show('mgr'); });
    await wait(); s = await sec(T);
    check('준비 전: 섹션 자리 + 진행률 문구, 막대·표 없음 · 요약 행 생략', s && /설정액 자료 준비 중 — 과거 자료 보충이 끝나면 자동으로 표시 \(25%\)/.test(s.txt) && !s.canv && !s.tbls.length, s && s.txt.slice(-60));
    await p.evaluate(() => App.show('summary')); await wait();
    check('준비 전 요약: 자금 유출입 행 없음, 나머지 정상', await p.evaluate(() => ![...document.querySelectorAll('#view table.kv th')].some(x => x.textContent === '자금 유출입') && document.querySelectorAll('#view table.kv tr').length >= 5));
    check('오류 없음', !errs.length, errs.slice(0, 3));
    await p.close();
  }
  await b.close();
  console.log(fails ? `\n${fails}건 실패` : '\n모두 통과');
  process.exit(fails ? 1 : 0);
})();
