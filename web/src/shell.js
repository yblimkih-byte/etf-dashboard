/* ── web 전용(v103): 페이지 헤드(설명 문장)·지표 타일·점유율 눈금. 데이터·차트 로직은 gas/App·Tabs 그대로 ── */
(function () {
  const FOCUS = '한투';                         // 리드 문장의 관찰 대상 운용사
  const $ = id => document.getElementById(id), lede = $('lede'), A = App;
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const pp = v => (Math.abs(v) < 0.05 ? '0.0' : (v > 0 ? '+' : '') + v.toFixed(1)) + '%p';
  const sg = (v, txt) => `<span class="${v < 0 && !/^[-+]?0\.0/.test(txt) ? 'neg' : ''}">${txt}</span>`;
  const chg = (a, b) => b ? (a / b - 1) * 100 : null;
  const jo = v => A.eok(v) + '조원';
  const dl = (v, txt) => `<span class="${v < 0 && !/^[-+]?0\.0/.test(txt) ? 'neg' : v > 0 ? 'up' : ''}">${txt}</span>`;
  const U = (v, u) => `${v}<small>${u}</small>`;
  /* 점유율 위치 눈금: 기준일(채운 점)·전년말(빈 점)을 한 축에 — 운용사 간 거리와 이동 방향 */
  function posStrip(rows, colors) {
    const R = rows.filter(r => r.mgr !== '기타'), W = 1000, H = 96, L = 8, Rr = 40, y = 56;
    const max = Math.ceil(Math.max.apply(null, R.map(r => Math.max(r.ms, r.msPy))) / 5) * 5, x = v => L + (W - L - Rr) * v / max;
    let g = `<line x1="${L}" y1="${y}" x2="${W - Rr}" y2="${y}" stroke="#a1a1aa" stroke-width="1"/>`;
    for (let t = 0; t <= max; t += 5) g += `<line x1="${x(t)}" y1="${y}" x2="${x(t)}" y2="${y + 5}" stroke="#a1a1aa"/><text x="${x(t)}" y="${y + 19}" font-size="11" fill="#8a8a94" text-anchor="middle">${t}%</text>`;
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

  /* 탭별 헤드: { desc: 설명 문장, label/note: 타일 구역 제목, tiles: [{k,v,d,c(색),f(강조),txt}], extra } — 모두 API 응답 값으로만 구성 */
  const HEAD = {
    overview(d) {
      const M = d.monthly, m = M[M.length - 1], p = M[M.length - 2], ytd = chg(m.nav, d.prevYE.nav), mom = p ? chg(m.nav, p.nav) : null;
      const idx = [['KOSPI', m.kYtd, m.k], ['S&P500', m.sYtd, m.s], ['NASDAQ100', m.qYtd, m.q]].filter(x => x[1] !== null && x[1] !== undefined && !isNaN(x[1]));
      return { desc: `국내 ETF 시장 순자산 <b>${jo(m.nav)}</b>, 연초 대비 ${sg(ytd, A.pct(ytd))}.` + (idx.length ? ` 같은 기간 ${idx.map(x => x[0] + ' ' + sg(x[1], A.pct(x[1]))).join(', ')}.` : ''),
        label: '시장 요약', note: '연초 대비 = 전년말 ' + esc(d.prevYE.ym) + ' 기준',
        tiles: [{ k: 'ETF 시장 총 NAV', v: U(A.eok(m.nav), '조원'), d: A.num(m.n) + '종목' },
          { k: '연초 대비', v: A.pct(ytd), d: dl(m.nav - d.prevYE.nav, A.signed(m.nav - d.prevYE.nav) + '조원'), s: ytd },
          { k: '전월 대비', v: mom === null ? '-' : A.pct(mom), d: p ? dl(m.nav - p.nav, A.signed(m.nav - p.nav) + '조원') : '', s: mom }]
          .concat(idx.map(x => ({ k: x[0], v: A.num(x[2], 2), d: '연초 대비 ' + dl(x[1], A.pct(x[1])) }))) };
    },
    mgr(d) {
      const R = d.rows.filter(r => r.mgr !== '기타').slice().sort((a, b) => b.nav - a.nav), f = R.find(r => r.mgr === FOCUS);
      let desc = `1위 ${esc(R[0].mgr)} M/S <b>${A.share(R[0].ms)}</b>, 1·2위 합산 ${A.share(R[0].ms + R[1].ms)}.`;
      if (f) { const rank = R.indexOf(f) + 1, dv = f.ms - f.msPy, ahead = R[rank - 2];
        desc = `${FOCUS} M/S <b>${A.share(f.ms)}</b>(연초 대비 ${sg(dv, pp(dv))})로 상위 5개사 중 ${rank}위.` + (ahead ? ` ${rank - 1}위 ${esc(ahead.mgr)}와의 격차 ${(ahead.ms - f.ms).toFixed(1)}%p.` : '') + ` 1·2위 ${esc(R[0].mgr)}·${esc(R[1].mgr)} 합산 ${A.share(R[0].ms + R[1].ms)}.`; }
      return { desc, label: '상위 5개사 M/S', note: '괄호 밖 = 잔고, %p = 연초 대비 M/S 변동',
        tiles: d.rows.filter(r => r.mgr !== '기타').map(r => ({ k: esc(r.mgr), c: A.meta.colors[r.mgr], f: r.mgr === FOCUS, v: U(r.ms.toFixed(1), '%'), d: `${A.eok(r.nav)}조원 · ${dl(r.ms - r.msPy, pp(r.ms - r.msPy))}` })),
        extra: posStrip(d.rows, A.meta.colors) };
    },
    type(d) {
      const R = d.rows.slice().sort((a, b) => b.share - a.share), t = R[0], g = d.rows.slice().sort((a, b) => (b.share - b.sharePy) - (a.share - a.sharePy)), up = g[0], dn = g[g.length - 1], ov = d.dom.find(x => x.dom === '해외');
      return { desc: `${esc(t.type)}이 <b>${A.share(t.share)}</b>로 최대. 연초 대비 비중 확대 1위는 ${esc(up.type)}(${sg(1, pp(up.share - up.sharePy))}), 축소 1위는 ${esc(dn.type)}(${sg(dn.share - dn.sharePy, pp(dn.share - dn.sharePy))}).` + (ov ? ` 해외 자산 비중 ${A.share(ov.share)}.` : ''),
        label: '유형별 NAV', note: '%p = 연초 대비 비중 변동',
        tiles: d.rows.map(r => ({ k: esc(r.type), v: U(A.eok(r.nav), '조원'), d: `${A.share(r.share)} · ${dl(r.share - r.sharePy, pp(r.share - r.sharePy))}` })) };
    },
    shares(d) {
      const mk = d.groups['시장 전체'], who = d.selected && d.groups[d.selected] ? d.selected : FOCUS, g = d.groups[who];
      if (!mk || !g) return { desc: '' };
      const topOf = x => x.types.slice().sort((a, b) => b.share - a.share)[0], a = topOf(mk), b = topOf(g);
      const gap = g.types.map(t => ({ type: t.type, d: t.share - (mk.types.find(m => m.type === t.type) || { share: 0 }).share })).sort((x, y) => y.d - x.d), lo = gap[gap.length - 1];
      return { desc: `${esc(who)}의 최대 유형은 ${esc(b.type)} <b>${A.share(b.share)}</b>. 시장 평균 대비 ${esc(gap[0].type)} ${sg(1, pp(gap[0].d))}, ${esc(lo.type)} ${sg(lo.d, pp(lo.d))}. 시장 전체 최대 유형은 ${esc(a.type)} ${A.share(a.share)}.`,
        label: esc(who) + ' 요약', note: '시장 대비 = 시장 전체 유형 비중과의 차이',
        tiles: [{ k: '총 NAV', v: U(A.eok(g.total), '조원'), d: A.num(g.n) + '종목' }, { k: '최대 유형', v: esc(b.type), txt: 1, d: A.share(b.share) },
          { k: '시장 대비 과대', v: esc(gap[0].type), txt: 1, d: dl(gap[0].d, pp(gap[0].d)) }, { k: '시장 대비 과소', v: esc(lo.type), txt: 1, d: dl(lo.d, pp(lo.d)) }] };
    },
    top(d) {
      const t = d.top[0], n = d.top.length, f = d.byMgr.find(x => x.top === FOCUS), c = d.topTotal / d.total * 100;
      return { desc: `상위 ${n}개 ETF가 시장 순자산의 <b>${A.share(c)}</b>. 1위 ${esc(t.name)} ${jo(t.nav)}.` + (f ? ` 상위 ${n}개 중 ${FOCUS} ${f.n}종목(${A.share(f.share)}).` : ''),
        label: `상위 ${n}개 ETF — 운용사별`, note: '비중 = 상위 ' + n + '개 NAV 합계 대비',
        tiles: d.byMgr.map(x => ({ k: esc(x.top), c: A.meta.colors[x.top], f: x.top === FOCUS, v: U(x.n, '종목'), d: `${A.eok(x.nav)}조원 · ${A.share(x.share)}` })) };
    },
    new(d) {
      if (!d.items.length) return { desc: `${esc(d.year)}년 상장 종목 중 조건에 해당하는 종목 없음.` };
      const m = d.byMgr.slice().sort((a, b) => b.nav - a.nav)[0], big = d.items.slice().sort((a, b) => b.nav - a.nav)[0];
      return { desc: `${esc(d.year)}년 신규상장 <b>${A.num(d.items.length)}종목</b>, NAV 합계 ${jo(d.total)}.` + (d.filter === 'exBond' ? ' 채권/금리형 제외 기준.' : ''),
        label: esc(d.year) + '년 신규상장 요약', note: '',
        tiles: [{ k: '신규상장', v: U(A.num(d.items.length), '종목') }, { k: 'NAV 합계', v: U(A.eok(d.total), '조원') }]
          .concat(m ? [{ k: 'NAV 1위 운용사', v: esc(m.mgr), txt: 1, d: A.eok(m.nav) + '조원' }] : []).concat(big ? [{ k: '최대 종목', v: esc(big.name), txt: 1, d: A.eok(big.nav) + '조원' }] : []) };
    },
    turnover(d) {
      const t = d.top[0];
      return { desc: `${esc(d.from)} ~ ${esc(d.to)} ETF 거래대금 <b>${jo(d.marketSum)}</b>, 일평균 ${jo(d.marketSum / d.days)}.`,
        label: '거래대금 요약', note: A.num(d.days) + '영업일 기준',
        tiles: [{ k: '기간 합계', v: U(A.eok(d.marketSum), '조원') }, { k: '일평균', v: U(A.eok(d.marketSum / d.days, 2), '조원') }, { k: '영업일', v: U(A.num(d.days), '일') }]
          .concat(t ? [{ k: '1위 종목', v: esc(t.name), txt: 1, d: `${A.eok(t.sum)}조원 · 시장의 ${A.share(t.sum / d.marketSum * 100)}` }] : []) };
    }
  };
  const KICK = { overview: 'Market Overview', mgr: 'Asset Managers', type: 'Asset Classes', shares: 'Type Mix', top: 'Top ETFs', new: 'New Listings', turnover: 'Turnover' };
  const stats = $('stats');
  function paint(t, d) {
    const dt = d && (d.date || d.to) || '';
    let h = { desc: '' };
    try { if (HEAD[t.id]) h = HEAD[t.id](d); } catch (e) { /* 생성 실패 시 제목만 표시 */ }
    lede.className = 'lede';
    lede.innerHTML = `<div class="lede-k">${esc(KICK[t.id] || 'ETF Market')}</div><h1 class="lede-h">${esc(t.label)}</h1>${h.desc ? `<p class="lede-d">${h.desc}</p>` : ''}` +
      `<div class="lede-s">${dt ? `기준 <b>${esc(dt)}</b> ·` : ''} 최종 적재 <b>${esc(A.meta.lastLoaded || '-')}</b> · 매 영업일 08:30 / 19:00 갱신</div>`;
    const T = h.tiles || [];
    stats.innerHTML = (T.length ? `<div class="sec-l"><span>${h.label || ''}</span><span>${h.note || ''}</span></div><div class="tiles" style="--n:${Math.min(T.length, 6)}">` +
      T.map(x => `<div class="tl${x.f ? ' focus' : ''}"><div class="k">${x.c ? `<i style="background:${x.c}"></i>` : ''}${x.k}</div><div class="v${x.txt ? ' txt' : ''}${x.s < 0 ? ' neg' : ''}" title="${x.txt ? x.v : ''}">${x.v}</div><div class="d">${x.d || '&nbsp;'}</div></div>`).join('') + '</div>' : '') + (h.extra || '');
  }
  // 새 탭이 나중에 등록돼도 적용되도록 init 시점에 render 를 감쌈
  const init0 = A.init;
  A.init = function () {
    this.tabs.forEach(t => { const r0 = t.render; t.render = function (d, view, a) { r0.call(t, d, view, a);
      view.querySelectorAll(':scope > .section').forEach((s, k) => s.setAttribute('data-src', t.id === 'overview' && k === 1 ? '자료: KRX 정보데이터시스템 · Yahoo Finance(지수) · 순자산총액 기준' : '자료: KRX 정보데이터시스템 · 순자산총액 기준'));
      paint(t, d); }; });
    return init0.call(this);
  };
  const tiles0 = A.tiles;
  A.tiles = function (parent, items) { const t = tiles0.call(this, parent, items); t.querySelectorAll('.tile').forEach(el => { if (/^[-−]/.test(el.querySelector('.v').textContent.trim())) el.classList.add('down'); }); return t; };
  const show0 = A.show;
  A.show = function (id) {
    const changed = id !== this.state.tab;
    if (changed) { lede.className = 'lede wait'; lede.innerHTML = '<div class="lede-k">&nbsp;</div><h1 class="lede-h">&nbsp;</h1><p class="lede-d">&nbsp;</p>'; stats.innerHTML = ''; }
    show0.call(this, id);
    const b = document.querySelector('.tab.active'); if (b && b.scrollIntoView) b.scrollIntoView({ block: 'nearest', inline: 'center' });
    const t = this.tab(); if (t) document.title = t.label + ' · ETF Dashboard';
    if (changed && window.scrollY > 120) window.scrollTo({ top: 0 });
  };
  window.addEventListener('hashchange', () => { const id = location.hash.replace('#', ''); if (id && id !== A.state.tab && A.tabs.some(t => t.id === id)) A.show(id); });
  window.addEventListener('keydown', e => {
    if (!/^Arrow(Up|Down)$/.test(e.key) || /^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName || '') || !e.altKey) return;
    const n = A.tabs.findIndex(t => t.id === A.state.tab) + (e.key === 'ArrowDown' ? 1 : -1); if (A.tabs[n]) { e.preventDefault(); A.show(A.tabs[n].id); }
  });
})();
