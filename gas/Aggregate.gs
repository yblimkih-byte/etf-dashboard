/**
 * Aggregate.gs — raw_월말 → 대시보드용 집계 시트(agg_*)
 *  v23 (2026-10-02, 9월말 미반영 사고 후 재설계)
 *   - 일별 적재: 스냅샷 일자·지수가 agg_시장월별과 다른 월만 다시 집계해 해당 월 행만 교체(aggregateMonths_). 1~2개월분이라 수십 초
 *   - 집계 필요 여부는 '시트 상태 비교'(aggStale_)로 판단 → 실행이 강제 종료돼도 다음 실행(감시 재시도 포함)에서 자동 복구
 *   - agg_시장월별을 마지막에 씀(완료 표식): 중간에 끊기면 해당 월이 계속 '불일치'로 남아 다시 처리됨
 *   - 전체 재계산(70여 개월)은 적재 실행에서 분리: 메뉴(rebuildAggregates) 또는 범례 변경 시 야간 분할 실행(fullAggStep_)
 *   (v22 까지: 적재마다 전체 재계산 → 아침 실행에서 6분 한도 초과로 강제 종료, 재시도 표식도 미리 지워져 2026-10-01·02 집계 누락)
 */

/** 집계 시트 목록 [키, 시트, 헤더] — 쓰는 순서. agg_시장월별(대시보드 월 목록·기준일 원천)은 마지막 = 완료 표식 */
function aggSheets_() {
  return [
    { key: 'mgr', name: CFG.SHEET.AGG_MGR, header: ['월', '운용사', '상위구분', 'NAV', '종목수'] },
    { key: 'typ', name: CFG.SHEET.AGG_TYPE, header: ['월', '유형최종1', '유형최종2', '국내해외', 'NAV', '종목수'] },
    { key: 'mgrTyp', name: CFG.SHEET.AGG_MGR_TYPE, header: ['월', '운용사', '상위구분', '유형최종2', 'NAV'] },
    { key: 'top', name: CFG.SHEET.AGG_TOP, header: ['월', '순위', '종목코드', '종목명', '운용사', '상위구분', 'NAV'] },
    { key: 'snap', name: CFG.SHEET.AGG_SNAP_M, header: CFG.SNAP_HEADER },
    { key: 'mkt', name: CFG.SHEET.AGG_MARKET, header: ['월', '기준일자', '총NAV', '종목수', 'KOSPI', 'S&P500', 'NASDAQ100'] }
  ];
}
function emptyAgg_() { return { mkt: [], mgr: [], typ: [], mgrTyp: [], top: [], snap: [] }; }
function mergeAgg_(all, o) { Object.keys(all).forEach(k => { const a = o[k] || []; for (let i = 0; i < a.length; i++) all[k].push(a[i]); }); return all; }

/** 한 달(스냅샷 레코드) → 6개 집계 시트의 해당 월 행 (전체 재계산·월별 갱신 공용 → 두 경로 결과 동일) */
function aggMonth_(k, recs, ctx, idx) {
  const out = emptyAgg_();
  if (!recs || !recs.length) return out;
  let date = recs[0].date;
  for (let i = 1; i < recs.length; i++) if (recs[i].date > date) date = recs[i].date;   // 블록 일자 = 최대 일자(monthlyMap_ 과 같은 기준 → 점검 비교 일치)
  let tot = 0;
  const byMgr = {}, byType = {}, byMgrType = {};
  recs.forEach(r => {
    tot += r.nav;
    const g = groupOf_(r, ctx);
    const a = byMgr[g.short] = byMgr[g.short] || { top: g.top, nav: 0, n: 0 }; a.nav += r.nav; a.n++;
    const tk = g.f1 + '|' + g.f2 + '|' + g.dom;
    const b = byType[tk] = byType[tk] || { nav: 0, n: 0 }; b.nav += r.nav; b.n++;
    const mk = g.short + '|' + g.f2;
    const c = byMgrType[mk] = byMgrType[mk] || { top: g.top, nav: 0 }; c.nav += r.nav;
  });
  const ix = nearestIndex_(idx, date);
  out.mkt.push([k, date, tot, recs.length, ix.k || '', ix.s || '', ix.n || '']);
  Object.keys(byMgr).forEach(s => out.mgr.push([k, s, byMgr[s].top, byMgr[s].nav, byMgr[s].n]));
  Object.keys(byType).forEach(t => { const p = t.split('|'); out.typ.push([k, p[0], p[1], p[2], byType[t].nav, byType[t].n]); });
  Object.keys(byMgrType).forEach(t => { const p = t.split('|'); out.mgrTyp.push([k, p[0], byMgrType[t].top, p[1], byMgrType[t].nav]); });
  out.snap = summarize_(recs, ctx, date);
  recs.slice().sort((a, b) => b.nav - a.nav).slice(0, CFG.TOP_N).forEach((r, i) => {
    const g = groupOf_(r, ctx); out.top.push([k, i + 1, r.code, r.name, g.short, g.top, r.nav]);
  });
  return out;
}

