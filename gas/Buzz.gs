/**
 * Buzz.gs — v29 관심도(버즈)
 *  · 원천: 네이버 개발자 API — DataLab 검색어 트렌드(주 단위, 일 1,000회) · 검색 API 뉴스(일 25,000회). 키는 메뉴 [ETF Dashboard] › 네이버 API 키 설정(사용자 직접 입력)
 *  · 대상: 범례_테마의 '관심도 검색어' 열(테마·상품구조 행). 비어 있으면 그 테마는 건너뜀
 *  · 검색 관심도: 요청마다 기준어 'ETF'를 함께 넣어(그룹 5개 중 1개) 검색량을 'ETF 검색 = 100'으로 환산 → 요청이 달라도 테마끼리 비교 가능.
 *               최근 4주 평균 vs 직전 4주 평균 변화율
 *  · 뉴스: 검색어마다 "검색어"(따옴표 = 구문 일치) 최신순 100건씩 병렬 조회, 14일 이전 기사가 나올 때까지(검색어당 최대 500건) → 최근 7일·이전 7일 기사 수(같은 기사 중복 제거).
 *          기사가 많아 14일을 다 덮지 못하면 덮은 구간의 하루 평균으로 7일분을 환산(추정 표시)
 *  · 새 단어: 'ETF' 최신 뉴스 제목(최대 1,000건)의 단어 빈도 — 모은 제목이 덮는 기간을 반으로 나눠 최근 절반 vs 이전 절반. 테마 규칙 키워드에 없는 단어 표시(사전 보강 후보)
 *  · 매일 07시대 수집(키 저장 시 트리거 설치) → 시트 '관심도'(최근 수집분만). 탭은 첫 수집 뒤에만 보임(meta.buzzDate)
 */
const BUZZ = {
  DATALAB: 'https://openapi.naver.com/v1/datalab/search',
  NEWS: 'https://openapi.naver.com/v1/search/news.json',
  SHEET: '관심도', HEADER: ['구분', '대상', '기간', '값'],
  ANCHOR: 'ETF', WEEKS: 26, NEWS_PAGES: 5, ANCHOR_PAGES: 10, NEWS_PAR: 10, NEWS_GAP_MS: 1000, KW_MAX: 3, RUN_MS: 4.5 * 60 * 1000,
  STOP: ['ETF', 'ETN', '상장', '출시', '운용', '자산운용', '투자', '투자자', '수익률', '순자산', '돌파', '종목', '시장', '지수', '증시', '상품', '국내', '해외', '최대', '최고', '최초', '올해', '연초',
    '이후', '이번', '관련', '대비', '기록', '규모', '전망', '공개', '추천', '분석', '전략', '포트폴리오', '개인', '외국인', '기관', '매수', '순매수', '매도', '자금', '유입', '유출', '억원', '조원', '만원',
    '코스피', '코스닥', 'KODEX', 'TIGER', 'ACE', 'RISE', 'SOL', 'KIWOOM', 'PLUS', 'HANARO', 'KoAct', 'TIME', '1Q', '삼성', '미래에셋', '한투', '한국투자', '신한', 'KB', '키움', '한화', 'NH', '하나', '우리',
    '오늘', '내일', '주간', '이번주', '지난주', '단독', '속보', '종합', '포토', '영상', '인터뷰', '칼럼', '사설', '기자', '뉴스', '머니', '경제',
    '몰려', '몰린', '몰리', '급등', '급락', '상승', '하락', '강세', '약세', '주목', '인기', '수익', '성과', '선정', '확대', '증가', '감소', '집중', '눈길', '부각', '수혜', '기대', '우려', '선점', '대표', '신규', '등극', '1위', '굴려', '담은', '담아', '모아', '쓸어', '비중', '연속', '역대', '사상', '만에', '가장', '이상', '미만', '최근', '지난해', '하반기', '상반기'],
  // 테마·상품구조 → 관심도 검색어(쉼표). 범례_테마 '관심도 검색어' 열의 기본값
  KW: {
    '레버리지·인버스': '레버리지 ETF, 인버스 ETF', '커버드콜·옵션': '커버드콜 ETF, 월배당 커버드콜', '채권혼합': '채권혼합 ETF', '액티브': '액티브 ETF',
    '원자재·통화': '달러 ETF, 원유 ETF', '금·은': '금 ETF, 금현물 ETF, 은 ETF', '단기자금·파킹': '파킹형 ETF, 머니마켓 ETF, CD금리 ETF', '만기매칭채권': '만기매칭 ETF',
    '장기채': '미국채 ETF, 장기채 ETF', '크레딧(회사채·금융채)': '회사채 ETF', '국공채·종합채권': '채권 ETF, 국고채 ETF', '리츠·인프라': '리츠 ETF', 'TDF·자산배분': 'TDF',
    '밸류업·주주환원': '밸류업 ETF, 주주환원 ETF', '배당·인컴': '배당 ETF, 고배당 ETF, 월배당 ETF', '그룹주': '그룹주 ETF', '반도체': '반도체 ETF',
    '전력·원자력': '원자력 ETF, 전력 ETF, SMR ETF', '로봇·피지컬AI': '로봇 ETF, 휴머노이드 ETF, 피지컬AI ETF', '2차전지·전기차': '2차전지 ETF, 테슬라 ETF',
    '바이오·헬스케어': '바이오 ETF, 헬스케어 ETF', '방산·우주항공': '방산 ETF, 우주항공 ETF', '조선·기계': '조선 ETF', '자동차·모빌리티': '자동차 ETF',
    '금융': '금융 ETF, 은행 ETF, 증권 ETF', '소비·콘텐츠': '화장품 ETF, 엔터 ETF, 소비재 ETF', '에너지·친환경': '에너지 ETF, 수소 ETF, 친환경 ETF',
    'AI·소프트웨어': 'AI ETF, 인공지능 ETF, 소프트웨어 ETF', '미국 시장대표': 'S&P500 ETF, 나스닥 ETF', '국내 시장대표': '코스피 ETF, 코스피200 ETF, 코스닥 ETF',
    '해외 시장대표': '인도 ETF, 일본 ETF, 중국 ETF'
  }
};

