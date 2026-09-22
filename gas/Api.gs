/**
 * Api.gs — 웹앱 진입점(doGet) 및 대시보드 데이터 API.
 *  클라이언트: google.script.run.api(action, params)
 *  새 탭 추가 시: 아래 ACTIONS 에 핸들러 1개 추가 (→ 탭추가_가이드.md)
 */
function doGet(e) {
  // 외부 프런트엔드(Vercel)용 JSON 엔드포인트: .../exec?action=meta&p={...}  — action 이 없으면 기존 웹앱 화면
  if (e && e.parameter && e.parameter.action) {
    let p = {}; try { p = JSON.parse(e.parameter.p || '{}'); } catch (err) {}
    return ContentService.createTextOutput(api(String(e.parameter.action), p)).setMimeType(ContentService.MimeType.JSON);
  }
  const t = HtmlService.createTemplateFromFile('Index');
  return t.evaluate().setTitle('ETF Dashboard')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}
function include(name) { return HtmlService.createHtmlOutputFromFile(name).getContent(); }

function api(action, params) {
  try {
    const fn = ACTIONS[action];
    if (!fn) throw new Error('알 수 없는 action: ' + action);
    // 응답 캐시: 적재·집계 때마다 CACHE_VER 가 바뀌므로 오래된 결과가 남지 않음 (6시간, 100KB 미만만)
    const cache = CacheService.getScriptCache();
    const key = cacheKey_(action, params);
    const hit = cache.get(key);
    if (hit) return hit;
    const out = JSON.stringify({ ok: true, data: fn(params || {}) });
    if (out.length < 95000) cache.put(key, out, 21600);
    return out;
  } catch (err) {
    return JSON.stringify({ ok: false, error: err.message });
  }
}

function cacheKey_(action, params) {
  const ver = PropertiesService.getScriptProperties().getProperty(PROP.CACHE_VER) || '0';
  const h = Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, JSON.stringify(params || {})));
  return 'api:' + ver + ':' + action + ':' + h;
}
/** 데이터 변경 시 호출 → 이후 API 응답 캐시 무효화 */
function bumpCache_() { PropertiesService.getScriptProperties().setProperty(PROP.CACHE_VER, String(Date.now())); }

const ACTIONS = {
  meta: apiMeta_,
  overview: apiOverview_,
  byMgr: apiByMgr_,
  byType: apiByType_,
  shares: apiShares_,
  topEtf: apiTopEtf_,
  race: apiRace_,
  newListings: apiNewListings_,
  treemap: apiTreemap_,
  turnover: apiTurnover_
};

// ─────────────────────────── 공통 ───────────────────────────

function aggRows_(name) { return readAll_(sheet_(name)); }
function aggMarket_() { return aggRows_(CFG.SHEET.AGG_MARKET).map(r => ({ ym: ymstr_(r[0]), date: dstr_(r[1]), nav: toNum_(r[2]), n: +r[3], k: toNum_(r[4]), s: toNum_(r[5]), q: toNum_(r[6]) })); }
function dstr_(v) { return v instanceof Date ? fmt_(v) : String(v); }
/** 시트가 '2021-01' 문자열을 날짜로 자동 변환하는 경우 대비 */
function ymstr_(v) { return v instanceof Date ? Utilities.formatDate(v, TZ, 'yyyy-MM') : String(v).slice(0, 7); }

/** 선택 가능한 기준일: 월말 스냅샷 일자 + 일별 일자 */
function availableDates_() {
  const months = aggMarket_();
  const daily = indexDates_();
  const set = {};
  months.forEach(m => set[m.date] = 'M');
  daily.forEach(d => set[d] = set[d] || 'D');
  return { dates: Object.keys(set).sort(), months: months.map(m => ({ ym: m.ym, date: m.date })) };
}

/** 기본 기준일 = 전월말(현재 월 직전 월의 스냅샷 일자) */
function defaultDate_(months) {
  const cur = ym_(fmt_(new Date()));
  const prev = months.filter(m => m.ym < cur);
  return prev.length ? prev[prev.length - 1].date : (months.length ? months[months.length - 1].date : null);
}
/** 기준일 → 전월말 스냅샷 일자, 전년말 스냅샷 일자 */
function refDates_(date, months) {
  const y = date.slice(0, 4), m = ym_(date);
  const prevM = months.filter(x => x.ym < m); const prevY = months.filter(x => x.ym < y + '-01');
  return { pm: prevM.length ? prevM[prevM.length - 1].date : null, py: prevY.length ? prevY[prevY.length - 1].date : null };
}

