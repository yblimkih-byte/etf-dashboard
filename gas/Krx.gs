/**
 * Krx.gs — KRX Open API / data.krx.co.kr 웹 / stooq 호출
 */

/** KRX Open API 공통 GET. 빈 결과는 [] */
function krxGet_(path, params) {
  const qs = Object.keys(params).map(k => k + '=' + encodeURIComponent(params[k])).join('&');
  const url = CFG.KRX.BASE + path + '?' + qs;
  let res, code, lastErr = null;
  for (let attempt = 1; attempt <= 2; attempt++) {   // 일시 오류(연결 실패·5xx)는 3초 뒤 1회 재시도
    try { res = UrlFetchApp.fetch(url, { headers: { AUTH_KEY: krxKey_() }, muteHttpExceptions: true }); code = res.getResponseCode(); lastErr = null; }
    catch (e) { lastErr = e; code = 0; }
    if (code && code < 500) break;
    if (attempt < 2) Utilities.sleep(3000);
  }
  if (lastErr) throw new Error('KRX API 연결 실패: ' + lastErr.message);
  if (code === 401 || code === 403) throw new Error('KRX API 인증 실패(' + code + '): 키 또는 서비스 이용신청 승인 확인');
  if (code !== 200) throw new Error('KRX API HTTP ' + code + ' ' + path);
  const body = JSON.parse(res.getContentText() || '{}');
  const block = body.OutBlock_1 || body.output || body[Object.keys(body)[0]];
  return Array.isArray(block) ? block : [];
}

/** ETF 일별매매정보 → 표준 레코드 {date, code, name, nav, trdval, idx}. v29: idx = 기초지수명(테마 분류용, ETF마스터 '기초지수' 열) */
function fetchEtfDaily_(dateStr) {
  const rows = krxGet_(CFG.KRX.ETF_DAILY, { basDd: fmtKrx_(parse_(dateStr)) });
  const F = CFG.KRX.F;
  const out = rows.map(r => ({
    date: fmt_(parse_(pick_(r, F.DATE) || dateStr)),
    code: padCode_(pick_(r, F.CODE)),
    name: String(pick_(r, F.NAME) || '').trim(),
    nav: toNum_(pick_(r, F.NAV_TOT)),
    trdval: toNum_(pick_(r, F.TRDVAL)),
    idx: String(pick_(r, F.IDX_IND) || '').trim()
  })).filter(r => r.code && r.code !== '000000' && r.date === dateStr);   // v17: 요청일과 다른 기준일자 행(전일 값 이월 등)은 제외
  // KRX는 휴장일(연말 휴장, 설·추석 등)에도 값이 0인 행을 반환함 → 전 종목 NAV 0이면 비거래일/미게시로 간주
  // (당일 19:00 시점에는 거래대금만 먼저 게시되고 순자산총액이 0인 경우가 있음 → 빈 응답으로 취급해 다음 실행에 재시도)
  if (!out.some(r => r.nav > 0)) { const e = []; e.raw = rows.length; e.trd = out.filter(r => r.trdval > 0).length; return e; }   // v17: 진단용 원자료 행수
  return out;
}

/** KOSPI 종가 */
function fetchKospi_(dateStr) {
  let rows = [];
  try { rows = krxGet_(CFG.KRX.KOSPI_DAILY, { basDd: fmtKrx_(parse_(dateStr)) }); } catch (e) { return null; }   // 지수 서비스 미승인(401) 시 null
  const F = CFG.KRX.F;
  const hit = rows.find(r => String(pick_(r, F.IDX_NM) || '').trim() === CFG.KRX.KOSPI_NAME);
  return hit ? toNum_(pick_(hit, F.IDX_CLS)) : null;
}

/** Yahoo Finance 일별 종가 → {date: close}. 날짜는 거래소 시간대 기준 */
function fetchYahoo_(sym, fromStr, toStr) {
  const p1 = Math.floor(parse_(fromStr).getTime() / 1000), p2 = Math.floor(addDays_(parse_(toStr), 1).getTime() / 1000);
  const url = CFG.YAHOO.URL.replace('{sym}', encodeURIComponent(sym)).replace('{p1}', p1).replace('{p2}', p2);
  const res = UrlFetchApp.fetch(url, { muteHttpExceptions: true, headers: { 'User-Agent': 'Mozilla/5.0' } });
  if (res.getResponseCode() !== 200) return {};
  const body = JSON.parse(res.getContentText() || '{}');
  const r = body.chart && body.chart.result && body.chart.result[0];
  if (!r || !r.timestamp) return {};
  const tz = (r.meta && r.meta.exchangeTimezoneName) || TZ;
  const close = (r.indicators && r.indicators.quote && r.indicators.quote[0] && r.indicators.quote[0].close) || [];
  const out = {};
  r.timestamp.forEach((ts, i) => { const v = close[i]; if (v !== null && v !== undefined) out[Utilities.formatDate(new Date(ts * 1000), tz, 'yyyy-MM-dd')] = Math.round(v * 100) / 100; });
  return out;
}