// ─────────────────────────── 순수 함수(로컬 테스트에서도 사용) ───────────────────────────

/** 'Mon, 05 Oct 2026 09:00:00 +0900' → ms */
function buzzDate_(s) { const t = Date.parse(String(s || '')); return isNaN(t) ? 0 : t; }
/** 뉴스 제목 정리: 태그·HTML 엔터티 제거 */
function buzzTitle_(s) { return String(s || '').replace(/<[^>]+>/g, '').replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;|&apos;/g, "'").trim(); }
/** 제목 → 단어(2자 이상, 조사 떼기, 불용어 제외, 숫자만 제외) — 제목 1건당 같은 단어는 1번 */
function buzzWords_(title) {
  const stop = {}; BUZZ.STOP.forEach(w => stop[w.toUpperCase()] = 1);
  const out = {};
  String(title).replace(/[\[\]()<>"'“”‘’…·,.!?:;/|~=+…→↑↓▲▼%]/g, ' ').split(/\s+/).forEach(t => {
    t = t.replace(/(으로|에서|에게|까지|부터|이다|이며|하는|했다|한다|하고|으며|은|는|이|가|을|를|의|에|와|과|도|로|만|서)$/, '');
    if (t.length < 2 || /^[\d.,%억조만원천]+$/.test(t) || stop[t.toUpperCase()]) return;
    out[t] = 1;
  });
  return Object.keys(out);
}
/** DataLab 응답(기준어 그룹 포함) → {그룹명: [[기간, 기준어=100 환산값]]} */
function buzzScale_(body, anchor) {
  const res = (body && body.results) || [], A = res.find(r => r.title === anchor), base = {};
  if (!A) return {};
  A.data.forEach(d => base[d.period] = +d.ratio);
  const out = {};
  res.filter(r => r.title !== anchor).forEach(r => { out[r.title] = r.data.map(d => [d.period, base[d.period] ? Math.round(+d.ratio / base[d.period] * 100 * 1000) / 1000 : 0]); });
  return out;
}
/** 주간 지수 [[기간, 값]] → 최근 4주 평균·직전 4주 평균·변화율(%) */
function buzzTrend_(series) {
  const v = (series || []).map(x => +x[1] || 0), n = v.length, avg = a => a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0;
  const s4 = avg(v.slice(Math.max(0, n - 4))), p4 = avg(v.slice(Math.max(0, n - 8), Math.max(0, n - 4)));
  return { s4: s4, p4: p4, chg: p4 > 0 ? (s4 / p4 - 1) * 100 : null };
}