/** 메뉴 '집계 재계산'·편집기 실행: 전체 재계산(한 번에). 적재·분할 재계산과 겹치지 않도록 잠금 */
function rebuildAggregates() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) { notify_('적재 또는 집계가 진행 중입니다. 잠시 후 다시 실행하십시오.'); return; }
  try { rebuildAggregates_(); } finally { lock.releaseLock(); }
}
/** 전체 재계산(한 번에): raw_월말 전체 → agg_* 6개 시트 재작성. 백필·보정 함수에서도 호출 */
function rebuildAggregates_() {
  const ctx = ctx_();
  const months = monthlyBlocks_();
  const keys = Object.keys(months).sort();
  const idx = indexSeries_();
  const all = emptyAgg_();
  keys.forEach(k => mergeAgg_(all, aggMonth_(k, months[k], ctx, idx)));
  aggBegin_();
  writeAllAgg_(all);
  aggDone_();
  fullAggFinished_(legendHash_(ctx));
  log_('집계 재계산 완료: ' + keys.length + '개월');
}
function writeAllAgg_(all) { aggSheets_().forEach(s => writeAgg_(s.name, s.header, all[s.key])); }
/** 집계 시트 쓰기 시작 표시 → 쓰기 후 캐시 갱신(aggDone_) 전에 실행이 끊기면 다음 점검(healAgg_)에서 캐시 갱신
 *  v24: 값 = 쓰는 월 목록('2026-09,2026-10') 또는 'all'(전체 재계산) → 복구 시 해당 월만 캐시 무효화 */
function aggBegin_(yms) { PropertiesService.getScriptProperties().setProperty(PROP.AGG_DIRTY, yms && yms.length ? yms.join(',') : 'all'); }
/** 집계 반영 후: API 응답 캐시 무효화. yms(바뀐 월)를 주면 그 월 이후 기준일 조회만, 없으면 전부(meta·블록 위치 캐시는 항상) */
function aggDone_(yms) {
  CacheService.getScriptCache().removeAll(['agg_market', 'agg_mgr', 'agg_type', 'agg_mgrtype', 'agg_top', 'legend', 'dates']);
  bumpCache_(yms);
  PropertiesService.getScriptProperties().deleteProperty(PROP.AGG_DIRTY);
}
/** AGG_DIRTY 값 → 월 목록(없거나 'all'·v23 형식(시각)이면 null = 전부) */
function dirtyMonths_(v) { const ks = String(v || '').split(',').filter(k => /^\d{4}-\d{2}$/.test(k)); return ks.length ? ks : null; }
/** 한 번의 쓰기로 r0 행부터 rows 를 쓰고, 그 아래 옛 행(~lr)은 빈 값으로 덮음 → 중간에 끊겨도 중복 행·빈 시트가 생기지 않음 */
function putRows_(sh, r0, rows, w, lr) {
  const grid = rows.slice();
  while (r0 + grid.length - 1 < lr) grid.push(new Array(w).fill(''));
  if (!grid.length) return;
  sh.getRange(r0, 1, grid.length, 1).setNumberFormat('@');   // 1열('월'·기준일자) 텍스트 고정(날짜 자동변환 방지)
  sh.getRange(r0, 1, grid.length, w).setValues(grid);
}

/** 시트 전체 재작성(v23: 지운 뒤 쓰지 않고 머리글+행+남는 옛 행 빈 값을 한 번에 씀) */
function writeAgg_(name, header, rows) {
  const sh = sheet_(name, header), w = header.length, lr = sh.getLastRow(), lc = sh.getLastColumn();
  putRows_(sh, 1, [header].concat(rows), w, Math.max(lr, 2));
  if (lc > w) sh.getRange(1, w + 1, Math.max(lr, rows.length + 1), lc - w).clearContent();
  sh.setFrozenRows(1);
}

// ─────────────────────────── v23: 바뀐 월만 갱신 ───────────────────────────

/**
 * 집계 점검: raw_월말 월별 스냅샷 일자·지수(KOSPI·S&P500·NASDAQ100)와 agg_시장월별을 비교.
 * 반환 {stale: 다시 집계할 월, extra: raw_월말에 없는데 집계에 남은 월, keys: raw_월말 월 목록, map, idx}
 */