/** 특정일 스냅샷 레코드: 일별 블록 우선, 없으면 해당 월 스냅샷 */
const SNAP_MEMO_ = {};
function snapshot_(date) {
  if (SNAP_MEMO_[date]) return SNAP_MEMO_[date];
  let recs = readDailyBlock_(date);
  if (!recs) {
    // raw_월말: 블록 위치 인덱스(캐시)로 해당 범위만 읽기 — A열 전체 스캔은 데이터 버전당 1회
    const ix = monthlyIndex_()[date];
    if (ix) recs = sheet_(CFG.SHEET.RAW_MONTHLY, CFG.RAW_HEADER).getRange(ix.start, 1, ix.count, CFG.RAW_HEADER.length).getValues().map(rowToRec_);
  }
  if (!recs) throw new Error('해당 일자 데이터 없음: ' + date);
  SNAP_MEMO_[date] = recs;
  return recs;
}
/** 시트 A열(기준일자) 블록 인덱스 {date: {start, count}}. CACHE_VER 별 캐시(집계 재계산 시 자동 갱신) */
function blockIndex_(sheetName) {
  const cache = CacheService.getScriptCache();
  const key = 'bix:' + sheetName + ':' + (PropertiesService.getScriptProperties().getProperty(PROP.CACHE_VER) || '0');
  const hit = cache.get(key); if (hit) return JSON.parse(hit);
  const sh = sheet_(sheetName), lr = sh.getLastRow(), out = {};
  if (lr >= 2) {
    const col = sh.getRange(2, 1, lr - 1, 1).getValues();
    let cur = null;
    for (let i = 0; i < col.length; i++) { const d = dstr_(col[i][0]); if (d !== cur) { cur = d; out[d] = { start: i + 2, count: 0 }; } out[d].count++; }
  }
  try { cache.put(key, JSON.stringify(out), 21600); } catch (e) {}
  return out;
}
function monthlyIndex_() { return blockIndex_(CFG.SHEET.RAW_MONTHLY); }

/** 일자별 요약 행 [{mgr, top, f2, dom, nav, n}] — 일별 요약 우선, 없으면 월말 요약 (raw 를 읽지 않음) */
const SNAPROWS_MEMO_ = {};
function snapRows_(date) {
  if (SNAPROWS_MEMO_[date]) return SNAPROWS_MEMO_[date];
  let rows = null;
  [CFG.SHEET.AGG_SNAP_D, CFG.SHEET.AGG_SNAP_M].some(name => {
    const ix = blockIndex_(name)[date]; if (!ix) return false;
    rows = sheet_(name).getRange(ix.start, 1, ix.count, CFG.SNAP_HEADER.length).getValues().map(r => ({ mgr: String(r[1]), top: String(r[2]), f2: String(r[3]), dom: String(r[4]), nav: toNum_(r[5]), n: +r[6] || 0 }));
    return true;
  });
  if (!rows) {   // 요약 미생성 일자: raw 스냅샷으로 대체 (느림) → "일별 요약 재작성" 메뉴로 채울 것
    const ctx = ctx_();
    rows = summarize_(snapshot_(date), ctx, date).map(r => ({ mgr: String(r[1]), top: String(r[2]), f2: String(r[3]), dom: String(r[4]), nav: toNum_(r[5]), n: +r[6] || 0 }));
  }
  SNAPROWS_MEMO_[date] = rows;
  return rows;
}
function sumBy_(recs, keyFn) { const o = {}; recs.forEach(r => { const k = keyFn(r); o[k] = (o[k] || 0) + r.nav; }); return o; }
function cntBy_(recs, keyFn) { const o = {}; recs.forEach(r => { const k = keyFn(r); o[k] = (o[k] || 0) + (r.n || 1); }); return o; }
function chg_(cur, base) { return { amt: cur - (base || 0), pct: base ? (cur / base - 1) * 100 : null }; }
function topOf_(t) { return CFG.TOP5.indexOf(t) >= 0 ? t : '기타'; }