// ─────────────────────────── 수집 ───────────────────────────

function naverKeys_() {
  const P = PropertiesService.getScriptProperties(), id = P.getProperty(PROP.NAVER_ID), sec = P.getProperty(PROP.NAVER_SECRET);
  if (!id || !sec) throw new Error('네이버 API 키 미설정: 메뉴 [ETF Dashboard] › 네이버 API 키 설정');
  return { 'X-Naver-Client-Id': id, 'X-Naver-Client-Secret': sec };
}
/** 범례_테마 → 관심도 대상 [[이름, 구분(theme|struct), 테마군, [검색어…]]] (검색어 빈 행 제외) */
function buzzTargets_() {
  const rows = themeRuleRows_(), seen = {}, out = [];
  rows.slice().sort((a, b) => a.order - b.order).forEach(r => {
    const k = THEME.KIND[String(r.kind || '').trim()], v = String(r.value || '').trim();
    if ((k !== 'theme' && k !== 'struct') || !v || seen[v]) return;
    const kw = themeTokens_(r.buzz === undefined ? BUZZ.KW[v] : r.buzz);
    if (!kw.length) return;
    seen[v] = 1; out.push([v, k, String(r.group || '').trim(), kw]);
  });
  return out;
}
/** 뉴스: 검색어 여러 개를 페이지 단위로 병렬 조회(fetchAll, NEWS_PAR건씩 NEWS_GAP_MS 간격) — 14일 이전 기사가 나오거나 페이지 상한까지.
 *  → {검색어: {links: {링크: 시각}, titles: [[시각, 제목]](기준어만), oldest(모은 기사 중 가장 이른 시각), full(14일을 다 덮음), err}} */
