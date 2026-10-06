/**
 * Theme.gs — v29 테마 맵
 *  · 분류: 종목명·기초지수명 키워드 규칙(시트 '범례_테마', 사용자가 고쳐 쓰는 표)으로 종목마다 상품구조·테마·지역을 하나씩 부여.
 *    규칙은 구분(상품구조/테마/지역)별로 '순서' 오름차순으로 검사해 처음 맞는 값을 씀. 시트가 없으면 아래 기본 규칙(THEME.DEFAULT)으로 만듦.
 *  · 화면: apiTheme_ → 종목 행 배열(테마·상품구조·지역 번호 포함) → 화면에서 보기(테마/상품구조)·자산·지역으로 집계(Tabs.html themeModel).
 *  · 기초지수명: KRX 일별매매정보의 기초지수명(IDX_IND_NM)을 ETF마스터 '기초지수' 열에 저장(일별 적재 때 갱신, fillIndexNames 로 1회 보충).
 *  · 검수: 메뉴 '테마 분류 검수표' → 시트 '테마_분류검토'(최근 영업일 기준 전 종목 분류 결과). 규칙을 고친 뒤 같은 메뉴를 다시 실행하면 화면에도 바로 반영.
 */
const THEME = {
  SHEET: '범례_테마',
  REVIEW: '테마_분류검토',
  HEADER: ['순서', '구분', '값', '테마군', '자산', '키워드', '제외 키워드', '찾는 곳', '메모', '관심도 검색어'],   // 관심도 검색어: 관심도 탭(Buzz.gs) 네이버 검색어
  KIND: { '상품구조': 'struct', '테마': 'theme', '지역': 'region' },
  GROUPS: ['시장대표', '산업·테마', '배당·스타일', '채권·금리', '대체·자산배분', '기타'],
  FALLBACK: { struct: '일반', theme: '미분류', region: '글로벌·기타' },
  LEV: '레버리지·인버스',                      // 화면 '레버리지·인버스 제외' 선택의 대상 상품구조 값
  IDX_HEADER: '기초지수',                     // ETF마스터 열 이름
  // 기초지수명 1회 보충에 쓰는 과거 시점(연말 스냅샷) — 상장폐지 종목의 기초지수명 확보용
  FILL_DATES: ['2025-12-30', '2024-12-30', '2023-12-28', '2022-12-29', '2021-12-30', '2021-01-29'],
  NOTE: [
    '키워드 쓰는 법 (쉼표로 구분, 하나라도 맞으면 해당)',
    '· 보통 글자: 대소문자·띄어쓰기를 무시한 부분 일치 (예: S&P500 → "S&P 500"도 일치)',
    '· ~AI : 영문 단어 단위 일치 (앞뒤가 영문자가 아닐 때만 — "AI반도체"는 일치, "TAIWAN"은 불일치)',
    '· /정규식/ : 정규식 (대소문자 무시)',
    '· * : 모든 종목 (해당 구분의 마지막 기본값)',
    '· 국내해외:국내 / 국내해외:해외 · 유형:혼합채권형 · 코드:069500',
    '· A & B : A와 B가 모두 맞을 때 (앞뒤 띄어쓰기 필요)',
    '자산: 전체 / 주식(채권·금리형 외 전부) / 채권(채권·금리형만)',
    '찾는 곳: 종목명 / 종목명·기초지수',
    '순서: 같은 구분 안에서 작은 수부터 검사, 처음 맞는 값 적용. 사이에 넣으려면 15처럼 중간 수를 쓰면 됨',
    '관심도 검색어(맨 오른쪽 열): 관심도 탭의 네이버 검색어(쉼표 구분, 비우면 그 행은 관심도 집계에서 제외)',
    '고친 뒤: 메뉴 [ETF Dashboard] › 테마 분류 검수표 를 실행하면 검수표와 화면에 바로 반영'
  ].join('\n'),
  // [구분, 값, 테마군, 자산, 키워드, 제외 키워드, 찾는 곳, 메모] — 순서는 행 순서 × 10
  DEFAULT: [
    ['상품구조', '레버리지·인버스', '', '전체', '레버리지, 인버스, 2X, 1.5X, 3X, 곱버스, Leverage, Inverse', '', '종목명', '배수·역방향 추종'],
    ['상품구조', '커버드콜·옵션', '', '전체', '커버드콜, Covered Call, BuyWrite, 프리미엄, Premium, 버퍼, Buffer, 목표헤지, 콜매도, 옵션', '', '종목명', '옵션 매도·구간 방어형'],
    ['상품구조', '채권혼합', '', '전체', '혼합, 밸런스, Balanced', '', '종목명', '주식(또는 금·리츠 등) + 채권 혼합'],
    ['상품구조', '액티브', '', '전체', '액티브, Active', '', '종목명', ''],
    ['상품구조', '일반', '', '전체', '*', '', '종목명', '그 밖의 지수 추종'],

    ['테마', '원자재·통화', '대체·자산배분', '전체', '원유, WTI, 브렌트, 천연가스선물, 구리, 농산물, 콩선물, 옥수수, 밀선물, 금속선물, 팔라듐, 니켈, 원자재, 커머디티, Commodity, 달러, 엔화, 엔선물, 위안, 유로선물, 탄소배출권', '채권, 국채, 금리, SOFR, 머니마켓, 노출, 밸류체인, 배당, 기업', '종목명', '통화 선물 포함(채권·금리형으로 분류된 달러선물 등도 여기)'],
    ['테마', '금·은', '대체·자산배분', '전체', '금현물, 골드, ~GOLD, 금선물, 금은선물, 국제금, 금액티브, 금채권혼합, 금커버드콜, 금광, 은선물, 은현물, 은액티브, 은채권혼합, ~SILVER, 귀금속', 'S&P500, 골드만', '종목명·기초지수', ''],
    ['테마', '단기자금·파킹', '채권·금리', '채권', '머니마켓, MMF, 단기자금, KOFR, CD금리, CD1년, CD91, SOFR, 초단기, 단기, T-Bill, 3개월, 6개월, 파킹, Money Market', '중단기, 중기, 회사채, 하이일드', '종목명', ''],
    ['테마', '만기매칭채권', '채권·금리', '채권', '/\\d{2}-\\d{2}/, 자동연장, 만기형, 만기매칭', '', '종목명·기초지수', '예: 26-12 회사채'],
    ['테마', '장기채', '채권·금리', '채권', '10년, 20년, 30년, 장기, 울트라, 스트립, ~Long, 7-10, 10+, 20+, 25+', '', '종목명', '만기 10년 이상'],
    ['테마', '크레딧(회사채·금융채)', '채권·금리', '채권', '회사채, 금융채, 은행채, 특수채, 공사채, 크레딧, 하이일드, 투자등급, Credit, Corporate, ~IG', '', '종목명·기초지수', ''],
    ['테마', '국공채·종합채권', '채권·금리', '채권', '*', '', '종목명', '그 밖의 채권·금리형'],
    ['테마', '리츠·인프라', '대체·자산배분', '주식', '리츠, REIT, 부동산, 맥쿼리, Real Estate', '', '종목명', ''],
    ['테마', 'TDF·자산배분', '대체·자산배분', '주식', '~TDF, ~TRF, ~TIF, 자산배분, 멀티에셋, Multi Asset, Target-date, Target Date, 생애', '', '종목명·기초지수', ''],
    ['테마', '밸류업·주주환원', '배당·스타일', '주식', '밸류업, 주주환원, 자사주, Value-up, ValueUp, 저PBR, 지배구조, 행동주의', '', '종목명·기초지수', ''],
    ['테마', '배당·인컴', '배당·스타일', '주식', '배당, ~Dividend, 캐시카우, Cash Cow, 인컴, ~Income, 고배당', '생애', '종목명', ''],
    ['테마', '그룹주', '산업·테마', '주식', '그룹, ~SAMs, 지주회사', '', '종목명·기초지수', ''],
    ['테마', '반도체', '산업·테마', '주식', '반도체, Semiconductor, 엔비디아, NVIDIA, 브로드컴, Broadcom, TSMC, 마이크론, 샌디스크, HBM, 메모리, 하이닉스, 삼성전자, ~CPU, 파운드리, 필라델피아, PHLX, ~SOX, 코스피200정보기술, 200IT', '', '종목명·기초지수', '코스피200 정보기술은 반도체 비중이 커서 반도체로 분류'],
    ['테마', '전력·원자력', '산업·테마', '주식', '원자력, ~SMR, 우라늄, Uranium, Nuclear, 전력, Electricity, 변압기, 전선, 그리드, ~Grid, 송배전', '', '종목명·기초지수', ''],
    ['테마', '로봇·피지컬AI', '산업·테마', '주식', '로봇, 로보틱스, Robot, 휴머노이드, Humanoid, 피지컬, Physical, 자동화, Automation', '', '종목명·기초지수', ''],
    ['테마', '2차전지·전기차', '산업·테마', '주식', '2차전지, 이차전지, 배터리, Battery, 전기차, ~EV, 리튬, Lithium, 테슬라, Tesla, 전고체, 양극재, 음극재, ~BYD', '', '종목명·기초지수', ''],
    ['테마', '바이오·헬스케어', '산업·테마', '주식', '바이오, 헬스케어, 제약, 의료, 메디컬, 신약, Bio, Health, Pharma, 일라이릴리, 비만, ~GLP, Medical, CDMO, 치료제, 치매', '', '종목명·기초지수', ''],
    ['테마', '방산·우주항공', '산업·테마', '주식', '방산, 방위, 국방, 우주, 항공, Defense, Aerospace, ~Space, 위성, 드론, ~UAM', '', '종목명·기초지수', ''],
    ['테마', '조선·기계', '산업·테마', '주식', '조선, 기계, 중공업, 제조업, Shipbuilding, 대장장이, 설비투자, CAPEX', '', '종목명·기초지수', ''],
    ['테마', '자동차·모빌리티', '산업·테마', '주식', '자동차, 현대차, 기아, 모빌리티, Mobility, 스마트카, 로보택시, 자율주행, ~Auto', '', '종목명·기초지수', ''],
    ['테마', '금융', '산업·테마', '주식', '은행, 증권, 보험, 금융, 핀테크, Fintech, ~Bank, Financial, ~IB, ETF산업', '금융채', '종목명·기초지수', ''],
    ['테마', '소비·콘텐츠', '산업·테마', '주식', '소비, 화장품, 뷰티, 미디어, 엔터, 콘텐츠, 컨텐츠, 게임, 컬처, 여행, 레저, 음식료, 식품, 경기방어, 명품, Luxury, Consumer, ~Game, Media, K-POP, 웹툰, 리테일, Retail, 커머스, 쇼핑, 면세, 컨슈머, 브랜드, 푸드, 내수, 골프', '', '종목명·기초지수', ''],
    ['테마', '에너지·친환경', '산업·테마', '주식', '에너지, 친환경, 수소, 태양광, 풍력, 신재생, 클린, Clean, Energy, 탄소중립, 천연가스, Solar, Hydrogen, 정유, 석유, ~Oil, 탄소효율, 그린, 기후변화, 원유생산', '선물', '종목명·기초지수', ''],
    ['테마', 'AI·소프트웨어', '산업·테마', '주식', '~AI, 인공지능, ~IT, 테크, Tech, 알리바바, 텐센트, 소프트웨어, Software, 플랫폼, 인터넷, Internet, 클라우드, Cloud, 데이터센터, Data Center, 양자, Quantum, 사이버, 보안, Cyber, 메타버스, 빅테크, ~FANG, 구글, 알파벳, Google, Alphabet, 애플, Apple, 마이크로소프트, Microsoft, 아마존, Amazon, 팔란티어, Palantir, 광통신, 네트워크, 5G, 6G, 디지털, 4차산업', '', '종목명·기초지수', ''],
    ['테마', '기타 업종', '산업·테마', '주식', '건설, 철강, 화학, 소재, 운송, 해운, 물류, 통신, 커뮤니케이션, 유틸리티, Utilities, Industrials, 산업재, 농업, 인프라, Infrastructure, 시멘트, 비철, 금속, Materials, 희토류, 자원생산, 전략자원', '', '종목명·기초지수', '건설·철강·화학·운송·통신 등'],
    ['테마', '미국 시장대표', '시장대표', '주식', 'S&P500, 나스닥, NASDAQ, 다우존스, Dow Jones, 러셀, Russell, CRSP, Wide Moat, 와이드모트, NYSE, 미국대형, 미국성장, Total Market, 토탈마켓, 미국500, 미국TOP, 버크셔', '', '종목명·기초지수', 'S&P500·나스닥100 등'],
    ['테마', '스타일·팩터', '배당·스타일', '주식', '모멘텀, Momentum, 가치, 밸류, ~Value, 퀄리티, Quality, 로우볼, 저변동, Low Vol, 동일가중, Equal Weight, 중소형, 소형, 중형, 성장, ~Growth, ~ESG, 사회책임, 우선주, 수출, 블루칩, 우량, 펀더멘탈, ~RAFI, 스마트베타, 팩터, 수급, 개미, 퀀트, 베스트셀러, 빌리어네어, 최소변동, 변동성, 주도업종, 주도주, 혁신, 이노베이션, 미래전략, 포스트IPO', '밸류체인, Value Chain, 밸류업', '종목명·기초지수', ''],
    ['테마', '국내 시장대표', '시장대표', '주식', '코스피, 코스닥, KOSPI, KOSDAQ, KRX300, KRX100, MSCI Korea, KTOP, FnGuide Top, ~TOP10 & 국내해외:국내, ~TOP5 & 국내해외:국내', '', '종목명·기초지수', ''],
    ['테마', '해외 시장대표', '시장대표', '주식', 'MSCI, 선진국, 신흥국, 이머징, 니케이, 닛케이, Nikkei, TOPIX, 유로스탁스, EURO STOXX, Stoxx, ~CSI, 항셍, Hang Seng, HSCEI, 차이나H, 중국본토, 차이나A, Nifty, 인도, 베트남, VN30, 글로벌, Global, World, 토탈월드, All Cap, ACWI, 라틴, Latin, 독일, ~DAX, 대만, Taiwan, 유럽, Europe, 일본, Japan, 중국, 차이나, China, 홍콩, 인도네시아, 브라질, 멕시코, 호주, 영국, 캐나다, 아시아, 차이넥스트, ChiNext, 심천', '', '종목명·기초지수', ''],
    ['테마', '기타 주식', '기타', '주식', '*', '', '종목명', '위 테마에 해당하지 않는 주식 등'],

    ['지역', '국내', '', '전체', '국내해외:국내', '달러선물, 엔선물, 엔화, 위안', '종목명', '통화 선물은 해당 통화 지역으로'],
    ['지역', '글로벌·기타', '', '전체', 'GSCI, Commodity', '미국', '종목명·기초지수', '해외 원자재 선물(종목명에 미국이 없으면)'],
    ['지역', '글로벌·기타', '', '전체', '글로벌, Global, 월드, World, 선진국, 신흥국, 이머징, 아시아, 유럽, 대만, 베트남, 독일, 라틴, 브라질, 멕시코, 호주, 싱가포르, 필리핀, 인도네시아, 러시아, 영국', '미국, 차이나, 중국, 일본, 인도', '종목명', '종목명에 다른 나라·글로벌이 있으면(미국·중국·일본·인도 제외)'],
    ['지역', '중국', '', '전체', '중국, 차이나, China, ~CSI, 항셍, Hang Seng, HSCEI, HSTECH, 홍콩, Hong Kong, 샤오미, Xiaomi, 알리바바, 텐센트, ~BYD, ~CNH, 상해, 심천, 과창판', '', '종목명·기초지수', ''],
    ['지역', '미국', '', '전체', '미국, ~US, U.S., USA, S&P, 나스닥, NASDAQ, 다우존스, Dow Jones, NYSE, Russell, 러셀, 필라델피아, PHLX, CRSP, 테슬라, Tesla, 엔비디아, NVIDIA, 팔란티어, 애플, 구글, 알파벳, 마이크로소프트, 브로드컴, 버크셔, 서학개미, 일라이릴리, SOFR, Treasury, 아마존', '글로벌, Global, World, 유럽, Europe', '종목명·기초지수', ''],
    ['지역', '일본', '', '전체', '일본, Japan, 니케이, 닛케이, Nikkei, TOPIX, 엔화, 엔선물', '노출', '종목명·기초지수', ''],
    ['지역', '인도', '', '전체', '인도, India, Nifty', '인도네시아, Indonesia', '종목명·기초지수', ''],
    ['지역', '글로벌·기타', '', '전체', '*', '', '종목명', '']
  ]
};

