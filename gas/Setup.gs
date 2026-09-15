/**
 * Setup.gs — 스프레드시트 메뉴 및 초기 설정
 */
function onOpen() {
  SpreadsheetApp.getUi().createMenu('ETF Dashboard')
    .addItem('1. API 키 설정', 'setApiKey')
    .addItem('2. 시트 생성(초기화)', 'setupSheets')
    .addItem('3. 월말 백필 시작 (2021~)', 'backfillMonthly')
    .addItem('4. 일별 백필 시작 (DAILY_FROM~)', 'backfillDaily')
    .addItem('5. 지수 백필', 'backfillKospi')
    .addItem('6. 매일 자동 적재 트리거 설치', 'installTriggers')
    .addSeparator()
    .addItem('오늘분 수동 적재', 'loadDaily')
    .addItem('집계 재계산', 'rebuildAggregates')
    .addItem('API 연결 테스트', 'testKrx')
    .addItem('백필 중단(트리거 제거)', 'stopBackfill')
    .addItem('NAV 0 일자 보정 (휴장일·미게시분 제거)', 'repairZeroDays')
    .addItem('운용사 보정 (범례_운용사 반영)', 'repairUnknownMgr')
    .addItem('상장일 보정 (최초 등장일)', 'repairListDates')
    .addItem('일별 요약 재작성', 'rebuildDailySummary')
    .addToUi();
}

function setApiKey() {
  const ui = SpreadsheetApp.getUi();
  const r = ui.prompt('KRX Open API 인증키', 'AUTH_KEY 를 입력하세요', ui.ButtonSet.OK_CANCEL);
  if (r.getSelectedButton() !== ui.Button.OK) return;
  PropertiesService.getScriptProperties().setProperty(PROP.KRX_KEY, r.getResponseText().trim());
  ui.alert('저장되었습니다.');
}

function setupSheets() {
  const S = CFG.SHEET;
  sheet_(S.RAW_DAILY, CFG.RAW_HEADER); sheet_(S.RAW_MONTHLY, CFG.RAW_HEADER);
  sheet_(S.MASTER, CFG.MASTER_HEADER);
  sheet_(S.AGG_SNAP_D, CFG.SNAP_HEADER);
  sheet_(S.META, ['기준일자', '시작행', '행수']);
  sheet_(S.INDEX, ['일자', 'KOSPI', 'S&P500', 'NASDAQ100']);
  sheet_(S.INVESTOR, ['기준일자', '운용사', '투자자', '순매수대금']);
  sheet_(S.LOG, ['시각', '수준', '내용']);
  // 종목코드 컬럼은 텍스트 서식(선행 0 보존)
  [S.RAW_DAILY, S.RAW_MONTHLY, S.MASTER].forEach(n => sheet_(n).getRange('B:B').setNumberFormat('@'));
  sheet_(S.MASTER).getRange('A:A').setNumberFormat('@');
  const tl = sheet_(S.TYPE_LEGEND); tl.getRange('A:A').setNumberFormat('@');
  if (tl.getLastColumn() < 12) tl.getRange(1, 12).setValue('확인필요');
  notify_('시트 준비 완료. 다음: 3. 월말 백필 시작');
}

function installTriggers() {
  clearTriggers_('loadDaily');
  ScriptApp.newTrigger('loadDaily').timeBased().everyDays(1).atHour(8).nearMinute(30).inTimezone(TZ).create();  // 08:30 KST (전영업일분)
  ScriptApp.newTrigger('loadDaily').timeBased().everyDays(1).atHour(19).nearMinute(0).inTimezone(TZ).create();  // 19:00 KST (당일분 게시 시)
  notify_('매일 08:30 / 19:00 자동 적재 트리거 설치 완료');
}

function stopBackfill() { clearTriggers_('cont_backfillMonthly'); clearTriggers_('cont_backfillDaily'); PropertiesService.getScriptProperties().deleteProperty(PROP.BACKFILL_CURSOR); }

/** API 연결 확인: 최근 영업일 ETF 건수 + 첫 레코드 필드명 */
function testKrx() {
  let d = addDays_(parse_(new Date()), -1), msg = '';
  for (let i = 0; i < 7; i++) {
    if (!isWeekend_(d)) {
      const raw = krxGet_(CFG.KRX.ETF_DAILY, { basDd: fmtKrx_(d) });
      if (raw.length) { msg = fmt_(d) + ': ' + raw.length + '종목\n필드: ' + Object.keys(raw[0]).join(', '); break; }
    }
    d = addDays_(d, -1);
  }
  notify_(msg || '최근 7일 응답 없음 — 키/서비스 승인 확인');
}

/** UI 가 있으면 알림창, 없으면(편집기·트리거 실행) 로그 */
function notify_(msg) {
  try { SpreadsheetApp.getUi().alert(msg); } catch (e) { log_(msg); }
}