// ─────────────────────────── 핸들러 ───────────────────────────

function apiMeta_() {
  const av = availableDates_();
  const legend = mgrLegend_();
  const mgrs = Object.keys(legend).filter(k => CFG.TOP5.indexOf(legend[k].top) < 0).map(k => legend[k].short).filter((v, i, a) => a.indexOf(v) === i).sort();   // 개별 운용사 선택용: 상위 5개사 제외
  const last = PropertiesService.getScriptProperties().getProperty(PROP.LAST_DAILY);
  return {
    dates: av.dates, months: av.months, daily: indexDates_(), defaultDate: defaultDate_(av.months),
    dailyFrom: CFG.DAILY_FROM, top5: CFG.TOP5, colors: CFG.COLOR, typeOrder: CFG.TYPE_ORDER, mgrs: mgrs,
    lastLoaded: last, curMonth: last ? ym_(last) : ym_(fmt_(new Date()))
  };
}

/** ETF 시장 개관 */
function apiOverview_(p) {
  const months = aggMarket_();
  const date = p.date || defaultDate_(months);
  const ym = ym_(date), y = ym.slice(0, 4);
  // 연도별: 각 연도 12월(없으면 그 해 마지막 월), 당해년도는 기준월
  const yearly = [];
  const years = months.map(m => m.ym.slice(0, 4)).filter((v, i, a) => a.indexOf(v) === i).filter(v => v <= y);
  years.forEach(yy => {
    const rows = months.filter(m => m.ym.slice(0, 4) === yy && (yy < y || m.ym <= ym));
    if (rows.length) { const r = rows[rows.length - 1]; yearly.push({ label: yy === y ? yy + '.' + ym.slice(5) : yy, ym: r.ym, date: r.date, nav: r.nav, n: r.n, k: r.k, s: r.s, q: r.q }); }
  });
  // 당해년도 월별: 전년말(기준점) + 당해년도 각 월
  const prevYE = months.filter(m => m.ym < y + '-01').pop() || null;
  const cur = months.filter(m => m.ym.slice(0, 4) === y && m.ym <= ym);
  const series = (prevYE ? [prevYE] : []).concat(cur);
  const monthly = series.map((m, i) => {
    const base = prevYE ? prevYE.nav : null, prev = i ? series[i - 1].nav : null;
    const pct = (a, b) => a && b ? (a / b - 1) * 100 : null;
    return Object.assign({}, m, { isBase: i === 0 && !!prevYE, ytd: chg_(m.nav, base), mom: chg_(m.nav, prev),
      navYtd: prevYE ? pct(m.nav, prevYE.nav) : null, kYtd: prevYE ? pct(m.k, prevYE.k) : null, sYtd: prevYE ? pct(m.s, prevYE.s) : null, qYtd: prevYE ? pct(m.q, prevYE.q) : null });
  });
  return { date: date, yearly: yearly, monthly: monthly, prevYE: prevYE };
}

/** 운용사별 NAV (상위 5개사 + 기타) — 일자별 요약 사용 */
function apiByMgr_(p) {
  const months = aggMarket_();
  const date = p.date || defaultDate_(months);
  const ref = refDates_(date, months);
  const key = r => topOf_(r.top);
  const cur = sumBy_(snapRows_(date), key), pm = ref.pm ? sumBy_(snapRows_(ref.pm), key) : {}, py = ref.py ? sumBy_(snapRows_(ref.py), key) : {};
  const tot = o => Object.keys(o).reduce((s, k) => s + o[k], 0);
  const total = tot(cur), totalPy = tot(py), totalPm = tot(pm);
  const groups = CFG.TOP5.concat(['기타']);
  const rows = groups.map(k => ({ mgr: k, nav: cur[k] || 0, ms: total ? (cur[k] || 0) / total * 100 : 0,
    navPy: py[k] || 0, msPy: totalPy ? (py[k] || 0) / totalPy * 100 : null, navPm: pm[k] || 0, msPm: totalPm ? (pm[k] || 0) / totalPm * 100 : null,
    ytd: chg_(cur[k] || 0, py[k]), mom: chg_(cur[k] || 0, pm[k]) }));
  // 월별 M/S 추이 (agg_운용사월별)
  const trend = {};
  aggRows_(CFG.SHEET.AGG_MGR).forEach(r => { const m = ymstr_(r[0]); if (m > ym_(date)) return; const t = trend[m] = trend[m] || {}; const g = topOf_(String(r[2])); t[g] = (t[g] || 0) + toNum_(r[3]); });
  return { date: date, ref: ref, total: total, totalPy: totalPy, totalPm: totalPm, rows: rows, trend: Object.keys(trend).sort().map(m => Object.assign({ ym: m }, trend[m])) };
}

