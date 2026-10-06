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
    .addItem('시트 빈 열 정리 (셀 한도 여유 확보)', 'trimRawColumns')
    .addItem('README 시트 갱신 (시트·탭 안내)', 'writeReadme')
    .addItem('범례_유형 유형최종3 갱신', 'syncTypeF3')
    .addSeparator()
    .addItem('테마 분류 검수표 (범례_테마 규칙 반영)', 'menuThemeReview')
    .addItem('기초지수명 채우기 (테마 분류용, 1회)', 'menuFillIndexNames')
    .addItem('KIS Open API 키 설정 (종목→ETF 찾기)', 'setKisKey')
    .addItem('KIS 연결 테스트', 'menuTestKis')
    .addItem('구성종목 수집 (지금, KIS — 국내 상장 상위 30)', 'menuCollectHoldings')
    .addItem('구성종목 수집 버튼(FunETF — 해외 주식 포함) 만들기', 'menuFunButton')
    .addItem('네이버 API 키 설정 (관심도)', 'setNaverKey')
    .addItem('네이버 연결 테스트', 'menuTestNaver')
    .addItem('관심도 수집 (지금)', 'menuCollectBuzz')
    .addToUi();
}

function setApiKey() {
  const ui = SpreadsheetApp.getUi();
  const r = ui.prompt('KRX Open API 인증키', 'AUTH_KEY 를 입력하세요', ui.ButtonSet.OK_CANCEL);
  if (r.getSelectedButton() !== ui.Button.OK) return;
  PropertiesService.getScriptProperties().setProperty(PROP.KRX_KEY, r.getResponseText().trim());
  ui.alert('저장되었습니다.');
}

/** v29: 키 입력(사용자가 직접) — 값은 스크립트 속성에만 저장, 화면·시트에 표시하지 않음 */
function askSecrets_(title, fields) {
  const ui = SpreadsheetApp.getUi(), props = PropertiesService.getScriptProperties(), vals = {};
  for (let i = 0; i < fields.length; i++) {
    const has = !!props.getProperty(fields[i][0]);
    const r = ui.prompt(title, fields[i][1] + (has ? ' (이미 저장됨 — 비워 두고 확인하면 유지)' : ''), ui.ButtonSet.OK_CANCEL);
    if (r.getSelectedButton() !== ui.Button.OK) return false;
    vals[fields[i][0]] = r.getResponseText().trim();
  }
  Object.keys(vals).forEach(k => { if (vals[k]) props.setProperty(k, vals[k]); });
  ui.alert('저장되었습니다.');
  return true;
}
function setKisKey() {
  if (!askSecrets_('한국투자증권 Open API', [[PROP.KIS_KEY, 'App Key 를 입력하세요'], [PROP.KIS_SECRET, 'App Secret 을 입력하세요']])) return;
  PropertiesService.getScriptProperties().deleteProperty(PROP.KIS_TOKEN);   // 키가 바뀌었을 수 있으므로 토큰 새로 발급
  installHoldingsTrigger_(); scheduleContinue_('collectHoldings', 1);
  notify_('구성종목 첫 수집을 1분 뒤 시작합니다(약 3~10분). 이후 매주 월요일 07시대 자동 수집 · 끝나면 화면에 \'종목→ETF 찾기\' 탭이 나타납니다.');
}
function setNaverKey() {
  if (!askSecrets_('NAVER API HUB (네이버 클라우드 — 검색어 트렌드·뉴스)', [[PROP.NAVER_ID, 'Client ID 를 입력하세요'], [PROP.NAVER_SECRET, 'Client Secret 을 입력하세요']])) return;
  installBuzzTrigger_(); scheduleContinue_('collectBuzz', 1);
  notify_('관심도 첫 수집을 1분 뒤 시작합니다(약 2~5분). 이후 매일 07시대 자동 수집 · 끝나면 화면에 \'관심도\' 탭이 나타납니다.');
}
function menuCollectHoldings() { PropertiesService.getScriptProperties().setProperty('KIS_PDF_FORCE', '1'); scheduleContinue_('collectHoldings', 1); notify_('KIS 구성종목 수집을 1분 뒤 시작합니다(진행·결과는 _log 시트). FunETF 로 반영한 자료(해외 주식 포함)는 KIS 자료(국내 상장 상위 30)로 바뀝니다.'); }   // v34: 메뉴는 강제 수집
/** v34: FunETF 화면에서 누를 즐겨찾기 버튼(북마클릿) — 구글 서버는 FunETF 접속이 막혀 브라우저가 받아 웹앱으로 보냄.
 *  버튼 코드는 '구성종목_버튼' 시트 A3 에 씀(대화상자(HtmlService)는 권한 범위가 늘어 쓰지 않음) */