function aggStale_() {
  const map = monthlyMap_(sheet_(CFG.SHEET.RAW_MONTHLY, CFG.RAW_HEADER)), idx = indexSeries_();
  const sh = sheet_(CFG.SHEET.AGG_MARKET), lr = sh.getLastRow(), agg = {};
  if (lr >= 2) sh.getRange(2, 1, lr - 1, 7).getValues().forEach(r => { agg[ymstr_(r[0])] = { d: dstr_(r[1]), k: toNum_(r[4]), s: toNum_(r[5]), n: toNum_(r[6]) }; });
  const diff = (a, b) => Math.abs(a - b) > 1e-9 * Math.max(1, Math.abs(b));
  const useIdx = idx.length >= 20;   // 지수 시트가 비었거나 깨졌으면 지수 비교 생략(빈 지수로 집계를 덮지 않음)
  const keys = Object.keys(map).sort();
  const stale = keys.filter(k => {
    const a = agg[k];
    if (!a || a.d !== map[k][0]) return true;
    if (!useIdx) return false;
    const ix = nearestIndex_(idx, map[k][0]);
    return diff(a.k, ix.k) || diff(a.s, ix.s) || diff(a.n, ix.n);
  });
  return { stale: stale, extra: Object.keys(agg).filter(k => k && !map[k]).sort(), keys: keys, map: map, idx: idx };
}

/**
 * 집계 점검·복구(적재 실행·야간 점검 공용). t0: 실행 시작 시각(시한 판단), getCtx: 범례 컨텍스트, pre: 이번 실행에서 이미 읽은 월 레코드
 * 반환 {state: 'none'(최신)|'inc'(바뀐 월 갱신)|'full'(전체 재계산 예약)|'defer'(시한 부족 → 이어서 실행), msg}
 */
function healAgg_(t0, getCtx, pre) {
  const dirty = PropertiesService.getScriptProperties().getProperty(PROP.AGG_DIRTY);
  if (dirty) { aggDone_(dirtyMonths_(dirty)); console.log('[healAgg] 이전 실행이 집계 쓰기 후 캐시 갱신 전에 끊김 → 캐시 갱신(' + dirty + ')'); }
  const chk = aggStale_(), targets = chk.stale.concat(chk.extra).sort();
  if (!targets.length) return { state: 'none', msg: '최신' };
  const lab = k => k + (chk.map[k] ? '(' + chk.map[k][0] + ')' : '(삭제)');
  const msg = targets.length > 4 ? targets.slice(0, 2).map(lab).join(', ') + ' 외 ' + (targets.length - 2) + '개월' : targets.map(lab).join(', ');
  const recentFrom = chk.keys.slice(-CFG.INC_MAX_MONTHS)[0] || '';
  if (targets.length > CFG.INC_MAX_MONTHS || targets[0] < recentFrom) {
    const ok = requestFullAgg_('집계 불일치 ' + targets.length + '개월(' + targets[0] + '~)');
    return { state: 'full', msg: msg + (ok ? ' → 전체 재계산 예약' : ' → 전체 재계산 보류(오늘 중단됨)') };
  }
  if (t0 && Date.now() - t0 > CFG.AGG_START_MS) return { state: 'defer', msg: msg };
  aggregateMonths_(targets, getCtx(), pre, chk);
  return { state: 'inc', msg: msg };
}

/** 지정 월만 다시 집계해 agg_* 6개 시트의 해당 월 행만 교체(agg_시장월별 마지막). raw_월말에 없는 월은 행 삭제 */
function aggregateMonths_(keys, ctx, pre, chk) {
  keys = keys.slice().sort();
  const t = Date.now();
  const sh = sheet_(CFG.SHEET.RAW_MONTHLY, CFG.RAW_HEADER);
  const map = chk ? chk.map : monthlyMap_(sh), idx = chk ? chk.idx : indexSeries_();
  const all = emptyAgg_();
  keys.forEach(k => {
    let recs = pre && pre[k];
    if (!recs && map[k]) recs = sh.getRange(map[k][1], 1, map[k][2] - map[k][1] + 1, CFG.RAW_HEADER.length).getValues().map(rowToRec_);
    mergeAgg_(all, aggMonth_(k, recs, ctx, idx));
  });
  let n = 0;
  aggBegin_(keys);
  aggSheets_().forEach(s => { replaceAggMonths_(s.name, s.header, keys, all[s.key]); n += all[s.key].length; });
  aggDone_(keys);   // v24: 바뀐 월 이후 기준일 조회만 캐시 무효화(이전 월 기준 조회는 유지)
  log_('집계 갱신(바뀐 월만): ' + keys.map(k => k + (map[k] ? ' ' + map[k][0] : ' 삭제')).join(', ') + ' — ' + n + '행, ' + Math.round((Date.now() - t) / 1000) + 's');
}