/** 유형별 NAV — 일자별 요약 사용 */
function apiByType_(p) {
  const months = aggMarket_();
  const date = p.date || defaultDate_(months);
  const ref = refDates_(date, months);
  const S = snapRows_(date), Pm = ref.pm ? snapRows_(ref.pm) : [], Py = ref.py ? snapRows_(ref.py) : [];
  const kT = r => r.f2, kD = r => r.dom;
  const cur = sumBy_(S, kT), pm = sumBy_(Pm, kT), py = sumBy_(Py, kT), curN = cntBy_(S, kT);
  const total = Object.keys(cur).reduce((s, k) => s + cur[k], 0), totalPy = Object.keys(py).reduce((s, k) => s + py[k], 0);
  const order = CFG.TYPE_ORDER.concat(Object.keys(cur).concat(Object.keys(py)).filter((k, i, a) => CFG.TYPE_ORDER.indexOf(k) < 0 && a.indexOf(k) === i));
  const rows = order.filter(k => cur[k] !== undefined || py[k] !== undefined).map(k => ({ type: k, nav: cur[k] || 0, n: curN[k] || 0, share: total ? (cur[k] || 0) / total * 100 : 0,
    navPy: py[k] || 0, sharePy: totalPy ? (py[k] || 0) / totalPy * 100 : null, ytd: chg_(cur[k] || 0, py[k]), mom: chg_(cur[k] || 0, pm[k]) }));
  const dom = sumBy_(S, kD), domPy = sumBy_(Py, kD), domPm = sumBy_(Pm, kD);
  const domRows = ['국내', '해외'].concat(Object.keys(dom).filter(k => k !== '국내' && k !== '해외')).filter(k => dom[k] !== undefined || domPy[k] !== undefined)
    .map(k => ({ dom: k, nav: dom[k] || 0, share: total ? (dom[k] || 0) / total * 100 : 0, navPy: domPy[k] || 0, sharePy: totalPy ? (domPy[k] || 0) / totalPy * 100 : null, ytd: chg_(dom[k] || 0, domPy[k]), mom: chg_(dom[k] || 0, domPm[k]) }));
  // 월별 유형 추이: 전년말 + 당해년도 각 월 (agg_유형월별)
  const y = date.slice(0, 4);
  const prevYE = months.filter(m => m.ym < y + '-01').pop();
  const wanted = (prevYE ? [prevYE.ym] : []).concat(months.filter(m => m.ym.slice(0, 4) === y && m.ym <= ym_(date)).map(m => m.ym));
  const trend = {};
  aggRows_(CFG.SHEET.AGG_TYPE).forEach(r => { const m = ymstr_(r[0]); if (wanted.indexOf(m) < 0) return; const t = trend[m] = trend[m] || {}; t[String(r[2])] = (t[String(r[2])] || 0) + toNum_(r[4]); });
  return { date: date, ref: ref, total: total, totalPy: totalPy, rows: rows, dom: domRows, trend: wanted.filter(m => trend[m]).map(m => Object.assign({ ym: m, isBase: prevYE && m === prevYE.ym }, trend[m])) };
}

