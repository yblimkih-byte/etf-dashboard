/**
 * Util.gs — 날짜·숫자·시트 공용 유틸
 */
const TZ = 'Asia/Seoul';

function ss_() { return SpreadsheetApp.getActiveSpreadsheet(); }

function sheet_(name, header) {
  const ss = ss_();
  let sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    if (header) { sh.getRange(1, 1, 1, header.length).setValues([header]); sh.setFrozenRows(1); }
  }
  return sh;
}

/** 'YYYY-MM-DD' ↔ Date ↔ 'YYYYMMDD' */
function fmt_(d) { return Utilities.formatDate(d, TZ, 'yyyy-MM-dd'); }
function fmtKrx_(d) { return Utilities.formatDate(d, TZ, 'yyyyMMdd'); }
function parse_(s) {               // 'YYYY-MM-DD' | 'YYYYMMDD' | Date
  if (s instanceof Date) return new Date(s.getFullYear(), s.getMonth(), s.getDate());
  s = String(s).replace(/[^0-9]/g, '');
  return new Date(+s.slice(0, 4), +s.slice(4, 6) - 1, +s.slice(6, 8));
}
function addDays_(d, n) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
function isWeekend_(d) { const w = d.getDay(); return w === 0 || w === 6; }
function ym_(s) { return String(s).slice(0, 7); }            // 'YYYY-MM'
function monthEnd_(y, m) { return new Date(y, m, 0); }        // m: 1~12
function toNum_(v) {
  if (v === null || v === undefined || v === '' || v === '-') return 0;
  const n = Number(String(v).replace(/,/g, ''));
  return isNaN(n) ? 0 : n;
}
function pick_(row, candidates) {
  for (const c of candidates) if (row[c] !== undefined) return row[c];
  return undefined;
}
/** 단축코드 6자리로 정규화. 표준코드(KR7069500007) 입력 시 3~9번째 자리 사용 */
function padCode_(c) {
  c = String(c === null || c === undefined ? '' : c).trim();
  if (/^KR7\d{9}$/.test(c)) return c.slice(3, 9);
  return c.length < 6 ? ('000000' + c).slice(-6) : c;
}
/** 단축코드 → 표준코드(ISIN). 체크디지트 계산 포함 */
function isinOf_(code6) {
  const base = 'KR7' + padCode_(code6) + '00';
  const digits = base.split('').map(ch => /\d/.test(ch) ? ch : String(ch.charCodeAt(0) - 55)).join('');
  let sum = 0, dbl = true;
  for (let i = digits.length - 1; i >= 0; i--) {
    let n = +digits[i]; if (dbl) { n *= 2; if (n > 9) n -= 9; } sum += n; dbl = !dbl;
  }
  return base + ((10 - (sum % 10)) % 10);
}

/** 시트에 행 일괄 추가 (마지막 행 다음). 반환: 시작 행 번호 */
function appendRows_(sh, rows) {
  if (!rows.length) return sh.getLastRow() + 1;
  const start = sh.getLastRow() + 1;
  sh.getRange(start, 1, rows.length, rows[0].length).setValues(rows);
  return start;
}

/** 헤더명 → 0-base 열 인덱스. names: {key: 헤더명}. 없는 열은 -1. width 는 마지막 열 번호 */
function hdrCols_(sh, names) {
  const lc = Math.max(sh.getLastColumn(), 1);
  const h = sh.getRange(1, 1, 1, lc).getValues()[0].map(v => String(v).trim());
  const out = { width: lc };
  Object.keys(names).forEach(k => out[k] = h.indexOf(names[k]));
  return out;
}
/** 헤더에 열이 없으면 끝에 추가하고 인덱스 반환 */
function ensureCol_(sh, cols, key, header) {
  if (cols[key] >= 0) return cols[key];
  sh.getRange(1, cols.width + 1).setValue(header);
  cols[key] = cols.width; cols.width++;
  return cols[key];
}

/** 시트 전체 데이터(헤더 제외) 읽기 */
function readAll_(sh) {
  const lr = sh.getLastRow(), lc = sh.getLastColumn();
  if (lr < 2) return [];
  return sh.getRange(2, 1, lr - 1, lc).getValues();
}