/** 집계 시트에서 대상 월(keys) 행만 교체. 시트는 월 오름차순 → 대상 최소 월의 첫 행부터 끝까지만 다시 씀(같은 월의 행 순서 유지) */
function replaceAggMonths_(name, header, keys, rows) {
  const sh = sheet_(name, header), w = header.length;
  let lr = sh.getLastRow();
  if (lr < 1) { sh.getRange(1, 1, 1, w).setValues([header]); sh.setFrozenRows(1); lr = 1; }
  const want = {}; keys.forEach(k => want[k] = 1);
  const r0 = lr >= 2 ? aggTailStart_(sh, lr, keys[0]) : 2;
  const tail = r0 <= lr ? sh.getRange(r0, 1, lr - r0 + 1, w).getValues() : [];
  const out = tail.filter(v => { const k = ymstr_(v[0]); return k && !want[k]; }).concat(rows)   // 빈 행은 버림
    .map((v, i) => ({ v: v, k: ymstr_(v[0]), i: i }))
    .sort((a, b) => a.k < b.k ? -1 : a.k > b.k ? 1 : a.i - b.i)
    .map(x => x.v);
  putRows_(sh, r0, out, w, lr);   // 새 끝부분 + 남는 옛 행 빈 값 → 한 번의 쓰기
}
/** 대상 최소 월(minK) 이상인 첫 행 번호. 아래쪽부터 창을 넓혀 A열만 읽음(대개 수백 행). 정렬이 깨져 있으면 2(전체 재작성·정렬) */
function aggTailStart_(sh, lr, minK) {
  let n = Math.min(lr - 1, 600);
  for (;;) {
    const top = lr - n + 1;
    const col = sh.getRange(top, 1, n, 1).getValues().map(v => ymstr_(v[0]));
    for (let i = 1; i < col.length; i++) if (col[i] < col[i - 1]) return 2;
    if (col[0] < minK || top === 2) {
      for (let i = 0; i < col.length; i++) if (col[i] >= minK) return top + i;
      return lr + 1;
    }
    n = Math.min(lr - 1, n * 4);
  }
}

// ─────────────────────────── v23: 전체 재계산 분할 실행 ───────────────────────────

/** 범례 지문: 집계 분류에 쓰이는 범례_운용사·범례_유형·ETF마스터(브랜드·운용사명) + 상위 5개사·브랜드 표 */
function legendHash_(ctx) {
  const m = ctx.mgrs, t = ctx.types, ms = ctx.master;
  const s = [
    CFG.TOP5.join(','), JSON.stringify(CFG.BRAND_MAP),
    Object.keys(m).sort().map(k => [k, m[k].kor, m[k].short, m[k].top, (m[k].brands || []).join(',')].join('|')).join('\n'),
    Object.keys(t).sort().map(k => [k, t[k].f1, t[k].f2, t[k].dom].join('|')).join('\n'),
    Object.keys(ms).sort().map(k => [k, ms[k].brand, ms[k].mgr].join('|')).join('\n')
  ].join('\n#\n');
  return Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, s));
}
/** v24: 화면 계산(groupOf_·listDdOf_·신규상장 목록)이 읽는 범례·마스터 항목 전체의 지문 — legendHash_(전체 재계산 판단)에 없는 상장일·종목명·신규상장용 구분 포함.
 *  야간 점검에서 바뀐 것이 확인되면 화면 캐시 전체 무효화(집계 재계산은 하지 않음). 예열이 캐시 보존 기간을 계속 연장하므로 이 점검이 없으면 범례 수정이 지난 기준일 화면에 반영되지 않음 */
function ctxHash_(ctx) {
  const t = ctx.types, ms = ctx.master;
  const s = [legendHash_(ctx),
    Object.keys(t).sort().map(k => [k, t[k].name, t[k].listDd, t[k].neu].join('|')).join('\n'),
    Object.keys(ms).sort().map(k => [k, ms[k].name, ms[k].listDd].join('|')).join('\n')].join('\n#\n');
  return Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, s));
}
function fullAggState_() { try { return JSON.parse(PropertiesService.getScriptProperties().getProperty(PROP.FULL_AGG) || 'null'); } catch (e) { return null; } }
function saveFullAgg_(st) { PropertiesService.getScriptProperties().setProperty(PROP.FULL_AGG, JSON.stringify(st)); }
/** 전체 재계산 완료 기록(한 번에·분할 공용): 범례 지문 저장, 진행 상태·예약 정리 */
function fullAggFinished_(hash) {
  const props = PropertiesService.getScriptProperties();
  props.setProperty(PROP.AGG_HASH, hash);
  props.deleteProperty(PROP.FULL_AGG);
  clearTriggers_('cont_fullAgg');
}