/** 유형 > 개별 ETF 트리맵 (v14). 넓이 = 기준일 NAV, 증감 = 전년말(신규상장은 상장 이후) 대비 NAV 증가액 */
function apiTreemap_(p) {
  const months = aggMarket_();
  const date = p.date || defaultDate_(months);
  const ref = refDates_(date, months);
  const ctx = ctx_();
  const cur = snapshot_(date), py = {};
  if (ref.py) snapshot_(ref.py).forEach(r => py[r.code] = r.nav);
  const items = cur.filter(r => r.nav > 0).map(r => {
    const g = groupOf_(r, ctx), ld = listDdOf_(r.code, ctx), isNew = !!(ref.py && ld && ld > ref.py);
    const base = isNew ? 0 : (py[r.code] !== undefined ? py[r.code] : null);
    return { code: r.code, name: r.name, mgr: g.short, top: g.top, type: g.f2, nav: r.nav, base: base, chg: base === null ? null : r.nav - base, isNew: isNew, listDd: ld || '' };
  });
  return { date: date, ref: ref, total: items.reduce((s, i) => s + i.nav, 0), items: items };
}

/** 상위 5개사 및 시장 전체의 유형별 비중 (+ 선택 운용사) — 일자별 요약 사용 */
function apiShares_(p) {
  const months = aggMarket_();
  const date = p.date || defaultDate_(months);
  const S = snapRows_(date);
  const groups = { '시장 전체': S };
  CFG.TOP5.forEach(t => groups[t] = S.filter(r => r.top === t));
  if (p.mgr) groups[p.mgr] = S.filter(r => r.mgr === p.mgr);
  const out = {};
  Object.keys(groups).forEach(g => {
    const s = sumBy_(groups[g], r => r.f2), n = cntBy_(groups[g], r => r.f2); const tot = Object.keys(s).reduce((a, k) => a + s[k], 0);
    const types = CFG.TYPE_ORDER.concat(Object.keys(s).filter(k => CFG.TYPE_ORDER.indexOf(k) < 0));
    out[g] = { total: tot, n: Object.keys(n).reduce((a, k) => a + n[k], 0), types: types.map(t => ({ type: t, nav: s[t] || 0, n: n[t] || 0, share: tot ? (s[t] || 0) / tot * 100 : 0 })) };
  });
  const mgrs = Object.keys(sumBy_(S, r => r.mgr)).sort();
  return { date: date, groups: out, mgrs: mgrs, selected: p.mgr || null };
}

/** 상위 ETF 50 */
function apiTopEtf_(p) {
  const months = aggMarket_();
  const date = p.date || defaultDate_(months);
  const ctx = ctx_();
  const recs = snapshot_(date).slice().sort((a, b) => b.nav - a.nav);
  const total = recs.reduce((s, r) => s + r.nav, 0);
  const top = recs.slice(0, CFG.TOP_N).map((r, i) => { const g = groupOf_(r, ctx); return { rank: i + 1, code: r.code, name: r.name, mgr: g.short, top: g.top, type: g.f2, nav: r.nav, share: total ? r.nav / total * 100 : 0 }; });
  const topTotal = top.reduce((s, t) => s + t.nav, 0);
  const byMgr = CFG.TOP5.concat(['기타']).map(k => { const xs = top.filter(t => t.top === k); const nav = xs.reduce((s, t) => s + t.nav, 0); return { top: k, n: xs.length, nav: nav, share: topTotal ? nav / topTotal * 100 : 0 }; });
  return { date: date, total: total, topTotal: topTotal, top: top, byMgr: byMgr };
}

/** bar chart race 자료: 월별 상위 N (agg_상위ETF월별) */
function apiRace_(p) {
  const n = +p.n || 10;
  const out = {}, types = ctx_().types;
  const isBond = c => { const t = types[c]; return !!t && (t.neu === '채권/금리' || t.f2 === '채권'); };   // 채권/금리형 → 회색 표시용
  aggRows_(CFG.SHEET.AGG_TOP).forEach(r => { const k = ymstr_(r[0]); if (+r[1] <= n) { const c = padCode_(r[2]); (out[k] = out[k] || []).push({ rank: +r[1], code: c, name: r[3], mgr: r[4], top: r[5], nav: toNum_(r[6]), bond: isBond(c) }); } });
  return { frames: Object.keys(out).sort().map(k => ({ ym: k, rows: out[k] })) };
}

