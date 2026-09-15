/**
 * Backfill.gs — 과거 데이터 백필 (시간 예산 초과 시 1분 후 자동 이어서 실행)
 *  - backfillMonthly : 2021-01 ~ (DAILY_FROM 직전 월) 월말 스냅샷. 거래대금 누적 컬럼은 공란
 *  - backfillDaily   : DAILY_FROM ~ 오늘 일별 (loadDaily 와 동일 로직)
 *  - backfillKospi   : 2021~ KOSPI 월말 종가 (+ 해외지수 stooq)
 */

function backfillMonthly() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) return;
  const ok = budget_(Date.now());
  try {
    const props = PropertiesService.getScriptProperties();
    const ctx = ctx_();
    const existing = monthlyBlocks_();
    const endMonth = ym_(fmt_(addDays_(parse_(CFG.DAILY_FROM), -1)));   // 일별 시작 직전 월
    let cursor = props.getProperty(PROP.BACKFILL_CURSOR) || CFG.MONTHLY_FROM;
    let [y, m] = cursor.split('-').map(Number);
    let done = false;

    while (ok()) {
      const key = y + '-' + ('0' + m).slice(-2);
      if (key > endMonth) { done = true; break; }
      if (!existing[key]) {
        const recs = lastTradingSnapshot_(y, m);
        if (recs) {
          ensureMaster_(recs, ctx, recs[0].date);
          const rows = recs.map(r => [r.date, r.code, r.name, mgrShortOf_(r.code, ctx, r.name), r.nav, r.trdval, '', '']);
          appendRows_(sheet_(CFG.SHEET.RAW_MONTHLY, CFG.RAW_HEADER), rows);
          log_('월말 백필 ' + key + ' (' + recs[0].date + ', ' + rows.length + '종목)');
        } else log_('월말 백필 ' + key + ' 데이터 없음', 'WARN');
      }
      m++; if (m > 12) { m = 1; y++; }
      props.setProperty(PROP.BACKFILL_CURSOR, y + '-' + ('0' + m).slice(-2));
    }
    if (done) {
      props.deleteProperty(PROP.BACKFILL_CURSOR);
      clearTriggers_('cont_backfillMonthly');
      rebuildAggregates_();
      log_('월말 백필 완료 → backfillDaily 를 실행하십시오');
    } else scheduleContinue_('backfillMonthly', 1);
  } finally { lock.releaseLock(); }
}

/** 해당 월의 마지막 거래일 스냅샷 (월말부터 최대 10일 역순 탐색) */
function lastTradingSnapshot_(y, m) {
  let d = monthEnd_(y, m);
  for (let i = 0; i < 10; i++) {
    if (!isWeekend_(d)) {
      const recs = fetchEtfDaily_(fmt_(d));
      if (recs.length) return recs;
    }
    d = addDays_(d, -1);
  }
  return null;
}

/** 일별 백필 = loadDaily 반복 (LAST_DAILY 기준으로 이어서). 완료 시 트리거 자동 정리 */
function backfillDaily() {
  loadDaily();
  const last = PropertiesService.getScriptProperties().getProperty(PROP.LAST_DAILY);
  const yesterday = fmt_(addDays_(parse_(new Date()), -1));
  if (last && last < yesterday && !isWeekend_(parse_(yesterday))) {
    // loadDaily 가 예산 초과로 스스로 예약했으면 중복 방지
    const pending = ScriptApp.getProjectTriggers().some(t => t.getHandlerFunction() === 'cont_loadDaily');
    if (!pending) scheduleContinue_('backfillDaily', 1);
  } else clearTriggers_('cont_backfillDaily');
}

/** 지수 전기간 백필: KOSPI·S&P500·NASDAQ100 을 Yahoo 에서 2021-01-01~오늘 일별로 받아 지수 시트 재작성 */
function backfillKospi() {
  const sh = sheet_(CFG.SHEET.INDEX, ['일자', 'KOSPI', 'S&P500', 'NASDAQ100']);
  const map = {};
  readAll_(sh).forEach(r => { const d = r[0] instanceof Date ? fmt_(r[0]) : String(r[0]); map[d] = { k: toNum_(r[1]), s: toNum_(r[2]), n: toNum_(r[3]) }; });
  mergeIndices_(map, CFG.MONTHLY_FROM + '-01', fmt_(new Date()));
  writeIndices_(sh, map);
  const n = Object.keys(map).length, nk = Object.keys(map).filter(d => map[d].k).length, ns = Object.keys(map).filter(d => map[d].s).length, nn = Object.keys(map).filter(d => map[d].n).length;
  rebuildAggregates_();   // agg_시장월별 의 지수 컬럼 갱신
  log_('지수 백필 완료: ' + n + '일 (KOSPI ' + nk + ', S&P500 ' + ns + ', NASDAQ100 ' + nn + ')');
}

