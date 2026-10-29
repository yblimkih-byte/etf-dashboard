/* v52 점검 — '시장'·'요약' 탭: 월 중 기준일(일별)을 고르면 시장 총 NAV·종목 수·지수가 그 기준일 값으로 바뀌는지
 *  (v51 까지: 그 달 마지막 적재일 값이 그대로 나와 기준일을 바꿔도 시장 NAV 불변 — 월말 일자를 골라야 바뀜)
 *  V29B=1 node build_page.js && V29B=1 node build_web.js && CHROME_PATH=/opt/pw-browsers/chromium node v52_shot.js */
const { chromium } = require('playwright'), fs = require('fs');
const OUT = __dirname + '/shots_v52';
const num = t => { const m = String(t || '').replace(/,/g, '').match(/[-+−]?\d+(\.\d+)?/); return m ? +m[0].replace('−', '-') : NaN; };
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
    const wait = () => p.waitForFunction(() => !document.querySelector('#view > .loading'), null, { timeout: 90000 }).then(() => p.waitForTimeout(600));
    await wait();
    // ① 서버: 일별 기준일마다 개관 마지막 월 행 = 그 기준일 값 (독립 계산: 일별 요약 시트 합계 · 지수 시트 기준일 이하 최근 값)
    const sv = await p.evaluate(() => {
      const months = aggMarket_(), ym = months[months.length - 1].ym, pm = months[months.length - 2].ym;
      const days = App.meta.dates.filter(d => d.slice(0, 7) === ym || d.slice(0, 7) === pm);
      const snap = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('agg_일별요약').rows.slice(1);
      const ixr = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('지수').rows.slice(1).map(r => [String(r[0] instanceof Date ? fmt_(r[0]) : r[0]), +r[1] || 0, +r[2] || 0, +r[3] || 0]).sort((a, b) => a[0] < b[0] ? -1 : 1);
      const near = (d, j) => { for (let i = ixr.length - 1; i >= 0; i--) if (ixr[i][0] <= d && ixr[i][j]) return ixr[i][j]; return 0; };
      const bad = [], rows = [];
      days.forEach(d => {
        const o = apiOverview_({ date: d }), L = o.monthly[o.monthly.length - 1], mrow = months.find(m => m.ym === d.slice(0, 7));
        const S = snap.filter(r => String(r[0] instanceof Date ? fmt_(r[0]) : r[0]) === d), nav = S.reduce((a, r) => a + (+r[5] || 0), 0), n = S.reduce((a, r) => a + (+r[6] || 0), 0);
        const isDay = mrow.date !== d;
        const exp = isDay ? { nav, n, k: near(d, 1), s: near(d, 2), q: near(d, 3) } : mrow;
        const ok = L.date === d && !!L.day === isDay && Math.abs(L.nav - exp.nav) < 1 && L.n === exp.n && L.k === exp.k && L.s === exp.s && L.q === exp.q && o.monthly.length === new Set(o.monthly.map(m => m.ym)).size;
        const Y = o.yearly[o.yearly.length - 1];
        if (!ok || Math.abs(Y.nav - L.nav) > 1) bad.push(d + ' ' + JSON.stringify({ L, exp }).slice(0, 200));
        rows.push([d, isDay, (L.nav / 1e12).toFixed(2), L.n, L.k]);
      });
      // 월말 일자: 일별 계산 = 월 집계 행(같은 방식인지 확인)
      const same = months.slice(-3).filter(m => App.meta.daily.includes(m.date)).map(m => { const x = marketDay_(m.ym, m.date); return Math.abs(x.nav - m.nav) < 1 && x.n === m.n && x.k === m.k && x.s === m.s && x.q === m.q; });
      return { n: days.length, bad, rows: rows.slice(-6), same, ymDays: days.filter(d => d.slice(0, 7) === ym).length };
    });
    check(`서버: 최근 2개월 기준일 ${sv.n}개 — 마지막 월 행 = 기준일 값(NAV·종목 수 = 일별 요약 합계, 지수 = 기준일 이하 최근 값), 월말 일자는 월 집계 그대로, 연도별 올해 = 같은 값`, !sv.bad.length && sv.n > 3, sv.bad.length ? sv.bad.slice(0, 2) : sv.rows.map(r => r.join(' ')).join(' / '));
    check('검산: 월말 일자의 일별 계산 = 월 집계 행(NAV·종목 수·지수)', sv.same.length > 0 && sv.same.every(Boolean), sv.same);
    // ② 화면: 이번 달 두 기준일(월 중) + 그 달 집계 일자(마지막 적재일)
    const dates = await p.evaluate(() => { const ms = App.meta.months, last = ms[ms.length - 1], prev = ms[ms.length - 2]; const ds = App.meta.dates.filter(d => d.slice(0, 7) === last.ym && d !== last.date); return [ds[0], ds[Math.floor(ds.length / 2)], last.date]; });   // 화면 기준일 목록 = 월말 + 이번 달 일별(실제 오류: 10월 일별 기준일이 모두 10-28 값)
    const seen = [];
    for (const d of dates) {
      await p.evaluate(dd => { App.state.date = dd; App.show('overview'); }, d); await wait();
      const r = await p.evaluate(async dd => {
        const g = await App.call('byMgr', { date: dd, ref: 'py' }), o = await App.call('overview', { date: dd });
        const cards = [...document.querySelectorAll('#view > .head .tile, #stats .cd')].map(t => ({ k: (t.querySelector('.kt, .cd-k') || {}).textContent.trim(), v: (t.querySelector('.v, .cd-v') || {}).textContent.trim() }));
        const lede = [...document.querySelectorAll('#view > .head .ld, #lede .ld')].map(x => x.textContent.trim()).join(' / ');
        const secs = [...document.querySelectorAll('#view > .section')], tb = secs[1].querySelector('table.tbl'), last = [...tb.tBodies[0].rows].pop();
        const bar = App.charts.filter(c => c.config.type === 'bar' && c.canvas.isConnected).pop(), lab = bar.data.labels[bar.data.labels.length - 1];
        const y1 = secs[0].querySelector('table.tbl'), ylast = [...y1.tBodies[0].rows].pop().cells[0].textContent;
        return { total: g.total, L: o.monthly[o.monthly.length - 1], cards, lede, row: [...last.cells].slice(0, 3).map(c => c.textContent.trim()), lab, ylast, sub: secs[0].innerText.slice(0, 80) };
      }, d);
      const c = k => (r.cards.find(x => x.k.indexOf(k) === 0) || {}).v || '';
      const isDay = !!r.L.day;
      check(`시장 탭 ${d}${isDay ? '(월 중)' : '(그 달 마지막 적재일)'}: 총 NAV 카드 = 그날 시장 합계(운용사별 NAV 탭 합계와 같음) · 종목 수 · KOSPI · 결론 줄`, Math.abs(num(c('ETF 시장 총 NAV')) - r.total / 1e12) < 0.006 && num(c('종목 수')) === r.L.n && (!r.L.k || Math.abs(num(c('KOSPI')) - r.L.k) < 0.006) && r.lede.indexOf(Math.round(r.total / 1e10) / 100 === 0 ? '' : (r.total / 1e12).toLocaleString('ko-KR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })) >= 0,
        `${c('ETF 시장 총 NAV')} · ${c('종목 수')} · KOSPI ${c('KOSPI')}`);
      check(`  월별 표 마지막 줄·막대 이름 = ${isDay ? "'월 (MM-DD 기준)' · 기준일" : "'월' 그대로"} · 연도별 올해 이름 · NAV 열 = 카드`, (isDay ? new RegExp(`^${r.L.ym} \\(${d.slice(5)} 기준\\)$`).test(r.row[0]) && r.lab === d && r.ylast === d.slice(0, 4) + '.' + d.slice(5, 7) + '.' + d.slice(8) : r.row[0] === r.L.ym && r.lab === r.L.ym && r.ylast === d.slice(0, 4) + '.' + d.slice(5, 7)) && Math.abs(num(r.row[1]) - r.total / 1e12) < 0.006 && /올해는 기준일/.test(r.sub), { row: r.row, lab: r.lab, ylast: r.ylast });
      // 요약 탭
      await p.evaluate(() => App.show('summary')); await wait();
      const s = await p.evaluate(() => ({ cards: [...document.querySelectorAll('#view > .head .tile, #stats .cd')].map(t => ({ k: (t.querySelector('.kt, .cd-k') || {}).textContent.trim(), v: (t.querySelector('.v, .cd-v') || {}).textContent.trim(), l2: (t.querySelector('.d2, .l2') || { textContent: '' }).textContent.trim() })), lede: [...document.querySelectorAll('#view > .head .ld, #lede .ld')].map(x => x.textContent.trim()).join(' / ') }));
      const mv = num((s.cards.find(x => x.k.indexOf('시장 NAV') === 0) || {}).v), ms = s.cards.find(x => / M\/S$/.test(x.k)) || { l2: '' };
      check(`  요약 탭 ${d}: 시장 NAV 카드 = 그날 시장 합계 · 결론 줄 '시장 NAV x조원' 같은 값`, Math.abs(mv - r.total / 1e12) < 0.006 && new RegExp('시장 NAV ' + (r.total / 1e12).toLocaleString('ko-KR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).replace(/[.]/g, '\\.') + '조원').test(s.lede), `${mv} / ${s.lede.slice(-40)}`);
      seen.push(mv);
      await p.evaluate(() => App.show('overview')); await wait();
      await p.screenshot({ path: `${OUT}/${name}_overview_${d}.png` });
    }
    check('기준일 3개(이번 달 월 중 2 + 마지막 적재일)의 시장 NAV가 서로 다름(기준일 따라 바뀜)', new Set(seen.map(v => v.toFixed(2))).size === seen.length, seen.join(' · '));
    check('스크립트 오류 없음', !errs.length, errs.slice(0, 3).join(' | '));
    await p.close();
  }
  await b.close();
  console.log(fails ? `FAIL ${fails}` : '전부 통과'); process.exit(fails ? 1 : 0);
})();
