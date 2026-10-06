/**
 * Kis.gs — v29 종목→ETF 찾기(역인덱스)
 *  · 원천: 한국투자증권 Open API 'ETF 구성종목시세'(국내주식-073, tr_id FHKST121600C0) — 종목별 구성종목·비중
 *  · 키: 메뉴 [ETF Dashboard] › KIS Open API 키 설정 (사용자가 직접 입력, 스크립트 속성에만 저장). 토큰(1일 유효)은 발급 후 재사용
 *  · 수집: collectHoldings() — 최근 영업일 NAV>0 전 종목을 15건씩 동시 요청(초당 20건 한도 아래), 4분을 넘기면 이어서 실행.
 *          새 시트('구성종목_수집중')에 쓰고 끝나면 '구성종목'과 교체 → 수집 도중에도 화면은 이전 자료 사용. 매주 월요일 07시대 자동(키 저장 시 트리거 설치)
 *  · 화면: apiHolders_({q, pick}) — 종목명·코드·별칭(범례_종목별칭: 한/영 표기)으로 구성종목을 찾아, 그 종목을 담은 ETF 목록(비중·보유 평가액 = ETF NAV × 비중)
 *  · 탭은 첫 수집이 끝난 뒤에만 보임(meta.holdingsDate)
 */
const KIS = {
  BASE: 'https://openapi.koreainvestment.com:9443',
  TOKEN: '/oauth2/tokenP',
  PDF: '/uapi/etfetn/v1/quotations/inquire-component-stock-price', PDF_TR: 'FHKST121600C0',
  SHEET: '구성종목', TMP: '구성종목_수집중', ALIAS: '범례_종목별칭',
  HEADER: ['ETF코드', 'ETF명', '구성종목코드', '구성종목명', '비중(%)', '평가금액(원)'],
  BATCH: 15, GAP_MS: 1100, RUN_MS: 4 * 60 * 1000, MAX_ERR: 0.5,
  CASH: /^(원화예금|원화현금|현금|설정현금액|예금|기타|KRW|USD|미국달러|CASH|선물증거금|미수금|미지급금)$/i,
  TOP_N: 40,
  // 대표 표기 | 검색어(쉼표) — 사용자가 시트에서 추가·수정. 해외 종목은 KIS 표기가 영문·한글 중 무엇이든 찾도록 둘 다
  DEFAULT_ALIAS: [
    ['삼성전자', '삼성전자, 005930, Samsung Electronics'], ['SK하이닉스', 'SK하이닉스, 하이닉스, 000660, SK hynix'],
    ['엔비디아', '엔비디아, NVIDIA, NVDA'], ['애플', '애플, APPLE, AAPL'], ['마이크로소프트', '마이크로소프트, MICROSOFT, MSFT'],
    ['알파벳(구글)', '알파벳, 구글, ALPHABET, GOOGL, GOOG'], ['아마존', '아마존, AMAZON, AMZN'], ['메타', '메타 플랫폼스, 메타플랫폼스, META PLATFORMS'],
    ['테슬라', '테슬라, TESLA, TSLA'], ['브로드컴', '브로드컴, BROADCOM, AVGO'], ['TSMC', 'TSMC, TAIWAN SEMICONDUCTOR, 타이완 세미컨덕터, 대만 반도체'],
    ['팔란티어', '팔란티어, PALANTIR, PLTR'], ['일라이릴리', '일라이릴리, 일라이 릴리, ELI LILLY, LLY'], ['버크셔해서웨이', '버크셔, BERKSHIRE'],
    ['넷플릭스', '넷플릭스, NETFLIX, NFLX'], ['AMD', 'AMD, ADVANCED MICRO DEVICES, 어드밴스드 마이크로'], ['마이크론', '마이크론, MICRON, MU'],
    ['오라클', '오라클, ORACLE, ORCL'], ['샌디스크', '샌디스크, SANDISK, SNDK'], ['아이온큐', '아이온큐, IONQ'], ['로켓랩', '로켓랩, ROCKET LAB, RKLB'],
    ['코스트코', '코스트코, COSTCO, COST'], ['JP모건', 'JP모건, JPMORGAN, JPM'], ['비자', '비자, VISA'], ['월마트', '월마트, WALMART, WMT'],
    ['노보 노디스크', '노보 노디스크, 노보노디스크, NOVO NORDISK'], ['ASML', 'ASML'], ['알리바바', '알리바바, ALIBABA, BABA'], ['텐센트', '텐센트, TENCENT'],
    ['샤오미', '샤오미, XIAOMI'], ['BYD', 'BYD, 비야디'], ['코인베이스', '코인베이스, COINBASE, COIN'], ['스트래티지', '스트래티지, 마이크로스트래티지, STRATEGY, MSTR']
  ]
};