/** 전체 재계산 예약(분할 실행). 이미 진행 중이면 예약만 확인. 오늘 중단된 적이 있으면 예약하지 않음(내일 야간 점검·메뉴로) → 반환 true/false */
function requestFullAgg_(reason) {
  const props = PropertiesService.getScriptProperties();
  if (!fullAggState_()) {
    if (props.getProperty(PROP.FULL_BLOCK) === fmt_(new Date())) { console.log('[fullAgg] 오늘 중단된 전체 재계산 → 예약 보류: ' + reason); return false; }
    saveFullAgg_({ id: String(Date.now()), reason: reason, hash: '', done: [], tries: 0, steps: 0, redo: 0 });
    log_('전체 집계 재계산 예약: ' + reason);
  }
  if (!ScriptApp.getProjectTriggers().some(t => t.getHandlerFunction() === 'cont_fullAgg')) scheduleContinue_('fullAgg', 1);
  return true;
}
function cont_fullAgg() { clearTriggers_('cont_fullAgg'); fullAggStep_(); }
/** 전체 재계산 중단: 진행 상태 삭제, 오늘은 다시 예약하지 않음(트리거 실행시간 보호) */
function abortFullAgg_(why) {
  const props = PropertiesService.getScriptProperties();
  props.deleteProperty(PROP.FULL_AGG);
  props.setProperty(PROP.FULL_BLOCK, fmt_(new Date()));
  clearTriggers_('cont_fullAgg');
  log_('전체 집계 재계산 중단: ' + why + ' → 내일 05시대 야간 점검에서 다시 시도(메뉴 [집계 재계산]으로 즉시 실행 가능)', 'ERROR');
}

/**
 * 전체 재계산 1단계 실행(실행당 계산 약 3분): 월별 결과를 캐시(6시간)에 보관 → 모든 월이 끝나면 6개 시트를 쓰기(agg_시장월별 마지막).
 * 시작할 때 15분 뒤 재시도 트리거를 걸어 두어 강제 종료돼도 이어서 진행. 무한 반복 방지: 연속 3회 비정상 종료·총 8회 실행·
 * 다시 계산 3회 중 하나라도 넘으면 중단(그날은 재예약 안 함). 계산 도중 범례가 바뀌면 처음부터, 쓰기 직전 스냅샷 일자가 바뀐 월은 다시 계산
 */
function fullAggStep_() {
  const st = fullAggState_(); if (!st) return;
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) { scheduleContinue_('fullAgg', 5); return; }
  const t0 = Date.now();
  try {
    st.steps = (st.steps || 0) + 1;
    if (st.tries >= 3) { abortFullAgg_('연속 3회 비정상 종료(시간 초과 추정)'); return; }
    if (st.steps > 8) { abortFullAgg_('실행 8회 초과'); return; }   // 정상은 1~3회, 느린 날 4~6회. 하루 트리거 실행시간(90분) 보호
    st.tries++; saveFullAgg_(st);
    scheduleContinue_('fullAgg', 15);   // 강제 종료 대비 재시도(정상 종료 시 아래에서 교체·해제)
    const sh = sheet_(CFG.SHEET.RAW_MONTHLY, CFG.RAW_HEADER), map = monthlyMap_(sh), keys = Object.keys(map).sort();
    const cache = CacheService.getScriptCache(), ck = k => 'fagg:' + st.id + ':' + k;
    let calc = 0;
    if (keys.some(k => st.done.indexOf(k) < 0)) {   // 계산할 월이 남았을 때만 범례·지수를 읽음(쓰기만 남은 실행은 바로 쓰기)
      const ctx = ctx_(), hash = legendHash_(ctx);
      if (st.hash !== hash) { st.hash = hash; st.done = []; }
      const idx = indexSeries_(), tc = Date.now();   // 계산 시한은 준비 읽기 뒤부터(단, 실행 시작 4.5분 이후에는 새 월을 시작하지 않음)
      for (const k of keys) {
        if (st.done.indexOf(k) >= 0) continue;
        if (Date.now() - tc > CFG.FULL_CALC_MS || Date.now() - t0 > 4.5 * 60 * 1000) break;
        const recs = sh.getRange(map[k][1], 1, map[k][2] - map[k][1] + 1, CFG.RAW_HEADER.length).getValues().map(rowToRec_);
        cache.put(ck(k), JSON.stringify(aggMonth_(k, recs, ctx, idx)), 21600);
        st.done.push(k); calc++;
        saveFullAgg_(st);
      }
    }
    const left = keys.filter(k => st.done.indexOf(k) < 0).length;
    if (!left && (!calc || Date.now() - t0 < CFG.FULL_WRITE_MS)) {   // 쓰기: 계산을 마친 실행에 여유가 있거나, 쓰기만 남은 실행
      const got = {}, ks = keys.map(ck), all = emptyAgg_(), redo = [];
      for (let i = 0; i < ks.length; i += 20) Object.assign(got, cache.getAll(ks.slice(i, i + 20)));
      keys.forEach(k => {
        const v = got[ck(k)], o = v ? JSON.parse(v) : null;
        if (!o || !o.mkt.length || o.mkt[0][1] !== map[k][0]) { redo.push(k); return; }   // 캐시 유실·스냅샷 일자 변경 → 다시 계산
        mergeAgg_(all, o);
      });
      if (!redo.length) {
        aggBegin_();
        writeAllAgg_(all);
        aggDone_();
        fullAggFinished_(st.hash);
        log_('전체 집계 재계산 완료(분할 실행 ' + st.steps + '회): ' + keys.length + '개월 — ' + st.reason);
        warmDay_();
        return;
      }
      st.redo = (st.redo || 0) + 1;
      if (st.redo > 2) { abortFullAgg_('캐시 유실·스냅샷 변경으로 3회 다시 계산(' + redo.slice(0, 5).join(',') + ')'); return; }
      st.done = st.done.filter(k => redo.indexOf(k) < 0);
      log_('전체 집계 재계산: ' + redo.length + '개월 다시 계산(캐시 유실 또는 스냅샷 변경)', 'WARN');
    }
    st.tries = 0; saveFullAgg_(st);
    console.log('[fullAgg] ' + calc + '개월 계산, 남은 ' + keys.filter(k => st.done.indexOf(k) < 0).length + '개월, ' + ((Date.now() - t0) / 1000).toFixed(0) + 's');
    scheduleContinue_('fullAgg', 1);
  } finally { lock.releaseLock(); }
}