function log_(msg, level) {
  const sh = sheet_(CFG.SHEET.LOG, ['시각', '수준', '내용']);
  sh.appendRow([new Date(), level || 'INFO', String(msg).slice(0, 5000)]);
  if (sh.getLastRow() > 3000) sh.deleteRows(2, 1000);
  console.log(msg);
}

/** 시간 예산 체커 */
function budget_(startMs) { return () => (Date.now() - startMs) < CFG.BUDGET_MS; }

/** 다음 실행 예약: 'cont_<fn>' 이름의 1회성 트리거를 재생성 (매일 정기 트리거와 분리) */
function scheduleContinue_(fnName, minutes) {
  const name = 'cont_' + fnName;
  clearTriggers_(name);
  ScriptApp.newTrigger(name).timeBased().after((minutes || 1) * 60 * 1000).create();
}
/** 연속 실행 진입점 — 자기 트리거를 정리하고 본 함수 호출 */
function cont_loadDaily() { clearTriggers_('cont_loadDaily'); loadDaily(); }
function cont_backfillMonthly() { clearTriggers_('cont_backfillMonthly'); backfillMonthly(); }
function cont_backfillDaily() { clearTriggers_('cont_backfillDaily'); backfillDaily(); }
function cont_rebuildDailySummary() { clearTriggers_('cont_rebuildDailySummary'); rebuildDailySummary(); }
/** 단계 표식: 시트가 아닌 Cloud 로그(실행 기록)에 남김 → 시간 초과로 강제 종료돼도 어느 단계에서 멈췄는지 확인 가능 */
function step_(t0, name) { console.log('[step +' + ((Date.now() - t0) / 1000).toFixed(1) + 's] ' + name); }

/** 감시 트리거(v12): 적재 시작 시 1회성 'wd_loadDaily' 를 걸어 두고 정상 종료 시 해제.
 *  실행이 시간 초과 등으로 강제 종료되면 해제되지 못한 트리거가 WD_MIN 분 뒤 적재를 다시 시도(연속 WD_MAX 회까지) */
const WD = { FN: 'wd_loadDaily', MIN: 12, MAX: 3, PROP: 'WD_RETRY', RETRY_PROP: 'UNPUB_RETRY', RETRY_MIN: 90, RETRY_MAX: 3 };
function armWatchdog_() {
  const n = +(PropertiesService.getScriptProperties().getProperty(WD.PROP) || 0);
  clearTriggers_(WD.FN);
  if (n >= WD.MAX) { log_('감시 재시도 한도(' + WD.MAX + '회) 도달 → 다음 정기 실행까지 대기', 'WARN'); return; }
  ScriptApp.newTrigger(WD.FN).timeBased().after(WD.MIN * 60 * 1000).create();
}
function disarmWatchdog_() { clearTriggers_(WD.FN); PropertiesService.getScriptProperties().deleteProperty(WD.PROP); }
function wd_loadDaily() {
  clearTriggers_(WD.FN);
  const props = PropertiesService.getScriptProperties(), n = +(props.getProperty(WD.PROP) || 0) + 1;
  props.setProperty(WD.PROP, String(n));
  log_('직전 적재 실행이 비정상 종료됨(시간 초과 추정) → 재시도 ' + n + '/' + WD.MAX, 'WARN');
  loadDaily();
}
/** 전영업일분이 아직 미게시(빈 응답)일 때: 낮 시간(08~16시)에는 RETRY_MIN 분 뒤 재시도를 예약(하루 RETRY_MAX 회) → 19:00 까지 기다리지 않음
 *  v17: 게시 예정일(expect, 다음 KRX 영업일)이 오늘 이후면(휴장 기간) 재시도하지 않음 — 정기 실행(08:30/19:00)이 계속 확인 */
function scheduleUnpublishedRetry_(missingDate, expect) {
  const now = new Date(), hour = +Utilities.formatDate(now, TZ, 'H'), day = Utilities.formatDate(now, TZ, 'yyyy-MM-dd');
  if (hour < 8 || hour >= 16 || missingDate >= day) return;          // 당일분 미게시는 19:00 정기 실행 몫
  if (expect && expect > day) { console.log(missingDate + ' 자료 게시 예정일 ' + expect + ' (휴장) → 낮 재시도 생략'); return; }
  const props = PropertiesService.getScriptProperties(), cur = String(props.getProperty(WD.RETRY_PROP) || '').split(':');
  const n = cur[0] === day ? +cur[1] || 0 : 0;
  if (n >= WD.RETRY_MAX) return;
  props.setProperty(WD.RETRY_PROP, day + ':' + (n + 1));
  scheduleContinue_('loadDaily', WD.RETRY_MIN);
  log_(missingDate + ' 자료 미게시 → ' + WD.RETRY_MIN + '분 뒤 재시도 예약 (' + (n + 1) + '/' + WD.RETRY_MAX + ')');
}

