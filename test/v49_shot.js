/* v49 화면 점검 — 탭 이름(개관 → 시장, 관심도 → 관심도 (베타)) · 관심도 보정 변화율 · 뉴스 단어 '제목 100건당' 비교
 *  V29B=1 node build_page.js && V29B=1 node build_web.js && CHROME_PATH=/opt/pw-browsers/chromium node v49_shot.js */
const { chromium } = require('playwright'), fs = require('fs');
const OUT = __dirname + '/shots_v49';
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
    const tabs = await p.evaluate(() => [...document.querySelectorAll('#tabs .tab')].map(t => t.textContent.trim()));
    check("탭 이름: '시장'(이전 개관) · '관심도 (베타)' · '개관' 없음", tabs.includes('시장') && tabs.includes('관심도 (베타)') && !tabs.includes('개관') && !tabs.includes('관심도'), tabs.join(' · '));
    if (name === 'gas') check('Apps Script 탭 한 줄 유지', await p.evaluate(() => { const t = [...document.querySelectorAll('#tabs .tab')]; return Math.round(t[0].getBoundingClientRect().top) === Math.round(t[t.length - 1].getBoundingClientRect().top); }));
    await p.evaluate(() => App.show('overview')); await wait();
    if (name === 'web') check("웹 상단 제목: 시장 탭 = 'ETF 시장'", await p.evaluate(() => document.getElementById('topTitle').textContent) === 'ETF 시장');
    await p.evaluate(() => { App.state.bz = { kind: 'theme', sel: null }; App.show('buzz'); }); await wait();
    if (name === 'web') check("웹 상단 제목: '관심도 (베타)'", await p.evaluate(() => document.getElementById('topTitle').textContent) === '관심도 (베타)');
    const r = await p.evaluate(async () => {
      const d = await App.call('buzz', {}), th = await App.call('theme', { date: App.meta.defaultDate, ref: 'py' }).catch(() => null);
      const Z = bzModel(App, Object.assign({}, d, { th }), 'theme');
      const adjOk = Z.rows.every(x => { const raw = d.items.find(y => y.key === x.key && y.kind === 'theme'); const e = raw.chg === null || raw.low ? null : ((raw.s4 + 1) / (raw.p4 + 1) - 1) * 100; return (e === null ? x.chg === null : Math.abs(x.chg - e) < 1e-9) && x.chgRaw === raw.chg; });
      const nOk = Z.rows.every(x => { const raw = d.items.find(y => y.key === x.key && y.kind === 'theme'); const e = raw.newsP > 0 ? ((raw.news7 + 5) / (raw.newsP + 5) - 1) * 100 : null; return e === null ? x.newsChg === null : Math.abs(x.newsChg - e) < 1e-9; });
      const sorted = Z.rows.filter(x => x.chg !== null).every((x, i, a) => !i || a[i - 1].chg >= x.chg);
      const shrink = Z.rows.filter(x => x.chg !== null && x.chgRaw !== null).every(x => Math.abs(x.chg) <= Math.abs(x.chgRaw) + 1e-9);
      const secs = [...document.querySelectorAll('#view > .section')];
      const s2 = secs.find(s => /관심도 · NAV/.test(s.querySelector('.h2').textContent)), s4 = secs.find(s => /자주 나온 단어/.test(s.querySelector('.h2').textContent)), s1 = secs[0];
      const h2 = [...s2.querySelectorAll('thead tr:last-child th')].map(x => x.textContent);
      const t4 = s4 ? s4.querySelector('table') : null, h4 = t4 ? [...t4.querySelectorAll('thead tr')].map(tr => [...tr.cells].map(c => c.textContent).join('|')) : [];
      const N7 = d.titles.n7, NP = d.titles.nP;
      const rows4 = t4 ? [...t4.tBodies[0].rows].map(tr => [...tr.cells].map(c => c.textContent)) : [];
      const perOk = rows4.length && rows4.every(c => { const w = d.words.find(x => x.w === c[0]); const a = (w.n7 / N7 * 100), bb = (w.nP / NP * 100); return Math.abs(parseFloat(c[3]) - a) < 0.051 && Math.abs(parseFloat(c[4]) - bb) < 0.051 && Math.abs(parseFloat(c[5]) - (a - bb)) < 0.11; });
      const det = (document.querySelector('#view .kv') || {}).textContent || '';
      return { adjOk, nOk, sorted, shrink, h2, h4, perOk, rows4: rows4.slice(0, 3).map(c => c.join(' ')), note2: s2.innerText, note4: s4 ? s4.innerText : '', title1: s1.querySelector('.h2').textContent, det };
    });
    check('검색 변화(보정) = (최근 4주 + 1) ÷ (직전 4주 + 1) − 1 · 단순값 보존 · 큰 순 정렬 · 보정값 크기 ≤ 단순값', r.adjOk && r.sorted && r.shrink);
    check('뉴스 변화(보정) = (최근 7일 + 5) ÷ (이전 7일 + 5) − 1', r.nOk);
    check("표 머리글 '변화(보정)' 2개 · 막대 제목 '(보정)' · 설명에 보정식·예시", r.h2.filter(h => h === '변화(보정)').length === 2 && /변화\(보정\)/.test(r.title1) && /\(최근 4주 \+ 1\) ÷ \(직전 4주 \+ 1\) − 1/.test(r.note2) && /단순 \+300% 이지만 보정 \+50%/.test(r.note2), r.h2.join('|'));
    check("상세: '보정 x%, 단순 y%'", /보정 [+-]?[\d.]+%, 단순 [+-]?[\d.]+%|검색량 적음/.test(r.det), r.det.slice(0, 100));
    check("단어 표: '기사 수(건)'·'제목 100건당'(최근·이전·차이) 열 · 값 = 건수 ÷ 제목 수 × 100 · 설명", r.h4.some(x => /기사 수\(건\)/.test(x) && /제목 100건당/.test(x)) && r.h4.some(x => /차이/.test(x)) && r.perOk && /건수를 그대로 비교하면 변화가 과장됨/.test(r.note4), r.rows4.join(' / '));
    await p.evaluate(() => { const s = [...document.querySelectorAll('#view > .section')].find(s => /자주 나온 단어/.test(s.querySelector('.h2').textContent)); s.scrollIntoView({ block: 'start' }); }); await p.waitForTimeout(300);
    await p.screenshot({ path: `${OUT}/${name}_words.png` });
    await p.evaluate(() => window.scrollTo(0, 0)); await p.waitForTimeout(200); await p.screenshot({ path: `${OUT}/${name}_buzz.png` });
    check('스크립트 오류 없음', !errs.length, errs.slice(0, 3).join(' | '));
    await p.close();
  }
  await b.close();
  console.log(fails ? `FAIL ${fails}` : '전부 통과'); process.exit(fails ? 1 : 0);
})();