/** 신규상장 ETF (기준일자 연도에 상장된 종목의 기준일자 NAV). 상장일 = ETF마스터 상장일 → 범례_유형 설정일 */
function apiNewListings_(p) {
  const months = aggMarket_();
  const date = p.date || defaultDate_(months);
  const year = p.year || date.slice(0, 4);
  const ctx = ctx_();
  const recs = snapshot_(date);
  const nav = {}; recs.forEach(r => nav[r.code] = r.nav);
  const codes = Object.keys(ctx.master).concat(Object.keys(ctx.types)).filter((c, i, a) => a.indexOf(c) === i);
  let items = codes.map(c => ({ c: c, ld: listDdOf_(c, ctx) })).filter(x => x.ld.slice(0, 4) === year && x.ld <= date).map(x => {
    const m = ctx.master[x.c], t = ctx.types[x.c];
    const g = groupOf_({ code: x.c, name: (m && m.name) || (t && t.name) || '', mgr: m ? m.mgr : '' }, ctx);
    return { code: x.c, name: (m && m.name) || (t && t.name) || x.c, listDd: x.ld, mgr: g.short, top: g.top, type: g.f2, neu: g.neu, nav: nav[x.c] || 0, listed: nav[x.c] !== undefined };
  });
  if ((p.filter || 'exBond') === 'exBond') items = items.filter(i => i.neu !== '채권/금리');
  items.sort((a, b) => b.nav - a.nav);
  const byMgr = {};
  items.forEach(i => { const b = byMgr[i.mgr] = byMgr[i.mgr] || { top: i.top, n: 0, nav: 0 }; b.n++; b.nav += i.nav; });
  const rows = Object.keys(byMgr).map(k => Object.assign({ mgr: k }, byMgr[k])).sort((a, b) => b.nav - a.nav);
  const noDate = codes.filter(c => !listDdOf_(c, ctx)).length;
  return { date: date, year: year, filter: p.filter || 'exBond', items: items, byMgr: rows, total: items.reduce((s, i) => s + i.nav, 0), noDate: noDate };
}

/** 거래대금 상위 50 (from~to). 일별 누적컬럼 차분으로 계산 → 대용량 스캔 불필요 */
function apiTurnover_(p) {
  const dates = indexDates_();
  if (!dates.length) throw new Error('일별 데이터가 없습니다 (backfillDaily 필요)');
  const months = aggMarket_();
  const def = defaultDate_(months);
  const to = p.to || (def >= dates[0] ? def : dates[dates.length - 1]);
  let from = p.from;
  if (!from) { const ref = refDates_(to, months); from = ref.py && ref.py >= dates[0] ? fmt_(addDays_(parse_(ref.py), 1)) : dates[0]; }
  if (from < dates[0]) throw new Error('일별 거래대금은 ' + dates[0] + ' 이후만 조회 가능합니다 (그 이전은 월말 스냅샷만 보유)');
  const inRange = dates.filter(d => d >= from && d <= to);
  if (!inRange.length) throw new Error('구간 내 영업일 없음');
  const ctx = ctx_();
  const sum = {}, names = {};
  // 연도별로 [구간 마지막일 ytd] − [구간 시작 직전일 ytd]
  const years = inRange.map(d => d.slice(0, 4)).filter((v, i, a) => a.indexOf(v) === i);
  years.forEach(y => {
    const ds = inRange.filter(d => d.slice(0, 4) === y);
    const endBlk = readDailyBlock_(ds[ds.length - 1]);
    const before = dates.filter(d => d < ds[0] && d.slice(0, 4) === y).pop();
    const startBlk = before ? readDailyBlock_(before) : [];
    const sm = {}; startBlk.forEach(r => sm[r.code] = r.ytd);
    endBlk.forEach(r => { sum[r.code] = (sum[r.code] || 0) + r.ytd - (sm[r.code] || 0); names[r.code] = r; });
  });
  const days = inRange.length;
  const top = Object.keys(sum).map(c => { const r = names[c], g = groupOf_(r, ctx); return { code: c, name: r.name, mgr: g.short, top: g.top, type: g.f2, sum: sum[c], avg: sum[c] / days }; })
    .sort((a, b) => b.sum - a.sum).slice(0, CFG.TOP_N).map((r, i) => Object.assign({ rank: i + 1 }, r));
  const marketSum = Object.keys(sum).reduce((s, c) => s + sum[c], 0);
  return { from: from, to: to, days: days, top: top, marketSum: marketSum, dailyDates: dates };
}
