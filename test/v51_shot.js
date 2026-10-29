/* v51 화면 점검 — 유형별 NAV 탭: '유형별 NAV 및 비중' 표 + v50 '운용사별 유형별 M/S' 표를 하나의 종합표로 (v50 '잔고·M/S 변동' 표 삭제)
 *  열 = 전체 · 상품유형 · 국내/해외 / 위 = 시장(잔고 · 비교 기준 대비 증감 · 전월 대비 증감 · 시장 내 비중) / 아래 = 운용사별 M/S(1~5위 + 기타 소계 펼치기)
 *  V29B=1 node build_page.js && V29B=1 node build_web.js && CHROME_PATH=/opt/pw-browsers/chromium node v51_shot.js */
const { chromium } = require('playwright'), fs = require('fs');
const OUT = __dirname + '/shots_v51';
const num = t => { const m = String(t || '').replace(/,/g, '').match(/[-+−]?\d+(\.\d+)?/); return m ? +m[0].replace('−', '-') : NaN; };
const sm = t => { const m = String(t || '').replace(/,/g, '').match(/[-+−]?\d+(\.\d+)?/g); return m && m[1] !== undefined ? +m[1].replace('−', '-') : null; };   // 칸의 둘째 숫자(아래 작은 글자)
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
    const read = () => p.evaluate(async () => {
      const d = await App.call('byType', { date: App.state.date, ref: App.state.ref }), dm = await App.call('byMgr', { date: App.state.date, ref: App.state.ref });
      const secs = [...document.querySelectorAll('#view > .section')], s1 = secs[0], tb = s1.querySelector('.type-mx table.tbl');
      const hr = tb.tHead.rows, heads = [...hr[hr.length - 1].cells].map(c => c.textContent.trim()), grp = [...hr[0].cells].map(c => [c.textContent.trim(), c.colSpan]);
      const rows = [...tb.tBodies[0].rows].map(tr => ({ cls: tr.className, k: tr.dataset.k || null, top: tr.dataset.top || null, hidden: tr.hidden, span: tr.cells[0].colSpan,
        c: [...tr.cells].map(c => c.textContent.trim()), b: [...tr.cells].map(c => !!c.querySelector('b')), tip: [...tr.cells].map(c => { const t = c.querySelector('[title]'); return t ? t.title : ''; }) }));
      const w = tb.closest('.tbl-scroll'), lab = tb.querySelector('tr.mx-lab small');
      return { secs: secs.map(x => x.querySelector('.h2').textContent), nTbl: s1.querySelectorAll('table.tbl').length, nCv: s1.querySelectorAll('canvas').length, heads, grp, rows,
        note: s1.innerText, page: document.getElementById('view').innerText, RL: App.refLabel(d), d: { rows: d.rows, dom: d.dom, total: d.total, totalPy: d.totalPy, totalPm: d.totalPm, ref: d.ref, mt: d.mgrTypes },
        bm: dm.rows.map(r => [r.mgr, r.ms, r.msPy]), sw: w.scrollWidth, cw: w.clientWidth, pageOver: document.documentElement.scrollWidth > innerWidth + 1,
        labR: lab ? lab.getBoundingClientRect().right : 0, iw: innerWidth, stickyFirst: getComputedStyle(tb.tBodies[0].rows[0].cells[0]).position };
    });
    let r = await read();
    const D = r.d, types = D.rows.map(x => x.type), doms = D.dom.map(x => x.dom), COLS = ['전체'].concat(types, doms);
    // ① 구조
    check("섹션: 첫 섹션 '유형별 NAV·비중 및 운용사별 M/S' → 설정액 → 히트맵 · 따로 있던 '운용사별 유형별 M/S' 섹션 없음", /^유형별 NAV·비중 및 운용사별 M\/S/.test(r.secs[0]) && r.secs.length === 3 && /설정액/.test(r.secs[1]) && /히트맵/.test(r.secs[2]) && !r.secs.slice(1).some(x => /운용사별 유형별/.test(x)), r.secs.join(' | '));
    check("v50 '잔고·M/S 변동' 표 없음 · 첫 섹션 = 막대 그림 2개 + 종합표 1개", !/잔고·M\/S 변동/.test(r.page) && r.nTbl === 1 && r.nCv === 2, { nTbl: r.nTbl, nCv: r.nCv });
    check('열: 구분 · 전체 · 상품유형(유형 전부) · 국내/해외 — 그룹 머리글 칸 수 맞음', r.heads.join() === ['구분'].concat(COLS).join() && r.grp.some(g => g[0] === '상품유형' && g[1] === types.length) && r.grp.some(g => g[0] === '국내/해외' && g[1] === doms.length), r.heads.join('|'));
    const mk = k => r.rows.find(x => x.k === k), mkd = COLS.map((c, i) => i === 0 ? { nav: D.total, navPy: D.totalPy, share: 100, ytd: { amt: D.total - D.totalPy, pct: (D.total / D.totalPy - 1) * 100 }, mom: { amt: D.total - D.totalPm, pct: (D.total / D.totalPm - 1) * 100 } } : i <= types.length ? D.rows[i - 1] : D.dom[i - 1 - types.length]);
    check(`시장 4줄(잔고 · ${r.RL} 대비 증감 · 전월 대비 증감 · 시장 내 비중) → 구분 줄 → 운용사`, r.rows.slice(0, 4).map(x => x.k).join() === 'nav,ytd,mom,share' && /mx-lab/.test(r.rows[4].cls) && /^잔고조원/.test(r.rows[0].c[0]) && r.rows[1].c[0].indexOf(r.RL + ' 대비 증감') === 0, r.rows.slice(0, 5).map(x => x.c[0]).join(' / '));
    // ② 시장 줄 값
    const near = (a, e, t) => Math.abs(a - e) <= t;
    const navOk = COLS.every((c, i) => near(num(mk('nav').c[i + 1]), mkd[i].nav / 1e12, 0.006));
    const ytdOk = COLS.every((c, i) => near(num(mk('ytd').c[i + 1]), mkd[i].ytd.amt / 1e12, 0.006) && (mkd[i].ytd.pct === null || near(sm(mk('ytd').c[i + 1]), mkd[i].ytd.pct, 0.051)));
    const momOk = COLS.every((c, i) => near(num(mk('mom').c[i + 1]), mkd[i].mom.amt / 1e12, 0.006) && (mkd[i].mom.pct === null || near(sm(mk('mom').c[i + 1]), mkd[i].mom.pct, 0.051)));
    const shOk = COLS.every((c, i) => near(num(mk('share').c[i + 1]), mkd[i].share, 0.051) && (i === 0 ? mk('share').c[1] === '100.0%' : near(sm(mk('share').c[i + 1]), mkd[i].share - mkd[i].sharePy, 0.051)));
    check('시장 잔고 = 유형·국내/해외 NAV, 전체 = 시장 합계', navOk, mk('nav').c.join(' '));
    check(`${r.RL} 대비 증감(조원·증감률) · 전월 대비 증감(조원·증감률) = 자료 값`, ytdOk && momOk, [mk('ytd').c.slice(0, 4).join(' '), mk('mom').c.slice(0, 4).join(' ')]);
    check(`시장 내 비중 · 작은 글자 = ${r.RL} 대비 %p · 전체 = 100.0%`, shOk, mk('share').c.slice(0, 4).join(' '));
    // 검산(독립): 유형 합 = 전체, 국내+해외 = 전체, 전월 합계 = 유형별 전월 합
    const sT = f => D.rows.reduce((s, x) => s + f(x), 0), sD = f => D.dom.reduce((s, x) => s + f(x), 0);
    check('검산: 유형 합 = 국내/해외 합 = 전체(잔고·증감) · 전월 합계 = 유형별 전월 증감 합 · 비중 합 100%',
      near(sT(x => x.nav), D.total, 1) && near(sD(x => x.nav), D.total, 1) && near(sT(x => x.ytd.amt), D.total - D.totalPy, 1) && near(sT(x => x.mom.amt), D.total - D.totalPm, 1) && near(sD(x => x.mom.amt), D.total - D.totalPm, 1) && near(sT(x => x.share), 100, 1e-6),
      { sumTypeMom: (sT(x => x.mom.amt) / 1e12).toFixed(3), totMom: ((D.total - D.totalPm) / 1e12).toFixed(3) });
    // ③ 운용사 줄
    const lab = r.rows.find(x => /mx-lab/.test(x.cls));
    check("구분 줄: 한 칸(열 전체) · '운용사별 M/S' · 정의(열마다 100%·작은 글자·굵게 = 1위)", lab && lab.span === COLS.length + 1 && lab.c.length === 1 && /^운용사별 M\/S/.test(lab.c[0]) && /열마다 그 시장 = 100%/.test(lab.c[0]) && /굵게 = 그 열 1위/.test(lab.c[0]), lab && lab.c[0]);
    const mg = r.rows.filter(x => /mx-mgr/.test(x.cls)), vis = mg.filter(x => !x.hidden), head = mg.find(x => /fold-head/.test(x.cls)), items = mg.filter(x => /fold-item/.test(x.cls));
    const key = y => y.top === '기타' ? y.mgr : y.top;
    const navOf = (y, f, c, i) => c === '전체' ? Object.values(y.t).reduce((a, v) => a + v[i], 0) : ((f === 't' ? y.t : y.d)[c] || [0, 0])[i];
    const all = D.mt.map(y => ({ k: key(y), y, nav: navOf(y, 't', '전체', 0), navPy: navOf(y, 't', '전체', 1) })).filter(x => x.nav > 0 || x.navPy > 0).sort((a, b) => b.nav - a.nav || b.navPy - a.navPy);
    const nm = x => x.c[0].replace(/^\d+/, '').trim();
    check('처음 화면: 1~5위(기준일 전체 NAV 큰 순) + 기타 소계 1줄 · 개별 운용사 숨김', vis.length === 6 && vis.slice(0, 5).map(nm).join() === all.slice(0, 5).map(x => x.k).join() && vis.slice(0, 5).map(x => num(x.c[0])).join() === '1,2,3,4,5' && head === vis[5] && items.every(x => x.hidden) && items.length === all.length - 5,
      vis.map(x => x.c[0]).join(' / '));
    // 칸 값 = 운용사 NAV(그 열) ÷ 시장 NAV(그 열) · 작은 글자 = 비교 기준 대비 %p (독립 계산)
    const mkt = (c, i) => c === '전체' ? (i ? D.totalPy : D.total) : (D.rows.find(x => x.type === c) || D.dom.find(x => x.dom === c))[i ? 'navPy' : 'nav'];
    const fOf = c => doms.includes(c) ? 'd' : 't';
    const ms = (list, c, i) => { const m = mkt(c, i); return m ? list.reduce((s, x) => s + navOf(x.y, fOf(c), c, i), 0) / m * 100 : null; };
    const bad = [];
    vis.forEach((row, ri) => { const list = row === head ? all.slice(5) : [all.find(x => x.k === nm(row))];
      COLS.forEach((c, j) => { const v = ms(list, c, 0), pv = ms(list, c, 1), t = row.c[j + 1];
        if (!near(num(t), v, 0.051) || (pv !== null && !near(sm(t), v - pv, 0.051 + 0.0001))) bad.push(`${nm(row)}·${c}: ${t} (계산 ${v.toFixed(2)} / ${(v - pv).toFixed(2)})`); }); });
    check('운용사 M/S = 운용사 NAV ÷ 그 열 시장 NAV (전체·유형·국내/해외) · 작은 글자 = 비교 기준 대비 %p', !bad.length, bad.length ? bad.slice(0, 4) : `${vis.length}줄 × ${COLS.length}열`);
    const colSum = COLS.map((c, j) => vis.reduce((s, x) => s + num(x.c[j + 1]), 0));
    check('열마다 1~5위 + 기타 소계 합 ≈ 100% (반올림 오차 이내)', colSum.every(v => near(v, 100, 0.35)), colSum.map(v => v.toFixed(1)).join(' '));
    const srv = types.every(t => near(D.mt.reduce((s, y) => s + ((y.t[t] || [0])[0]), 0), D.rows.find(x => x.type === t).nav, D.mt.length)) && doms.every(k => near(D.mt.reduce((s, y) => s + ((y.d[k] || [0])[0]), 0), D.dom.find(x => x.dom === k).nav, D.mt.length) && near(D.mt.reduce((s, y) => s + ((y.d[k] || [0, 0])[1]), 0), D.dom.find(x => x.dom === k).navPy, D.mt.length));
    check('서버 자료 검산: 운용사별 유형·국내/해외 NAV 합 = 시장 유형·국내/해외 NAV (기준일·비교 기준)', srv);
    const sameMgr = vis.slice(0, 5).filter(x => r.bm.some(y => y[0] === nm(x))).every(x => { const y = r.bm.find(z => z[0] === nm(x)); return near(num(x.c[1]), y[1], 0.051) && near(sm(x.c[1]), y[1] - y[2], 0.051 + 0.0001); });
    check('전체 열 M/S = 운용사별 NAV 탭 M/S (상위 5개사)', sameMgr, vis.slice(0, 5).map(x => nm(x) + ' ' + x.c[1]).join(', '));
    // 굵게 = 열 1위(기타 소계 제외, 숨긴 개별 운용사 포함)
    const leadOk = COLS.every((c, j) => { const bs = mg.filter(x => x.b[j + 1]); if (bs.length !== 1) return false; const cand = mg.filter(x => x !== head); const mx = Math.max(...cand.map(x => num(x.c[j + 1]))); return num(bs[0].c[j + 1]) === mx && bs[0] !== head; });
    check('굵게 = 열마다 1곳, 그 열 M/S 최대(기타 소계 제외)', leadOk, COLS.map((c, j) => c + ':' + nm(mg.find(x => x.b[j + 1]) || { c: ['-'] })).join(' '));
    const hr = mg.find(x => x.top === '한투'), ti = hr ? hr.tip[2] : '';
    check(`운용사 칸 툴팁: '운용사 · 열: x조원 (${r.RL} y조원)' · 한투 줄 data-top(ACE 강조 대상)`, !!hr && new RegExp(`^한투 · ${types[0]}: [\\d,.]+조원 \\(${r.RL} [\\d,.]+조원\\)$`).test(ti), ti);
    // ④ 기타 펼치기
    await p.evaluate(() => document.querySelector('.type-mx .fold-head').click()); await p.waitForTimeout(150);
    r = await read();
    const mg2 = r.rows.filter(x => /mx-mgr/.test(x.cls)), it2 = mg2.filter(x => /fold-item/.test(x.cls)), hd2 = mg2.find(x => /fold-head/.test(x.cls));
    const subOk = COLS.every((c, j) => near(it2.reduce((s, x) => s + num(x.c[j + 1]), 0), num(hd2.c[j + 1]), 0.05 * Math.max(1, it2.length)));
    check(`기타 누르면 개별 운용사 ${it2.length}곳 표시(6위부터) · ▾ · 소계 ≈ 개별 합`, it2.every(x => !x.hidden) && num(it2[0].c[0]) === 6 && /^▾기타 \d+개사/.test(hd2.c[0]) && subOk, hd2.c[0] + ' / ' + it2.slice(0, 2).map(x => x.c[0]).join(', '));
    await p.evaluate(() => { const t = document.querySelector('.type-mx'); t.scrollIntoView({ block: 'start' }); window.scrollBy(0, -170); }); await p.waitForTimeout(300);
    await p.screenshot({ path: `${OUT}/${name}_open.png` });
    await p.evaluate(() => document.querySelector('.type-mx .fold-head').click()); await p.waitForTimeout(150);
    check('다시 누르면 접힘', await p.evaluate(() => [...document.querySelectorAll('.type-mx tr.fold-item')].every(tr => tr.hidden)));
    check('설명: 잔고 정의·기준일 · M/S 정의(열마다 합계 100%) · 1~5위 기준 · 기타 펼치기', /잔고 = 순자산총액\(NAV\)/.test(r.note) && /M\/S = 그 열 시장\(전체 · 유형 · 국내\/해외\) NAV 중 운용사 NAV 비중/.test(r.note) && /1~5위 = 기준일 전체 NAV 순위/.test(r.note) && /누르면 개별 운용사/.test(r.note));
    // ⑤ 화면 폭
    if (name === 'mob') check('모바일: 표 안에서 가로 스크롤 · 첫 열 고정 · 구분 줄 설명이 화면 안에서 줄바꿈', r.sw > r.cw && r.stickyFirst === 'sticky' && r.labR <= r.iw, { sw: r.sw, cw: r.cw, labR: Math.round(r.labR) });
    else check('넓은 화면: 표가 가로 스크롤 없이 한 화면에 들어감', r.sw <= r.cw + 1, { sw: r.sw, cw: r.cw });
    check('가로 넘침(페이지) 없음', !r.pageOver);
    await p.evaluate(() => { const t = document.querySelector('.type-mx'); t.scrollIntoView({ block: 'start' }); window.scrollBy(0, -170); }); await p.waitForTimeout(300);
    await p.screenshot({ path: `${OUT}/${name}_matrix.png` });
    if (name === 'web') {
      // ⑥ 비교 기준 = 전월말 → 전월 대비 줄은 같은 내용이라 한 번만
      await p.evaluate(() => { App.state.ref = 'pm'; App.show('type'); }); await wait();
      const pm = await read();
      check("비교 기준 '전월말': 시장 줄 3개(잔고 · 전월말 대비 증감 · 시장 내 비중) — 같은 줄 반복 없음", pm.RL === '전월말' && pm.rows.filter(x => /mx-mkt/.test(x.cls)).map(x => x.k).join() === 'nav,ytd,share' && pm.d.ref.py === pm.d.ref.pm, pm.rows.slice(0, 4).map(x => x.c[0]).join(' / '));
      await p.evaluate(() => { App.state.ref = 'py'; });
      // ⑦ 이전 응답(국내/해외 자료 없음)이어도 오류 없이 '-'
      const old = await p.evaluate(async () => { const d = JSON.parse(JSON.stringify(await App.call('byType', { date: App.state.date, ref: 'py' }))); d.mgrTypes.forEach(m => delete m.d); delete d.totalPm;
        const host = document.createElement('div'); document.getElementById('view').appendChild(host); let e = null; try { typeMatrix(App, host, d); } catch (x) { e = x.message; }
        const tb = host.querySelector('table'), n = tb ? tb.tHead.rows[tb.tHead.rows.length - 1].cells.length : 0, rr = tb ? [...tb.querySelectorAll('tr.mx-mgr')][0] : null, mom = tb ? tb.querySelector('tr.mx-mkt[data-k="mom"]') : null;
        const out = { e, dom: rr ? [...rr.cells].slice(n - 2).map(c => c.textContent) : [], momTot: mom ? mom.cells[1].textContent : '' }; host.remove(); return out; });
      check("이전 캐시 응답(국내/해외·전월 합계 없음): 오류 없음 · 운용사 국내/해외 칸 '-' · 전체 전월 '-'", !old.e && old.dom.every(x => x === '-') && old.momTot === '-', old);
    }
    check('스크립트 오류 없음', !errs.length, errs.slice(0, 3).join(' | '));
    await p.close();
  }
  await b.close();
  console.log(fails ? `FAIL ${fails}` : '전부 통과'); process.exit(fails ? 1 : 0);
})();