// ─────────────────────────── 분류 엔진(순수 함수 — 시트 의존 없음, 로컬 테스트에서도 사용) ───────────────────────────

/** 대문자 + 공백 제거 */
function themeNorm_(s) { return String(s === null || s === undefined ? '' : s).toUpperCase().replace(/\s+/g, ''); }
/** 키워드 칸 → 토큰 배열. 쉼표로 나누되 /정규식/ 안의 쉼표는 유지 */
function themeTokens_(s) {
  s = String(s === null || s === undefined ? '' : s);
  const out = []; let i = 0;
  while (i < s.length) {
    while (i < s.length && /[\s,]/.test(s[i])) i++;
    if (i >= s.length) break;
    if (s[i] === '/') { const j = s.indexOf('/', i + 1); if (j > i + 1) { out.push(s.slice(i, j + 1)); i = j + 1; continue; } }
    let j = s.indexOf(',', i); if (j < 0) j = s.length;
    const t = s.slice(i, j).trim(); if (t) out.push(t); i = j;
  }
  return out;
}
/** 토큰 → 판정 함수 (e, inIdx) => bool. 해석할 수 없으면 null */
function themeMatcher_(tok) {
  tok = String(tok || '').trim(); if (!tok) return null;
  if (tok.indexOf(' & ') > 0) { const ps = tok.split(' & ').map(themeMatcher_); if (ps.some(p => !p)) return null; return (e, x) => ps.every(p => p(e, x)); }
  if (tok === '*') return () => true;
  let m;
  if ((m = /^(?:코드|code)\s*:\s*(\S+)$/i.exec(tok))) { const c = m[1].toUpperCase(); return e => e.code === c; }
  if ((m = /^(?:국내해외|dom)\s*:\s*(\S+)$/i.exec(tok))) { const v = m[1]; return e => e.dom === v; }
  if ((m = /^(?:유형|type)\s*:\s*(\S+)$/i.exec(tok))) { const v = m[1]; return e => e.f2 === v; }
  if (tok.length > 2 && tok[0] === '/' && tok[tok.length - 1] === '/') {
    let re; try { re = new RegExp(tok.slice(1, -1), 'i'); } catch (err) { return null; }
    return (e, x) => re.test(x ? e.textI : e.text);
  }
  if (tok[0] === '~') {
    const w = tok.slice(1).trim().toUpperCase(); if (!w) return null;
    const re = new RegExp('(^|[^A-Z])' + w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s*') + '(?![A-Z])');
    return (e, x) => re.test(x ? e.upI : e.up);
  }
  const k = themeNorm_(tok);
  return (e, x) => (x ? e.nI : e.n).indexOf(k) >= 0;
}
/** 분류 입력 1건 — code, 종목명, 기초지수명, 국내해외, 유형, 채권·금리 여부 */
function themeEntry_(code, name, idx, dom, f2, bond) {
  const text = String(name || ''), textI = text + ' | ' + String(idx || '');
  return { code: String(code || '').toUpperCase(), dom: String(dom || '').trim(), f2: String(f2 || '').trim(), bond: !!bond,
    text: text, textI: textI, up: text.toUpperCase(), upI: textI.toUpperCase(), n: themeNorm_(text), nI: themeNorm_(text) + '|' + themeNorm_(idx) };
}
function themeAsset_(s) { s = String(s || '').trim(); return /채권|금리/.test(s) ? 'B' : /주식/.test(s) ? 'S' : 'A'; }
/** 규칙 행(객체 배열: {order, kind, value, group, asset, inc, exc, scope}) → {struct:[], theme:[], region:[], values:{...}, groups:{테마: 테마군}} */
function compileThemeRules_(rows) {
  const R = { struct: [], theme: [], region: [], values: { struct: [], theme: [], region: [] }, groups: {}, bad: [] };
  rows.map((r, i) => Object.assign({ i: i }, r)).sort((a, b) => (a.order - b.order) || (a.i - b.i)).forEach(r => {
    const k = THEME.KIND[String(r.kind || '').trim()], v = String(r.value || '').trim();
    if (!k || !v) return;
    const toks = themeTokens_(r.inc), inc = toks.map(themeMatcher_), exc = themeTokens_(r.exc).map(themeMatcher_);
    inc.forEach((f, j) => { if (!f) R.bad.push(v + ': ' + toks[j]); });
    const incF = inc.filter(Boolean); if (!incF.length) return;
    R[k].push({ value: v, asset: themeAsset_(r.asset), inc: incF, exc: exc.filter(Boolean), idx: /지수/.test(String(r.scope || '')), all: toks.length > 0 && toks.every(t => t.trim() === '*') });
    if (R.values[k].indexOf(v) < 0) R.values[k].push(v);
    if (k === 'theme' && !(v in R.groups)) R.groups[v] = String(r.group || '').trim() || '기타';
  });
  return R;
}
/** 기본 규칙 → 규칙 행 객체 */
function themeDefaultRows_() {
  return THEME.DEFAULT.map((r, i) => ({ order: (i + 1) * 10, kind: r[0], value: r[1], group: r[2], asset: r[3], inc: r[4], exc: r[5], scope: r[6], memo: r[7] }));
}
/** 1차: 종목명만으로 검사 → 2차: '종목명·기초지수' 행을 기초지수까지 넓혀 검사 → 마지막: * 행. 종목명이 기초지수보다 우선 */
function themePick_(list, e, fb) {
  const ok = r => !((r.asset === 'B' && !e.bond) || (r.asset === 'S' && e.bond));
  for (let pass = 1; pass <= 2; pass++) {
    const x = pass === 2;
    for (let i = 0; i < list.length; i++) {
      const r = list[i];
      if (!ok(r) || r.all || (x && !r.idx)) continue;
      if (r.inc.some(f => f(e, x)) && !r.exc.some(f => f(e, x))) return r.value;
    }
  }
  for (let i = 0; i < list.length; i++) { const r = list[i]; if (ok(r) && r.all && !r.exc.some(f => f(e, r.idx))) return r.value; }
  return fb;
}
/** 종목 1건 분류 → {struct, theme, region} */
function classifyEtf_(R, e) {
  return { struct: themePick_(R.struct, e, THEME.FALLBACK.struct), theme: themePick_(R.theme, e, THEME.FALLBACK.theme), region: themePick_(R.region, e, THEME.FALLBACK.region) };
}
/** 채권·금리형 여부: 유형 범례(신규상장용 '채권/금리' 또는 유형최종2 '채권형'), 범례에 없으면 종목명으로 추정 */
function themeIsBond_(t, name) {
  const n = String(name || '');
  const byName = /(국채|국고채|미국채|통안채|회사채|금융채|은행채|특수채|공사채|전단채|물가채|채권|금리|머니마켓|MMF|KOFR|SOFR|하이일드)/i.test(n) && !/(혼합|밸런스|주식|리츠)/.test(n);
  if (t) return String(t.neu || '').trim() === '채권/금리' || String(t.f2 || '').trim() === '채권형' || byName;
  return byName;
}

// ─────────────────────────── 시트(범례_테마) ───────────────────────────

/** 범례_테마 시트. 없거나 비어 있으면 기본 규칙으로 만듦 */
function themeSheet_() {
  const ss = ss_();
  let sh = ss.getSheetByName(THEME.SHEET);
  if (sh && sh.getLastRow() >= 2) return sh;
  if (!sh) sh = ss.insertSheet(THEME.SHEET);
  sh.clear();
  const kw = (typeof BUZZ !== 'undefined' && BUZZ.KW) || {};
  const rows = themeDefaultRows_().map(r => [r.order, r.kind, r.value, r.group, r.asset, r.inc, r.exc, r.scope, r.memo, r.kind === '지역' ? '' : (kw[r.value] || '')]);
  sh.getRange(1, 1, 1, THEME.HEADER.length).setValues([THEME.HEADER]).setFontWeight('bold');
  sh.getRange(2, 1, rows.length, THEME.HEADER.length).setValues(rows);
  sh.setFrozenRows(1);
  sh.getRange(1, 6).setNote(THEME.NOTE);
  sh.getRange(2, 6, rows.length, 2).setWrap(true);
  [50, 70, 150, 100, 55, 520, 200, 110, 260, 260].forEach((w, i) => sh.setColumnWidth(i + 1, w));
  log_('범례_테마 시트 생성(기본 규칙 ' + rows.length + '행)');
  return sh;
}
/** 범례_테마 → 규칙 행 객체 배열(머리글 이름으로 열을 찾음) */
function themeRuleRows_() {
  const sh = themeSheet_(), C = hdrCols_(sh, { ORDER: '순서', KIND: '구분', VALUE: '값', GROUP: '테마군', ASSET: '자산', INC: '키워드', EXC: '제외 키워드', SCOPE: '찾는 곳', MEMO: '메모', BUZZ: '관심도 검색어' });
  const g = (r, i) => i >= 0 ? r[i] : '';
  return readAll_(sh).map((r, i) => ({ order: g(r, C.ORDER) === '' ? (i + 1) * 10 : +g(r, C.ORDER), kind: g(r, C.KIND), value: g(r, C.VALUE), group: g(r, C.GROUP), asset: g(r, C.ASSET),
    inc: g(r, C.INC), exc: g(r, C.EXC), scope: g(r, C.SCOPE), memo: g(r, C.MEMO), buzz: C.BUZZ >= 0 ? String(g(r, C.BUZZ) || '') : undefined })).filter(r => String(r.kind).trim() && String(r.value).trim());
}
let THEME_RULES_MEMO_ = null;
function themeRules_() { return THEME_RULES_MEMO_ || (THEME_RULES_MEMO_ = compileThemeRules_(themeRuleRows_())); }
/** 규칙 지문(야간 점검·캐시 무효화 판단용) */
function themeRulesSig_() {
  try { return JSON.stringify(themeRuleRows_().map(r => [r.order, r.kind, r.value, r.group, r.asset, r.inc, r.exc, r.scope])); } catch (e) { return ''; }
}
/** 종목 → 분류 입력(유형 범례·마스터 기초지수 사용) */
function themeEntryOf_(code, name, ctx) {
  const t = ctx.types[code], m = ctx.master[code];
  return themeEntry_(code, name || (m && m.name) || (t && t.name) || '', m ? m.idx : '', t ? t.dom : '', t ? t.f2 : '', themeIsBond_(t, name));
}

// ─────────────────────────── API ───────────────────────────

/** 테마 맵 자료: 기준일·비교일 스냅샷 결합 → 종목 행 배열(화면에서 보기·자산·지역 선택에 따라 집계)
 *  rows[[종목코드, 종목명, 운용사 번호, NAV(억원), 비교 NAV(억원), 테마 번호, 상품구조 번호, 지역 번호, 채권·금리 1|0, 상장일(최근 1년 이내만, 아니면 0)]]
 *  비교 기준일 이후 상장 종목은 비교 NAV 0(증감 = 기준일 NAV). 비교 기준일에만 있는 종목(상장폐지)은 NAV 0 */
function apiTheme_(p) {
  const months = aggMarket_();
  const date = p.date || defaultDate_(months);
  const ref = applyRef_(refDates_(date, months), date, months, p.ref);
  const ctx = ctx_(), R = themeRules_();
  const cur = snapshot_(date), base = {};
  if (ref.py) snapshot_(ref.py).forEach(r => { if (r.nav > 0) base[r.code] = r; });
  const lists = { theme: R.values.theme.slice(), struct: R.values.struct.slice(), region: R.values.region.slice() };
  const ix = k => v => { let i = lists[k].indexOf(v); if (i < 0) { lists[k].push(v); i = lists[k].length - 1; } return i; };
  const tI = ix('theme'), sI = ix('struct'), rI = ix('region');
  const mgrs = [], mIx = {};
  const mgrOf = (r) => { const g = groupOf_(r, ctx), k = g.short + '|' + g.top; if (!(k in mIx)) { mIx[k] = mgrs.length; mgrs.push([g.short, g.top]); } return mIx[k]; };
  const d0 = parse_(date), from = fmt_(new Date(d0.getFullYear() - 1, d0.getMonth(), d0.getDate()));
  const rows = [], seen = {};
  let total = 0, totalBase = 0;
  const push = (r, nav, b) => {
    const e = themeEntryOf_(r.code, r.name, ctx), c = classifyEtf_(R, e), ld = listDdOf_(r.code, ctx);
    const isNew = !!(ref.py && ld && ld > ref.py);
    const bv = isNew ? 0 : b;
    total += nav; totalBase += bv;
    rows.push([r.code, String(r.name), mgrOf(r), eok1_(nav), eok1_(bv), tI(c.theme), sI(c.struct), rI(c.region), e.bond ? 1 : 0, ld && ld > from && ld <= date ? ld : 0]);
  };
  cur.forEach(r => { const b = base[r.code]; if (r.nav <= 0 && !b) return; seen[r.code] = 1; push(r, r.nav, b ? b.nav : 0); });
  Object.keys(base).forEach(c => { if (!seen[c]) push(base[c], 0, base[c].nav); });
  return { date: date, ref: ref, refLabel: ref.label, unit: 1e8, total: total, totalBase: totalBase,
    cols: ['code', 'name', 'mgr', 'nav', 'base', 'theme', 'struct', 'region', 'bond', 'listDd'], rows: rows,
    themes: lists.theme.map(t => [t, R.groups[t] || '기타']), structs: lists.struct, regions: lists.region, mgrs: mgrs,
    groups: THEME.GROUPS, lev: THEME.LEV };
}

// ─────────────────────────── 검수표·캐시 반영 ───────────────────────────

/** 메뉴: 테마 분류 검수표 — 최근 영업일(없으면 최근 월말) 전 종목의 분류 결과를 '테마_분류검토' 시트에 씀(테마·NAV 순).
 *  규칙을 고친 뒤 실행하면 테마 맵 화면 캐시도 새로 계산되게 함 */
function buildThemeReview() {
  THEME_RULES_MEMO_ = null;
  const R = themeRules_(), ctx = ctx_();
  const dates = indexDates_(), months = aggMarket_();
  const date = dates.length ? dates[dates.length - 1] : (months.length ? months[months.length - 1].date : null);
  if (!date) throw new Error('적재된 자료가 없습니다');
  const recs = snapshot_(date).filter(r => r.nav > 0);
  const head = ['테마군', '테마', '상품구조', '지역', '자산', '종목코드', '종목명', '기초지수', '운용사', 'NAV(억원)'];
  const out = recs.map(r => {
    const e = themeEntryOf_(r.code, r.name, ctx), c = classifyEtf_(R, e), g = groupOf_(r, ctx), m = ctx.master[r.code];
    return [R.groups[c.theme] || '기타', c.theme, c.struct, c.region, e.bond ? '채권·금리' : '주식 등', r.code, r.name, (m && m.idx) || '', g.short, Math.round(r.nav / 1e8)];
  });
  const gOrd = THEME.GROUPS, tOrd = R.values.theme;
  out.sort((a, b) => (gOrd.indexOf(a[0]) - gOrd.indexOf(b[0])) || (tOrd.indexOf(a[1]) - tOrd.indexOf(b[1])) || (b[9] - a[9]));
  const ss = ss_(); let sh = ss.getSheetByName(THEME.REVIEW); if (!sh) sh = ss.insertSheet(THEME.REVIEW);
  sh.clear();
  sh.getRange(1, 1, 1, head.length).setValues([head]).setFontWeight('bold');
  if (out.length) sh.getRange(2, 1, out.length, head.length).setValues(out);
  sh.setFrozenRows(1);
  sh.getRange(1, 1).setNote('기준일 ' + date + ' · ' + out.length + '종목 · 범례_테마 규칙으로 자동 분류(이 시트를 고쳐도 반영되지 않음 — 분류를 바꾸려면 범례_테마의 키워드를 수정)'
    + (R.bad.length ? '\n해석할 수 없는 키워드: ' + R.bad.join(', ') : ''));
  [90, 150, 110, 80, 70, 70, 300, 340, 90, 80].forEach((w, i) => sh.setColumnWidth(i + 1, w));
  bumpThemeCache_();
  const cnt = {}; out.forEach(r => cnt[r[1]] = (cnt[r[1]] || 0) + 1);
  log_('테마 분류 검수표 작성: ' + date + ' ' + out.length + '종목 · 기타 주식 ' + (cnt['기타 주식'] || 0) + '종목' + (R.bad.length ? ' · 해석 불가 키워드 ' + R.bad.length + '개' : ''));
  return { date: date, n: out.length, etc: cnt['기타 주식'] || 0, bad: R.bad };
}
/** 테마 맵 입력 지문 = 범례_테마 규칙 + 기초지수명 (야간 점검에서 비교) */
function themeHash_(ctx) {
  const ms = ctx.master, s = themeRulesSig_() + '\n#\n' + Object.keys(ms).sort().map(k => k + '|' + (ms[k].idx || '')).join('\n');
  return md5_(s);   // v31: UTF-8
}
/** 테마 맵 화면 캐시만 새로 계산되게 함(다른 탭 캐시는 유지) */
function bumpThemeCache_() { PropertiesService.getScriptProperties().setProperty(PROP.THEME_VER, String(Date.now())); }

// ─────────────────────────── 기초지수명(ETF마스터 '기초지수' 열) ───────────────────────────

/** 일별 적재 레코드(fetchEtfDaily_ 결과, idx 포함)의 기초지수명을 ETF마스터에 반영. 바뀐 행이 있을 때만 열 전체 1회 쓰기 → 바뀐 행 수 */
function syncIndexNames_(records, ctx) {
  const want = {}; records.forEach(r => { if (r.idx) want[r.code] = r.idx; });
  if (!Object.keys(want).length) return 0;
  const sh = sheet_(CFG.SHEET.MASTER, CFG.MASTER_HEADER), C = masterCols_(sh);
  const col = ensureCol_(sh, C, 'IDX', THEME.IDX_HEADER), lr = sh.getLastRow();
  if (lr < 2) return 0;
  const codes = sh.getRange(2, C.CODE + 1, lr - 1, 1).getValues(), cur = sh.getRange(2, col + 1, lr - 1, 1).getValues();
  let n = 0;
  const vals = codes.map((r, i) => { const c = padCode_(r[0]), v = want[c], old = String(cur[i][0] || ''); if (v && v !== old) { n++; if (ctx && ctx.master[c]) ctx.master[c].idx = v; return [v]; } return [old]; });
  if (n) sh.getRange(2, col + 1, vals.length, 1).setValues(vals);
  return n;
}
/** 메뉴·편집기 실행용(1회): 최근 영업일 + 과거 연말 시점의 KRX 자료로 ETF마스터 '기초지수' 열을 채움(비어 있는 종목만, 시점당 KRX 조회 1회) */
function fillIndexNames() {
  const t0 = Date.now(), ctx = ctx_(), dates = indexDates_();
  const pts = (dates.length ? [dates[dates.length - 1]] : []).concat(THEME.FILL_DATES);
  let total = 0; const done = [];
  for (let i = 0; i < pts.length; i++) {
    if (Date.now() - t0 > CFG.HARD_MS) break;
    const missing = Object.keys(ctx.master).filter(c => !ctx.master[c].idx);
    if (!missing.length) break;
    let recs = [];
    try { recs = fetchEtfDaily_(pts[i]); } catch (e) { log_('기초지수명 조회 실패 ' + pts[i] + ': ' + e.message, 'WARN'); continue; }
    const need = {}; missing.forEach(c => need[c] = 1);
    total += syncIndexNames_(recs.filter(r => need[r.code]), ctx); done.push(pts[i]);
  }
  const left = Object.keys(ctx.master).filter(c => !ctx.master[c].idx).length;
  bumpThemeCache_();
  log_('기초지수명 채우기: ' + total + '종목 갱신 (' + done.join(', ') + ') · 남은 빈칸 ' + left + '종목');
  return { updated: total, left: left, dates: done };
}
