/* v29 종목→ETF 찾기·관심도 화면 점검 (모의 KIS·네이버 수집 뒤) — V29B=1 node build_page.js && V29B=1 node build_web.js && CHROME_PATH=/opt/pw-browsers/chromium node v29b_shot.js
 *  탭 표시(수집 뒤) · 첫 화면(많이 담은 종목) · 검색(별칭·후보 칩·비중 순·운용사별·한투 보유 비중) · 행 클릭 검색 · 처음으로
 *  관심도: 변화율 막대·표(관심도·뉴스·NAV·한투 점유율·기회 후보)·상세(주간 추이)·새 단어 · 상품구조 보기 · 검산 · 내부 이름 미노출 · 모바일 넘침 · 오류 없음 */
const { chromium } = require('playwright'), fs = require('fs');
const OUT = __dirname + '/shots_v29';
const INTERNAL = /범례_|유형최종|신규상장용|ETF마스터|agg_|raw_|테마_분류검토|_index|구성종목_수집중|관심도 시트/;
(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const b = await chromium.launch({ executablePath: process.env.CHROME_PATH });
  let fails = 0; const check = (name, ok, info) => { if (!ok) fails++; console.log((ok ? '  OK   ' : '  FAIL ') + name + (info !== undefined ? ' — ' + (typeof info === 'string' ? info : JSON.stringify(info)) : '')); };
  for (const [file, name] of [['web.html', 'web'], ['index.html', 'gas']]) {
    console.log(`[${name}]`);
    for (const vw of [1440, 390]) {
      const p = await b.newPage({ viewport: { width: vw, height: 900 } }); const errs = [];
      p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error' && !/favicon/.test(JSON.stringify(m.location()))) errs.push('console: ' + m.text()); });
      await p.route('**/*', r => /^https?:/.test(r.request().url()) ? r.fulfill({ status: 200, body: '' }) : r.continue());
      await p.goto('file://' + __dirname + '/' + file + '#holders'); await p.waitForSelector('.tab');
      const wait = () => p.waitForFunction(() => !document.querySelector('#view > .loading'), null, { timeout: 60000 }).then(() => p.waitForTimeout(500));
      const freeze = () => p.evaluate(() => App.charts.forEach(c => { c.options.animation = false; c.update('none'); }));
      const snap = () => p.evaluate(() => {
        const v = document.getElementById('view'), secs = [...v.querySelectorAll(':scope > .section, :scope > div > .section')];
        const tbl = i => { const t = secs[i] && secs[i].querySelector('table.tbl'); return t ? { head: [...t.querySelectorAll('thead tr:last-child th')].map(x => x.textContent), rows: [...t.querySelectorAll('tbody tr')].map(tr => [...tr.cells].map(c => c.textContent.trim())) } : { head: [], rows: [] }; };
        return { tabs: [...document.querySelectorAll('#tabs .tab')].map(t => t.textContent.trim()), active: (document.querySelector('#tabs .tab.active') || {}).textContent, titles: secs.map(s => s.querySelector('.h2').textContent),
          t0: tbl(0), t1: tbl(1), t2: tbl(2), t3: tbl(3), chips: [...v.querySelectorAll('.chips button')].map(x => x.textContent + (x.classList.contains('on') ? '*' : '')), charts: App.charts.map(c => c.config.type + ':' + c.data.labels.length),
          text: v.innerText + ' ' + ((document.getElementById('lede') || {}).innerText || '') + ' ' + ((document.getElementById('stats') || {}).innerText || ''), lede: (document.getElementById('lede') || {}).innerText || '',
          cards: [...document.querySelectorAll('#stats .cd')].map(c => c.innerText.replace(/\s+/g, ' ')), tiles: [...v.querySelectorAll('.grid .tile')].map(t => t.innerText.replace(/\s+/g, ' ')), ovf: document.documentElement.scrollWidth - window.innerWidth,
          src: secs.map(s => s.getAttribute('data-src') || '') };
      });
      await wait();
      let s = await snap();
      if (vw === 1440) {
        console.log('     탭: ' + s.tabs.join(' · ') + '\n     섹션: ' + s.titles.join(' / ') + '\n     타일: ' + s.tiles.join(' ‖ ') + (name === 'web' ? '\n     카드: ' + s.cards.join(' ‖ ') : ''));
        check('탭: 테마 맵 다음에 종목→ETF 찾기·관심도(수집 뒤 표시)', s.tabs.slice(-3).join('|') === '테마 맵|종목→ETF 찾기|관심도' && /종목→ETF 찾기/.test(s.active), s.tabs.slice(-3).join('|'));
        check('첫 화면: 많이 담은 종목 막대 + 표(순위·종목명·코드·보유 추정·담은 ETF 수)', /많이 담은 종목 상위/.test(s.titles[0]) && s.charts.some(c => /^bar:/.test(c)) && s.t0.head.join('|') === '순위|종목명|종목코드|보유 추정(조원)|담은 ETF 수' && s.t0.rows[0][1] === '삼성전자', s.t0.rows.slice(0, 3).map(r => r[1] + ' ' + r[3]).join(', '));
        check('바로가기 칩(많이 담은 종목)', s.chips.length >= 5 && s.chips[0] === '삼성전자', s.chips.slice(0, 5).join(','));
        if (name === 'web') check('웹 카드·문장', s.cards.length === 2 && /많이 담은 종목/.test(s.lede), s.cards.join(' ‖ '));
        if (name === 'web') check('웹 자료 출처: 한국투자증권 Open API', /한국투자증권 Open API/.test(s.src[0]), s.src[0]);
        await freeze(); await p.screenshot({ path: `${OUT}/${name}_holders_top.png`, fullPage: true });
        // 검색: 엔비디아(별칭) → NVIDIA
        await p.fill('.hd-q', '엔비디아'); await p.evaluate(() => document.querySelector('.hd-form').requestSubmit()); await wait();
        s = await snap();
        console.log('     검색 섹션: ' + s.titles.join(' / ') + '\n     타일: ' + s.tiles.join(' ‖ ') + (name === 'web' ? '\n     문장: ' + s.lede.replace(/\n/g, ' / ') + '\n     카드: ' + s.cards.join(' ‖ ') : ''));
        check('검색(엔비디아 → NVIDIA CORP): 비중 상위 막대·운용사별·전체 목록', /NVIDIA CORP 비중 상위 ETF/.test(s.titles[0]) && /운용사별/.test(s.titles[1]) && /담은 ETF \d+종목/.test(s.titles[2]), s.titles.join(' / '));
        const ws = s.t2.rows.map(r => parseFloat(r[s.t2.head.indexOf('구성 비중')]));
        check('전체 목록: 구성 비중 내림차순 · 보유 추정 = NAV × 비중', ws.length > 0 && ws.every((w, i) => !i || w <= ws[i - 1] + 1e-9), ws.slice(0, 5).join(','));
        const chk = await p.evaluate(async () => { const d = await App.call('holders', { q: '엔비디아', pick: '' }); const H = hdModel(App, d); const sumM = H.mgrs.reduce((a, m) => a + m.amt, 0);
          return { amtOk: d.items.every(r => Math.abs(r.amt - r.nav * r.w / 100) < 1), mgrOk: Math.abs(sumM - H.amt) < 1, f: H.fShare, fRaw: H.amt ? d.items.filter(r => r.top === App.FOCUS).reduce((a, r) => a + r.amt, 0) / H.amt * 100 : null, n: d.items.length }; });
        check('검산: 보유 추정 = NAV × 비중, 운용사별 합 = 전체, 한투 보유 비중', chk.amtOk && chk.mgrOk && Math.abs(chk.f - chk.fRaw) < 1e-9, JSON.stringify(chk));
        check('타일/카드: 종목·담은 ETF·보유 추정·한투 보유 비중', name === 'web' ? s.cards.length === 4 && /한투 보유 비중/.test(s.cards.join(' ')) : s.tiles.length === 4 && /한투 보유 비중/.test(s.tiles[3]), (name === 'web' ? s.cards : s.tiles).join(' ‖ '));
        await freeze(); await p.screenshot({ path: `${OUT}/${name}_holders_nvda.png`, fullPage: true });
        // 운용사 칩 → 전체 목록 필터
        const flt = await p.evaluate(() => { const sec = [...document.querySelectorAll('#view .section')][2]; const btn = [...sec.querySelectorAll('.chip-m')].find(x => x.dataset.k === App.FOCUS); if (!btn) return null; btn.click(); const vis = [...sec.querySelectorAll('tbody tr')].filter(tr => !tr.classList.contains('fold')); return { n: vis.length, ok: vis.every(tr => tr.dataset.top === App.FOCUS) }; });
        check('운용사 칩(한투) → 목록 필터', flt && flt.n > 0 && flt.ok, JSON.stringify(flt));
        // 후보 칩: 삼성전자 → 삼성전자우 후보로 전환
        await p.fill('.hd-q', '삼성전자'); await p.evaluate(() => document.querySelector('.hd-form').requestSubmit()); await wait();
        s = await snap();
        const hasC = s.chips.some(c => /^삼성전자우/.test(c)) && s.chips.some(c => /^삼성전자005930.*\*$/.test(c));
        check('비슷한 이름 후보 칩(삼성전자* · 삼성전자우)', hasC, s.chips.filter(c => /삼성/.test(c)).join(','));
        if (hasC) { await p.evaluate(() => [...document.querySelectorAll('#view .chip-m.hd-c')].find(x => /^삼성전자우/.test(x.textContent)).click()); await wait(); s = await snap(); check('후보 칩 클릭 → 삼성전자우로 전환', /삼성전자우 비중 상위/.test(s.titles[0]), s.titles[0]); }
        // 처음으로
        await p.evaluate(() => document.querySelector('.hd-clear').click()); await wait(); s = await snap();
        check('처음으로 → 많이 담은 종목', /많이 담은 종목 상위/.test(s.titles[0]));
        // 첫 화면 표 행 클릭 → 검색
        await p.evaluate(() => [...document.querySelectorAll('#view tr.clk')][1].click()); await wait(); s = await snap();
        check('표 행 클릭 → 그 종목 검색', / 비중 상위 ETF/.test(s.titles[0]), s.titles[0]);
        // 없는 종목
        await p.fill('.hd-q', '없는종목XYZ'); await p.evaluate(() => document.querySelector('.hd-form').requestSubmit()); await wait();
        const none = await p.evaluate(() => (document.querySelector('#view .empty') || {}).textContent || '');
        check('없는 종목 → 안내', /찾지 못했습니다/.test(none), none);
        check('내부 시트·열 이름 없음(종목→ETF 찾기)', !INTERNAL.test(s.text), (s.text.match(INTERNAL) || [''])[0]);
        await p.evaluate(() => { App.state.hd = null; });
        // ── 관심도
        await p.evaluate(() => App.show('buzz')); await wait(); s = await snap();
        console.log('     관심도 섹션: ' + s.titles.join(' / ') + '\n     표: ' + s.t1.head.join(' | ')); s.t1.rows.slice(0, 5).forEach(r => console.log('       ' + r.join(' | ')));
        console.log('     타일: ' + s.tiles.join(' ‖ ') + (name === 'web' ? '\n     문장: ' + s.lede.replace(/\n/g, ' / ') + '\n     카드: ' + s.cards.join(' ‖ ') : ''));
        check('관심도: 변화율 막대·표·상세·새 단어', /검색 관심도 변화/.test(s.titles[0]) && /관심도 · NAV/.test(s.titles[1]) && /상세 — /.test(s.titles[2]) && /자주 나온 단어/.test(s.titles[3]), s.titles.join(' / '));
        check('표 머리글: 검색어·최근 4주·변화·최근 7일·NAV 조원·증감·점유율·상품 수·구분', ['검색어', '최근 4주', '변화', '최근 7일', '조원', '증감', '점유율', '상품 수', '구분'].every(h => s.t1.head.indexOf(h) >= 0), s.t1.head.join('|'));
        const bz = await p.evaluate(async () => { const b = await App.call('buzz', {}), t = await App.call('theme', { date: App.meta.defaultDate, ref: 'py' }); const Z = bzModel(App, Object.assign({}, b, { th: t }), 'theme');
          const M = themeModel(App, t, { lens: 'theme', asset: 'A', region: '', exLev: false });
          return { sorted: Z.rows.every((r, i) => !i || r.chg === null || Z.rows[i - 1].chg === null || r.chg <= Z.rows[i - 1].chg + 1e-9), navOk: Z.rows.every(r => !r.m || Math.abs(r.m.nav - M.list.find(g => g.key === r.key).nav) < 1),
            opp: Z.rows.every(r => r.opp === (r.chg !== null && r.chg > 0 && (!r.m || r.m.nav <= 0 || r.m.fShare < M.ySplit))), n: Z.rows.length, nOpp: Z.opp.length, words: Z.words.length, newW: Z.newWords.length }; });
        check('검산: 변화율 순 · NAV = 테마 맵(전체 자산) · 기회 후보 판정', bz.sorted && bz.navOk && bz.opp && bz.n > 20, JSON.stringify(bz));
        check('새 단어 표: 사전에 없는 단어 표시', s.t3.rows.some(r => /새 단어/.test(r[4])) && s.t3.rows.some(r => r[0] === '스테이블코인' && /새 단어/.test(r[4])), s.t3.rows.slice(0, 4).map(r => r.join(' ')).join(', '));
        check('상세: 주간 추이 꺾은선', s.charts.some(c => /^line:2[5-7]$/.test(c)), s.charts.join(','));
        if (name === 'web') check('웹 카드 4개·문장', s.cards.length === 4 && /검색 관심 상승 1위/.test(s.lede), s.cards.join(' ‖ '));
        if (name === 'web') check('웹 자료 출처: 네이버', /네이버 데이터랩/.test(s.src[0]), s.src[0]);
        await freeze(); await p.screenshot({ path: `${OUT}/${name}_buzz.png`, fullPage: true });
        // 표 행 클릭 → 상세 전환
        const ck = await p.evaluate(() => { const tr = [...document.querySelectorAll('#view tr.clk')][3]; tr.click(); return tr.dataset.key; }); await p.waitForTimeout(300);
        const dh = await p.evaluate(() => [...document.querySelectorAll('#view .section')].find(x => /상세 — /.test(x.querySelector('.h2').textContent)).querySelector('.h2').textContent);
        check('표 행 클릭 → 상세 전환', dh.indexOf(ck) >= 0, dh);
        // 상품구조 보기
        await p.evaluate(() => [...document.querySelectorAll('.th-bar .ctl')][0].querySelectorAll('button')[1].click()); await wait(); s = await snap();
        check('보기 → 상품구조: 구조 행·새 단어 표 없음', s.t1.head[0] === '상품구조' && s.t1.rows.length > 0 && s.t1.rows.every(r => ['레버리지·인버스', '커버드콜·옵션', '채권혼합', '액티브'].indexOf(r[0]) >= 0) && !s.titles.some(t => /자주 나온 단어/.test(t)), s.t1.rows.map(r => r[0]).join(','));
        check('내부 시트·열 이름 없음(관심도)', !INTERNAL.test(s.text), (s.text.match(INTERNAL) || [''])[0]);
        await p.evaluate(() => { App.state.bz = null; });
      } else {
        check('모바일(390px) 종목→ETF 찾기: 가로 넘침 없음', s.ovf <= 1, 'overflow ' + s.ovf);
        await freeze(); await p.screenshot({ path: `${OUT}/${name}_holders_m.png`, fullPage: false });
        await p.fill('.hd-q', 'NVDA'); await p.evaluate(() => document.querySelector('.hd-form').requestSubmit()); await wait(); s = await snap();
        check('모바일: 티커(NVDA) 검색 · 넘침 없음', /NVIDIA CORP 비중 상위/.test(s.titles[0]) && s.ovf <= 1, s.titles[0] + ' / ' + s.ovf);
        await p.evaluate(() => App.show('buzz')); await wait(); s = await snap();
        check('모바일 관심도: 가로 넘침 없음', s.ovf <= 1 && s.titles.length >= 3, 'overflow ' + s.ovf);
        await freeze(); await p.screenshot({ path: `${OUT}/${name}_buzz_m.png`, fullPage: false });
      }
      check(`페이지 오류 없음 (${vw}px)`, !errs.length, errs.slice(0, 3).join(' | '));
      await p.close();
    }
  }
  await b.close();
  console.log(fails ? `\n${fails}건 실패` : '\n전부 통과');
  process.exit(fails ? 1 : 0);
})();