/** data.krx.co.kr JSON 호출 (bld 기반) */
function krxWeb_(bld, params) {
  const payload = Object.assign({ bld: bld, locale: 'ko_KR', share: '1', csvxls_isNo: 'false' }, params || {});
  const res = UrlFetchApp.fetch(CFG.KRX_WEB.URL, {
    method: 'post', payload: payload, muteHttpExceptions: true,
    headers: { Referer: CFG.KRX_WEB.REFERER, 'User-Agent': 'Mozilla/5.0' }
  });
  if (res.getResponseCode() !== 200) throw new Error('data.krx.co.kr HTTP ' + res.getResponseCode());
  const body = JSON.parse(res.getContentText() || '{}');
  return body.output || body.OutBlock_1 || body.block1 || [];
}

/** ETF 전종목 기본정보 → {code: {name, mgr, listDd, mkt, asset, obj}} */
function fetchEtfBasic_() {
  const F = CFG.KRX_WEB.BASIC_F;
  const rows = krxWeb_(CFG.KRX_WEB.BASIC_BLD, {});
  const out = {};
  rows.forEach(r => {
    const code = padCode_(r[F.CODE]);
    if (!code) return;
    out[code] = {
      name: String(r[F.NAME] || '').trim(), mgr: String(r[F.MGR] || '').trim(),
      listDd: r[F.LIST_DD] ? fmt_(parse_(r[F.LIST_DD])) : '',
      mkt: String(r[F.MKT] || '').trim(), asset: String(r[F.ASSET] || '').trim(), obj: String(r[F.OBJ] || '').trim()
    };
  });
  if (!Object.keys(out).length) throw new Error('ETF 기본정보 응답 없음: CFG.KRX_WEB.BASIC_BLD/필드명 확인');
  return out;
}

/** (선택) 종목별 투자자별 순매수 — bld·필드명 확인 후 INVESTOR_ENABLED=true */
function fetchInvestorNetBuy_(isuCdFull, dateStr) {
  const F = CFG.KRX_WEB.INVESTOR_F;
  const p = { strtDd: fmtKrx_(parse_(dateStr)), endDd: fmtKrx_(parse_(dateStr)), inqTpCd: '2', trdVolVal: '2', askBid: '3' };
  p[CFG.KRX_WEB.INVESTOR_PARAM_CODE] = isuCdFull;
  return krxWeb_(CFG.KRX_WEB.INVESTOR_BLD, p).map(r => ({ investor: String(r[F.INVST] || '').trim(), netbuy: toNum_(r[F.NETBUY_VAL]) }));
}

/** v41 점검(편집기에서 실행 — 시트·캐시는 바꾸지 않음): 설정액(자금 유출입)·평가 증감 분리에 쓸 필드·정합성 확인.
 *  KRX ETF 일별매매정보 응답의 NAV(1좌당 순자산가치)·LIST_SHRS(상장좌수)를 전월말 ~ 최근 영업일 매일 받아
 *  ① 필드 유무 ② 순자산총액 ≈ NAV × 상장좌수(같은 날·전날·다음 날 좌수) ③ 설정액 = Δ좌수 × 그날 NAV 의 일별 합 vs 월말·최근일 두 시점만 쓴 근사
 *  ④ 상장좌수 대신 내재 좌수(순자산총액 ÷ NAV)로 계산한 값과 비교(설정·해지가 상장좌수에 늦게 반영되는지) ⑤ 운용사·유형별 합계(월초 이후)
 *  결과는 실행 로그와 스크립트 속성 FLOW_CHECK(JSON)에 남김. 금액 단위 억원 */