/** v17: 적재 중 오류(KRX 연결 실패 등)로 끝났을 때 07~21시에는 30분 뒤 재시도(미게시 재시도와 합쳐 하루 RETRY_MAX 회) */
function retryAfterError_() {
  const now = new Date(), hour = +Utilities.formatDate(now, TZ, 'H'), day = Utilities.formatDate(now, TZ, 'yyyy-MM-dd');
  if (hour < 7 || hour >= 21) return;
  const props = PropertiesService.getScriptProperties(), cur = String(props.getProperty(WD.RETRY_PROP) || '').split(':');
  const n = cur[0] === day ? +cur[1] || 0 : 0;
  if (n >= WD.RETRY_MAX) return;
  props.setProperty(WD.RETRY_PROP, day + ':' + (n + 1));
  scheduleContinue_('loadDaily', 30);
  log_('적재 오류 → 30분 뒤 재시도 예약 (' + (n + 1) + '/' + WD.RETRY_MAX + ')', 'WARN');
}

// ─────────────────────────── KRX 영업일·적재 상태 (v17) ───────────────────────────

const DOW_KO = ['일', '월', '화', '수', '목', '금', '토'];
/** CFG.KRX_HOLIDAYS 에 있는 평일 휴장일이면 이름, 아니면 '' */
function krxHoliday_(ds) { return (CFG.KRX_HOLIDAYS && CFG.KRX_HOLIDAYS[ds]) || ''; }
/** ds 다음의 KRX 영업일(주말·휴장일 목록 제외) 'yyyy-MM-dd' */
function nextKrxDay_(ds) {
  let d = addDays_(parse_(ds), 1);
  for (let i = 0; i < 20 && (isWeekend_(d) || krxHoliday_(fmt_(d))); i++) d = addDays_(d, 1);
  return fmt_(d);
}
/** 'MM-DD(요일)' */
function mdDow_(ds) { return ds.slice(5) + '(' + DOW_KO[parse_(ds).getDay()] + ')'; }
/** 적재 상태 저장/조회 → apiMeta_ 응답(loadStatus)으로 화면 상단에 표시 */
function setLoadStatus_(o) {
  try { PropertiesService.getScriptProperties().setProperty(PROP.LOAD_STATUS, JSON.stringify(o)); } catch (e) { console.log('상태 저장 실패: ' + e.message); }
}
function loadStatus_() {
  try { return JSON.parse(PropertiesService.getScriptProperties().getProperty(PROP.LOAD_STATUS) || 'null'); } catch (e) { return null; }
}
/** 미게시 일자 설명: '09-23(수)분 KRX 미게시 — 추석 연휴(09-24~09-25) 휴장, 09-28(월) 오전 게시 예상' */
function pendingNote_(pending, expect, today) {
  const hol = [];
  for (let d = addDays_(parse_(pending), 1); fmt_(d) < expect; d = addDays_(d, 1)) { const h = krxHoliday_(fmt_(d)); if (h && !isWeekend_(d)) hol.push({ d: fmt_(d), h: h }); }
  let s = mdDow_(pending) + '분 KRX 미게시';
  if (expect > today) {
    if (hol.length) { const names = hol.map(x => x.h).filter((v, i, a) => a.indexOf(v) === i).join('·'); s += ' — ' + names + '(' + hol[0].d.slice(5) + (hol.length > 1 ? '~' + hol[hol.length - 1].d.slice(5) : '') + ') 휴장'; }
    s += (hol.length ? ', ' : ' — ') + mdDow_(expect) + ' 오전 게시 예상';
  } else s += ' — 게시 지연, 자동 재시도 중';
  return s;
}

function clearTriggers_(fnName) {
  ScriptApp.getProjectTriggers().forEach(t => { if (t.getHandlerFunction() === fnName) ScriptApp.deleteTrigger(t); });
}
