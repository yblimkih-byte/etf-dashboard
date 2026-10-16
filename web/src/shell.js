/* ── web 전용(v104): shadcn 식 골격 보조 — 설명 문장·지표 카드 모양·사이드바·차트 경량화. 데이터·차트·카드 내용(v41 tabHead)은 gas/App·Tabs 그대로 ── */
(function () {
  const $ = id => document.getElementById(id), lede = $('lede'), stats = $('stats'), A = App;
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const UP = '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 7l-8.5 8.5-5-5L2 17"/><path d="M16 7h6v6"/></svg>';
  const DN = '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 17l-8.5-8.5-5 5L2 7"/><path d="M16 17h6v-6"/></svg>';

  /* v41: 탭별 문장·카드 내용(이전 HEAD)은 두 화면 공용 gas/Tabs.html tabHead 로 옮김 — 여기서는 웹 모양(상단 문장·카드)으로만 그림.
     App.load → App.afterRender → paintHead(이 함수) */
  function paint(t, h) {
    h = h || { lines: [] };
    // v110: 한 줄 문장 대신 짧은 줄 2~3개 (v114: '기준 (일자)' 줄은 상단 기준일자 선택과 중복이라 제거)
    lede.className = (h.lines || []).length ? 'lede' : 'lede empty'; lede.innerHTML = (h.lines || []).map(l => `<span class="ld">· ${l}</span>`).join('');   // v24: 문장이 없으면 줄 자체를 숨김
    document.body.classList.toggle('narrow-tab', !!t.narrow);
    const C = h.cards || [], n = C.length === 6 ? 3 : Math.min(C.length, 5);
    stats.innerHTML = (C.length ? `<div class="cards" style="--n:${n}">` + C.map(x => `<div class="cd${x.f ? ' focus' : ''}${x.warn ? ' warn' : ''}"><div class="cd-h"><div class="cd-k">${x.c ? `<i style="background:${x.c}"></i>` : ''}${x.k}${x.d ? `<span class="cd-i" title="${esc(x.d)}">i</span>` : ''}</div>${x.b ? `<span class="bdg${x.b.s < 0 ? ' neg' : ''}">${x.b.s < 0 ? DN : UP}${x.b.t}</span>` : ''}</div>` +
      `<div class="cd-v${x.txt ? ' txt' : ''}${x.neg ? ' neg' : ''}"${x.txt ? ` title="${String(x.v).replace(/<[^>]+>/g, '').replace(/"/g, '&quot;')}"` : ''}>${x.v}</div><div class="cd-f"><div class="l1">${x.l1 || '&nbsp;'}</div><div class="l2">${x.l2 || '&nbsp;'}</div></div></div>`).join('') + '</div>' : '') + (h.extra || '');
  }
  A.paintHead = function (t, d, h) { paint(t, h); };

  /* ── 차트 경량화(이 화면 한정): 레이블·수치·색 체계는 유지, 질감만 조정 ── */
  const INK = '#17171c', INK2 = '#3f3f46', BASE = '#93939f', BASE2 = '#d4d4d8';
  const chart0 = A.chart;
  A.chart = function (canvas, cfg) {
    try {
      const o = cfg.options || {}, ds = cfg.data.datasets || [], single = ds.length === 1;
      ds.forEach(d => {
        if (cfg.type === 'bar') {
          const soft = c => single ? (c === INK ? INK2 : c === BASE ? BASE2 : c) : c;       // 단일 계열의 검정 막대 → 한 단계 밝은 톤
          d.backgroundColor = Array.isArray(d.backgroundColor) ? d.backgroundColor.map(soft) : soft(d.backgroundColor);
          if (!d.stack && !(o.scales && o.scales.x && o.scales.x.stacked)) { d.borderRadius = 6; d.barPercentage = Math.min(d.barPercentage || 0.7, 0.62); }
          else d.borderRadius = 2;
        } else if (cfg.type === 'line' && d.fill === false) { d.borderWidth = 2; d.pointRadius = d.pointRadius ? 2.5 : 0; d.pointHoverRadius = 4; }
      });
      Chart.defaults.color = '#71717a'; Chart.defaults.font.size = 12;
      Object.keys(o.scales || {}).forEach(k => { const sc = o.scales[k]; if (!sc) return;
        if (sc.grid && sc.grid.display !== false) sc.grid = Object.assign({}, sc.grid, { color: '#f1f1f3', drawTicks: false });
        sc.border = Object.assign({}, sc.border, { display: false, dash: [3, 3] });
        sc.ticks = Object.assign({ padding: 8 }, sc.ticks, { color: '#a1a1aa' });
        if (sc.title) sc.title = Object.assign({}, sc.title, { color: '#a1a1aa' }); });
      const P = o.plugins || {};
      if (P.tooltip) Object.assign(P.tooltip, { backgroundColor: '#fff', titleColor: '#18181b', bodyColor: '#52525b', borderColor: '#e4e4e7', borderWidth: 1, padding: 10, cornerRadius: 8, boxPadding: 4, usePointStyle: true, titleFont: { weight: '600', size: 12 }, bodyFont: { size: 12 } });
      if (P.legend && P.legend.labels) Object.assign(P.legend.labels, { usePointStyle: true, pointStyle: 'rectRounded', boxWidth: 8, boxHeight: 8, padding: 18, color: '#52525b' });
    } catch (e) { /* 경량화 실패 시 원래 설정 그대로 */ }
    return chart0.call(this, canvas, cfg);
  };

  /* ── 골격: 탭 아이콘·제목·사이드바 ── */
  const IC = { summary: '<path d="M4 4h16v16H4z"/><path d="M8 9h8M8 13h8M8 17h5"/>', overview: '<rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/><rect x="14" y="12" width="7" height="9" rx="1"/><rect x="3" y="16" width="7" height="5" rx="1"/>',
    mgr: '<path d="M3 21h18M5 21V7l7-4 7 4v14M9 21v-5h6v5M9 10h.01M15 10h.01M9 13h.01M15 13h.01"/>', type: '<path d="M21 12A9 9 0 1 1 12 3v9z"/><path d="M21 8a9 9 0 0 0-5-5v5z"/>',
    shares: '<path d="M3 3v18h18"/><path d="M7 16h8M7 11h12M7 6h5"/>', top: '<path d="M10 6h11M10 12h11M10 18h11M4 6h1v4M4 10h2M6 18H4c0-1 2-2 2-3s-1-1.5-2-1"/>',
    new: '<circle cx="12" cy="12" r="9"/><path d="M12 8v8M8 12h8"/>', turnover: '<path d="M8 3L4 7l4 4M4 7h16M16 21l4-4-4-4M20 17H4"/>',
    theme: '<path d="M12 3v18M3 12h18"/><circle cx="7.5" cy="7.5" r="2"/><circle cx="16.5" cy="8" r="2.5"/><circle cx="8" cy="16.5" r="1.5"/><circle cx="16.5" cy="16.5" r="3"/>',
    holders: '<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3M8 11h6M11 8v6"/>', buzz: '<path d="M3 12h4l3-8 4 16 3-8h4"/>' };
  const init0 = A.init;
  A.init = function () {
    this.tabs.forEach(t => { const r0 = t.render; t.render = function (d, view, a) { r0.call(t, d, view, a);
      const SRC = { holders: '자료: ETF 구성종목 PDF(FunETF 공개 자료 · 한국투자증권 Open API) · KRX 정보데이터시스템(순자산총액)', buzz: '자료: 네이버 데이터랩(검색어 트렌드) · 네이버 뉴스 검색 · KRX 정보데이터시스템(순자산총액)' };   // v29
      view.querySelectorAll(':scope > .section').forEach((s, k) => s.setAttribute('data-src', SRC[t.id] || (t.id === 'overview' && k === 1 ? '자료: KRX 정보데이터시스템 · Yahoo Finance(지수) · 순자산총액 기준' : '자료: KRX 정보데이터시스템 · 순자산총액 기준')));
      // 캔버스 글자는 웹폰트 도착 전에 그려지면 대체 글꼴로 남음 → Pretendard 로드 후 한 번 다시 그림
      if (document.fonts && document.fonts.load) Promise.all([document.fonts.load("500 12px 'Pretendard Variable'", '가나다0123조원%'), document.fonts.ready]).then(() => a.charts.forEach(c => { try { c.update('none'); } catch (e) {} })).catch(() => {}); }; });
    return Promise.resolve(init0.call(this)).then(() => {
      document.querySelectorAll('#tabs .tab').forEach(b => { b.insertAdjacentHTML('afterbegin', `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${IC[b.dataset.id] || IC.overview}</svg>`); });
      const m = $('hdrMeta'); if (m && this.meta) {   // v17: 적재 상태(미게시 사유·오류·확인 시각)
        const ll = this.loadLine(this.meta), foot = m.closest('.side-foot'), sm = foot && foot.querySelector('small');
        m.textContent = ll.head;
        if (sm) { sm.textContent = ll.note || ('매 영업일 08:30 / 19:00 갱신' + (ll.at ? ' · 확인 ' + ll.at : '')); sm.classList.toggle('ld-note', !!ll.note); }
        if (foot) { foot.classList.toggle('warn', ll.warn); foot.title = ll.head + (ll.note ? '\n' + ll.note : '') + (ll.at ? '\n확인 ' + ll.at : ''); }
      }
      sync();
    });
  };
  // v109: Apps Script 는 동시 요청이 몰리면 HTML 오류 페이지를 돌려줌(프록시 502) → ① 동시 요청 3건 제한 ② 실패 시 자동 재시도 ③ 선조회는 한 건씩 차례로
  const MAX_CONC = 3; let running = 0; const waitq = [];
  const acquire = () => new Promise(r => { if (running < MAX_CONC) { running++; r(); } else waitq.push(r); });
  const release = () => { const n = waitq.shift(); if (n) n(); else running--; };
  const fetch0 = window.fetch.bind(window);
  window.fetch = function (url) {
    if (!(typeof url === 'string' && window.API_BASE && url.indexOf(window.API_BASE) === 0)) return fetch0.apply(window, arguments);
    const args = arguments;
    return acquire().then(() => fetch0.apply(window, args)).then(r => { release(); return r; }, e => { release(); throw e; });
  };
  const retryable = e => /\((502|503|504|500)\)|Failed to fetch|NetworkError|Load failed|network/i.test(String(e && e.message || e));
  const call0 = A.call;
  A.call = function (action, params) {
    const self = this, delays = [1500, 3000, 5000, 8000];
    const attempt = n => call0.call(self, action, params).catch(e => {
      if (n >= delays.length || !retryable(e)) throw e;
      return new Promise(r => setTimeout(r, delays[n])).then(() => attempt(n + 1));
    });
    return attempt(0);
  };
  // 기준일 등 조건이 바뀌면 나머지 탭도 같은 조건으로 미리 받아 둠(call() 이 같은 조회를 기억) → 탭 전환 대기 제거. 현재 탭 이후 한 건씩
  // v24: 목록은 App.prefetchList()(탭 기본 조회 + 히트맵·변천·거래대금, 무거운 조회 먼저) — App.init 의 일괄 선조회 대신 이 방식만 사용
  A.prefetchSeq = true;
  const load0 = A.load;
  A.load = function () {
    const r = load0.apply(this, arguments);
    clearTimeout(this._pf); const gen = (this._pfGen = (this._pfGen || 0) + 1);
    this._pf = setTimeout(() => {
      this.prefetchList().reduce((ch, [a, p]) => ch.then(() => gen === this._pfGen ? this.call(a, p).catch(() => {}) : null), Promise.resolve(r).catch(() => {}));
    }, 400);
    return r;
  };
  const sync = () => { const t = A.tab && A.tab(); if (t) { const T = t.title || t.label; $('topTitle').textContent = T; document.title = T + ' · ETF Dashboard'; } };   // v41: 탭 이름은 짧게(label), 상단 제목은 전체 이름(title)
  const show0 = A.show;
  A.show = function (id) {
    const changed = id !== this.state.tab;
    if (changed) { lede.className = 'lede wait'; lede.innerHTML = '&nbsp;'; stats.innerHTML = ''; }
    show0.call(this, id); sync(); document.body.classList.remove('side-on');
    if (changed && window.scrollY > 120) window.scrollTo({ top: 0 });
  };
  const narrow = () => window.matchMedia('(max-width:900px)').matches;
  $('sideBtn').onclick = () => { document.body.classList.toggle(narrow() ? 'side-on' : 'side-off'); setTimeout(() => window.dispatchEvent(new Event('resize')), 220); };
  $('scrim').onclick = () => document.body.classList.remove('side-on');
  window.addEventListener('hashchange', () => { const id = location.hash.replace('#', ''); if (id && id !== A.state.tab && A.tabs.some(t => t.id === id)) A.show(id); });
  window.addEventListener('keydown', e => {
    if (!/^Arrow(Up|Down)$/.test(e.key) || /^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName || '') || !e.altKey) return;
    const n = A.tabs.findIndex(t => t.id === A.state.tab) + (e.key === 'ArrowDown' ? 1 : -1); if (A.tabs[n]) { e.preventDefault(); A.show(A.tabs[n].id); }
  });
})();