// ─────────────────────────── 인증·요청(순수 해석 함수는 로컬 테스트에서도 사용) ───────────────────────────

/** 'yyyy-MM-dd HH:mm:ss'(KST) → ms */
function kisKst_(s) { const t = new Date(String(s).trim().replace(' ', 'T') + '+09:00').getTime(); return isNaN(t) ? 0 : t; }
function kisJson_(s) { try { return JSON.parse(s || '{}'); } catch (e) { return {}; } }
function kisKeys_() {
  const P = PropertiesService.getScriptProperties(), key = P.getProperty(PROP.KIS_KEY), sec = P.getProperty(PROP.KIS_SECRET);
  if (!key || !sec) throw new Error('KIS Open API 키 미설정: 메뉴 [ETF Dashboard] › KIS Open API 키 설정');
  return { key: key, sec: sec };
}
/** 접근 토큰(유효 1일). 남은 시간 30분 이상이면 저장된 토큰 재사용(발급은 분당 1회 제한) */
function kisToken_(force) {
  const P = PropertiesService.getScriptProperties(), k = kisKeys_();
  if (!force) { const o = kisJson_(P.getProperty(PROP.KIS_TOKEN)); if (o.t && o.exp - Date.now() > 30 * 60 * 1000) return o.t; }
  const res = UrlFetchApp.fetch(KIS.BASE + KIS.TOKEN, { method: 'post', contentType: 'application/json; charset=utf-8', muteHttpExceptions: true,
    payload: JSON.stringify({ grant_type: 'client_credentials', appkey: k.key, appsecret: k.sec }) });
  const code = res.getResponseCode(), b = kisJson_(res.getContentText());
  if (code !== 200 || !b.access_token) throw new Error('KIS 토큰 발급 실패(' + code + '): ' + (b.error_description || b.msg1 || String(res.getContentText()).slice(0, 120)));
  const exp = kisKst_(b.access_token_token_expired) || Date.now() + (+b.expires_in || 86400) * 1000;
  P.setProperty(PROP.KIS_TOKEN, JSON.stringify({ t: b.access_token, exp: exp }));
  return b.access_token;
}
/** 구성종목 조회 요청 객체(UrlFetchApp.fetchAll 용) */
function kisPdfReq_(code, token, k) {
  return { url: KIS.BASE + KIS.PDF + '?FID_COND_MRKT_DIV_CODE=J&FID_INPUT_ISCD=' + encodeURIComponent(code) + '&FID_COND_SCR_DIV_CODE=11216', method: 'get',
    contentType: 'application/json; charset=utf-8', muteHttpExceptions: true,
    headers: { authorization: 'Bearer ' + token, appkey: k.key, appsecret: k.sec, tr_id: KIS.PDF_TR, custtype: 'P' } };
}
/** 응답 → {ok, rows:[[구성종목코드, 구성종목명, 비중(%), 평가금액]], n(ETF 측 구성종목 수), err, retry, expired}.
 *  v31: 비중 = 평가금액(etf_vltn_amt, CU 1개 기준) ÷ CU 금액(output1 etf_cu_unit_scrt_cnt × nav) × 100 — ETF 전체 순자산 대비 실제 비중.
 *       (etf_cnfg_issu_rlim 은 '응답에 나온 국내 상장 종목끼리'의 비중이라 해외 종목이 섞인 ETF 에서 과대 — 예: 해외 21종목 중 국내 1종목이면 100%)
 *  CU 금액을 모르면 etf_cnfg_issu_rlim, 그것도 없으면 응답 종목이 전부일 때만 평가금액 비율 */