function buzzNewsAll_(hdr, kws, since, t0) {
  const S = {}; kws.forEach(k => S[k] = { links: {}, titles: [], oldest: Infinity, full: false, done: false, err: '' });
  const maxPg = k => k === BUZZ.ANCHOR ? BUZZ.ANCHOR_PAGES : BUZZ.NEWS_PAGES;
  for (let pg = 0; pg < BUZZ.ANCHOR_PAGES; pg++) {
    const act = kws.filter(k => !S[k].done && pg < maxPg(k));
    for (let i = 0; i < act.length; i += BUZZ.NEWS_PAR) {
      if (t0 && Date.now() - t0 > BUZZ.RUN_MS) return S;   // 시간 초과: 모은 만큼으로 환산
      if (i || pg) Utilities.sleep(BUZZ.NEWS_GAP_MS);
      const part = act.slice(i, i + BUZZ.NEWS_PAR);
      const rs = UrlFetchApp.fetchAll(part.map(k => ({ url: BUZZ.NEWS + '?query=' + encodeURIComponent('"' + k + '"') + '&display=100&sort=date&start=' + (pg * 100 + 1), headers: hdr, muteHttpExceptions: true })));
      rs.forEach((r, j) => {
        const k = part[j], s = S[k];
        if (r.getResponseCode() !== 200) { s.done = true; s.err = '네이버 뉴스 HTTP ' + r.getResponseCode() + ' ' + String(r.getContentText()).slice(0, 80); return; }
        const items = (kisJson_(r.getContentText()).items) || [];
        let old = false;
        items.forEach(it => {
          const t = buzzDate_(it.pubDate); if (!t) return;
          if (t < since) { old = true; return; }
          if (t < s.oldest) s.oldest = t;
          const l = it.originallink || it.link;
          if (!(l in s.links)) { s.links[l] = t; if (k === BUZZ.ANCHOR) s.titles.push([t, buzzTitle_(it.title)]); }
        });
        if (old || items.length < 100) { s.done = true; s.full = true; }
      });
    }
  }
  return S;
}
/** 기사 시각 목록 → 최근 7일·이전 7일 기사 수. cover = 빠짐없이 모은 구간의 시작(since 이상) — 덜 덮은 쪽은 하루 평균으로 7일분 환산, 이전 7일을 전혀 못 덮으면 null */
function buzzNewsCount_(ts, cover, now, mid, since) {
  const d7 = 7 * 86400000;
  const rec = ts.filter(t => t >= Math.max(mid, cover)).length, prv = ts.filter(t => t >= cover && t < mid).length;
  return { n7: cover <= mid ? rec : Math.round(rec * d7 / Math.max(now - cover, 3600000)),
    nP: cover <= since ? prv : (cover < mid ? Math.round(prv * d7 / (mid - cover)) : null), est: cover > since };
}
/** 메뉴·트리거: 관심도 수집(매일). DataLab 요청 ⌈대상/4⌉회 + 뉴스 검색어당 1~5회(기준어 ETF 최대 10회, 10건씩 병렬) */
function collectBuzz() {
  const P = PropertiesService.getScriptProperties(), t0 = Date.now(), hdr = naverKeys_(), tz = TZ;
  const targets = buzzTargets_();
  if (!targets.length) { log_('관심도: 범례_테마의 관심도 검색어가 모두 비어 있음', 'WARN'); return; }
  const now = new Date(), day = 86400000;
  // 주 단위: 지난 일요일까지(진행 중인 주 제외), 26주
  const end = new Date(now.getTime() - ((now.getDay() + 7) % 7 || 7) * day), start = new Date(end.getTime() - (BUZZ.WEEKS * 7 - 1) * day);
  const f = d => Utilities.formatDate(d, tz, 'yyyy-MM-dd');
  const rows = [], errs = [];
  for (let i = 0; i < targets.length; i += 4) {
    const grp = targets.slice(i, i + 4);
    const body = { startDate: f(start), endDate: f(end), timeUnit: 'week', keywordGroups: [{ groupName: BUZZ.ANCHOR, keywords: [BUZZ.ANCHOR] }].concat(grp.map(t => ({ groupName: t[0], keywords: t[3].slice(0, 20) }))) };
    const r = UrlFetchApp.fetch(BUZZ.DATALAB, { method: 'post', contentType: 'application/json', headers: hdr, payload: JSON.stringify(body), muteHttpExceptions: true });
    if (r.getResponseCode() !== 200) { errs.push('DataLab ' + r.getResponseCode() + ' ' + String(r.getContentText()).slice(0, 80)); continue; }
    const sc = buzzScale_(kisJson_(r.getContentText()), BUZZ.ANCHOR);
    grp.forEach(t => (sc[t[0]] || []).forEach(x => rows.push(['검색', t[0], x[0], x[1]])));
  }
  const nowT = now.getTime(), since = nowT - 14 * day, mid = nowT - 7 * day;
  const kws = [];
  targets.forEach(t => t[3].slice(0, BUZZ.KW_MAX).forEach(k => { if (kws.indexOf(k) < 0) kws.push(k); }));
  if (kws.indexOf(BUZZ.ANCHOR) < 0) kws.push(BUZZ.ANCHOR);
  let S = {};
  try { S = buzzNewsAll_(hdr, kws, since, t0); } catch (e) { errs.push('뉴스 ' + e.message); }
  let done = 0, est = 0;
  targets.forEach(t => {
    const ks = t[3].slice(0, BUZZ.KW_MAX).filter(k => S[k] && (S[k].full || S[k].oldest < Infinity));
    if (!ks.length) { const k = t[3][0]; if (S[k] && S[k].err) errs.push(t[0] + ' ' + S[k].err); return; }
    const links = {}; ks.forEach(k => Object.keys(S[k].links).forEach(l => links[l] = S[k].links[l]));
    const cover = Math.max.apply(null, [since].concat(ks.map(k => S[k].full ? since : S[k].oldest)));
    const c = buzzNewsCount_(Object.keys(links).map(l => links[l]), cover, nowT, mid, since);
    rows.push(['뉴스', t[0], '최근7일', c.n7], ['뉴스', t[0], '이전7일', c.nP === null ? '' : c.nP]);
    if (c.est) { rows.push(['뉴스', t[0], '추정', 1]); est++; }
    done++;
  });
  // 새 단어: 'ETF' 뉴스 제목 — 모은 제목이 덮는 기간을 반으로 나눠 비교
  let wordDays = null;
  const E = S[BUZZ.ANCHOR];
  if (E && E.titles.length) {
    const cover = E.full ? since : E.oldest, midW = cover + (nowT - cover) / 2;
    wordDays = Math.round((nowT - midW) / day * 10) / 10;
    const cnt = {};
    E.titles.forEach(x => buzzWords_(x[1]).forEach(w => { const c = cnt[w] = cnt[w] || [0, 0]; c[x[0] >= midW ? 0 : 1]++; }));
    Object.keys(cnt).filter(w => cnt[w][0] >= 3).sort((a, b) => cnt[b][0] - cnt[a][0]).slice(0, 60).forEach(w => rows.push(['단어', w, '최근', cnt[w][0]], ['단어', w, '이전', cnt[w][1]]));
    rows.push(['단어', '(제목 수)', '최근', E.titles.filter(x => x[0] >= midW).length], ['단어', '(제목 수)', '이전', E.titles.filter(x => x[0] < midW).length]);
  } else if (E && E.err) errs.push('새 단어 ' + E.err);
  if (!rows.some(r => r[0] === '검색') && !rows.some(r => r[0] === '뉴스')) { log_('관심도 수집 실패: ' + errs.slice(0, 3).join(' | '), 'ERROR'); return; }
  const ss = ss_(); let sh = ss.getSheetByName(BUZZ.SHEET); if (!sh) sh = ss.insertSheet(BUZZ.SHEET);
  sh.clear(); sh.getRange(1, 1, 1, BUZZ.HEADER.length).setValues([BUZZ.HEADER]); sh.setFrozenRows(1); sh.getRange('C:C').setNumberFormat('@');
  sh.getRange(2, 1, rows.length, BUZZ.HEADER.length).setValues(rows);
  const date = f(now);
  P.setProperty(PROP.BUZZ_DATE, date);
  P.setProperty(PROP.BUZZ_INFO, JSON.stringify({ date: date, at: Utilities.formatDate(now, tz, 'yyyy-MM-dd HH:mm'), targets: targets.length, news: done, newsEst: est, wordDays: wordDays, weeks: [f(start), f(end)], errs: errs.slice(0, 5) }));
  bumpCache_(['9999-12']);
  log_('관심도 수집 완료: 대상 ' + targets.length + ' · 뉴스 ' + done + ' · ' + rows.length + '행' + (errs.length ? ' · 오류 ' + errs.length + '건: ' + errs.slice(0, 3).join(' | ') : ''));
}
function cont_collectBuzz() { clearTriggers_('cont_collectBuzz'); collectBuzz(); }
function installBuzzTrigger_() {
  clearTriggers_('collectBuzz');
  ScriptApp.newTrigger('collectBuzz').timeBased().everyDays(1).atHour(7).nearMinute(40).inTimezone(TZ).create();
}