function checkFlowFields() {
  const t0 = Date.now(), m = JSON.parse(api('meta', {})).data, dv = m.dates.filter(d => d >= m.dailyFrom);
  const d1 = dv[dv.length - 1], m0 = (m.months.filter(x => x.ym < d1.slice(0, 7)).pop() || {}).date;
  const days = dv.filter(d => d >= m0 && d <= d1), E = 1e8, r1 = v => Math.round(v / E);
  const ctx = ctx_(), grp = {};
  (readDailyBlock_(d1) || []).forEach(r => { const g = groupOf_(r, ctx); grp[r.code] = { top: g.top, f2: g.f2 }; });
  const snap = {}, keys = {};
  days.forEach(d => {
    const o = {};
    krxGet_(CFG.KRX.ETF_DAILY, { basDd: fmtKrx_(parse_(d)) }).forEach(r => {
      Object.keys(r).forEach(k => keys[k] = 1);
      const c = padCode_(pick_(r, CFG.KRX.F.CODE)), nav = toNum_(pick_(r, CFG.KRX.F.NAV_TOT));
      if (c && nav > 0) o[c] = { nav: nav, ps: toNum_(r.NAV), sh: toNum_(r.LIST_SHRS) };
    });
    snap[d] = o;
  });
  const out = { at: Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd HH:mm'), from: m0, to: d1, days: days.length, fields: { NAV: !!keys.NAV, LIST_SHRS: !!keys.LIST_SHRS, all: Object.keys(keys).sort().join(',') } };
  // ② 정합: 순자산총액 ÷ (NAV × 좌수). 끝에서 둘째 날 기준으로 같은 날·전날·다음 날 좌수 비교
  const k = days.length - 2, dk = days[k], fit = shOf => { const xs = []; Object.keys(snap[dk]).forEach(c => { const x = snap[dk][c], sh = shOf(c); if (x.ps > 0 && sh > 0) xs.push(x.nav / (x.ps * sh)); }); xs.sort((a, b) => a - b); const w = t => xs.filter(q => Math.abs(q - 1) <= t).length; return { n: xs.length, w01: w(0.001), w1: w(0.01), med: xs.length ? +xs[Math.floor(xs.length / 2)].toFixed(5) : null }; };
  if (k >= 1) out.fit = { date: dk, same: fit(c => snap[dk][c].sh), prev: fit(c => (snap[days[k - 1]][c] || {}).sh), next: fit(c => (snap[days[k + 1]][c] || {}).sh) };
  // ③④ 설정액: 일별 합(상장좌수 S·내재 좌수 U) vs 두 시점 근사(평균 NAV)
  const per = {}, add = (c, s, u) => { const p = per[c] = per[c] || { s: 0, u: 0 }; p.s += s; p.u += u; };
  for (let i = 1; i < days.length; i++) {
    const a = snap[days[i - 1]], b = snap[days[i]];
    Object.keys(b).forEach(c => { const y = b[c], x = a[c]; if (!x) { add(c, y.nav, y.nav); return; } if (!(y.ps > 0 && x.ps > 0)) return; add(c, (y.sh - x.sh) * y.ps, (y.nav / y.ps - x.nav / x.ps) * y.ps); });
    Object.keys(a).forEach(c => { if (!b[c]) add(c, -a[c].nav, -a[c].nav); });
  }
  const A0 = snap[m0], B0 = snap[d1], apx = {};
  Object.keys(B0).forEach(c => { const y = B0[c], x = A0[c]; apx[c] = !x ? y.nav : (y.ps > 0 && x.ps > 0 ? (y.sh - x.sh) * (x.ps + y.ps) / 2 : 0); });
  Object.keys(A0).forEach(c => { if (!B0[c]) apx[c] = -A0[c].nav; });
  const sum = (o, f) => Object.keys(o).reduce((t, c) => t + f(o[c], c), 0);
  const dNav = sum(B0, x => x.nav) - sum(A0, x => x.nav), fS = sum(per, p => p.s), fU = sum(per, p => p.u), fA = sum(apx, v => v);
  out.market = { dNav: r1(dNav), flowDailyShares: r1(fS), flowDailyImplied: r1(fU), flowTwoPoint: r1(fA), valuation: r1(dNav - fS) };
  const big = 100 * E;   // 100억
  out.gap = { sharesVsImplied: r1(sum(per, p => Math.abs(p.s - p.u))), nSharesVsImplied: Object.keys(per).filter(c => Math.abs(per[c].s - per[c].u) > big).length,
    dailyVsTwoPoint: r1(Object.keys(per).reduce((t, c) => t + Math.abs(per[c].s - (apx[c] || 0)), 0)), nDailyVsTwoPoint: Object.keys(per).filter(c => Math.abs(per[c].s - (apx[c] || 0)) > big).length };
  // ⑤ 운용사·유형별(일별 합, 상장좌수 기준)
  const by = key => { const o = {}; Object.keys(per).forEach(c => { const g = grp[c] || { top: '기타', f2: '미분류' }, kk = g[key] || '기타'; o[kk] = (o[kk] || 0) + per[c].s; }); Object.keys(o).forEach(kk => o[kk] = r1(o[kk])); return o; };
  out.byTop = by('top'); out.byType = by('f2');
  out.ms = Date.now() - t0;
  const js = JSON.stringify(out);
  PropertiesService.getScriptProperties().setProperty('FLOW_CHECK', js.slice(0, 8500));
  console.log(js);
  return out;
}