function kisParsePdf_(code, text) {
  const b = kisJson_(text), msg = String((b.msg_cd || '') + ' ' + (b.msg1 || '')).trim();
  if (code !== 200 || (b.rt_cd !== undefined && String(b.rt_cd) !== '0')) {
    const expired = /EGW00123|EGW00121|token/i.test(msg) || code === 401;
    return { ok: false, err: (code !== 200 ? 'HTTP ' + code + ' ' : '') + (msg || String(text || '').slice(0, 80)), expired: expired, retry: expired || code >= 500 || code === 429 || /EGW00201|초당|건수/.test(msg) };
  }
  const items = Array.isArray(b.output2) ? b.output2 : [], o1 = b.output1 || {}, n = toNum_(o1.etf_cnfg_issu_cnt);
  const cuv = toNum_(o1.etf_cu_unit_scrt_cnt) * toNum_(o1.nav), r4 = v => Math.round(v * 1e4) / 1e4;
  let rows = items.map(x => [String(x.stck_shrn_iscd || '').trim(), String(x.hts_kor_isnm || '').trim(), toNum_(x.etf_cnfg_issu_rlim), toNum_(x.etf_vltn_amt)]).filter(r => r[0] || r[1]);
  if (cuv > 0 && rows.some(r => r[3] > 0)) rows = rows.map(r => [r[0], r[1], r4(Math.max(r[3], 0) / cuv * 100), r[3]]);
  else if (rows.length && rows.every(r => !r[2]) && !(n > rows.length)) { const s = rows.reduce((a, r) => a + Math.max(r[3], 0), 0); if (s > 0) rows = rows.map(r => [r[0], r[1], r4(Math.max(r[3], 0) / s * 100), r[3]]); }
  return { ok: true, rows: rows, n: n, part: n > rows.length };
}
const kisCash_ = (code, name) => KIS.CASH.test(String(name || '').replace(/\s+/g, '')) || /^KRD0/.test(String(code || ''));

// ─────────────────────────── 수집 ───────────────────────────

