/* v41 화면 점검 (index.html = Apps Script 화면 1568×751, web.html = Vercel 빌드 1920×919) — '3초 테스트' 개선 반영
 *  V29B=1 node build_page.js && V29B=1 node build_web.js && CHROME_PATH=/opt/pw-browsers/chromium node v41_shot.js
 *  공통 탭 머리(두 화면 같은 결론 줄·카드) · 기준 표시(월말 'n월 말 기준'·기간·구성종목 지연) · Apps Script 머리 압축(탭 한 줄)·본문 폭 ·
 *  긴 표 앞 20행 + 전체 보기 · 섹션 바로가기 · 거래대금 기본 구간 끝 = 최근 영업일 · 일평균 소수 2자리(v46) · 유형 배지 '비중' · 지수 카드 전월 대비 ·
 *  테마 맵 조건 접힘·제목 · 종목→ETF 칩 짧은 표기·갱신 지연 · 관심도 '관심 상승 후보'·뉴스 소표본 */
const { chromium } = require('playwright'), fs = require('fs');
const OUT = __dirname + '/shots_v41';
(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const b = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/opt/pw-browsers/chromium' });
  let fails = 0; const check = (name, ok, info) => { if (!ok) fails++; console.log((ok ? '  OK   ' : '  FAIL ') + name + (info !== undefined ? ' — ' + (typeof info === 'string' ? info : JSON.stringify(info)) : '')); };
  const heads = {};
  for (const [file, name, vw] of [['index.html', 'gas', { width: 1568, height: 751 }], ['web.html', 'web', { width: 1920, height: 919 }]]) {
    console.log(`[${name}]`);
    const p = await b.newPage({ viewport: vw }); const errs = [];
    p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errs.push('console: ' + m.text()); });
    await p.route('**/*', r => /^https?:/.test(r.request().url()) ? r.fulfill({ status: 200, body: '' }) : r.continue());
    await p.goto('file://' + __dirname + '/' + file); await p.waitForSelector('.tab');
    const wait = () => p.waitForFunction(() => !document.querySelector('#view > .loading'), null, { timeout: 90000 }).then(() => p.waitForTimeout(400));
    const freeze = () => p.evaluate(() => App.charts.forEach(c => { c.options.animation = false; c.update('none'); }));
    await wait();
    const head = () => p.evaluate(() => {
      const cards = [...document.querySelectorAll('#view > .head .tile, #stats .cd')].map(t => ({ k: (() => { const e = (t.querySelector('.kt, .cd-k') || document.createElement('i')).cloneNode(true); e.querySelectorAll('.cd-i').forEach(x => x.remove()); return e.textContent.trim(); })(), v: (t.querySelector('.v, .cd-v') || {}).textContent.trim(), b: (t.querySelector('.bdg') || { textContent: '' }).textContent.trim(), l2: (t.querySelector('.d2, .l2') || {}).textContent.trim(), warn: t.classList.contains('warn') }));
      const lines = [...document.querySelectorAll('#view > .head .ld, #lede .ld')].map(x => x.textContent.trim());
      const a = document.getElementById('asof');
      return { cards, lines, asof: a ? a.textContent : null, asofWarn: a ? a.classList.contains('warn') : false, asofFirst: !!document.querySelector('#controls > .ctl-asof:first-child') };
    });
    // ① 탭 이름·제목
    const tabs = await p.evaluate(() => [...document.querySelectorAll('#tabs .tab')].map(t => t.textContent.trim()));
    check('탭 이름 짧게: 개관·상위 5개사·신규상장', tabs.includes('개관') && tabs.includes('상위 5개사') && tabs.includes('신규상장') && !tabs.some(t => /ETF 시장 개관|시장 유형 비중|신규상장 ETF/.test(t)), tabs.join(' · '));
    if (name === 'gas') {
      const hd = await p.evaluate(() => { const t = document.getElementById('tabs'), first = t.querySelector('.tab'), last = [...t.querySelectorAll('.tab')].pop(), v = document.querySelector('#view > .head'); return { rows: Math.round((last.getBoundingClientRect().top - first.getBoundingClientRect().top) / first.offsetHeight) + 1, hdr: document.querySelector('.hdr-wrap').offsetHeight, top: v ? Math.round(v.getBoundingClientRect().top) : -1, viewW: Math.round(document.getElementById('view').getBoundingClientRect().width), mainW: Math.round(document.querySelector('main').getBoundingClientRect().width) }; });
      check('Apps Script 머리: 탭 한 줄 · 머리 높이 150px 이하 · 본문 시작이 화면 위 1/4 안', hd.rows === 1 && hd.hdr <= 150 && hd.top > 0 && hd.top <= 751 / 4, hd);
      check('Apps Script 본문 폭 = 머리글 폭(폭 제한 탭도 오른쪽 빈 공간 없음)', hd.viewW >= hd.mainW - 70, `${hd.viewW} / ${hd.mainW}`);
    }
    const ids = await p.evaluate(() => App.tabs.map(t => t.id));
    const latest = await p.evaluate(() => { const m = App.meta, dv = m.dates.filter(d => d >= m.dailyFrom); return dv[dv.length - 1]; });
    for (const id of ids) {
      await p.evaluate(i => App.show(i), id); await wait();
      const h = await head(); heads[name + ':' + id] = h;
      if (id === 'summary') {
        check('요약: (v44) 결론 세 줄(한투 M/S · 순위 · 시장 NAV) + 카드 4개', h.lines.length === 3 && /한투 M\/S [\d.]+%/.test(h.lines[0]) && /상위 5개사 중 \d위/.test(h.lines[1]) && /시장 NAV/.test(h.lines[2]) && h.cards.length === 4, h.lines.join(' / '));
        check('기준 표시: 컨트롤 줄 맨 앞, 당월 일자 = 기준 YYYY-MM-DD', h.asofFirst && /^기준 \d{4}-\d{2}-\d{2}$/.test(h.asof), h.asof);
        const opt = await p.evaluate(() => { const se = [...document.querySelectorAll('#controls select')][0]; return [...se.options].map(o => o.textContent); });
        check('기준일자 목록: 지난 달은 "YYYY-MM 말"', opt.some(o => /^\d{4}-\d{2} 말$/.test(o)) && opt.some(o => /^\d{4}-\d{2}-\d{2}$/.test(o)), opt.slice(0, 3).join(', '));
        // 지난 달(월말 확정치) 선택
        await p.evaluate(() => { const se = [...document.querySelectorAll('#controls select')][0], o = [...se.options].find(x => / 말$/.test(x.textContent)); se.value = o.value; se.dispatchEvent(new Event('change')); }); await wait();
        const hm = await head(), sel = await p.evaluate(() => App.state.date);
        check('지난 달 선택 → "n월 말 기준 · YYYY-MM-DD"', new RegExp('^' + (+sel.slice(5, 7)) + '월 말 기준 · ' + sel + '$').test(hm.asof), hm.asof);
        await p.evaluate(() => { App.state.date = App.meta.defaultDate; App.renderControls(); App.load(); }); await wait();
      }
      if (id === 'overview') {
        const ix = h.cards.filter(c => /KOSPI|S&P500|NASDAQ100/.test(c.k));
        check('개관: 지수 카드 아래 줄 = 지수 자체 전월 대비(ETF 총 NAV 반복 없음)', ix.length >= 1 && ix.every(c => /^전월 대비 [+-]?[\d.]+%$|^기준일 종가$/.test(c.l2)), ix.map(c => c.k + ':' + c.l2).join(' · '));
        if (name === 'web') check('웹 상단 제목 = 전체 이름(ETF 시장 개관)', await p.evaluate(() => document.getElementById('topTitle').textContent) === 'ETF 시장 개관');
      }
      if (id === 'mgr') {
        check('운용사별: (v44) 결론 두 줄(한투 M/S · 순위) + 운용사 카드 5개', h.lines.length === 2 && /한투 M\/S/.test(h.lines[0]) && /상위 5개사 중 \d위/.test(h.lines[1]) && h.cards.length === 5, h.lines.join(' / '));
        const toc = await p.evaluate(() => [...document.querySelectorAll('.toc-a')].map(x => x.textContent));
        check('섹션 바로가기 5개(v43 운용사별 설정액 · 맨 아래 변천 포함)', toc.length === 5 && /운용사별 설정액/.test(toc[1]) && /변천/.test(toc[4]), toc.join(' · '));
        await p.evaluate(() => [...document.querySelectorAll('.toc-a')].pop().click()); await p.waitForTimeout(1200);
        const pos = await p.evaluate(() => { const s = [...document.querySelectorAll('#view > .section')].pop(), hdr = document.querySelector('.hdr-wrap, .top'); return { top: Math.round(s.getBoundingClientRect().top), hdr: hdr.offsetHeight, y: Math.round(window.scrollY) }; });
        check('바로가기 누르면 그 섹션이 머리글 바로 아래로', pos.y > 500 && pos.top >= pos.hdr - 2 && pos.top <= pos.hdr + 40, pos);
        await p.evaluate(() => window.scrollTo(0, 0));
      }
      if (id === 'type') check('유형별: 카드 배지 = "비중 ±%p"(NAV 증감으로 읽히지 않게)', h.cards.length >= 4 && h.cards.filter(c => c.b).every(c => /비중 [+-]?[\d.]+%p/.test(c.b)) && h.cards.some(c => c.b), h.cards.map(c => c.b).join(','));
      if (id === 'top') {
        const t = await p.evaluate(() => { const tb = [...document.querySelectorAll('#view table.tbl')].pop(), rows = [...tb.tBodies[0].rows].filter(r => !r.classList.contains('total')), vis = () => rows.filter(r => getComputedStyle(r).display !== 'none').length, more = tb.closest('.tbl-scroll').parentElement.querySelector('.tbl-more');
          const a = { all: rows.length, vis: vis(), btn: more && !more.hidden ? more.textContent : '' }; more.click(); a.open = vis(); a.btn2 = more.textContent; more.click(); a.closed = vis();
          const q = tb.closest('.tbl-scroll').parentElement.querySelector('.tbl-q'); q.value = 'KODEX'; q.dispatchEvent(new Event('input')); a.q = vis(); a.qAll = rows.filter(r => /KODEX/.test(r.textContent)).length; a.qBtn = more.hidden ? '' : more.textContent; q.value = ''; q.dispatchEvent(new Event('input')); a.after = vis(); return a; });
        check('긴 표: 50행 중 앞 20행 + "전체 50행 보기"', t.all === 50 && t.vis === 20 && t.btn === '전체 50행 보기 ▾', t);
        check('전체 보기 → 50행 · 다시 누르면 20행', t.open === 50 && /앞 20행만/.test(t.btn2) && t.closed === 20);
        check('검색 중에도 보이는 행 기준(최대 20행, 버튼 건수 = 검색 결과)', t.q === Math.min(20, t.qAll) && (t.qAll > 20 ? t.qBtn === `전체 ${t.qAll}행 보기 ▾` : t.qBtn === '') && t.after === 20, t);
        await p.evaluate(() => { const c = [...document.querySelectorAll('#view .sticky-chips .chip-m')].find(x => x.dataset.k === '삼성'); c.click(); });
        const f = await p.evaluate(() => { const tb = [...document.querySelectorAll('#view table.tbl')].pop(), rows = [...tb.tBodies[0].rows]; return { vis: rows.filter(r => getComputedStyle(r).display !== 'none').length, sam: rows.filter(r => r.dataset.top === '삼성').length, sub: [...document.querySelectorAll('#view .sub-h')].pop().textContent }; });
        check('운용사 칩(삼성) → 그 운용사 행만(20행 넘으면 앞 20행), 소제목 종목 수', f.vis === Math.min(20, f.sam) && new RegExp(`삼성 ${f.sam}종목`).test(f.sub), f);
        await p.evaluate(() => [...document.querySelectorAll('#view .sticky-chips .chip-m.reset')][0].click());
      }
      if (id === 'turnover') {
        const r = await p.evaluate(() => ({ to: App.state.to, from: App.state.from }));
        check('거래대금 기본 구간 끝 = 최근 영업일', r.to === latest, `${r.from} ~ ${r.to} (최근 ${latest})`);
        check('기준 표시 = 기간', h.asof === `기간 ${r.from} ~ ${r.to}`, h.asof);
        const avg = h.cards.find(c => c.k === '일평균');
        check('일평균 소수 2자리(다른 금액과 같게)', avg && /^[\d,]+\.\d{2}조원$/.test(avg.v), avg && avg.v);
        check('카드에 "조회 구간" 없음(결론 숫자만)', !h.cards.some(c => /조회 구간/.test(c.k)));
      }
      if (id === 'theme') {
        const th = await p.evaluate(() => ({ sum: (document.querySelector('.th-sum-v') || {}).textContent, barHidden: document.querySelector('.th-bar').hidden, t: document.querySelector('#view > .section .h2').textContent, notes: [...document.querySelector('#view > .section').querySelectorAll(':scope > .note')].map(n => n.textContent).join(' ') }));
        check('테마 맵: 조건 접힘(한 줄 요약 + 조건 바꾸기)', th.barHidden && /주식 등/.test(th.sum), th.sum);
        check('사분면 제목 짧게("테마 사분면"), 점선·눈금 설명은 차트 아래', th.t === '테마 사분면' && /중앙값/.test(th.notes) && /12개/.test(th.notes), th.t);
        await p.evaluate(() => document.querySelector('.th-tg').click());
        check('조건 바꾸기 → 선택 막대 표시', await p.evaluate(() => !document.querySelector('.th-bar').hidden));
        await p.evaluate(() => [...document.querySelectorAll('.th-bar .seg button')].find(x => x.textContent === '전체').click()); await wait();
        check('조건을 바꿔도 열린 채 유지·요약 갱신', await p.evaluate(() => !document.querySelector('.th-bar').hidden && /전체 자산/.test(document.querySelector('.th-sum-v').textContent)));
        await p.evaluate(() => { App.state.th.asset = 'S'; App.state.th.open = false; App.load(); }); await wait();
        const tc = (await head()).cards.find(c => c.k === '기회 구간');
        check('기회 구간 카드: NAV 증감 기준임을 표기', tc && /NAV 증감 상위/.test(tc.l2), tc && tc.l2);
        if (name === 'gas') check('Apps Script: 섹션 제목 한 줄(설명이 길어도)', await p.evaluate(() => [...document.querySelectorAll('#view > .section .section-h .h2')].every(h => h.getBoundingClientRect().height < 45)));
      }
      if (id === 'holders') {
        const chips = await p.evaluate(() => [...document.querySelectorAll('.hd-sugg .chip-m')].map(c => c.textContent));
        check('종목→ETF: 추천 칩 짧은 표기("/" 없음, 영문 대문자 이름은 단어 첫 글자만 대문자)', chips.length >= 5 && chips.every(c => c.indexOf('/') < 0) && !chips.some(c => /^[A-Z]{5,} [A-Z]{4,}/.test(c)), chips.slice(0, 12).join(','));
        check('카드: 구성종목 기준일·확인 비율·최다 보유(찾는 방법 없음)', h.cards.length === 3 && /구성종목 확인/.test(h.cards[1].k) && /%$/.test(h.cards[1].v) && !h.cards.some(c => /찾는 방법/.test(c.k)), h.cards.map(c => c.k + '=' + c.v).join(' · '));
        check('기준 표시: 구성종목 YYYY-MM-DD 기준(최신이면 경고 없음)', /^구성종목 \d{4}-\d{2}-\d{2} 기준$/.test(h.asof) && !h.asofWarn, h.asof);
        await p.evaluate(() => { const d = new Date(App.meta.holdingsDate || App.meta.lastLoaded); App._ll = App.meta.lastLoaded; const x = new Date(Date.parse(App.meta.lastLoaded) + 14 * 864e5); App.meta.lastLoaded = x.toISOString().slice(0, 10); App.load(); }); await wait();
        const hs = await head();
        check('구성종목이 최종 적재보다 14일 오래되면 기준 표시·카드에 갱신 지연(주의 색)', hs.asofWarn && /14일 지남\(갱신 지연\)/.test(hs.asof) && hs.cards[0].warn, hs.asof);
        await p.evaluate(() => { App.meta.lastLoaded = App._ll; App.load(); }); await wait();
        const hd = await p.evaluate(() => [hdShort('엔비디아/NVIDIA Corp'), hdShort('ADVANCED MICRO DEVICES'), hdShort('APPLE INC'), hdShort('TSMC'), hdShort('SK하이닉스')].join('|'));
        check('짧은 표기 규칙', hd === '엔비디아|Advanced Micro Devices|Apple Inc|TSMC|SK하이닉스', hd);
      }
      if (id === 'buzz') {
        const txt = await p.evaluate(() => document.body.innerText);
        check('관심도: "관심 상승 후보"(테마 맵 "기회 구간"과 구분), "영업 기회" 표현 없음', /관심 상승 후보/.test(txt) && !/영업 기회/.test(txt) && h.cards.some(c => c.k === '관심 상승 후보'));
        const nz = await p.evaluate(() => [bzNewsChg(App, { newsChg: 800, newsP: 1, news7: 9 }), bzNewsChg(App, { newsChg: 50, newsP: 10, news7: 15 }), bzNewsOk({ newsChg: 800, newsP: 4, news7: 36 }), bzNewsOk({ newsChg: 20, newsP: 5, news7: 6 })].join('|'));
        check('뉴스 소표본: 이전 5건 미만은 증가율 대신 "1→9건", 5건 이상은 %', nz === '1→9건|+50.0%|false|true', nz);
        const mdl = await p.evaluate(() => { const d0 = { items: [{ kind: 'theme', key: 'A', chg: 1, newsChg: 800, newsP: 1, news7: 9 }, { kind: 'theme', key: 'B', chg: 2, newsChg: 60, newsP: 10, news7: 16 }] }; return bzModel(App, d0, 'theme').news.key; });
        check('뉴스 증가 1위 = 이전 5건 이상 중 최대(1→9건 +800% 제외)', mdl === 'B', mdl);
        check('기준 표시 = 관심도 수집일', /^관심도 \d{4}-\d{2}-\d{2} 기준$/.test(h.asof), h.asof);
      }
      await freeze(); await p.screenshot({ path: `${OUT}/${name}_${id}.png` });
    }
    check('페이지 오류 없음', !errs.length, errs.slice(0, 3).join(' | '));
    await p.close();
  }
  // ② 두 화면 탭 머리 동일
  const ids = Object.keys(heads).filter(k => k.startsWith('gas:')).map(k => k.slice(4));
  const diff = ids.filter(id => { const g = heads['gas:' + id], w = heads['web:' + id]; if (!w) return true; return g.cards.length !== w.cards.length || g.lines.length !== w.lines.length || g.cards.some((c, i) => c.v !== w.cards[i].v) || g.asof !== w.asof; });
  check('두 화면 탭 머리 같음(탭마다 결론 줄 수·카드 수·카드 값·기준 표시)', !diff.length, diff.map(id => `${id}: gas ${heads['gas:' + id].cards.length}/${heads['gas:' + id].lines.length} web ${(heads['web:' + id] || { cards: [] }).cards.length}/${(heads['web:' + id] || { lines: [] }).lines.length}`).join(' · ') || ids.length + '개 탭');
  console.log(fails ? `\n${fails}건 실패` : '\n전부 통과');
  await b.close(); process.exit(fails ? 1 : 0);
})();
