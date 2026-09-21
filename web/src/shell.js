/* ── web 전용(v104): shadcn 식 골격 보조 — 설명 문장·지표 카드·점유율 눈금·사이드바·차트 경량화. 데이터·차트 로직은 gas/App·Tabs 그대로 ── */
(function () {
  const FOCUS = '한투';                         // 설명 문장·카드 강조의 관찰 대상 운용사
  const $ = id => document.getElementById(id), lede = $('lede'), stats = $('stats'), A = App;
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const pp = v => (Math.abs(v) < 0.05 ? '0.0' : (v > 0 ? '+' : '') + v.toFixed(1)) + '%p';
  const sg = (v, txt) => `<span class="${v < 0 && !/^[-+]?0\.0/.test(txt) ? 'neg' : ''}">${txt}</span>`;
  const chg = (a, b) => b ? (a / b - 1) * 100 : null;
  const jo = v => A.eok(v) + '조원';
  const U = (v, u) => `${v}<small>${u}</small>`;
  const sj = v => A.signed(v) + '조원';
  const UP = '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 7l-8.5 8.5-5-5L2 17"/><path d="M16 7h6v6"/></svg>';
  const DN = '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 17l-8.5-8.5-5 5L2 7"/><path d="M16 17h6v-6"/></svg>';
  const bd = (v, txt) => (v === null || v === undefined || isNaN(v)) ? null : { s: /^[-+]?0\.0/.test(txt) ? 0 : v, t: txt };   // 추세 배지

  /* 점유율 위치 눈금: 기준일(채운 점)·전년말(빈 점)을 한 축에 — 운용사 간 거리와 이동 방향 */
  function posStrip(rows, colors) {
    const R = rows.filter(r => r.mgr !== '기타'), W = 1000, H = 96, L = 8, Rr = 40, y = 56;
    const max = Math.ceil(Math.max.apply(null, R.map(r => Math.max(r.ms, r.msPy))) / 5) * 5, x = v => L + (W - L - Rr) * v / max;
    let g = `<line x1="${L}" y1="${y}" x2="${W - Rr}" y2="${y}" stroke="#d4d4d8" stroke-width="1"/>`;
    for (let t = 0; t <= max; t += 5) g += `<line x1="${x(t)}" y1="${y}" x2="${x(t)}" y2="${y + 5}" stroke="#d4d4d8"/><text x="${x(t)}" y="${y + 19}" font-size="11" fill="#a1a1aa" text-anchor="middle">${t}%</text>`;
    const S = R.slice().sort((a, b) => a.ms - b.ms); let lastX = -99, up = false;
    S.forEach(r => {
      const c = colors[r.mgr] || '#8A8A96', cx = x(r.ms), f = r.mgr === FOCUS;
      up = cx - lastX < 86 ? !up : false; lastX = cx;                      // 이웃과 가까우면 레이블을 위·아래로 번갈아
      const ly = up ? y - 34 : y - 14;
      g += `<line x1="${x(r.msPy)}" y1="${y}" x2="${cx}" y2="${y}" stroke="${c}" stroke-width="3"/>` +
        `<circle cx="${x(r.msPy)}" cy="${y}" r="4" fill="#fff" stroke="${c}" stroke-width="1.5"/>` +
        `<circle cx="${cx}" cy="${y}" r="${f ? 7 : 5}" fill="${c}"/>` + (up ? `<line x1="${cx}" y1="${y - 8}" x2="${cx}" y2="${ly + 4}" stroke="${c}" stroke-width="1"/>` : '') +
        `<text x="${cx}" y="${ly}" font-size="${f ? 13.5 : 12}" font-weight="${f ? 700 : 500}" fill="${f ? '#18181b' : '#52525b'}" text-anchor="middle">${esc(r.mgr)} ${r.ms.toFixed(1)}%</text>`;
    });
    return `<div class="pos"><div class="pos-h"><span>M/S 위치</span><span>● 기준일 &nbsp;○ 전년말 &nbsp;선 = 연초 이후 이동</span></div><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="상위 5개사 점유율 위치">${g}</svg></div>`;
  }

  /* 탭별 헤드: { desc, cards: [{k, c(색 점), f(강조), v, txt, b(배지), l1, l2}], extra } — 모두 API 응답 값으로만 구성 */
  const HEAD = {
    overview(d) {
      const M = d.monthly, m = M[M.length - 1], p = M[M.length - 2], py = d.prevYE, ytd = chg(m.nav, py.nav), mom = p ? chg(m.nav, p.nav) : null;
      const idx = [['KOSPI', m.kYtd, m.k], ['S&P500', m.sYtd, m.s], ['NASDAQ100', m.qYtd, m.q]].filter(x => x[1] !== null && x[1] !== undefined && !isNaN(x[1]));
      return { desc: `국내 ETF 시장 순자산 <b>${jo(m.nav)}</b>, 연초 대비 ${sg(ytd, A.pct(ytd))}.` + (idx.length ? ` 같은 기간 ${idx.map(x => x[0] + ' ' + sg(x[1], A.pct(x[1]))).join(', ')}.` : ''),
        cards: [{ k: 'ETF 시장 총 NAV', v: U(A.eok(m.nav), '조원'), b: bd(ytd, A.pct(ytd)), l1: `연초 대비 ${sj(m.nav - py.nav)}`, l2: `${A.num(m.n)}종목 · 전년말 ${A.eok(py.nav)}조원` },
          { k: '전월 대비', v: mom === null ? '-' : A.pct(mom), neg: mom < 0, b: null, l1: p ? `${sj(m.nav - p.nav)}` : '', l2: p ? `전월말 ${esc(p.ym)} ${A.eok(p.nav)}조원` : '' },
          { k: '종목 수', v: U(A.num(m.n), '종목'), b: null, l1: `연초 대비 ${m.n - py.n >= 0 ? '+' : ''}${A.num(m.n - py.n)}종목`, l2: `전년말 ${A.num(py.n)}종목` }]
          .concat(idx.map(x => ({ k: x[0], v: A.num(x[2], 2), b: bd(x[1], A.pct(x[1])), l1: `연초 대비 ${A.pct(x[1])}`, l2: 'ETF 총 NAV ' + A.pct(ytd) }))) };
    },
    mgr(d) {
      const R = d.rows.filter(r => r.mgr !== '기타').slice().sort((a, b) => b.nav - a.nav), f = R.find(r => r.mgr === FOCUS);
      let desc = `1위 ${esc(R[0].mgr)} M/S <b>${A.share(R[0].ms)}</b>, 1·2위 합산 ${A.share(R[0].ms + R[1].ms)}.`;
      if (f) { const rank = R.indexOf(f) + 1, dv = f.ms - f.msPy, ahead = R[rank - 2];
        desc = `${FOCUS} M/S <b>${A.share(f.ms)}</b>(연초 대비 ${sg(dv, pp(dv))})로 상위 5개사 중 ${rank}위.` + (ahead ? ` ${rank - 1}위 ${esc(ahead.mgr)}와의 격차 ${(ahead.ms - f.ms).toFixed(1)}%p.` : '') + ` 1·2위 ${esc(R[0].mgr)}·${esc(R[1].mgr)} 합산 ${A.share(R[0].ms + R[1].ms)}.`; }
      return { desc, cards: d.rows.filter(r => r.mgr !== '기타').map(r => ({ k: esc(r.mgr) + ' M/S', c: A.meta.colors[r.mgr], f: r.mgr === FOCUS, v: U(r.ms.toFixed(1), '%'), b: bd(r.ms - r.msPy, pp(r.ms - r.msPy)),
          l1: `잔고 ${A.eok(r.nav)}조원`, l2: `연초 대비 ${sj(r.nav - r.navPy)}` })),
        extra: posStrip(d.rows, A.meta.colors) };
    },
    type(d) {
      const R = d.rows.slice().sort((a, b) => b.share - a.share), t = R[0], g = d.rows.slice().sort((a, b) => (b.share - b.sharePy) - (a.share - a.sharePy)), up = g[0], dn = g[g.length - 1], ov = d.dom.find(x => x.dom === '해외');
      return { desc: `${esc(t.type)}이 <b>${A.share(t.share)}</b>로 최대. 연초 대비 비중 확대 1위는 ${esc(up.type)}(${sg(1, pp(up.share - up.sharePy))}), 축소 1위는 ${esc(dn.type)}(${sg(dn.share - dn.sharePy, pp(dn.share - dn.sharePy))}).` + (ov ? ` 해외 자산 비중 ${A.share(ov.share)}.` : ''),
        cards: d.rows.map(r => ({ k: esc(r.type), v: U(A.eok(r.nav), '조원'), b: bd(r.share - r.sharePy, pp(r.share - r.sharePy)), l1: `비중 ${A.share(r.share)} · ${A.num(r.n)}종목`, l2: `연초 대비 ${sj(r.nav - r.navPy)}` })) };
    },
    shares(d) {
      const mk = d.groups['시장 전체'], who = d.selected && d.groups[d.selected] ? d.selected : FOCUS, g = d.groups[who];
      if (!mk || !g) return { desc: '' };
      const topOf = x => x.types.slice().sort((a, b) => b.share - a.share)[0], a = topOf(mk), b = topOf(g);
      const gap = g.types.map(t => ({ type: t.type, s: t.share, d: t.share - (mk.types.find(m => m.type === t.type) || { share: 0 }).share })).sort((x, y) => y.d - x.d), lo = gap[gap.length - 1];
      return { desc: `${esc(who)}의 최대 유형은 ${esc(b.type)} <b>${A.share(b.share)}</b>. 시장 평균 대비 ${esc(gap[0].type)} ${sg(1, pp(gap[0].d))}, ${esc(lo.type)} ${sg(lo.d, pp(lo.d))}. 시장 전체 최대 유형은 ${esc(a.type)} ${A.share(a.share)}.`,
        cards: [{ k: esc(who) + ' 총 NAV', v: U(A.eok(g.total), '조원'), l1: `${A.num(g.n)}종목`, l2: `시장 전체의 ${A.share(g.total / mk.total * 100)}` },
          { k: '최대 유형', v: esc(b.type), txt: 1, l1: `비중 ${A.share(b.share)}`, l2: `시장 전체 ${esc(a.type)} ${A.share(a.share)}` },
          { k: '시장 대비 과대', v: esc(gap[0].type), txt: 1, b: bd(gap[0].d, pp(gap[0].d)), l1: `${esc(who)} ${A.share(gap[0].s)}`, l2: '시장 전체 유형 비중과의 차이' },
          { k: '시장 대비 과소', v: esc(lo.type), txt: 1, b: bd(lo.d, pp(lo.d)), l1: `${esc(who)} ${A.share(lo.s)}`, l2: '시장 전체 유형 비중과의 차이' }] };
    },
    top(d) {
      const t = d.top[0], n = d.top.length, f = d.byMgr.find(x => x.top === FOCUS), c = d.topTotal / d.total * 100;
      return { desc: `상위 ${n}개 ETF가 시장 순자산의 <b>${A.share(c)}</b>. 1위 ${esc(t.name)} ${jo(t.nav)}.` + (f ? ` 상위 ${n}개 중 ${FOCUS} ${f.n}종목(${A.share(f.share)}).` : ''),
        cards: d.byMgr.map(x => ({ k: esc(x.top), c: A.meta.colors[x.top], f: x.top === FOCUS, v: U(x.n, '종목'), l1: `NAV ${A.eok(x.nav)}조원`, l2: `상위 ${n}개 합계의 ${A.share(x.share)}` })) };
    },
    new(d) {
      if (!d.items.length) return { desc: `${esc(d.year)}년 상장 종목 중 조건에 해당하는 종목 없음.` };
      const m = d.byMgr.slice().sort((a, b) => b.nav - a.nav)[0], big = d.items.slice().sort((a, b) => b.nav - a.nav)[0];
      return { desc: `${esc(d.year)}년 신규상장 <b>${A.num(d.items.length)}종목</b>, NAV 합계 ${jo(d.total)}.` + (d.filter === 'exBond' ? ' 채권/금리형 제외 기준.' : ''),
        cards: [{ k: '신규상장', v: U(A.num(d.items.length), '종목'), l1: esc(d.year) + '년 상장', l2: d.filter === 'exBond' ? '채권/금리형 제외' : '전체 유형' },
          { k: 'NAV 합계', v: U(A.eok(d.total), '조원'), l1: `종목당 평균 ${A.eok(d.total / d.items.length, 2)}조원`, l2: '기준일 순자산총액' }]
          .concat(m ? [{ k: 'NAV 1위 운용사', v: esc(m.mgr), txt: 1, l1: `${A.eok(m.nav)}조원`, l2: `신규상장 NAV 의 ${A.share(m.nav / d.total * 100)}` }] : [])
          .concat(big ? [{ k: '최대 종목', v: esc(big.name), txt: 1, l1: `${A.eok(big.nav)}조원`, l2: esc(big.mgr || '') }] : []) };
    },
    turnover(d) {
      const t = d.top[0];
      return { desc: `${esc(d.from)} ~ ${esc(d.to)} ETF 거래대금 <b>${jo(d.marketSum)}</b>, 일평균 ${jo(d.marketSum / d.days)}.`,
        cards: [{ k: '기간 합계', v: U(A.eok(d.marketSum), '조원'), l1: `${esc(d.from)} ~ ${esc(d.to)}`, l2: `${A.num(d.days)}영업일` },
          { k: '일평균', v: U(A.eok(d.marketSum / d.days, 2), '조원'), l1: '기간 합계 ÷ 영업일', l2: `${A.num(d.days)}영업일 기준` }]
          .concat(t ? [{ k: '거래대금 1위', v: esc(t.name), txt: 1, l1: `${A.eok(t.sum)}조원`, l2: `시장의 ${A.share(t.sum / d.marketSum * 100)}` }] : [])
          .concat(d.top[1] ? [{ k: '거래대금 2위', v: esc(d.top[1].name), txt: 1, l1: `${A.eok(d.top[1].sum)}조원`, l2: `시장의 ${A.share(d.top[1].sum / d.marketSum * 100)}` }] : []) };
    }
  };
  function paint(t, d) {
    let h = { desc: '' };
    try { if (HEAD[t.id]) h = HEAD[t.id](d); } catch (e) { /* 생성 실패 시 카드 없이 표시 */ }
    const dt = d && (d.date || d.to) || '';
    lede.className = 'lede'; lede.innerHTML = (h.desc || '') + (dt ? ` <span style="white-space:nowrap">· 기준 ${esc(dt)}</span>` : '');
    const C = h.cards || [], n = C.length === 6 ? 3 : Math.min(C.length, 5);
    stats.innerHTML = (C.length ? `<div class="cards" style="--n:${n}">` + C.map(x => `<div class="cd${x.f ? ' focus' : ''}"><div class="cd-h"><div class="cd-k">${x.c ? `<i style="background:${x.c}"></i>` : ''}${x.k}</div>${x.b ? `<span class="bdg${x.b.s < 0 ? ' neg' : ''}">${x.b.s < 0 ? DN : UP}${x.b.t}</span>` : ''}</div>` +
      `<div class="cd-v${x.txt ? ' txt' : ''}${x.neg ? ' neg' : ''}"${x.txt ? ` title="${x.v}"` : ''}>${x.v}</div><div class="cd-f"><div class="l1">${x.l1 || '&nbsp;'}</div><div class="l2">${x.l2 || '&nbsp;'}</div></div></div>`).join('') + '</div>' : '') + (h.extra || '');
  }

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
  const IC = { overview: '<rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/><rect x="14" y="12" width="7" height="9" rx="1"/><rect x="3" y="16" width="7" height="5" rx="1"/>',
    mgr: '<path d="M3 21h18M5 21V7l7-4 7 4v14M9 21v-5h6v5M9 10h.01M15 10h.01M9 13h.01M15 13h.01"/>', type: '<path d="M21 12A9 9 0 1 1 12 3v9z"/><path d="M21 8a9 9 0 0 0-5-5v5z"/>',
    shares: '<path d="M3 3v18h18"/><path d="M7 16h8M7 11h12M7 6h5"/>', top: '<path d="M10 6h11M10 12h11M10 18h11M4 6h1v4M4 10h2M6 18H4c0-1 2-2 2-3s-1-1.5-2-1"/>',
    new: '<circle cx="12" cy="12" r="9"/><path d="M12 8v8M8 12h8"/>', turnover: '<path d="M8 3L4 7l4 4M4 7h16M16 21l4-4-4-4M20 17H4"/>' };
  const init0 = A.init;
  A.init = function () {
    this.tabs.forEach(t => { const r0 = t.render; t.render = function (d, view, a) { r0.call(t, d, view, a);
      view.querySelectorAll(':scope > .section').forEach((s, k) => s.setAttribute('data-src', t.id === 'overview' && k === 1 ? '자료: KRX 정보데이터시스템 · Yahoo Finance(지수) · 순자산총액 기준' : '자료: KRX 정보데이터시스템 · 순자산총액 기준'));
      paint(t, d);
      // 캔버스 글자는 웹폰트 도착 전에 그려지면 대체 글꼴로 남음 → Pretendard 로드 후 한 번 다시 그림
      if (document.fonts && document.fonts.load) Promise.all([document.fonts.load("500 12px 'Pretendard Variable'", '가나다0123조원%'), document.fonts.ready]).then(() => a.charts.forEach(c => { try { c.update('none'); } catch (e) {} })).catch(() => {}); }; });
    return Promise.resolve(init0.call(this)).then(() => {
      document.querySelectorAll('#tabs .tab').forEach(b => { b.insertAdjacentHTML('afterbegin', `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${IC[b.dataset.id] || IC.overview}</svg>`); });
      const m = $('hdrMeta'); if (m && this.meta) m.textContent = '최종 적재 ' + (this.meta.lastLoaded || '-');
      sync();
    });
  };
  // 기준일 등 조건이 바뀌면 나머지 탭도 같은 조건으로 미리 받아 둠(call() 이 같은 조회를 기억) → 탭 전환 대기 제거
  const load0 = A.load;
  A.load = function () {
    const r = load0.apply(this, arguments);
    clearTimeout(this._pf);
    this._pf = setTimeout(() => this.tabs.forEach(t => { if (t.id === this.state.tab || !t.action) return; const p = t.params ? t.params(this.state) : {}; if (Object.keys(p).some(k => p[k] === null || p[k] === undefined)) return; this.call(t.action, p).catch(() => {}); }), 400);
    return r;
  };
  const sync = () => { const t = A.tab && A.tab(); if (t) { $('topTitle').textContent = t.label; document.title = t.label + ' · ETF Dashboard'; } };
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
