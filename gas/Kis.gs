/**
 * Kis.gs — v29 종목→ETF 찾기(역인덱스)
 *  · 원천 ① (v34) FunETF(삼성자산운용 ETF 정보 사이트) 공개 구성종목 PDF — 전 ETF 의 전체 구성종목·비중(해외 주식 포함, 한글명/영문명·티커·ISIN).
 *          FunETF 는 구글 서버(Apps Script)의 접속을 막으므로(HTTP 403) 사용자가 주 1회 FunETF 화면에서 즐겨찾기 버튼을 눌러 브라우저가 받아 웹앱(doPost)으로 보냄
 *          → funImport_({op: start|put|end}). 버튼은 메뉴 [ETF Dashboard] › 구성종목 수집 버튼(FunETF) 만들기
 *  · 원천 ② 한국투자증권 Open API 'ETF 구성종목시세'(국내주식-073, tr_id FHKST121600C0) — 국내 상장 종목, ETF마다 상위 30. 매주 월요일 07시대 자동 수집(collectHoldings).
 *          FunETF 자료가 FRESH_DAYS 이내면 자동 수집은 건너뜀. FunETF 반영 때 빈 응답 ETF 는 KIS 로 보완
 *  · 키: KIS 는 메뉴 [ETF Dashboard] › KIS Open API 키 설정 (사용자가 직접 입력, 스크립트 속성에만 저장). 토큰(1일 유효)은 발급 후 재사용
 *  · 저장: 새 시트('구성종목_수집중')에 쓰고 끝나면 '구성종목'과 교체 → 수집 도중에도 화면은 이전 자료 사용
 *  · 화면: apiHolders_({q, pick}) — 종목명·티커·코드·별칭(범례_종목별칭: 한/영 표기)으로 구성종목을 찾아, 그 종목을 담은 ETF 목록(비중·보유 평가액 = ETF NAV × 비중)
 *          같은 ISIN 은 운용사마다 표기가 달라도 한 종목으로 묶음
 *  · 탭은 첫 수집이 끝난 뒤에만 보임(meta.holdingsDate)
 */