/** 야간 점검(v23, 매일 05시대 트리거): ① 범례가 마지막 전체 재계산 이후 바뀌었으면 전체 재계산(분할) ② 집계 불일치 월 복구 */
function nightlyAgg() {
  if (fullAggState_()) { requestFullAgg_('이어서 실행'); return; }
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) return;
  try {
    try { const n = syncTypeF3_(); if (n) log_('범례_유형 유형최종3 갱신: ' + n + '행'); } catch (e) { log_('유형최종3 갱신 실패: ' + e.message, 'WARN'); }   // v26
    const props = PropertiesService.getScriptProperties(), ctx = ctx_(), hash = legendHash_(ctx), prev = props.getProperty(PROP.AGG_HASH);
    if (prev !== hash) { requestFullAgg_(prev ? '범례(유형·운용사·ETF마스터) 변경 반영' : '범례 지문 최초 기록'); return; }
    const r = healAgg_(Date.now(), () => ctx, null);
    console.log('[nightlyAgg] 집계 점검: ' + r.msg);
    // v24: 상장일·종목명·신규상장용 구분 등 화면 계산이 읽는 항목이 바뀌었으면 화면 캐시 전체 무효화(처음 실행은 지문만 기록)
    const ch = ctxHash_(ctx), pc = props.getProperty(PROP.CTX_HASH), changed = !!pc && pc !== ch;
    if (pc !== ch) props.setProperty(PROP.CTX_HASH, ch);
    if (changed) { bumpCache_(); log_('범례·마스터 항목 변경 감지 → 화면 캐시 전체 갱신'); }
    if (r.state === 'inc' || changed) warmDay_();
  } finally { lock.releaseLock(); }
}
/** 집계 갱신 뒤 예열 예약. v24: 시간대 제한 없음(밤에도 캐시를 채워 둠 — 예열은 바뀐 조회만 계산하므로 1~2분 이내) */
function warmDay_() { warmCache_(); }
/** 야간 점검 트리거가 없으면 설치(적재 실행에서 확인 → 별도 수동 설치 불필요) */
function ensureNightly_() {
  if (ScriptApp.getProjectTriggers().some(t => t.getHandlerFunction() === 'nightlyAgg')) return;
  ScriptApp.newTrigger('nightlyAgg').timeBased().everyDays(1).atHour(5).nearMinute(10).inTimezone(TZ).create();
  log_('야간 집계 점검 트리거 설치 (매일 05시대)');
}

