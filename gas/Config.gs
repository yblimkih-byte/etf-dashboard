/**
 * Config.gs — 전역 설정. 시트명·API·상위 운용사·색상 등 변경은 이 파일에서만.
 */
const CFG = {
  // ── 시트명 ─────────────────────────────────────────────
  SHEET: {
    TYPE_LEGEND: '범례_유형',      // 사용자 작성: 종목코드/ETF명/설정일/유형1~4/유형최종1/유형최종2/국내해외/신규상장용
    MGR_LEGEND: '범례_운용사',     // 사용자 작성: 운용사명/약식_한글/약식_정식/약식_상위/운용사명_상위
    RAW_DAILY: 'raw_일별',         // 2026-01-02 이후 매 영업일
    RAW_MONTHLY: 'raw_월말',       // 2021-01 이후 매월 말 영업일 스냅샷
    INDEX: '지수',                 // KOSPI / S&P500 / NASDAQ100 일자별
    INVESTOR: '투자자별순매수',    // (선택) data.krx.co.kr 웹 자료
    MASTER: 'ETF마스터',           // 자동: 종목코드/종목명/운용사명(정식)/상장일/기초시장/기초자산/출처
    META: '_index',                // raw_일별의 기준일자 → 시작행/행수 인덱스
    AGG_MARKET: 'agg_시장월별',
    AGG_MGR: 'agg_운용사월별',
    AGG_TYPE: 'agg_유형월별',
    AGG_MGR_TYPE: 'agg_운용사유형월별',
    AGG_TOP: 'agg_상위ETF월별',
    AGG_SNAP_M: 'agg_월말요약',      // 월말 스냅샷별 운용사×유형×국내해외 요약 (집계 재계산 시 전체 재작성)
    AGG_SNAP_D: 'agg_일별요약',      // 일별 적재일별 동일 요약 (적재 시 추가)
    LOG: '_log'
  },

  // raw 시트 공통 컬럼 (요청 사양)
  RAW_HEADER: ['기준일자', '종목코드', '종목명', '자산운용사', '순자산총액', '거래대금', '해당연도거래대금계', '해당월거래대금계'],

  // 범례_유형 컬럼 인덱스(0-base) — 사용자 시트 구조 그대로
  TYPE_COL: { CODE: 0, NAME: 1, LIST_DD: 2, T1: 3, T2: 4, T3: 5, T4: 6, F1: 7, F2: 8, DOM: 9, NEW: 10, CHECK: 11 },
  // 범례_운용사 컬럼 인덱스
  MGR_COL: { FULL: 0, KOR: 1, SHORT: 2, TOP: 3, TOP_FULL: 4 },

  // ── 데이터 범위 ────────────────────────────────────────
  MONTHLY_FROM: '2021-01',      // 월말 스냅샷 시작 월
  DAILY_FROM: '2026-01-02',     // 일별 적재 시작일

  // ── KRX Open API ───────────────────────────────────────
  KRX: {
    BASE: 'https://data-dbg.krx.co.kr/svc/apis',
    ETF_DAILY: '/etp/etf_bydd_trd',      // ETF 일별매매정보 (basDd)
    KOSPI_DAILY: '/idx/kospi_dd_trd',    // KOSPI 시리즈 일별시세
    KOSPI_NAME: '코스피',
    // 필드 후보(문서 표기가 바뀔 수 있어 첫 매칭 사용)
    F: {
      DATE: ['BAS_DD'],
      CODE: ['ISU_CD', 'ISU_SRT_CD'],
      NAME: ['ISU_NM', 'ISU_ABBRV'],
      NAV_TOT: ['INVSTASST_NETASST_TOTAMT', 'NETASST_TOTAMT', 'NAV_TOTAMT'],
      TRDVAL: ['ACC_TRDVAL', 'TRDVAL'],
      IDX_NM: ['IDX_NM'],
      IDX_CLS: ['CLSPRC_IDX', 'CLSPRC']
    }
  },

  // data.krx.co.kr (openAPI 미제공 자료) — bld 값은 브라우저 DevTools > Network 에서 확인 후 수정
  KRX_WEB: {
    URL: 'https://data.krx.co.kr/comm/bldAttendant/getJsonData.cmd',
    REFERER: 'https://data.krx.co.kr/contents/MDC/MDI/mdiLoader/index.cmd?menuId=MDC020103010901',
    // ETF 전종목 기본정보 (운용사·기초시장·기초자산 포함)
    BASIC_BLD: 'dbms/MDC/STAT/standard/MDCSTAT04601',
    BASIC_F: { CODE: 'ISU_SRT_CD', NAME: 'ISU_ABBRV', MGR: 'COM_ABBRV', LIST_DD: 'LIST_DD',
               MKT: 'IDX_MKT_CLSS_NM', ASSET: 'IDX_ASST_CLSS_NM', OBJ: 'ETF_OBJ_IDX_NM' },
    // ETF 투자자별 거래실적(개별종목) — 확인 후 사용. INVESTOR_ENABLED=false 이면 건너뜀
    INVESTOR_ENABLED: false,
    INVESTOR_BLD: 'dbms/MDC/STAT/standard/MDCSTAT04901',
    INVESTOR_PARAM_CODE: 'isuCd',   // 종목 전체코드(KR7xxxxxx) 파라미터명
    INVESTOR_F: { INVST: 'INVST_NM', NETBUY_VAL: 'NETBID_TRDVAL' }
  },

  // 해외지수: stooq 무료 CSV (키 불필요). 실패 시 '지수' 시트에 수동 입력 가능
  // 지수: Yahoo Finance chart API (키 불필요, Apps Script 에서 접근 확인). stooq 는 봇 차단으로 사용 불가
  YAHOO: { KOSPI: '^KS11', SP500: '^GSPC', NDX100: '^NDX', URL: 'https://query1.finance.yahoo.com/v8/finance/chart/{sym}?period1={p1}&period2={p2}&interval=1d' },
  // ETF마스터 헤더 (사용자 관리 열 포함). 코드는 헤더명으로 열을 찾음
  MASTER_HEADER: ['종목코드', '종목명', '운용사명', '브랜드', '상장일', '기초시장', '기초자산', '출처'],
  SNAP_HEADER: ['기준일자', '운용사', '상위구분', '유형최종2', '국내해외', 'NAV', '종목수'],

  // ── 상위 운용사 & 고유색 (약식_상위 값 기준) ─────────────
  TOP5: ['삼성', '미래', 'KB', '한투', '신한'],
  COLOR: { '삼성': '#2743C8', '미래': '#E0561A', 'KB': '#C9A000', '한투': '#7A4A1D', '신한': '#2A9DF4', '기타': '#8A8A96' },

  // 브랜드 접두어 → 운용사명(범례_운용사 '운용사명'과 일치해야 함). 웹 조회 실패·상장폐지 종목의 운용사 보완용
  BRAND_MAP: {
    'KODEX': '삼성자산운용', 'TIGER': '미래에셋자산운용', 'RISE': '케이비자산운용', 'KBSTAR': '케이비자산운용',
    'ACE': '한국투자신탁운용', 'KINDEX': '한국투자신탁운용', 'SOL': '신한자산운용', 'KIWOOM': '키움투자자산운용',
    'KOSEF': '키움투자자산운용', '히어로즈': '키움투자자산운용', 'HANARO': '엔에이치아문디자산운용',
    'PLUS': '한화자산운용', 'ARIRANG': '한화자산운용', 'KoAct': '삼성액티브자산운용', 'TIMEFOLIO': '타임폴리오자산운용',
    'UNICORN': '현대자산운용', 'WON': '우리자산운용', '1Q': '하나자산운용', 'BNK': '비엔케이자산운용',
    '파워': '교보악사자산운용', '마이티': '디비자산운용', 'TREX': '유리에셋', 'KCGI': '케이씨지아이자산운용',
    'DAISHIN343': '대신자산운용', 'HK': '흥국자산운용', '에셋플러스': '에셋플러스자산운용', '마이다스': '마이다스에셋',
    'TRUSTON': '트러스톤자산운용', 'ITF': '아이비케이자산운용', 'VITA': '브이아이자산운용',
    // 구 브랜드 (상장폐지·리브랜딩 종목)
    'SMART': '신한자산운용', 'WOORI': '우리자산운용', '대신343': '대신자산운용', '흥국': '흥국자산운용', '네비게이터': '한국투자신탁운용'
  },

  // 유형 축 (범례_유형 '유형최종2' 값 순서)
  TYPE_ORDER: ['국내주식형', '해외주식형', '채권형', '파생형', '혼합채권형', '기타'],

  // 실행 예산(ms): Apps Script 1회 실행 6분 한도 대비 여유
  BUDGET_MS: 3 * 60 * 1000,     // 적재 루프 예산 (이후 월말 동기화·트리거 예약 시간 확보)
  PRE_SYNC_MS: 2 * 60 * 1000,   // 실행 시작 시 이월된 월말 갱신에 쓸 수 있는 시한
  HARD_MS: 4 * 60 * 1000,       // 루프 후 월말 동기화 시작 가능 시한
  SAFE_MS: 5.2 * 60 * 1000,     // 이 시점 전에 끝날 수 없는 작업은 시작하지 않음 (6분 한도)
  SYNC_COST_MS: 100 * 1000,     // 월말 스냅샷 1개월 갱신 예상 소요(측정 전 초기값)
  AGG_START_MS: 2.5 * 60 * 1000, // 이 시점을 넘기면 집계 재계산은 다음 회차로
  WARM_MS: 5.0 * 60 * 1000,      // 집계 후 API 캐시 예열 허용 시한
  TOP_N: 50
};

/** Script Properties 키 */
const PROP = { KRX_KEY: 'KRX_AUTH_KEY', LAST_DAILY: 'LAST_DAILY_DATE', BACKFILL_CURSOR: 'BACKFILL_CURSOR', SNAP_CURSOR: 'SNAP_CURSOR', PENDING_AGG: 'PENDING_AGG', CACHE_VER: 'CACHE_VER' };

function krxKey_() {
  const k = PropertiesService.getScriptProperties().getProperty(PROP.KRX_KEY);
  if (!k) throw new Error('KRX_AUTH_KEY 미설정: 메뉴 [ETF Dashboard] > [1. API 키 설정] 실행');
  return k;
}