const KIS = {
  BASE: 'https://openapi.koreainvestment.com:9443',
  TOKEN: '/oauth2/tokenP',
  PDF: '/uapi/etfetn/v1/quotations/inquire-component-stock-price', PDF_TR: 'FHKST121600C0',
  SHEET: '구성종목', TMP: '구성종목_수집중', ALIAS: '범례_종목별칭',
  HEADER: ['ETF코드', 'ETF명', '구성종목코드', '구성종목명', '비중(%)', '평가금액(원)', 'ISIN', '출처'],   // v34: ISIN·출처(F = FunETF, K = 한국투자증권) 추가
  BATCH: 15, GAP_MS: 1100, RUN_MS: 4 * 60 * 1000, MAX_ERR: 0.5,
  FRESH_DAYS: 13,   // v34: FunETF 자료가 이 일수 이내면 월요일 KIS 자동 수집은 건너뜀(해외 구성종목 유지)
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
/** v34: FunETF 공개 구성종목 PDF — GET {BASE}{PDF}?itemId=<ETF ISIN>&etfPdfYmd=<yyyyMMdd> → [{grpItmNo(구성종목 ISIN), ticker, citmNm, evP(비중 %), evAmt(평가금액)}] */
/** v34: FunETF 공개 구성종목 PDF — GET {BASE}{PDF}?itemId=<ETF ISIN>&etfPdfYmd=<yyyyMMdd> → [{grpItmNo(구성종목 ISIN), ticker, citmNm, evP(비중 %), evAmt(평가금액)}] */
const FUN = {
  BASE: 'https://www.funetf.co.kr', PDF: '/api/public/product/view/etfpdf',
  MAX: 600,     // ETF 1개당 비중 상위 최대 행 수(전 세계·전체 시장형 ETF 의 수천 종목 중 극소 비중 생략)
  CHUNK: 20,    // 브라우저가 한 번에 보내는 ETF 수
  STATE: 'FUN_IMPORT_STATE', TOKEN: 'FUN_IMPORT_TOKEN'
};

// ─────────────────────────── FunETF 구성종목(v34) ───────────────────────────

/** 국내 상장 단축코드(6자리, 끝자리 0 — ETF·보통주) → ISIN(KR7 + 코드 + 00 + 검사숫자). 우선주 등 끝자리가 0 이 아니면 ISIN 규칙이 달라 '' */
function isinKr_(code) {
  code = String(code || '').trim().toUpperCase();
  if (!/^[0-9A-Z]{5}0$/.test(code)) return '';
  const base = 'KR7' + code + '00', d = base.split('').map(c => /[0-9]/.test(c) ? c : String(c.charCodeAt(0) - 55)).join('');
  let sum = 0, dbl = true;
  for (let i = d.length - 1; i >= 0; i--) { let x = +d[i]; if (dbl) { x *= 2; if (x > 9) x -= 9; } sum += x; dbl = !dbl; }
  return base + ((10 - sum % 10) % 10);
}
/** 주식(국내·해외) 행만: 형식이 ISIN 이고, 국내는 KR7(주식·ETF)만(채권 KR1·KR6, TRS·스왑 KRYZ, 현금 KRD 제외), 외화 예금(..ZZ..)·현금성 이름 제외. 선물(TYZ6 등)은 ISIN 형식이 아니라 제외 */
function funStock_(isin, name) {
  isin = String(isin || '').trim().toUpperCase();
  if (!/^[A-Z]{2}[A-Z0-9]{9}[0-9]$/.test(isin) || /ZZ[0-9]/.test(isin)) return false;
  if (/^KR/.test(isin) && !/^KR7/.test(isin)) return false;
  return !kisCash_(isin, name) && !/예금|현금|증거금|미수|미지급|스왑|TRS/i.test(String(name || ''));
}
/** [[ISIN, 티커, 이름, 비중(%), 평가금액]] → 주식 행 [[구성종목코드(티커, 없으면 ISIN), 구성종목명, 비중(%), 평가금액, ISIN]] (비중 내림차순, 최대 FUN.MAX) */
function funRows_(items) {
  const r4 = v => Math.round(v * 1e4) / 1e4;
  return (items || []).filter(x => Array.isArray(x) && funStock_(x[0], x[2]))
    .map(x => { const isin = String(x[0]).trim().toUpperCase(), t = String(x[1] || '').trim(); return [t || isin, String(x[2] || '').trim(), r4(toNum_(x[3])), Math.round(toNum_(x[4])), isin]; })
    .sort((p, q) => q[2] - p[2]).slice(0, FUN.MAX);
}
/** FunETF 응답 원문 → {ok, raw(원 행 수), rows, err, retry} (점검·시험용) */
function funParsePdf_(code, text) {
  if (code !== 200) return { ok: false, err: 'FunETF HTTP ' + code, retry: code >= 500 || code === 429 };
  let a; try { a = JSON.parse(text || '[]'); } catch (e) { return { ok: false, err: 'FunETF 응답 형식 오류: ' + String(text || '').slice(0, 60).replace(/\s+/g, ' '), retry: false }; }
  if (!Array.isArray(a)) return { ok: false, err: 'FunETF 응답 형식 오류(배열 아님)', retry: false };
  return { ok: true, raw: a.length, rows: funRows_(a.filter(x => x).map(x => [x.grpItmNo, x.ticker, x.citmNm, x.evP, x.evAmt])) };
}

/** 브라우저(FunETF 화면의 즐겨찾기 버튼) → 웹앱 doPost 로 받은 구성종목 반영. body = {k: 토큰, op, date, items: {ETF코드: [[ISIN, 티커, 이름, 비중, 평가금액]] | null(받기 실패)}}
 *  start: 대상(기준일 NAV>0 전 종목 + ETF ISIN)·기준일을 돌려주고 수집중 시트 새로 만듦 / put: 받은 묶음을 시트에 추가 / end: 빈 응답·실패 ETF 는 KIS 로 보완 후 '구성종목'과 교체 */
function funImport_(b) {
  const P = PropertiesService.getScriptProperties(), tok = P.getProperty(FUN.TOKEN);
  if (!tok || !b || String(b.k || '') !== tok) throw new Error('수집 버튼 인증 실패: 메뉴 [ETF Dashboard] › 구성종목 수집 버튼(FunETF) 만들기로 버튼을 다시 만드세요');
  const ss = ss_(), lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) throw new Error('다른 반영 작업이 진행 중입니다. 잠시 뒤 다시 누르세요');
  try {
    if (b.op === 'start') {
      const run = +(P.getProperty(PROP.KIS_RUN) || 0);
      if (run && Date.now() - run < 6 * 60 * 1000) throw new Error('KIS 구성종목 수집이 진행 중입니다. 몇 분 뒤 다시 누르세요');
      const dates = indexDates_(); if (!dates.length) throw new Error('일별 자료가 없습니다');
      const date = dates[dates.length - 1], targets = holdingsTargets_(date).map(t => [t[0], isinKr_(t[0])]);
      P.deleteProperty(PROP.KIS_STATE); clearTriggers_('cont_collectHoldings');   // 진행 중이던 KIS 이어서 실행은 중단(같은 시트를 씀)
      holdingsTmpSheet_(ss);
      P.setProperty(FUN.STATE, JSON.stringify({ date: date, n: targets.length, got: 0, ok: 0, empty: 0, err: 0, f: 0, k: 0, rows: 0, need: [], errs: [], start: Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd HH:mm') }));
      return { date: date, ymd: date.replace(/-/g, ''), targets: targets, chunk: FUN.CHUNK };
    }
    const st = kisJson_(P.getProperty(FUN.STATE)), sh = ss.getSheetByName(KIS.TMP);
    if (!st.date || st.date !== b.date || !sh) throw new Error('반영 상태가 없습니다(시간이 지났거나 다른 반영이 시작됨). 버튼을 다시 누르세요');
    if (b.op === 'put') {
      const names = {}; readDailyBlock_(st.date).forEach(r => names[r.code] = String(r.name));
      const buf = [];
      Object.keys(b.items || {}).forEach(code => {
        const c = padCode_(code), items = b.items[code]; st.got++;
        if (!names[c]) return;
        if (!Array.isArray(items) || !items.length) { st.need.push(c); return; }   // 받기 실패·빈 응답 → 끝에서 KIS 보완
        const rows = funRows_(items);
        if (!rows.length) { st.empty++; return; }
        st.ok++; st.f++; rows.forEach(y => buf.push([c, names[c], y[0], y[1], y[2], y[3], y[4], 'F']));
      });
      if (buf.length) { appendRows_(sh, buf); st.rows += buf.length; }
      P.setProperty(FUN.STATE, JSON.stringify(st));
      return { got: st.got, n: st.n, rows: st.rows };
    }
    if (b.op === 'end') {
      const names = {}; readDailyBlock_(st.date).forEach(r => names[r.code] = String(r.name));
      const need = st.need.filter(c => names[c]).map(c => [c, names[c]]), buf = [];
      if (need.length) {
        const kr = kisCollectList_(need);
        need.forEach((c, j) => {
          const r = kr[j];
          if (!r.ok) { if (/KIS (키 없음|토큰 실패)/.test(r.err)) st.empty++; else { st.err++; if (st.errs.length < 5) st.errs.push(c[0] + ' ' + r.err); } return; }
          if (!r.rows.length) { st.empty++; return; }
          st.ok++; st.k++; r.rows.forEach(y => buf.push([c[0], c[1], y[0], y[1], y[2], y[3], isinKr_(y[0]), 'K']));
        });
        if (buf.length) { appendRows_(sh, buf); st.rows += buf.length; }
      }
      st.empty += Math.max(0, st.n - st.got - 0);   // 브라우저가 보내지 못한 ETF(창을 닫는 등)는 구성종목 없음으로
      P.deleteProperty(FUN.STATE);
      return holdingsFinish_(ss, sh, Object.assign(st, { src: 'F' }));
    }
    throw new Error('알 수 없는 요청: ' + b.op);
  } finally { lock.releaseLock(); }
}
/** 메뉴: FunETF 화면에서 누를 즐겨찾기 버튼(북마클릿) 코드 — 웹앱 주소와 비밀 토큰을 넣어 만듦(토큰은 처음 1회 생성, 다시 만들기 = 새 토큰) */
function funBookmarklet_(renew) {
  const P = PropertiesService.getScriptProperties();
  let tok = P.getProperty(FUN.TOKEN);
  if (!tok || renew) { tok = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '').slice(0, 8); P.setProperty(FUN.TOKEN, tok); }
  const ex = ScriptApp.getService().getUrl();
  if (!ex) throw new Error('웹앱 배포 주소를 찾지 못했습니다(배포 후 다시 시도)');
  const js = "(async()=>{const EX='" + ex + "',K='" + tok + "';" +
    "if(!/(^|\\.)funetf\\.co\\.kr$/.test(location.hostname)){alert('FunETF(www.funetf.co.kr) 화면에서 눌러 주세요');return;}" +
    "const bx=document.createElement('div');bx.style.cssText='position:fixed;z-index:2147483647;right:16px;bottom:16px;background:#fff;border:1px solid #17171c;padding:12px 16px;font:14px/1.5 sans-serif;color:#17171c;max-width:340px';document.body.appendChild(bx);const say=s=>bx.textContent='ETF 구성종목 반영: '+s;" +
    "const post=async o=>{const r=await fetch(EX,{method:'POST',body:JSON.stringify(Object.assign({k:K},o)),headers:{'Content-Type':'text/plain;charset=utf-8'}});const j=JSON.parse(await r.text());if(!j.ok)throw new Error(j.error);return j.data;};" +
    "const zz=ms=>new Promise(z=>setTimeout(z,ms));" +
    "try{say('대상 목록 받는 중…');const s=await post({op:'start'});const T=s.targets,N=T.length;let B={},n=0;" +
    "const one=async t=>{if(!t[1]){B[t[0]]=null;return;}for(let a=0;a<2;a++){try{const r=await fetch('/api/public/product/view/etfpdf?itemId='+t[1]+'&etfPdfYmd='+s.ymd,{headers:{'X-Requested-With':'XMLHttpRequest'}});if(r.ok){const j=await r.json();B[t[0]]=Array.isArray(j)?j.map(x=>[x.grpItmNo,x.ticker,x.citmNm,x.evP,x.evAmt]):null;return;}}catch(e){}await zz(1500);}B[t[0]]=null;};" +
    "for(let x=0;x<N;x+=2){await Promise.all(T.slice(x,x+2).map(one));n=Math.min(N,x+2);say(n+' / '+N+' 종목 받는 중 (창을 닫지 마세요)');await zz(500);if(Object.keys(B).length>=s.chunk||n>=N){await post({op:'put',date:s.date,items:B});B={};}}" +
    "say('시트에 반영 중…');const e=await post({op:'end',date:s.date});say('완료 — '+e.date+' 기준 '+e.ok+' / '+e.n+'종목 · '+e.rows+'행');}catch(err){say('오류 — '+err.message);}})();";
  return 'javascript:' + encodeURIComponent(js).replace(/%20/g, ' ');
}

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


// ─────────────────────────── KIS 수집 ───────────────────────────

/** 수집 대상: 기준일(최근 영업일) NAV>0 종목 [code, name] (종목코드 순 — 이어서 실행해도 같은 순서) */
function holdingsTargets_(date) { return readDailyBlock_(date).filter(r => r.nav > 0).map(r => [r.code, String(r.name)]).sort((a, b) => a[0] < b[0] ? -1 : 1); }
/** 수집중 시트 새로 만들기(머리글·텍스트 서식) */
function holdingsTmpSheet_(ss) {
  const old = ss.getSheetByName(KIS.TMP); if (old) ss.deleteSheet(old);
  const sh = ss.insertSheet(KIS.TMP); sh.getRange(1, 1, 1, KIS.HEADER.length).setValues([KIS.HEADER]); sh.setFrozenRows(1);
  ['A:A', 'C:C', 'G:G'].forEach(a => sh.getRange(a).setNumberFormat('@'));
  return sh;
}
/** KIS 로 ETF 목록 조회(15건씩 동시, 한도 초과·일시 오류·토큰 만료는 1.5초 뒤 1회 재시도) → 결과 배열. 키·토큰이 없으면 {ok:false, err:'KIS 키 없음'|'KIS 토큰 실패'} */
function kisCollectList_(list) {
  let k = null, token = null;
  try { k = kisKeys_(); } catch (e) { return list.map(() => ({ ok: false, err: 'KIS 키 없음' })); }
  try { token = kisToken_(); } catch (e) { log_('KIS 보완 조회 중단(토큰 발급 실패): ' + e.message, 'WARN'); return list.map(() => ({ ok: false, err: 'KIS 토큰 실패' })); }
  const out = [];
  for (let i = 0; i < list.length; i += KIS.BATCH) {
    const batch = list.slice(i, i + KIS.BATCH), t1 = Date.now();
    const res = UrlFetchApp.fetchAll(batch.map(c => kisPdfReq_(c[0], token, k))).map(r => kisParsePdf_(r.getResponseCode(), r.getContentText()));
    const again = res.map((r, j) => r.retry ? j : -1).filter(j => j >= 0);
    if (again.length) {
      if (res.some(r => r.expired)) token = kisToken_(true);
      Utilities.sleep(1500);
      const rr = UrlFetchApp.fetchAll(again.map(j => kisPdfReq_(batch[j][0], token, k))).map(r => kisParsePdf_(r.getResponseCode(), r.getContentText()));
      again.forEach((j, x) => { res[j] = rr[x]; });
    }
    res.forEach(r => out.push(r));
    const wait = KIS.GAP_MS - (Date.now() - t1); if (i + KIS.BATCH < list.length && wait > 0) Utilities.sleep(wait);
  }
  return out;
}
/** 수집 끝: 실패 판정 → '구성종목' 교체·기준일·정보·많이 담긴 종목·캐시·색인. st = {date, n, ok, empty, err, rows, errs, src('F'|'K'), f, k, part} → info */
function holdingsFinish_(ss, sh, st) {
  const P = PropertiesService.getScriptProperties();
  const info = { date: st.date, n: st.n, ok: st.ok, empty: st.empty, err: st.err, part: st.part || 0, f: st.f || 0, k: st.k || 0, src: st.src || 'K', rows: st.rows, at: Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd HH:mm'), errs: st.errs || [] };
  if (st.err > st.n * KIS.MAX_ERR || !st.ok) {   // 절반 넘게 오류·확인 0건 → 이전 자료 유지(수집중 시트는 점검용으로 남김)
    log_('구성종목 수집 실패: 성공 ' + st.ok + '/' + st.n + (info.errs.length ? ' · 오류 예: ' + info.errs.join(' | ') : ''), 'ERROR'); P.setProperty(PROP.KIS_INFO, JSON.stringify(Object.assign(info, { failed: true }))); return info;
  }
  const old = ss.getSheetByName(KIS.SHEET); if (old) ss.deleteSheet(old);
  sh.setName(KIS.SHEET);
  P.setProperty(PROP.KIS_DATE, st.date); P.setProperty(PROP.KIS_INFO, JSON.stringify(info));
  try { P.setProperty(PROP.KIS_TOP, JSON.stringify(holdingsTop_(st.date))); } catch (e) { log_('많이 담긴 종목 계산 실패: ' + e.message, 'WARN'); }
  bumpCache_(['9999-12']);   // meta(탭 표시·기준일)·검색 결과 캐시만 새로(기준일 조회 캐시는 유지)
  try { holdingsIndex_(st.date); } catch (e) { log_('검색 색인 만들기 실패(첫 검색 때 다시 시도): ' + e.message, 'WARN'); }   // v32
  log_('구성종목 ' + (info.src === 'F' ? 'FunETF 반영' : 'KIS 수집') + ' 완료: ' + st.date + ' · ' + st.ok + '/' + st.n + '종목' + (info.src === 'F' ? '(FunETF ' + info.f + ', KIS 보완 ' + info.k + ')' : '') + ' · 구성종목 없음 ' + st.empty + ', 오류 ' + st.err + ' · ' + st.rows + '행' + (info.errs.length ? ' · 오류 예: ' + info.errs.join(' | ') : ''));
  return info;
}
/** 메뉴·트리거: KIS 전 종목 구성종목 수집(이어서 실행). 적재(loadDaily)와 겹치지 않게 적재 실행 중이면 10분 뒤.
 *  v34: 최근 자료가 FunETF(FRESH_DAYS 이내)이면 자동 수집은 건너뜀 — 메뉴 '구성종목 수집 (지금, KIS)'은 강제(KIS_PDF_FORCE) */
function collectHoldings() {
  const P = PropertiesService.getScriptProperties(), t0 = Date.now();
  const since = +(P.getProperty(PROP.LOADING) || 0);
  if (since && Date.now() - since < 7 * 60 * 1000) { scheduleContinue_('collectHoldings', 10); return; }
  const run = +(P.getProperty(PROP.KIS_RUN) || 0);
  if (run && Date.now() - run < 6 * 60 * 1000) return;   // 다른 수집 실행 중
  if (P.getProperty(FUN.STATE)) { log_('KIS 구성종목 수집 건너뜀: FunETF 반영이 진행 중', 'INFO'); return; }
  let st = kisJson_(P.getProperty(PROP.KIS_STATE));
  if (!st.date) {
    const force = P.getProperty('KIS_PDF_FORCE') === '1', inf = kisJson_(P.getProperty(PROP.KIS_INFO));
    P.deleteProperty('KIS_PDF_FORCE');
    const ds = indexDates_(), last = ds[ds.length - 1];   // 최근 영업일 대비 FunETF 기준일 경과 일수
    if (!force && inf.src === 'F' && !inf.failed && inf.date && last && (new Date(last + 'T00:00:00Z') - new Date(inf.date + 'T00:00:00Z')) / 86400000 <= KIS.FRESH_DAYS) {
      log_('KIS 구성종목 자동 수집 건너뜀: FunETF 자료(' + inf.date + ' 기준, 해외 주식 포함) 유지', 'INFO'); return;
    }
  }
  P.setProperty(PROP.KIS_RUN, String(t0));
  try {
    const ss = ss_();
    if (!st.date) {
      const dates = indexDates_(); if (!dates.length) throw new Error('일별 자료가 없습니다');
      st = { date: dates[dates.length - 1], i: 0, ok: 0, empty: 0, err: 0, errs: [], rows: 0, start: Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd HH:mm') };
      holdingsTmpSheet_(ss);
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
        st.ok++; if (r.part) st.part = (st.part || 0) + 1; r.rows.forEach(x => buf.push([c[0], c[1], x[0], x[1], x[2], x[3], isinKr_(x[0]), 'K']));
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
    holdingsFinish_(ss, sh, Object.assign(st, { n: targets.length, src: 'K' }));
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

/** 구성종목 시트 → [{etf, comp, name, w, isin}] (현금성 제외).
 *  v34: 같은 ISIN 은 운용사마다 표기가 달라도('마이크로소프트/MICROSOFT CORP'·'마이크로소프트/Microsoft Corp') 한 종목 — 대표 표기 = 한글이 든 첫 표기(없으면 첫 표기) */
function holdingsRows_() {
  const sh = ss_().getSheetByName(KIS.SHEET); if (!sh) return [];
  const rows = readAll_(sh).map(r => ({ etf: padCode_(r[0]), comp: String(r[2] || '').trim(), name: String(r[3] || '').trim(), w: toNum_(r[4]), isin: String(r[6] || '').trim() }))
    .filter(r => r.etf && (r.comp || r.name) && !kisCash_(r.comp, r.name));
  const rep = {}, han = s => /[가-힣]/.test(s);
  rows.forEach(r => { if (!r.isin) return; const p = rep[r.isin]; if (!p || (!han(p.name) && han(r.name))) rep[r.isin] = { comp: r.comp, name: r.name }; });
  rows.forEach(r => { const p = r.isin && rep[r.isin]; if (p) { r.comp = p.comp; r.name = p.name; } });
  return rows;
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
  const hn = c => [holdNorm_(c.name)].concat(String(c.name).split('/').map(holdNorm_));   // v34: '엔비디아/NVIDIA Corp' → 전체·한글·영문 표기 각각
  const exact = cands.find(c => hn(c).indexOf(nq) >= 0 || holdNorm_(c.comp) === nq || terms.some(t => hn(c).indexOf(holdNorm_(t)) >= 0));
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

/** 메뉴: KIS 연결 테스트 — 토큰 발급과 국내·해외 ETF 각 1종목 구성종목 조회 결과를 _log 에 남김(필드 형식 확인용).
 *  FunETF 는 구글 서버에서 막혀(HTTP 403) 여기서 시험하지 않음 — 브라우저 버튼으로 반영 */
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