/** 스냅샷 레코드 → {short(약식_정식), top(상위구분), f1, f2, f3(v26 유형최종3), dom, neu}. 운용사는 ETF마스터 브랜드/운용사명 → 범례_운용사 */
function groupOf_(r, ctx) {
  const e = resolveMgr_(r.code, r.name, ctx);
  let short = e ? e.short : (r.mgr || '미확인');
  let top = e ? e.top : '기타';
  if (!e && r.mgr && ctx.lookup.byName[r.mgr]) { short = ctx.lookup.byName[r.mgr].short; top = ctx.lookup.byName[r.mgr].top; }
  if (CFG.TOP5.indexOf(top) < 0) top = '기타';
  const t = ctx.types[r.code] || { f1: '미분류', f2: '미분류', dom: '미분류', neu: '미분류' };
  return { short: short, top: top, f1: t.f1 || '미분류', f2: t.f2 || '미분류', f3: t.f3 || t.f2 || '미분류', dom: t.dom || '미분류', neu: t.neu || '미분류' };
}

/** 스냅샷 레코드 → 요약 행 [기준일자, 운용사, 상위구분, 유형최종2, 국내해외, NAV, 종목수] (운용사×유형×국내해외) */
function summarize_(recs, ctx, date) {
  const agg = {};
  recs.forEach(r => {
    const g = groupOf_(r, ctx), k = g.short + '|' + g.top + '|' + g.f2 + '|' + g.dom;
    const a = agg[k] = agg[k] || { nav: 0, n: 0 }; a.nav += r.nav; a.n++;
  });
  return Object.keys(agg).sort().map(k => { const p = k.split('|'); return [date, p[0], p[1], p[2], p[3], agg[k].nav, agg[k].n]; });
}

/**
 * agg_일별요약 전체 재작성 (_index 의 일별 블록을 순회). 6분 예산 초과 시 이어서 실행.
 * 초기 1회 및 범례(운용사·유형) 대량 수정 후 실행. 이후 일별 적재 시 자동 추가됨
 */
function rebuildDailySummary() {
  const lock = LockService.getScriptLock(); if (!lock.tryLock(10000)) return;
  const t0 = Date.now();
  try {
    const props = PropertiesService.getScriptProperties();
    const ctx = ctx_(), ix = indexMap_(), dates = Object.keys(ix).sort();
    const sh = sheet_(CFG.SHEET.AGG_SNAP_D, CFG.SNAP_HEADER);
    let cursor = props.getProperty(PROP.SNAP_CURSOR);
    if (!cursor) { sh.clearContents(); sh.getRange(1, 1, 1, CFG.SNAP_HEADER.length).setValues([CFG.SNAP_HEADER]); sh.getRange('A:A').setNumberFormat('@'); cursor = ''; }
    const shD = sheet_(CFG.SHEET.RAW_DAILY, CFG.RAW_HEADER);
    let buf = [], done = 0, i = 0;
    for (; i < dates.length; i++) {
      const d = dates[i]; if (d <= cursor) continue;
      if (Date.now() - t0 > CFG.HARD_MS) break;
      const b = ix[d];
      const recs = shD.getRange(b.start, 1, b.count, CFG.RAW_HEADER.length).getValues().map(rowToRec_);
      buf = buf.concat(summarize_(recs, ctx, d)); cursor = d; done++;
      if (buf.length > 4000) { appendRows_(sh, buf); buf = []; }
    }
    if (buf.length) appendRows_(sh, buf);
    if (i < dates.length) { props.setProperty(PROP.SNAP_CURSOR, cursor); log_('일별 요약 재작성 진행 중: ' + done + '일, 최종 ' + cursor + ' (이어서 실행 예약)'); scheduleContinue_('rebuildDailySummary', 1); return; }
    props.deleteProperty(PROP.SNAP_CURSOR); clearTriggers_('cont_rebuildDailySummary');
    bumpCache_();
    log_('일별 요약 재작성 완료: ' + dates.length + '일');
  } finally { lock.releaseLock(); }
}

/** API 캐시 예열(v13). 캐시 키는 파라미터로 정해지므로 **화면이 실제로 보내는 파라미터**로 호출해야 적중함
 *  (v12 까지는 {} 로 예열해 화면 요청({date:…})과 키가 달라 효과가 없었음). v24: 키는 파라미터 키 순서와 무관(stableStr_) */