/** 수집 대상: 기준일(최근 영업일) NAV>0 종목 [code, name] (종목코드 순 — 이어서 실행해도 같은 순서) */
function holdingsTargets_(date) { return readDailyBlock_(date).filter(r => r.nav > 0).map(r => [r.code, String(r.name)]).sort((a, b) => a[0] < b[0] ? -1 : 1); }
/** 메뉴·트리거: 전 종목 구성종목 수집(이어서 실행). 적재(loadDaily)와 겹치지 않게 적재 실행 중이면 10분 뒤 */
function collectHoldings() {
  const P = PropertiesService.getScriptProperties(), t0 = Date.now();
  const since = +(P.getProperty(PROP.LOADING) || 0);
  if (since && Date.now() - since < 7 * 60 * 1000) { scheduleContinue_('collectHoldings', 10); return; }
  const run = +(P.getProperty(PROP.KIS_RUN) || 0);
  if (run && Date.now() - run < 6 * 60 * 1000) return;   // 다른 수집 실행 중
  P.setProperty(PROP.KIS_RUN, String(t0));
  try {
    const ss = ss_();
    let st = kisJson_(P.getProperty(PROP.KIS_STATE));
    if (!st.date) {
      const dates = indexDates_(); if (!dates.length) throw new Error('일별 자료가 없습니다');
      st = { date: dates[dates.length - 1], i: 0, ok: 0, empty: 0, err: 0, errs: [], rows: 0, start: Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd HH:mm') };
      const old = ss.getSheetByName(KIS.TMP); if (old) ss.deleteSheet(old);
      const sh = ss.insertSheet(KIS.TMP); sh.getRange(1, 1, 1, KIS.HEADER.length).setValues([KIS.HEADER]); sh.setFrozenRows(1); sh.getRange('A:A').setNumberFormat('@'); sh.getRange('C:C').setNumberFormat('@');
    }
    const targets = holdingsTargets_(st.date), k = kisKeys_(), sh = ss.getSheetByName(KIS.TMP);
    if (!sh) { P.deleteProperty(PROP.KIS_STATE); throw new Error('수집 중 시트가 없어 처음부터 다시 시작해야 합니다'); }
    let token = kisToken_(), buf = [];
    for (let first = true; st.i < targets.length && (first || Date.now() - t0 < KIS.RUN_MS); first = false) {   // 실행마다 최소 1묶음은 처리
      const batch = targets.slice(st.i, st.i + KIS.BATCH), t1 = Date.now();
      let res = UrlFetchApp.fetchAll(batch.map(c => kisPdfReq_(c[0], token, k))).map((r, j) => kisParsePdf_(r.getResponseCode(), r.getContentText()));
      const again = res.map((r, j) => r.retry ? j : -1).filter(j => j >= 0);
      if (again.length) {   // 한도 초과·일시 오류·토큰 만료: 1.5초 뒤 1회 재시도(토큰 만료면 재발급)
        if (res.some(r => r.expired)) token = kisToken_(true);
        Utilities.sleep(1500);
        const rr = UrlFetchApp.fetchAll(again.map(j => kisPdfReq_(batch[j][0], token, k))).map(r => kisParsePdf_(r.getResponseCode(), r.getContentText()));
        again.forEach((j, x) => { res[j] = rr[x]; });
      }
      res.forEach((r, j) => {
        const c = batch[j];
        if (!r.ok) { st.err++; if (st.errs.length < 5) st.errs.push(c[0] + ' ' + r.err); return; }
        if (!r.rows.length) { st.empty++; return; }
        st.ok++; if (r.part) st.part = (st.part || 0) + 1; r.rows.forEach(x => buf.push([c[0], c[1], x[0], x[1], x[2], x[3]]));
      });
      st.i += batch.length;
      if (buf.length >= 3000) { appendRows_(sh, buf); st.rows += buf.length; buf = []; }
      const wait = KIS.GAP_MS - (Date.now() - t1); if (wait > 0) Utilities.sleep(wait);
    }
    if (buf.length) { appendRows_(sh, buf); st.rows += buf.length; }
    if (st.i < targets.length) {
      P.setProperty(PROP.KIS_STATE, JSON.stringify(st)); scheduleContinue_('collectHoldings', 1);
      console.log('[collectHoldings] 진행 ' + st.i + '/' + targets.length + ' (이어서 실행)'); return;
    }
    P.deleteProperty(PROP.KIS_STATE);
    const info = { date: st.date, n: targets.length, ok: st.ok, empty: st.empty, err: st.err, part: st.part || 0, rows: st.rows, at: Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd HH:mm'), errs: st.errs };
    if (st.err > targets.length * KIS.MAX_ERR) {   // 절반 넘게 오류 → 이전 자료 유지(수집중 시트는 점검용으로 남김)
      log_('구성종목 수집 실패: 성공 ' + st.ok + '/' + targets.length + ' · 오류 예: ' + st.errs.join(' | '), 'ERROR'); P.setProperty(PROP.KIS_INFO, JSON.stringify(Object.assign(info, { failed: true }))); return;
    }
    const old = ss.getSheetByName(KIS.SHEET); if (old) ss.deleteSheet(old);
    sh.setName(KIS.SHEET);
    P.setProperty(PROP.KIS_DATE, st.date); P.setProperty(PROP.KIS_INFO, JSON.stringify(info));
    try { P.setProperty(PROP.KIS_TOP, JSON.stringify(holdingsTop_(st.date))); } catch (e) { log_('많이 담긴 종목 계산 실패: ' + e.message, 'WARN'); }
    bumpCache_(['9999-12']);   // meta(탭 표시·기준일)·검색 결과 캐시만 새로(기준일 조회 캐시는 유지)
    try { holdingsIndex_(st.date); } catch (e) { log_('검색 색인 만들기 실패(첫 검색 때 다시 시도): ' + e.message, 'WARN'); }   // v32
    log_('구성종목 수집 완료: ' + st.date + ' · ' + st.ok + '/' + targets.length + '종목(구성종목 없음 ' + st.empty + ', 오류 ' + st.err + ') · ' + st.rows + '행' + (st.errs.length ? ' · 오류 예: ' + st.errs.join(' | ') : ''));
  } catch (e) {
    log_('구성종목 수집 오류: ' + e.message, 'ERROR'); throw e;
  } finally { P.deleteProperty(PROP.KIS_RUN); }
}
function cont_collectHoldings() { clearTriggers_('cont_collectHoldings'); collectHoldings(); }
/** 매주 월요일 07시대 수집 트리거(키 저장 시 설치) */
function installHoldingsTrigger_() {
  clearTriggers_('collectHoldings');
  ScriptApp.newTrigger('collectHoldings').timeBased().onWeekDay(ScriptApp.WeekDay.MONDAY).atHour(7).nearMinute(10).inTimezone(TZ).create();
}

// ─────────────────────────── 검색 ───────────────────────────

/** 구성종목 시트 → [{etf, comp, name, w}] (현금성 제외) */
function holdingsRows_() {
  const sh = ss_().getSheetByName(KIS.SHEET); if (!sh) return [];
  return readAll_(sh).map(r => ({ etf: padCode_(r[0]), comp: String(r[2] || '').trim(), name: String(r[3] || '').trim(), w: toNum_(r[4]) })).filter(r => r.etf && (r.comp || r.name) && !kisCash_(r.comp, r.name));
}
/** 많이 담긴 종목(보유 평가액 = ETF NAV × 비중 합계) 상위 N — 검색 제안용 [[이름, 코드, 보유액(억원), ETF 수]] */
function holdingsTop_(date) {
  const nav = {}; readDailyBlock_(date).forEach(r => nav[r.code] = r.nav);
  const agg = {};
  holdingsRows_().forEach(r => { const k = r.comp + '|' + r.name, a = agg[k] = agg[k] || { name: r.name, comp: r.comp, amt: 0, n: 0 }; a.amt += (nav[r.etf] || 0) * r.w / 100; a.n++; });
  return Object.keys(agg).map(k => agg[k]).sort((a, b) => b.amt - a.amt).slice(0, KIS.TOP_N).map(a => [a.name, a.comp, Math.round(a.amt / 1e8), a.n]);
}
/** 범례_종목별칭 시트(없으면 기본값으로 생성) → [[대표, [검색어…]]] */
function holdingsAlias_() {
  const ss = ss_(); let sh = ss.getSheetByName(KIS.ALIAS);
  if (!sh) {
    sh = ss.insertSheet(KIS.ALIAS);
    sh.getRange(1, 1, 1, 2).setValues([['대표 표기', '검색어(쉼표로 구분 — 한글·영문·티커·종목코드)']]).setFontWeight('bold');
    sh.getRange(2, 1, KIS.DEFAULT_ALIAS.length, 2).setValues(KIS.DEFAULT_ALIAS); sh.setFrozenRows(1); sh.setColumnWidth(1, 140); sh.setColumnWidth(2, 460);
  }
  return readAll_(sh).filter(r => String(r[0]).trim()).map(r => [String(r[0]).trim(), themeTokens_(r[1]).concat([String(r[0]).trim()])]);
}
/** 검색어 → 비교용 정규형(대문자·공백·점 제거) */
function holdNorm_(s) { return String(s || '').toUpperCase().replace(/[\s.,·()]/g, ''); }
/** 구성종목 1건이 검색어 집합에 맞는지: 코드 일치 · 영문 4자 이하(티커)는 이름의 단어 일치 · 그 밖은 이름 부분 일치 */
function holdMatch_(terms, comp, name) {
  const nc = holdNorm_(comp), nn = holdNorm_(name), up = String(name || '').toUpperCase();
  return terms.some(t => {
    const n = holdNorm_(t); if (!n) return false;
    if (n === nc) return true;
    if (/^[A-Z]{1,4}$/.test(n)) return new RegExp('(^|[^A-Z])' + n + '(?![A-Z])').test(up);
    return n.length >= 2 && nn.indexOf(n) >= 0;
  });
}
/** 검색: q = 종목명·코드·별칭. 후보(같은 검색어에 맞는 구성종목들)를 보유액 순으로 돌려주고, pick(코드|이름)이 없으면 이름이 정확히 같은 후보 → 보유액 1위 후보를 선택.
 *  결과 ETF 목록: 비중(%)·보유 평가액(= 기준일 ETF NAV × 비중)·운용사·유형 */
function apiHolders_(p) {
  const P = PropertiesService.getScriptProperties(), date = P.getProperty(PROP.KIS_DATE);
  if (!date) return { ready: false };
  const q = String(p.q || '').trim();
  const base = { ready: true, date: date, info: kisJson_(P.getProperty(PROP.KIS_INFO)), top: kisJson_(P.getProperty(PROP.KIS_TOP) || '[]') };
  if (!q) return base;
  const nq = holdNorm_(q), alias = holdingsAlias_();
  let terms = [q];
  alias.forEach(a => { if (a[1].some(t => holdNorm_(t) === nq) || holdNorm_(a[0]) === nq) terms = terms.concat(a[1]); });
  const ix = holdingsIndex_(date), E = ix.etfs, cands = [];   // v32: 미리 만든 색인(압축 캐시)에서 찾음 — 시트·범례를 매번 읽지 않음
  ix.comps.forEach((c, j) => {
    if (!holdMatch_(terms, c[0], c[1])) return;
    let amt = 0; const l = c[2]; for (let x = 0; x < l.length; x += 2) amt += E[l[x]][5] * l[x + 1] / 100;
    cands.push({ key: c[0] + '|' + c[1], comp: c[0], name: c[1], amt: amt, n: l.length / 2, j: j });
  });
  cands.sort((a, b) => b.amt - a.amt);
  if (!cands.length) return Object.assign(base, { q: q, terms: terms, cands: [], items: [] });
  const exact = cands.find(c => holdNorm_(c.name) === nq || holdNorm_(c.comp) === nq || terms.some(t => holdNorm_(t) === holdNorm_(c.name)));
  const sel = (p.pick && cands.find(c => c.key === p.pick)) || exact || cands[0], l = ix.comps[sel.j][2], items = [];
  for (let x = 0; x < l.length; x += 2) { const e = E[l[x]], w = l[x + 1]; items.push({ code: e[0], name: e[1], mgr: e[2], top: e[3], type: e[4], w: w, nav: e[5], amt: e[5] * w / 100 }); }
  items.sort((a, b) => b.w - a.w);
  return Object.assign(base, { q: q, terms: terms, cands: cands.slice(0, 12).map(c => ({ key: c.key, comp: c.comp, name: c.name, amt: c.amt, n: c.n })), sel: { key: sel.key, comp: sel.comp, name: sel.name }, items: items });
}
/** v32: 검색 색인 = {date, etfs:[[코드, 종목명, 운용사, 상위구분, 유형, NAV]], comps:[[구성종목코드, 구성종목명, [ETF번호, 비중, …]]]}.
 *  구성종목 시트(약 1.1만 행)·일별 NAV·범례를 한 번 읽어 만들고 응답 캐시와 같은 방식(압축·분할)으로 6시간 보관.
 *  키에 캐시 버전(적재·집계마다 바뀜)과 수집 기준일 포함 → 적재 직후 예열(warmAll)·수집 완료 때 다시 만듦. ext = 'extend' 면 보관 기간 연장 */
function holdingsIndexKey_(date) { return CACHE_GEN_ + ':hidx:' + (PropertiesService.getScriptProperties().getProperty(PROP.CACHE_VER) || '0') + ':' + date; }
function holdingsIndex_(date, ext) {
  const cache = CacheService.getScriptCache(), key = holdingsIndexKey_(date), hit = getCached_(cache, key);
  if (hit) { if (ext === 'extend') putCached_(cache, key, hit); return JSON.parse(hit); }
  const ix = buildHoldingsIndex_(date);
  putCached_(cache, key, JSON.stringify(ix));
  return ix;
}
function buildHoldingsIndex_(date) {
  const rows = holdingsRows_(), snap = {}; readDailyBlock_(date).forEach(r => snap[r.code] = r);
  const ctx = ctx_(), eIdx = {}, etfs = [], cIdx = {}, comps = [];
  rows.forEach(r => {
    let i = eIdx[r.etf];
    if (i === undefined) { const e = snap[r.etf] || { code: r.etf, name: r.etf, nav: 0 }, g = groupOf_(e, ctx); i = eIdx[r.etf] = etfs.length; etfs.push([r.etf, String(e.name), g.short, g.top, g.f3, e.nav || 0]); }
    const k = r.comp + '|' + r.name; let j = cIdx[k];
    if (j === undefined) { j = cIdx[k] = comps.length; comps.push([r.comp, r.name, []]); }
    comps[j][2].push(i, Math.round(r.w * 1e4) / 1e4);
  });
  return { date: date, etfs: etfs, comps: comps };
}

/** 메뉴: KIS 연결 테스트 — 토큰 발급과 국내·해외 ETF 각 1종목 구성종목 조회 결과를 _log 에 남김(필드 형식 확인용) */
function testKis() {
  const k = kisKeys_(), token = kisToken_(), out = [];
  ['069500', '133690', '0167A0'].forEach(code => {
    const r = UrlFetchApp.fetchAll([kisPdfReq_(code, token, k)])[0], p = kisParsePdf_(r.getResponseCode(), r.getContentText());
    const b = kisJson_(r.getContentText()), keys2 = b.output2 && b.output2[0] ? Object.keys(b.output2[0]).join(',') : '';
    out.push(code + ': ' + (p.ok ? p.rows.length + '건(ETF 측 ' + p.n + ') 예 ' + p.rows.slice(0, 3).map(x => x.join('/')).join(' · ') + ' · 필드 ' + keys2 : '실패 ' + p.err));
  });
  log_('KIS 연결 테스트\n' + out.join('\n'));
  return out;
}
