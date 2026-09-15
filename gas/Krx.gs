/**
 * Krx.gs — KRX Open API / data.krx.co.kr 웹 / stooq 호출
 */

/** KRX Open API 공통 GET. 빈 결과는 [] */
function krxGet_(path, params) {
  const qs = Object.keys(params).map(k => k + '=' + encodeURIComponent(params[k])).join('&');
  const url = CFG.KRX.BASE + path + '?' + qs;
  const res = UrlFetchApp.fetch(url, { headers: { AUTH_KEY: krxKey_() }, muteHttpExceptions: true });
  const code = res.getResponseCode();
  if (code === 401 || code === 403) throw new Error('KRX API 인증 실패(' + code + '): 키 또는 서비스 이용신청 승인 확인');
  if (code !== 200) throw new Error('KRX API HTTP ' + code + ' ' + path);
  const body = JSON.parse(res.getContentText() || '{}');
  const block = body.OutBlock_1 || body.output || body[Object.keys(body)[0]];
  return Array.isArray(block) ? block : [];
}

/** ETF 일별매매정보 → 표준 레코드 {date, code, name, nav, trdval} */
function fetchEtfDaily_(dateStr) {
  const rows = krxGet_(CFG.KRX.ETF_DAILY, { basDd: fmtKrx_(parse_(dateStr)) });
  const F = CFG.KRX.F;
  const out = rows.map(r => ({
    date: fmt_(parse_(pick_(r, F.DATE) || dateStr)),
    code: padCode_(pick_(r, F.CODE)),
    name: String(pick_(r, F.NAME) || '').trim(),
    nav: toNum_(pick_(r, F.NAV_TOT)),
    trdval: toNum_(pick_(r, F.TRDVAL))
  })).filter(r => r.code && r.code !== '000000');
  // KRX는 휴장일(연말 휴장, 설·추석 등)에도 값이 0인 행을 반환함 → 전 종목 NAV 0이면 비거래일/미게시로 간주
  // (당일 19:00 시점에는 거래대금만 먼저 게시되고 순자산총액이 0인 경우가 있음 → 빈 응답으로 취급해 다음 실행에 재시도)
  if (!out.some(r => r.nav > 0)) return [];
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