function warmParams_(date, dv, months) {
  const to = dv.indexOf(date) >= 0 ? date : dv[dv.length - 1];
  let from = dv[0];
  if (to) { const py = months.filter(x => x.ym < to.slice(0, 4) + '-01').pop(); const f = py && dv.filter(d => d > py.date)[0]; if (f) from = f; }
  // 첫 화면 묶음(bootList_: 요약 탭 6건 = 각 탭 기본 조회) → 히트맵 → 거래대금
  const list = bootList_(date).concat([['treemap', { date: date, ref: 'py' }]]);
  if (to) list.push(['turnover', { from: from, to: to }]);
  return list;
}
/** v24 예열: 기본 기준일(전월말, 첫 화면) → 최근 영업일 → 상위 ETF 변천 순으로, 캐시에 있으면 보존 기간만 연장(다시 넣기)·없으면 계산.
 *  5시간마다(밤낮 없이) 반복 → 캐시 만료(6시간)로 느려지는 시간대가 없음. 적재·집계로 바뀐 조회만 다시 계산하므로 보통 수 초~2분
 *  (v17~v23: 캐시에 있으면 아무것도 하지 않아 보존 기간이 늘지 않음 → 넣은 지 6시간 뒤 만료되어 오후·야간에 첫 조회가 느렸음, 22~09시 예열 없음) */
function warmAll() {
  clearTriggers_('cont_warmAll');
  const since = +(PropertiesService.getScriptProperties().getProperty(PROP.LOADING) || 0);
  if (since && Date.now() - since < 7 * 60 * 1000) { console.log('[warmAll] 적재 실행 중 → 10분 뒤 예열'); scheduleContinue_('warmAll', 10); return; }   // v17: 적재와 겹치지 않게
  const t0 = Date.now(), limit = CFG.WARM_MS, cache = CacheService.getScriptCache();
  scheduleWarm_(CFG.WARM_EVERY_MIN);   // 다음 정기 예열을 먼저 예약 → 이번 실행이 6분 한도로 강제 종료돼도 예열 주기가 끊기지 않음(남은 건이 있으면 아래에서 2분 뒤로 교체)
  let put = 0, hit = 0, left = 0;
  try {
    const P = PropertiesService.getScriptProperties().getProperties();
    if (warmOne_(cache, 'meta', {}, P) === 'hit') hit++; else put++;
    const m = JSON.parse(api('meta', {})).data;
    const dv = m.dates.filter(d => d >= m.dailyFrom), latest = dv[dv.length - 1] || null;
    // 기본 기준일(전월말)·최근 영업일만 예열. 당월의 다른 일자는 처음 조회할 때 계산해 6시간 캐시
    //  (v13~v16 은 당월 전 일자를 5.5시간마다 다시 예열 → 하루 40~57분 사용, 무료 계정 트리거 한도 90분/일에 근접)
    const list = [];
    [m.defaultDate, latest].filter((d, i, a) => d && a.indexOf(d) === i).forEach(d => warmParams_(d, dv, m.months).forEach(x => list.push(x)));
    list.push(['race', { n: 20 }]);
    list.forEach(x => {
      if (Date.now() - t0 > limit) { left++; return; }
      try { if (warmOne_(cache, x[0], x[1], P) === 'hit') hit++; else put++; } catch (e) {}
    });
  } catch (e) { console.log('warmAll 오류: ' + e.message); }
  console.log('[warmAll] 계산 ' + put + '건 · 보존 연장 ' + hit + '건 · 잔여 ' + left + '건, ' + ((Date.now() - t0) / 1000).toFixed(0) + 's');
  if (left) scheduleWarm_(2);   // 남았으면 곧바로 이어서(아니면 처음에 예약한 5시간 뒤 정기 예열 유지)
}
/** 다음 예열 예약. v24: 시간대 제한 없이 min 분 뒤(1회성 트리거 cont_warmAll 하나만 유지) */
function scheduleWarm_(min) { scheduleContinue_('warmAll', min); }
function cont_warmAll() { warmAll(); }
function warmCache_() { scheduleContinue_('warmAll', 1); }   // 적재 직후: 별도 실행(자체 6분)으로 예열

/** 지수 시트 → 정렬된 [{d,k,s,n}] */
function indexSeries_() {
  return readAll_(sheet_(CFG.SHEET.INDEX, ['일자', 'KOSPI', 'S&P500', 'NASDAQ100']))
    .map(r => ({ d: r[0] instanceof Date ? fmt_(r[0]) : String(r[0]), k: toNum_(r[1]), s: toNum_(r[2]), n: toNum_(r[3]) }))
    .sort((a, b) => a.d < b.d ? -1 : 1);
}
/** 기준일 이하 가장 가까운 값 (각 지수별로 개별 탐색: 휴장일 상이) */
function nearestIndex_(series, date) {
  const out = { k: 0, s: 0, n: 0 };
  for (let i = series.length - 1; i >= 0; i--) {
    if (series[i].d > date) continue;
    if (!out.k && series[i].k) out.k = series[i].k;
    if (!out.s && series[i].s) out.s = series[i].s;
    if (!out.n && series[i].n) out.n = series[i].n;
    if (out.k && out.s && out.n) break;
  }
  return out;
}
