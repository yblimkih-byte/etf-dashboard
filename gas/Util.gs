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
function clearTriggers_(fnName) {
  ScriptApp.getProjectTriggers().forEach(t => { if (t.getHandlerFunction() === fnName) ScriptApp.deleteTrigger(t); });
}