function menuFunButton() {
  const code = funBookmarklet_(false), ss = ss_();
  let sh = ss.getSheetByName(FUN.SHEET); if (!sh) sh = ss.insertSheet(FUN.SHEET);
  sh.getRange(1, 1, Math.max(sh.getLastRow(), 3), 1).clearContent();
  sh.getRange(1, 1, 3, 1).setValues([
    ['ETF 구성종목 반영 버튼(FunETF — 해외 주식 포함): 아래 A3 셀 내용을 모두 복사해 브라우저에서 새 북마크를 만들고 URL(주소) 칸에 붙여 넣으세요. 이름은 예: ETF 구성종목 반영'],
    ['사용: 매주 월요일 이후 www.funetf.co.kr 아무 화면에서 그 북마크를 누르면 오른쪽 아래에 진행 상황이 나오며 10분 안팎 걸립니다. 그동안 그 탭을 닫거나 다른 탭으로 옮기지 마세요(뒤로 가면 브라우저가 속도를 크게 늦춥니다). 끝나면 종목→ETF 찾기에서 해외 주식도 검색됩니다. 이 버튼에는 비밀 값이 들어 있으니 공유하지 마세요.'],
    [code]]);
  try { sh.setColumnWidth(1, 900); sh.getRange(1, 1, 3, 1).setWrap(true); ss.setActiveSheet(sh); sh.setActiveSelection('A3'); } catch (e) {}   // 화면 정리(실패해도 무관)
  notify_('구성종목_버튼 시트 A3 셀의 내용을 복사해 브라우저 새 북마크의 URL 칸에 붙여 넣으세요.\n이후 매주 월요일 이후 www.funetf.co.kr 화면에서 그 북마크를 누르면 반영됩니다(10분 안팎, 그 탭을 앞에 둔 채 기다리기).');
}
function menuCollectBuzz() { scheduleContinue_('collectBuzz', 1); notify_('관심도 수집을 1분 뒤 시작합니다(결과는 _log 시트).'); }
function menuTestKis() { notify_(testKis().join('\n')); }
function menuTestNaver() { notify_(testNaver().join('\n').slice(0, 1500)); }
/** v29: 메뉴 — 테마 분류 검수표 작성 + 테마 맵 캐시 갱신 */
function menuThemeReview() {
  const r = buildThemeReview();
  notify_('테마 분류 검수표 작성 완료\n기준일 ' + r.date + ' · ' + r.n + '종목 (기타 주식 ' + r.etc + '종목)\n시트: ' + THEME.REVIEW + ' — 분류를 바꾸려면 ' + THEME.SHEET + ' 시트의 키워드를 고친 뒤 이 메뉴를 다시 실행'
    + (r.bad.length ? '\n해석할 수 없는 키워드: ' + r.bad.join(', ') : ''));
}
/** v29: 메뉴 — 기초지수명 채우기 */
function menuFillIndexNames() {
  const r = fillIndexNames();
  notify_('기초지수명 채우기: ' + r.updated + '종목 갱신 · 남은 빈칸 ' + r.left + '종목 (조회 시점 ' + r.dates.join(', ') + ')' + (r.left ? '\n남은 종목은 오래전 상장폐지 종목일 수 있음(종목명으로만 분류)' : ''));
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
  typeF3Col_(tl);   // v26: 유형최종3 열(머리글·메모)
  notify_('시트 준비 완료. 다음: 3. 월말 백필 시작');
}