// ─────────────────────────── API ───────────────────────────

/** 관심도 자료: 대상별 주간 검색 관심도(ETF=100)·최근 4주 변화·뉴스 7일 기사 수 + 새 단어(테마 규칙 키워드에 없는 단어 표시) */
function apiBuzz_() {
  const P = PropertiesService.getScriptProperties(), date = P.getProperty(PROP.BUZZ_DATE);
  if (!date) return { ready: false };
  const sh = ss_().getSheetByName(BUZZ.SHEET); if (!sh) return { ready: false };
  const T = {}, W = {}, weeks = {};
  readAll_(sh).forEach(r => {
    const k = String(r[0]), n = String(r[1]), per = r[2] instanceof Date ? fmt_(r[2]) : String(r[2]), v = toNum_(r[3]);
    if (k === '검색') { const t = T[n] = T[n] || { s: [], news7: 0, newsP: 0 }; t.s.push([per, v]); weeks[per] = 1; }
    else if (k === '뉴스') { const t = T[n] = T[n] || { s: [], news7: 0, newsP: 0 }; if (per === '최근7일') t.news7 = v; else if (per === '이전7일') t.newsP = r[3] === '' ? null : v; else if (per === '추정') t.est = true; }
    else if (k === '단어') { const w = W[n] = W[n] || { n7: 0, nP: 0 }; if (/^최근/.test(per)) w.n7 = v; else w.nP = v; }
  });
  const tg = buzzTargets_(), meta = {}; tg.forEach(t => meta[t[0]] = t);
  // 사전 단어: 테마 규칙 키워드 + 관심도 검색어(정규형)
  const dict = []; themeRuleRows_().forEach(r => themeTokens_(r.inc).concat(themeTokens_(r.buzz)).concat([r.value]).forEach(x => { const n = themeNorm_(String(x).replace(/^~/, '').replace(/ETF$/i, '')); if (n.length >= 2 && !/^[\/*]/.test(n) && n.indexOf(':') < 0) dict.push(n); }));
  const inDict = w => { const n = themeNorm_(w); return dict.some(d => d.indexOf(n) >= 0 || n.indexOf(d) >= 0); };
  const items = Object.keys(T).map(n => { const t = T[n], tr = buzzTrend_(t.s.sort((a, b) => a[0] < b[0] ? -1 : 1)), m = meta[n] || [n, 'theme', '', []];
    return { key: n, kind: m[1], group: m[2], kw: m[3], s: t.s.map(x => x[1]), s4: tr.s4, p4: tr.p4, chg: tr.chg, news7: t.news7, newsP: t.newsP, newsEst: !!t.est, newsChg: t.newsP > 0 ? (t.news7 / t.newsP - 1) * 100 : null }; });
  const tot = W['(제목 수)'] || { n7: 0, nP: 0 }; delete W['(제목 수)'];
  const words = Object.keys(W).map(w => ({ w: w, n7: W[w].n7, nP: W[w].nP, dict: inDict(w) })).sort((a, b) => b.n7 - a.n7);
  return { ready: true, date: date, info: kisJson_(P.getProperty(PROP.BUZZ_INFO)), weeks: Object.keys(weeks).sort(), items: items, words: words, titles: tot, anchor: BUZZ.ANCHOR };
}

/** 메뉴: 네이버 연결 테스트 — DataLab 1회(ETF·반도체 ETF)·뉴스 1회 결과를 _log 에 */
function testNaver() {
  const hdr = naverKeys_(), f = d => Utilities.formatDate(d, TZ, 'yyyy-MM-dd'), now = new Date();
  const r1 = UrlFetchApp.fetch(BUZZ.DATALAB, { method: 'post', contentType: 'application/json', headers: hdr, muteHttpExceptions: true,
    payload: JSON.stringify({ startDate: f(new Date(now.getTime() - 56 * 86400000)), endDate: f(now), timeUnit: 'week', keywordGroups: [{ groupName: 'ETF', keywords: ['ETF'] }, { groupName: '반도체', keywords: ['반도체 ETF'] }] }) });
  const r2 = UrlFetchApp.fetch(BUZZ.NEWS + '?query=' + encodeURIComponent('"반도체 ETF"') + '&display=5&sort=date', { headers: hdr, muteHttpExceptions: true });
  const out = ['DataLab ' + r1.getResponseCode() + ' ' + String(r1.getContentText()).slice(0, 300), '뉴스 ' + r2.getResponseCode() + ' ' + String(r2.getContentText()).slice(0, 300)];
  log_('네이버 연결 테스트\n' + out.join('\n'));
  return out;
}
