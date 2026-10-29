/* v43 화면 점검 — 설정액(자금 유출입) 섹션: 연초 이후 누적(선) + 월별(막대, 별도 축) (index.html = Apps Script 화면, web.html = Vercel 빌드)
 *  V29B=1 node build_page.js && V29B=1 node build_web.js && CHROME_PATH=/opt/pw-browsers/chromium node v43_shot.js
 *  운용사별 NAV: 기본 선택 한투 — 위 = 운용사 6개 누적 선(한투 파랑·나머지 회색), 아래 = 한투 월별 설정액 막대, 두 그림 같은 월 위치
 *               지표(설정액 | NAV 증감) · 연도 버튼 · 월별 표 보기 · 운용사별 표(선택 연도 누적 + 마지막 월) · 설정/해지 상위 ETF
 *  유형별 NAV: 기본 선택 첫 유형 — 유형별 누적 선 · 운용사 선택 · 유형별 표 · 요약 '자금 유출입' 행 · 준비 전 문구 · 'ACE 강조' 흐림 미적용 · 모바일 넘침 없음 · 오류 없음 */
const { chromium } = require('playwright'), fs = require('fs');
const OUT = __dirname + '/shots_v43';
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
      const tbls = [...s.querySelectorAll('table.tbl')].map(tb => ({ head: [...tb.querySelectorAll('thead tr:last-child th')].map(x => x.textContent.trim()), grp: [...tb.querySelectorAll('thead tr:first-child th')].map(x => x.textContent.trim()), rows: [...tb.querySelectorAll('tbody tr:not(.total)')].map(tr => [...tr.children].map(td => td.textContent.trim())), hl: [...tb.querySelectorAll('tbody tr.hl')].map(tr => tr.children[0].textContent.trim()), total: tb.querySelector('tr.total') ? [...tb.querySelector('tr.total').children].map(td => td.textContent.trim()) : null }));
      const cs = [...s.querySelectorAll('canvas')].map(c => App.charts.find(x => x.canvas === c)).filter(Boolean);
      const ch = cs.map(c => ({ type: c.config.type, labels: c.data.labels.slice(), ds: c.data.datasets.map(d => ({ k: d.label, on: !!d.$on, col: d.borderColor || d.backgroundColor, data: d.data.slice() })), ca: [Math.round(c.chartArea.left), Math.round(c.chartArea.right)], xs: c.data.labels.map((_, i) => Math.round(c.scales.x.getPixelForValue(i))) }));
      return { subs: [...s.querySelectorAll('.h3')].map(x => x.textContent.trim()), cts: [...s.querySelectorAll('.flow-ct')].map(x => x.textContent.trim()), tbls, ch,
        chips: [...s.querySelectorAll('.chip-m')].map(x => x.textContent.trim() + (x.classList.contains('on') ? '*' : '')), sw: s.querySelectorAll('.chip-m .sw').length,
        segs: [...s.querySelectorAll('.flow-rng')].map(w => [...w.querySelectorAll('button')].map(x => x.textContent + (x.classList.contains('on') ? '*' : ''))),
        det: !!s.querySelector('details.flow-tb'), lineNotes: s.querySelectorAll('.note-lines .nl').length, notes: [...s.querySelectorAll('.note')].map(x => x.textContent), txt: s.textContent }; }, t);
    const click = (t, label, n) => p.evaluate(([t, label, n]) => { const s = [...document.querySelectorAll('#view .section')].find(x => (x.querySelector('.h2') || {}).textContent.indexOf(t) === 0); const btn = [...s.querySelectorAll('.chip-m, .flow-rng button')].filter(x => x.textContent.trim() === label)[n || 0]; btn.click(); return !!btn; }, [t, label, n]);
    const W = v => v / 1e12;
    await wait();

    // ① 운용사별 NAV — 기본 선택 한투
    await p.evaluate(() => App.show('mgr')); await wait();
    const T = '운용사별 설정액(자금 유출입)';
    const ym = await p.evaluate(() => App.state.date.slice(0, 7)), Y = ym.slice(0, 4), M = +ym.slice(5, 7);
    let s = await sec(T);
    check('운용사별 NAV: 섹션(위 NAV 표 바로 다음) · 그림 2개 · 운용사 칩(시장 전체 + 6, 색 견본 없음) · 기본 선택 한투', !!s && s.ch.length === 2 && s.chips.length === 7 && s.chips[0] === '시장 전체' && s.chips.filter(x => /\*$/.test(x)).join() === '한투*' && !s.sw
      && await p.evaluate(() => { const hs = [...document.querySelectorAll('#view .section .h2')].map(x => x.textContent); return hs[1] && hs[1].indexOf('운용사별 설정액') === 0; }), s && s.chips);
    check('지표 버튼(설정액* | NAV 증감) · 연도 버튼(기준 연도* 먼저, 2021까지)', s.segs.length === 2 && s.segs[0].join() === '설정액*,NAV 증감' && s.segs[1][0] === Y + '*' && s.segs[1][s.segs[1].length - 1] === '2021', s.segs);
    let [L, B] = s.ch;
    check('위 = 누적 선: 전년말 + 1~기준월, 운용사 6개 선 · 한투만 강조(파랑)·나머지 회색 · 시작 0', L.type === 'line' && L.labels.length === M + 1 && L.labels[0] === '전년말' && L.labels[M] === M + '월' && L.ds.length === 6 && L.ds.filter(d => d.on).map(d => d.k).join() === '한투'
      && L.ds.every(d => d.col === (d.on ? '#1863dc' : '#c3c2b7') && d.data[0] === 0), { labels: L.labels, ds: L.ds.map(d => d.k + (d.on ? '*' : '') + ':' + d.col) });
    check('아래 = 한투 월별 막대: 같은 가로 칸(전년말 자리 비움) · 유입 파랑/유출 빨강 · 누적 선 = 막대 누계', B.type === 'bar' && B.labels.join() === L.labels.join() && B.ds.length === 1 && B.ds[0].data[0] === null
      && L.ds.find(d => d.on).data.every((v, i) => !i || Math.abs(v - L.ds.find(d => d.on).data[i - 1] - B.ds[0].data[i]) < 1)
      && B.ds[0].col.every((c, i) => !i || c === (B.ds[0].data[i] < 0 ? '#b3261e' : '#1c5cab')), B.ds[0].col);
    check('두 그림 같은 월 = 같은 가로 위치(그림 영역·칸 위치 일치)', L.ca.join() === B.ca.join() && L.xs.join() === B.xs.join(), { L: L.ca, B: B.ca });
    check('제목 줄: 연초 이후 누적 설정액(조원) · 월별 설정액 — 한투(조원) 유입·유출 견본', s.cts[0] === '연초 이후 누적 설정액(조원)' && s.cts[1] === '월별 설정액 — 한투(조원)유입유출', s.cts);
    const hSum = L.ds.find(d => d.on).data[M];
    check('요약 문장: 한투 YYYY년 1~M월 누적 설정액 = 누적 선 끝 값', s.subs[0].indexOf(`한투: ${Y}년 1~${M}월 누적 설정액 `) === 0 && Math.abs(num(s.subs[0].split('누적 설정액 ')[1]) - W(hSum)) < 0.006, s.subs[0]);
    // 월별 표 보기
    const mt = s.tbls[0];
    check('월별 표 보기(접힘): 한투 1~기준월, NAV 증감 = 설정액 + 평가 증감, 누적 = 누계, 산출 표기', s.det && mt.rows.length === M && mt.rows[0][0] === Y + '-01' && mt.rows[M - 1][0] === ym && mt.rows.every(r => Math.abs(num(r[1]) + num(r[3]) - num(r[2])) <= 0.011)
      && Math.abs(num(mt.rows[M - 1][4]) - W(hSum)) < 0.006 && mt.rows.every(r => /일별 합|월말 근사/.test(r[r.length - 1])), mt.head);
    // 운용사별 표 — 선택 연도 누적 · NAV 증감 = 위 NAV 표 증감액(전년말 대비)
    const top = await p.evaluate(() => { const tb = document.querySelector('#view .section table.tbl'); return { rows: [...tb.querySelectorAll('tbody tr:not(.total)')].map(tr => [...tr.children].map(td => td.textContent.trim())), total: [...tb.querySelector('tr.total').children].map(td => td.textContent.trim()) }; });
    const ct = s.tbls[1];
    check('운용사별 표: 6개사 + 시장 전체 · 머리글(설정액 먼저 · 연도 누적 · 기준월) · 한투 행 강조', ct.rows.length === 6 && ct.total[0] === '시장 전체' && ct.head.join() === '운용사,설정액,설정액 점유율,NAV 증감,평가 증감,설정액,NAV 증감'
      && ct.grp.some(g => g.indexOf(`${Y}년 누적 (${Y}-01~${ym})`) === 0) && ct.grp.some(g => g === `기준월 ${ym}`) && ct.hl.join() === '한투', { head: ct.head, grp: ct.grp, hl: ct.hl });
    const navChg = Object.fromEntries(top.rows.map(r => [r[0], num(r[2])]));
    const bad = ct.rows.filter(r => Math.abs(num(r[3]) - navChg[r[0]]) > 0.051);
    check('운용사별 NAV 증감 = 위 표 증감액(전년말 대비) — 6개사·시장 · 설정액 + 평가 = NAV 증감 · 점유율 합 100%', !bad.length && Math.abs(num(ct.total[3]) - num(top.total[2])) <= 0.051 && ct.rows.every(r => Math.abs(num(r[1]) + num(r[4]) - num(r[3])) <= 0.011)
      && (ct.total[2] === '-' || Math.abs(ct.rows.reduce((a, r) => a + num(r[2]), 0) - 100) < 0.6), { bad, mkt: [ct.total[3], top.total[2]] });
    const hRow = ct.rows.find(r => r[0] === '한투');
    check('누적 선 끝 값(각 운용사) = 운용사별 표 설정액', L.ds.every(d => Math.abs(W(d.data[M]) - num(ct.rows.find(r => r[0] === d.k)[1])) < 0.006), L.ds.map(d => d.k + ' ' + W(d.data[M]).toFixed(2)));
    check('설정 상위·해지 상위 ETF(기준월) — 한투만 · 설정액 부호', s.tbls.length === 4 && s.subs.some(x => x.indexOf(ym + ' 설정 상위·해지 상위 ETF — 한투') === 0) && s.tbls[2].rows.length > 0 && s.tbls[2].rows.concat(s.tbls[3].rows).every(r => r[1] === '한투')
      && s.tbls[2].rows.every(r => num(r[2]) > 0) && s.tbls[3].rows.every(r => num(r[2]) < 0), s.subs);
    check('설명(v44 한 줄에 하나씩): 산식·산출 방법(일별 합·월말 근사 — 해당 연도)·내부 이름 없음', /설정액: 늘어난 좌수 × 전날 1좌당 NAV/.test(s.txt) && /분배금은 유출이 아니라 평가 증감에 포함/.test(s.txt) && s.notes.some(n => /같은 가로 위치/.test(n)) && s.notes.some(n => /영업일마다 계산해 더함/.test(n)) && s.lineNotes > 0 && !/agg_|raw_|유형최종|FLOW|flows/.test(s.txt));
    await freeze(); await p.addStyleTag({ content: '.hdr-wrap{position:static!important}' });
    await p.evaluate(T => [...document.querySelectorAll('#view .section')].find(x => x.querySelector('.h2').textContent.indexOf(T) === 0).scrollIntoView(), T);
    await p.screenshot({ path: `${OUT}/${name}_mgr_flow.png`, fullPage: false });
    // 시장 전체 → 선 1개
    await click(T, '시장 전체'); await wait(); s = await sec(T); [L, B] = s.ch;
    check('시장 전체(선택 해제) → 시장 선 1개(강조) · 막대 = 시장 · ETF 표 시장 전체 · 표 강조 없음', L.ds.length === 1 && L.ds[0].k === '시장 전체' && L.ds[0].on && Math.abs(W(L.ds[0].data[M]) - num(ct.total[1])) < 0.006 && s.cts[1].indexOf('월별 설정액 — 시장 전체') === 0
      && s.subs.some(x => /ETF — 시장 전체/.test(x)) && !s.tbls[1].hl.length, L.ds.map(d => d.k));
    // 지표 NAV 증감
    await click(T, 'NAV 증감'); await wait(); s = await sec(T); [L, B] = s.ch;
    check('지표 NAV 증감 → 두 그림 NAV 기준(누적 끝 = 표 NAV 증감 합계) · 제목·견본(증가/감소)', Math.abs(W(L.ds[0].data[M]) - num(s.tbls[1].total[3])) < 0.006 && s.cts[0] === '연초 이후 누적 NAV 증감(조원)' && s.cts[1] === '월별 NAV 증감 — 시장 전체(조원)증가감소' && s.segs[0].join() === '설정액,NAV 증감*', s.cts);
    await click(T, '설정액'); await wait();
    // 연도 2025 → 12개월
    const py = String(+Y - 1);
    await click(T, py); await wait(); s = await sec(T); [L, B] = s.ch;
    check(`연도 ${py} → 전년말 + 1~12월 · 표 머리글 ${py}년 누적·마지막 월 · 월별 표 12행`, L.labels.length === 13 && L.labels[12] === '12월' && s.tbls[1].grp.some(g => g.indexOf(`${py}년 누적 (${py}-01~${py}-12)`) === 0) && s.tbls[1].grp.some(g => g === `마지막 월 ${py}-12`)
      && s.tbls[0].rows.length === 12 && s.subs[0].indexOf(`시장 전체: ${py}년 1~12월`) === 0 && !s.notes.some(n => /위 NAV 표의/.test(n)), { n: L.labels.length, grp: s.tbls[1].grp });
    await click(T, '2021'); await wait(); s = await sec(T); [L] = s.ch;
    const m0 = await p.evaluate(() => App.call('flows', {}).then(f => f.months[0]));
    check('연도 2021 → 첫 자료 월부터(시작점 = 그 전월 말)', m0.slice(0, 4) !== '2021' || (L.labels[0] === (m0.slice(5) === '01' ? '전년말' : `${+m0.slice(5) - 1}월 말`) && L.labels.length === 13 - (+m0.slice(5) - 1)), { m0, labels: L.labels.slice(0, 2) });
    await click(T, Y); await wait();
    // 'ACE 강조' 켜도 선택 선 색 유지(자체 강조)
    await p.evaluate(() => { App.state.focus = true; App.show('mgr'); }); await wait();
    await click(T, '삼성'); await wait(); s = await sec(T); [L] = s.ch;
    check("'ACE 강조' 켜도 선택(삼성) 파랑·나머지 회색 그대로", L.ds.find(d => d.on).k === '삼성' && L.ds.every(d => d.col === (d.on ? '#1863dc' : '#c3c2b7')), L.ds.map(d => d.k + ':' + d.col));
    await p.evaluate(() => { App.state.focus = false; });

    // ② 유형별 NAV — 기본 선택 첫 유형
    await p.evaluate(() => App.show('type')); await wait();
    const TT = '유형별 설정액(자금 유출입)';
    s = await sec(TT); [L, B] = s.ch;
    // v51: 유형별 표가 종합표(열 = 전체·유형·국내/해외, 행 = 시장 지표)로 바뀜 → '전년말 대비 증감' 줄에서 [이름, '', 증감액] 형태로 읽음
    const tTop = await p.evaluate(() => { const tb = document.querySelector('#view .type-mx table.tbl'), hs = [...tb.tHead.rows[tb.tHead.rows.length - 1].cells].map(c => c.textContent.trim()), v = [...tb.querySelector('tr.mx-mkt[data-k="ytd"]').cells].map(td => td.textContent.trim());
      return { rows: hs.slice(2).map((h, i) => [h, '', v[i + 2]]), total: ['합계', '', v[1]] }; });
    check('유형별 NAV: 유형 칩(전체 유형 + 유형, 기본 국내주식형) · 운용사 칩(시장 전체* + 6) · 그림 2개', !!s && s.chips[0] === '전체 유형' && s.chips.includes('국내주식형*') && s.chips.includes('시장 전체*') && s.chips.length >= 13 && s.ch.length === 2, s && s.chips);
    check('위 = 유형별 누적 선(국내주식형 강조) · 아래 = 국내주식형 월별 막대 · 같은 가로 위치', L.ds.filter(d => d.on).map(d => d.k).join() === '국내주식형' && L.ds.length >= 4 && s.cts[1].indexOf('월별 설정액 — 국내주식형 · 시장 전체') === 0 && L.xs.join() === B.xs.join(), L.ds.map(d => d.k));
    const tt = s.tbls[1], tChg = Object.fromEntries(tTop.rows.map(r => [r[0], num(r[2])]));
    const badT = tt.rows.filter(r => tChg[r[0]] !== undefined && Math.abs(num(r[3]) - tChg[r[0]]) > 0.051);
    check('유형별 표: 유형 + 국내/해외 행 · NAV 증감 = 위 유형 표 증감액 · 합계 = 시장 · 국내주식형 행 강조', tt.rows.some(r => r[0] === '국내') && tt.rows.some(r => r[0] === '해외') && !badT.length && Math.abs(num(tt.total[3]) - num(tTop.total[2])) <= 0.051 && tt.hl.join() === '국내주식형', { badT, tot: [tt.total[3], tTop.total[2]], hl: tt.hl });
    check('누적 선 끝 값(각 유형) = 유형별 표 설정액 · ETF 표 = 국내주식형', L.ds.every(d => Math.abs(W(d.data[M]) - num(tt.rows.find(r => r[0] === d.k)[1])) < 0.006) && s.subs.some(x => x.indexOf(ym + ' 설정 상위·해지 상위 ETF — 국내주식형 · 시장 전체') === 0), s.subs);
    await freeze(); await p.evaluate(T => [...document.querySelectorAll('#view .section')].find(x => x.querySelector('.h2').textContent.indexOf(T) === 0).scrollIntoView(), TT);
    await p.screenshot({ path: `${OUT}/${name}_type_flow.png` });
    await click(TT, '전체 유형'); await wait(); s = await sec(TT); [L] = s.ch;
    check('전체 유형 → 시장 선 1개', L.ds.length === 1 && L.ds[0].k === '시장 전체', L.ds.map(d => d.k));
    await click(TT, '한투'); await wait(); s = await sec(TT); [L] = s.ch;
    check('전체 유형 · 한투 → "한투 전체" 선 1개', L.ds.length === 1 && L.ds[0].k === '한투 전체' && s.subs[0].indexOf('한투:') === 0, L.ds.map(d => d.k));
    await click(TT, '해외주식형'); await wait(); s = await sec(TT); [L] = s.ch;
    check('해외주식형 · 한투 → 한투 유형별 선(해외주식형 강조) · 표 한투 합계(국내/해외 행 없음) · ETF 표 한투', L.ds.find(d => d.on).k === '해외주식형' && s.subs[0].indexOf('해외주식형 · 한투:') === 0 && s.tbls[1].total[0] === '한투 합계' && !s.tbls[1].rows.some(r => r[0] === '국내')
      && s.tbls.slice(2).every(tb => tb.rows.every(r => r[1] === '한투')) && L.ds.every(d => Math.abs(W(d.data[M]) - num((s.tbls[1].rows.find(r => r[0] === d.k) || [0, 0])[1])) < 0.006), s.subs);

    // ③ 요약 — 자금 유출입 행(비교 기준 전년말 = 올해 누적)
    await p.evaluate(() => App.show('summary')); await wait();
    const kv = await p.evaluate(() => [...document.querySelectorAll('#view table.kv tr')].map(tr => [tr.children[0].textContent, tr.children[1].textContent]));
    const fr = kv.find(r => r[0] === '자금 유출입');
    check('요약: 자금 유출입 행 — 한투 설정액 = 운용사별 표 한투 설정액(올해 누적)', !!fr && kv[kv.indexOf(fr) - 1][0] === 'M/S 변동 요인' && fr[1].indexOf('한투 설정액 ' + hRow[1] + '조원') === 0, [fr && fr[1].slice(0, 30), hRow[1]]);

    // ④ 준비 전(과거 자료 보충 중) 문구
    await p.evaluate(() => { const orig = App.call.bind(App); App.call = (a, q) => a === 'flows' ? Promise.resolve({ ready: false, fill: { done: 60, left: 180 } }) : orig(a, q); App.show('mgr'); });
    await wait(); s = await sec(T);
    check('준비 전: 섹션 자리 + 진행률 문구, 그림·표 없음', s && /설정액 자료 준비 중 — 과거 자료 보충이 끝나면 자동으로 표시 \(25%\)/.test(s.txt) && !s.ch.length && !s.tbls.length, s && s.txt.slice(-60));
    check('오류 없음', !errs.length, errs.slice(0, 3));
    await p.close();
  }
  // ⑤ 모바일(390px) — 가로 넘침 없음 · 두 그림 정렬
  {
    const p = await b.newPage({ viewport: { width: 390, height: 844 } });
    await p.route('**/*', r => /^https?:/.test(r.request().url()) ? r.fulfill({ status: 200, body: '' }) : r.continue());
    await p.goto('file://' + __dirname + '/index.html'); await p.waitForSelector('.tab');
    const wait = () => p.waitForFunction(() => !document.querySelector('#view > .loading') && ![...document.querySelectorAll('#view .empty')].some(e => /불러오는 중/.test(e.textContent)), null, { timeout: 90000 }).then(() => p.waitForTimeout(400));
    await wait();
    for (const t of ['mgr', 'type']) {
      await p.evaluate(t => App.show(t), t); await wait();
      const r = await p.evaluate(() => { const s = [...document.querySelectorAll('#view .section')].find(x => /설정액\(자금 유출입\)/.test(x.querySelector('.h2').textContent)); const cs = [...s.querySelectorAll('canvas')].map(c => App.charts.find(x => x.canvas === c));
        return { ovf: document.documentElement.scrollWidth - window.innerWidth, w: cs.map(c => Math.round(c.chartArea.right - c.chartArea.left)), same: cs[0].chartArea.left === cs[1].chartArea.left && cs[0].chartArea.right === cs[1].chartArea.right }; });
      check(`모바일(390px) ${t}: 가로 넘침 없음 · 두 그림 정렬 · 그림 폭 ≥ 120px`, r.ovf <= 1 && r.same && r.w[0] >= 120, r);
    }
    await p.close();
  }
  await b.close();
  console.log(fails ? `\n${fails}건 실패` : '\n모두 통과');
  process.exit(fails ? 1 : 0);
})();