function installTriggers() {
  clearTriggers_('loadDaily');
  ScriptApp.newTrigger('loadDaily').timeBased().everyDays(1).atHour(8).nearMinute(30).inTimezone(TZ).create();  // 08:30 KST (전영업일분)
  ScriptApp.newTrigger('loadDaily').timeBased().everyDays(1).atHour(19).nearMinute(0).inTimezone(TZ).create();  // 19:00 KST (당일분 게시 시)
  clearTriggers_('nightlyAgg');
  ScriptApp.newTrigger('nightlyAgg').timeBased().everyDays(1).atHour(5).nearMinute(10).inTimezone(TZ).create();  // v23: 05시대 집계 점검·범례 변경 시 전체 재계산
  notify_('매일 08:30 / 19:00 자동 적재 · 05시대 집계 점검 트리거 설치 완료');
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

// ─────────────────────────── README 시트 (v18) ───────────────────────────

const README = {
  SHEET: 'README', VER: 'v29',
  /* [시트명, 구분, 내용·주요 열, 갱신 방식, 사용하는 대시보드 탭] */
  SHEETS: [
    ['README', '안내', '이 시트. 시트별 역할과 대시보드 탭별 원천 설명', '메뉴 [ETF Dashboard] › README 시트 갱신 (코드 변경 시 자동 1회)', '-'],
    ['범례_유형', '사용자 작성 (자동 보강)', '종목코드 · ETF명 · 설정일 · 유형1~4 · 유형최종1 · 유형최종2 · 국내해외 · 신규상장용 · 확인필요 · 유형최종3(v26 자동 계산: 유형최종2, 단 파생형 중 신규상장용 채권/금리 → 채권형. 머리글 메모에 설명)', '사용자 관리. 신규 종목은 적재 시 규칙 기반 유형으로 자동 추가되고 확인필요 표시됨. 유형최종3은 신규 종목 추가·매일 05시대 점검 시 자동 갱신(직접 수정 대신 유형최종2·신규상장용 수정)', '유형최종2: 유형별 NAV(히트맵 포함) · 운용사별 M/S 변동 요인 · 상위 5개사·시장 유형 비중 — 유형별 NAV 합계 기준 / 유형최종3: 상위 ETF(목록 유형, 변천의 유형별 M/S 막대) · 신규상장 ETF(유형별 합계·목록) · 거래대금 목록 — 개별 종목 유형 표시 / 신규상장용: 채권/금리 구분(변천 회색·신규상장 채권/금리 제외)'],
    ['범례_운용사', '사용자 작성 (자동 보강)', '운용사명 · 브랜드 · 약식_한글 · 약식_정식 · 약식_상위 · 운용사명_상위', '사용자 관리. 처음 보는 운용사는 적재 시 자동 추가됨', '전 탭 — 운용사 약식명, 상위 5개사(삼성·미래·KB·한투·신한)/기타 구분과 고유색, 개별 운용사 선택 목록'],
    ['ETF마스터', '자동 적재', '종목코드 · 종목명 · 운용사명 · 브랜드 · 상장일 · 기초시장 · 기초자산 · 출처 · 기초지수(v29: KRX 기초지수명)', '일별 적재 시 신규 종목 추가·기초지수명 갱신. 메뉴 운용사 보정·상장일 보정·기초지수명 채우기로 보완', '전 탭(운용사 매칭) · 신규상장 ETF(상장일) · 유형별 NAV 히트맵(상장일 이후 증감) · 테마 맵(기초지수명으로 테마 분류)'],
    ['범례_테마', '사용자 수정 (v29, 없으면 기본 규칙으로 생성)', '순서 · 구분(상품구조/테마/지역) · 값 · 테마군 · 자산(전체/주식/채권) · 키워드 · 제외 키워드 · 찾는 곳(종목명/종목명·기초지수) · 메모 · 관심도 검색어. 구분별로 순서가 작은 행부터 검사해 처음 맞는 값 적용(키워드 문법은 키워드 머리글 메모)', '사용자 관리. 고친 뒤 메뉴 테마 분류 검수표 실행 → 화면 즉시 반영(야간 점검도 변경 감지)', '테마 맵(테마·상품구조·지역 분류) · 관심도(관심도 검색어)'],
    ['테마_분류검토', '자동 작성 (v29)', '테마군 · 테마 · 상품구조 · 지역 · 자산 · 종목코드 · 종목명 · 기초지수 · 운용사 · NAV(억원) — 최근 영업일 전 종목 분류 결과', '메뉴 테마 분류 검수표 실행 시 다시 작성(직접 수정해도 반영되지 않음 — 범례_테마를 고칠 것)', '-(검수용)'],
    ['구성종목', '자동 수집 (v29) · 버튼 반영 (v34)', 'ETF코드 · ETF명 · 구성종목코드(티커·종목코드) · 구성종목명 · 비중(%) · 평가금액(원) · ISIN · 출처(F = FunETF, K = 한국투자증권) — 최근 수집분만(수집 중에는 구성종목_수집중 시트에 쓰고 끝나면 교체)', 'FunETF 화면의 즐겨찾기 버튼(주 1회, 해외 주식 포함 전체 구성종목) · 매주 월요일 07시대 collectHoldings(한국투자증권 Open API, 국내 상장 상위 30 — FunETF 자료가 2주 이내면 건너뜀)', '종목→ETF 찾기'],
    ['범례_종목별칭', '사용자 수정 (v29, 없으면 기본값으로 생성)', '대표 표기 · 검색어(한글·영문·티커·종목코드, 쉼표 구분)', '사용자 관리 — 해외 종목 한/영 표기 등', '종목→ETF 찾기(검색어 확장)'],
    ['관심도', '자동 수집 (v29, 네이버 키 설정 시)', '구분(검색/뉴스/단어) · 대상 · 기간 · 값 — 검색 관심도(ETF 검색 = 100 환산 주간 지수) · 뉴스 기사 수(최근 7일·이전 7일) · ETF 뉴스 제목 단어 빈도', '매일 07시대 collectBuzz (NAVER API HUB 검색어 트렌드·뉴스 검색) · 메뉴 관심도 수집', '관심도'],
    ['raw_일별', '자동 적재', '2026-01-02 이후 매 영업일 전 종목: 기준일자 · 종목코드 · 종목명 · 자산운용사 · 순자산총액 · 거래대금 · 해당연도거래대금계 · 해당월거래대금계', '매일 08:30/19:00 loadDaily (KRX Open API ETF 일별매매정보, 전 영업일분)', '거래대금(누적 차분) · 일별 기준일 선택 시 상위 ETF · 유형별 NAV 히트맵 · 신규상장 ETF의 NAV / raw_월말·agg_* 의 원천'],
    ['raw_월말', '자동 적재', '2021-01 이후 월별 마지막 영업일 전 종목 스냅샷(당월은 최근 영업일). 열 구성은 raw_일별과 같음(2025년 이전 거래대금 누적 열은 공란)', '월말 백필(과거) · 일별 적재 시 해당 월 스냅샷 교체', '월말 기준일 선택 시 상위 ETF · 유형별 NAV 히트맵 · 신규상장 ETF의 NAV / 집계(agg_*) 원천'],
    ['_index', '시스템', 'raw_일별의 기준일자별 시작행 · 행수', '일별 적재 시 1행 추가', '전 탭 — 선택 가능한 일별 기준일 목록, raw_일별 블록 빠른 조회'],
    ['지수', '자동 적재', '일자 · KOSPI · S&P500 · NASDAQ100 (Yahoo Finance 일별 종가)', '일별 적재 뒤 최근 구간 갱신 · 메뉴 지수 백필', 'ETF 시장 개관(지수 비교) — agg_시장월별을 거쳐 사용'],
    ['agg_시장월별', '자동 집계', '월 · 기준일자 · 총NAV · 종목수 · KOSPI · S&P500 · NASDAQ100', '적재 후 바뀐 월만 갱신(이 시트를 마지막에 씀 = 완료 표식) · 범례 변경 시 전체 재계산', 'ETF 시장 개관 · 전 탭의 월말 기준일 목록·기본 기준일(전월말)·전월말/전년말 비교 기준일'],
    ['agg_운용사월별', '자동 집계', '월 · 운용사 · 상위구분 · NAV · 종목수', '적재 후 바뀐 월만 갱신 · 범례 변경 시 전체 재계산', '운용사별 NAV(월별 M/S 추이)'],
    ['agg_유형월별', '자동 집계', '월 · 유형최종1 · 유형최종2 · 국내해외 · NAV · 종목수', '적재 후 바뀐 월만 갱신 · 범례 변경 시 전체 재계산', '유형별 NAV(월별 유형 추이)'],
    ['agg_운용사유형월별', '자동 집계', '월 · 운용사 · 상위구분 · 유형최종2 · NAV', '적재 후 바뀐 월만 갱신 · 범례 변경 시 전체 재계산', '현재 대시보드 직접 사용 없음(분석용 보관)'],
    ['agg_상위ETF월별', '자동 집계', '월 · 순위 · 종목코드 · 종목명 · 운용사 · 상위구분 · NAV (월별 상위 50)', '적재 후 바뀐 월만 갱신 · 범례 변경 시 전체 재계산', '상위 ETF(NAV 상위 20 변천 · 상위 20 내 운용사별·유형별 M/S 막대)'],
    ['agg_월말요약', '자동 집계', '기준일자 · 운용사 · 상위구분 · 유형최종2 · 국내해외 · NAV · 종목수 (월말 스냅샷별)', '적재 후 바뀐 월만 갱신 · 범례 변경 시 전체 재계산', '월말 기준일 선택 시 운용사별 NAV · 유형별 NAV · 상위 5개사·시장 유형 비중'],
    ['agg_일별요약', '자동 적재', 'agg_월말요약과 같은 구성의 일별 요약(적재일마다 추가)', '일별 적재 시 추가 · 메뉴 일별 요약 재작성', '일별 기준일 선택 시 운용사별 NAV · 유형별 NAV · 상위 5개사·시장 유형 비중'],
    ['투자자별순매수', '선택 기능(미사용)', '기준일자 · 운용사 · 투자자 · 순매수대금', 'Config.gs KRX_WEB.INVESTOR_ENABLED=true 일 때만 적재(현재 false)', '현재 사용 없음'],
    ['_log', '시스템', '시각 · 수준(INFO/WARN/ERROR) · 내용 — 적재·보정·집계 실행 기록', '실행 시 자동 추가(3,000행 초과 시 오래된 1,000행 삭제)', '-(점검용)']
  ],
  /* [탭, 화면 구성, API(action), 원천 시트] */
  TABS: [
    ['공통(머리글·기준일 선택)', '최종 적재일 · 적재 상태(미게시 사유 등) · 기준일/연도/구간 선택 · 첫 화면 묶음(meta + 기본 기준일 탭 자료 중 캐시에 있는 것, Apps Script 화면은 페이지에 포함)', 'boot · meta', 'agg_시장월별 · _index · 범례_운용사 · 스크립트 속성(최종 적재일·적재 상태) · 응답 캐시'],
    ['요약', '지표 4개 · 핵심 요약 표(순위·격차, M/S 변동 요인(v26: 유형별 M/S 기여 상위 유형, v27: 반대 방향 0.1%p 이상이면 상쇄 요인), 시장 유형 이동, 한투 유형 구성, 신규상장) · 상위 5개사 NAV·M/S · 한투 유형 구성 vs 시장 · 한투 신규상장', 'byMgr · overview · byType · topEtf · newListings · shares', '각 탭과 같음(조회 6건 결합)'],
    ['ETF 시장 개관', '연도별 총 NAV · 당해 월별 NAV · 지수 대비 연초 이후 증감 · 요약 카드', 'overview', 'agg_시장월별(지수는 지수 시트에서 집계 시 반영)'],
    ['운용사별 NAV', '상위 5개사+기타 NAV·M/S·전월말/비교 기준 대비 증감 · M/S 변동 요인(v26: 유형별 M/S 기여 = (운용사 증감액 − 시장 증감액 × 비교 기준 M/S) ÷ 기준일 시장 NAV, 합계 = M/S 변동) · 월별 M/S 추이', 'byMgr', 'agg_일별요약 또는 agg_월말요약(기준일·전월말·전년말) · agg_운용사월별 · agg_시장월별'],
    ['유형별 NAV', '유형별·국내해외 NAV와 비중 · 유형별 ETF 히트맵(유형별 띠 > 운용사 > 종목)', 'byType · treemap', 'byType: agg_일별요약/agg_월말요약 · agg_유형월별 / treemap: raw_일별 또는 raw_월말(기준일·전년말) · ETF마스터 · 범례_유형 · 범례_운용사'],
    ['상위 5개사·시장 유형 비중', '시장 전체 · 상위 5개사 · 선택 운용사의 유형별 비중', 'shares', 'agg_일별요약 또는 agg_월말요약 · 범례_운용사(선택 목록)'],
    ['상위 ETF', '상위 20 막대 · NAV 상위 20 변천(월별)과 상위 20 내 운용사별·유형별 M/S 막대 · 상위 50 운용사별 요약·종목 목록', 'topEtf · race', 'topEtf: raw_일별 또는 raw_월말(기준일) · 범례_유형 · 범례_운용사 · ETF마스터 / race: agg_상위ETF월별 · 범례_유형(유형최종3·채권/금리 구분)'],
    ['신규상장 ETF', '연도별 신규상장 종목수·NAV · 운용사별·유형별 합계 · 종목 목록', 'newListings', 'ETF마스터(상장일) · 범례_유형(설정일·신규상장용 구분·유형최종3) · raw_일별 또는 raw_월말(기준일 NAV) · 범례_운용사'],
    ['거래대금', '구간(from~to) 거래대금 상위 50 · 운용사별 합계', 'turnover', 'raw_일별(해당연도거래대금계 차분) · _index · 범례_유형(유형최종3) · 범례_운용사'],
    ['테마 맵 (v29)', '테마(또는 상품구조)별 NAV·증감·1위 운용사·한투 점유율 · 사분면(증감액 × 한투 점유율) · 테마 상세(운용사별 2행 막대·종목 목록) · 보기·자산·지역·레버리지 제외 선택', 'theme', 'raw_일별 또는 raw_월말(기준일·비교 기준일) · 범례_테마 · ETF마스터(기초지수·상장일) · 범례_유형(채권·금리 구분·국내해외) · 범례_운용사'],
    ['종목→ETF 찾기 (v29, 수집 후 표시)', '종목명·코드·별칭으로 그 종목을 담은 ETF 목록(비중·보유 평가액) · 많이 담긴 종목', 'holders', '구성종목 · 범례_종목별칭 · raw_일별(최근 영업일 NAV) · 범례_운용사'],
    ['관심도 (v29, 수집 후 표시)', '테마별 검색 관심도(주간)·뉴스 기사 수 변화 · 테마 맵 NAV 증감과 비교 · ETF 뉴스 새 단어', 'buzz (+ theme)', '관심도 · 범례_테마(관심도 검색어·키워드)']
  ],
  FLOW: [
    '적재: KRX Open API(ETF 일별매매정보) → raw_일별 · _index · agg_일별요약 → raw_월말(해당 월 스냅샷) → 지수 갱신 → 집계 갱신(스냅샷 일자·지수가 agg_시장월별과 다른 월만 agg_* 6개 시트의 해당 월 행 교체, agg_시장월별을 마지막에 씀)',
    '일정: 매일 08:30 · 19:00 자동 실행. D일분은 KRX가 다음 영업일 오전에 게시하므로 보통 다음 날 08:30 실행에서 적재됨. 휴장일(Config.gs KRX_HOLIDAYS)은 건너뜀',
    '점검·복구: 모든 적재 실행(새 자료가 없어도)이 raw_월말 스냅샷 일자·지수와 agg_시장월별을 비교해 어긋난 월을 다시 집계 → 실행이 시간 초과로 끊겨도 감시 재시도(12분 뒤)·다음 실행에서 자동 복구. 매일 05시대 점검: 범례(범례_유형·범례_운용사·ETF마스터)가 바뀌었으면 전체 재계산(약 3분 단위 분할 실행)',
    '화면·캐시: 두 화면(Apps Script 웹앱, Vercel)은 같은 API를 사용. 응답 캐시(6시간) — 기준일 조회는 그 기준일 이하 월의 자료가 바뀔 때만, meta·변천은 적재·집계마다 새로 계산. 큰 응답(히트맵·변천)은 압축 저장. 5시간마다(밤낮 없이) 예열해 캐시 보존 기간을 연장 → 만료로 느려지는 시간대 없음. 범례·마스터 수정은 05시대 야간 점검에서 반영(즉시 반영: 메뉴 집계 재계산)',
    '수동 작업: 시트 메뉴 [ETF Dashboard] — 오늘분 수동 적재 · 집계 재계산 · 운용사/상장일 보정 · NAV 0 일자 보정 · 일별 요약 재작성 · 시트 빈 열 정리 · README 시트 갱신 · 범례_유형 유형최종3 갱신 · (v29) 테마 분류 검수표 · 기초지수명 채우기 · KIS/네이버 키 설정·연결 테스트·지금 수집',
    '외부 API 키(v29): KRX·한국투자증권·네이버 키는 메뉴로 직접 입력(스크립트 속성에만 저장, 시트·화면에 표시하지 않음). 종목→ETF 찾기·관심도 탭은 첫 수집이 끝난 뒤에만 화면에 나타남',
    '주의: 범례_유형·범례_운용사는 사용자 작성 시트이므로 열 순서를 바꾸지 말 것. raw_* · agg_* · _index 는 자동 생성 시트이므로 직접 수정하지 말 것'
  ]
};

/** README 시트 작성(맨 앞). 흰 바탕·검은 글자·선만 사용. 각 시트의 현재 행 수를 함께 기록하고, 목록에 없는 시트는 '설명 없음'으로 표시 */
function writeReadme() {
  const ss = ss_(), R = README, W = 7;
  let sh = ss.getSheetByName(R.SHEET);
  if (!sh) sh = ss.insertSheet(R.SHEET, 0);
  sh.getRange(1, 1, sh.getMaxRows(), sh.getMaxColumns()).breakApart();
  sh.clear(); sh.setFrozenRows(0);
  const known = {};
  R.SHEETS.forEach(x => known[x[0]] = x);
  const names = R.SHEETS.map(x => x[0]).concat(ss.getSheets().map(s => s.getName()).filter(n => !known[n]));
  const sheetRows = names.map((n, i) => {
    const s = ss.getSheetByName(n), k = known[n] || [n, '기타', '설명 없음(사용자 추가 시트로 추정)', '-', '-'];
    return [i + 1, n, k[1], k[2], k[3], k[4], s ? (n === R.SHEET ? '-' : Math.max(0, s.getLastRow() - 1)) : '(없음)'];
  });
  const tabRows = R.TABS.map((x, i) => [i + 1, x[0], x[2], x[1], x[3], '', '']);
  const flowRows = R.FLOW.map((x, i) => [i + 1, x, '', '', '', '', '']);
  const pad = a => a.concat(Array(W - a.length).fill(''));
  const now = Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd HH:mm');
  const grid = [
    pad(['ETF Dashboard — 시트 안내 (README)']),
    pad(['작성 ' + now + ' · 최종 적재 ' + (PropertiesService.getScriptProperties().getProperty(PROP.LAST_DAILY) || '-') + ' · 행 수는 작성 시점 기준(머리글 제외)']),
    pad([]),
    pad(['1. 시트별 역할'])];
  const t1 = grid.length + 1;
  grid.push(['순번', '시트명', '구분', '내용 · 주요 열', '갱신 방식', '사용하는 대시보드 탭', '행 수']);
  sheetRows.forEach(x => grid.push(x));
  grid.push(pad([]), pad(['2. 대시보드 탭별 원천']));
  const t2 = grid.length + 1;
  grid.push(['순번', '탭', 'API(action)', '화면 구성', '원천 시트', '', '']);
  tabRows.forEach(x => grid.push(x));
  grid.push(pad([]), pad(['3. 데이터 흐름 · 운영']));
  const t3 = grid.length + 1;
  flowRows.forEach(x => grid.push(x));
  const n = grid.length;
  if (sh.getMaxRows() < n) sh.insertRowsAfter(sh.getMaxRows(), n - sh.getMaxRows());
  if (sh.getMaxColumns() < W) sh.insertColumnsAfter(sh.getMaxColumns(), W - sh.getMaxColumns());
  sh.getRange(1, 1, n, W).setValues(grid);
  // 서식: 흰 바탕·검은 글자·선만 (음영·색 없음)
  sh.getRange(1, 1, n, W).setFontColor('#000000').setBackground(null).setVerticalAlignment('top').setWrap(true).setFontSize(10);
  sh.getRange(1, 1).setFontSize(14).setFontWeight('bold');
  [t1 - 1, t2 - 1, t3 - 1].forEach(x => sh.getRange(x, 1).setFontSize(11).setFontWeight('bold'));
  const line = (row, rowsN) => sh.getRange(row, 1, rowsN, W).setBorder(true, true, true, true, true, true, '#000000', SpreadsheetApp.BorderStyle.SOLID);
  sh.getRange(t2, 5, tabRows.length + 1, 3).mergeAcross();
  sh.getRange(t3, 2, flowRows.length, 6).mergeAcross();
  line(t1, sheetRows.length + 1); line(t2, tabRows.length + 1); line(t3, flowRows.length);
  [t1, t2].forEach(x => sh.getRange(x, 1, 1, W).setFontWeight('bold').setHorizontalAlignment('center'));
  [[t1, sheetRows.length], [t2, tabRows.length], [t3, flowRows.length]].forEach(x => sh.getRange(x[0], 1, x[1] + 1, 1).setHorizontalAlignment('center'));
  sh.getRange(t1 + 1, 7, sheetRows.length, 1).setHorizontalAlignment('right').setNumberFormat('#,##0');
  [48, 150, 130, 360, 260, 340, 70].forEach((w, i) => sh.setColumnWidth(i + 1, w));
  if (sh.getMaxColumns() > W) sh.deleteColumns(W + 1, sh.getMaxColumns() - W);
  if (sh.getMaxRows() > n + 2) sh.deleteRows(n + 3, sh.getMaxRows() - n - 2);
  sh.setHiddenGridlines(true);
  ss.setActiveSheet(sh); ss.moveActiveSheet(1);
  PropertiesService.getScriptProperties().setProperty(PROP.README_VER, R.VER);
  log_('README 시트 갱신 (' + sheetRows.length + '개 시트, ' + tabRows.length + '개 탭)');
}