/**
 * 보정: '전 종목 NAV 0' 일자(휴장일, 또는 순자산총액 게시 전에 적재된 당일분)를 raw_월말·raw_일별·agg_일별요약에서 제거하고
 * _index 재작성 → 마지막 정상 일자 기준으로 당월 스냅샷 재동기화 → 집계 재계산. (제거된 일자는 다음 loadDaily 에서 재적재됨.
 * 과거 월말이 제거된 경우 "3. 월말 백필 시작"으로 다시 채움) 대용량 시트 전체 읽기 없이 컬럼 단위·블록 단위로만 읽음
 */
function repairZeroDays() {
  const removed = { monthly: [], daily: [] };
  const delBlocks = (sh, blocks) => {   // blocks: [{start,count}] → 아래쪽부터 삭제
    blocks.sort((a, b) => b.start - a.start).forEach(b => sh.deleteRows(b.start, b.count));
  };
  const zeroNavDates = (sh, navCol) => {   // A(기준일자)/NAV 열만 읽어 NAV 합계 0인 일자의 블록 반환
    const lr = sh.getLastRow(), blk = {}, sum = {};
    if (lr < 2) return { dates: [], blk: blk };
    const a = sh.getRange(2, 1, lr - 1, 1).getValues(), e = sh.getRange(2, navCol, lr - 1, 1).getValues();
    a.forEach((v, i) => { const d = v[0] instanceof Date ? fmt_(v[0]) : String(v[0]); if (!blk[d]) blk[d] = { start: i + 2, count: 0 }; blk[d].count++; sum[d] = (sum[d] || 0) + toNum_(e[i][0]); });
    return { dates: Object.keys(sum).filter(d => sum[d] === 0).sort(), blk: blk };
  };
  // 1) raw_월말
  const shM = sheet_(CFG.SHEET.RAW_MONTHLY, CFG.RAW_HEADER), zm = zeroNavDates(shM, 5);
  removed.monthly = zm.dates; delBlocks(shM, zm.dates.map(d => zm.blk[d]));
  // 2) raw_일별: _index 블록별로 E 열만 읽어 판정
  const shD = sheet_(CFG.SHEET.RAW_DAILY, CFG.RAW_HEADER), ix = indexMap_();
  const zeroBlocks = [];
  Object.keys(ix).sort().forEach(d => {
    const b = ix[d];
    const e = shD.getRange(b.start, 5, b.count, 1).getValues();
    if (!e.some(r => toNum_(r[0]) > 0)) { removed.daily.push(d); zeroBlocks.push(b); }
  });
  // 3) agg_일별요약: NAV 0 일자 블록 제거 (제거된 일별 블록과 동일 일자)
  const shS = sheet_(CFG.SHEET.AGG_SNAP_D, CFG.SNAP_HEADER), zs = zeroNavDates(shS, CFG.SNAP_HEADER.indexOf('NAV') + 1);
  delBlocks(shS, zs.dates.map(d => zs.blk[d]));
  if (zeroBlocks.length) {
    delBlocks(shD, zeroBlocks);
    // _index 재작성: 삭제된 블록 이후의 시작행을 앞으로 당김
    const rows = Object.keys(ix).sort().filter(d => removed.daily.indexOf(d) < 0).map(d => {
      const shift = zeroBlocks.filter(z => z.start < ix[d].start).reduce((s, z) => s + z.count, 0);
      return [d, ix[d].start - shift, ix[d].count];
    });
    const shI = sheet_(CFG.SHEET.META, ['기준일자', '시작행', '행수']);
    shI.clearContents(); shI.getRange(1, 1, 1, 3).setValues([['기준일자', '시작행', '행수']]);
    if (rows.length) { shI.getRange(2, 1, rows.length, 1).setNumberFormat('@'); shI.getRange(2, 1, rows.length, 3).setValues(rows); PropertiesService.getScriptProperties().setProperty(PROP.LAST_DAILY, rows[rows.length - 1][0]); }
  }
  if (removed.monthly.length || removed.daily.length) {
    syncMonthly_(Date.now(), CFG.HARD_MS, false);   // 일별 데이터가 있는 월(당월 포함)은 마지막 정상 일자로 스냅샷 재생성
    rebuildAggregates_();
  }
  const pastM = removed.monthly.filter(d => !indexMap_()[d] && d < CFG.DAILY_FROM);
  log_('NAV 0 일자 제거: 월말 ' + (removed.monthly.join(',') || '없음') + ' / 일별 ' + (removed.daily.join(',') || '없음') + (pastM.length ? ' → "3. 월말 백필 시작"으로 해당 월 재적재 필요' : ''));
  return removed;
}
