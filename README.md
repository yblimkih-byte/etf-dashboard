# ETF Dashboard

KRX Open API 기반 국내 ETF 시장 데이터를 Google 스프레드시트에 매일 적재하고, Google Apps Script 웹앱과 Vercel 웹 화면으로 대시보드(요약·개관·운용사·유형·상위 5개사·상위 ETF·신규상장·거래대금·테마 맵·종목→ETF 찾기·관심도)를 제공하는 프로젝트.

- 웹앱(배포 URL, 익명 접근): https://script.google.com/macros/s/AKfycbwF4iZ_1BilAMgSFAySTPrS8gaEOVdTQdMPE3QaVhEd--A38x1l9sQXJWIk_RXuHbO0dA/exec
- 데이터 시트: `ETF_Dashboard` (spreadsheetId `1Wlz32KuXGS8fnh8z5U1ZhuwQK7vQkVKre5nOdeJBd4U`)
- Apps Script 프로젝트: 시트에 바운드된 `ETF Dashboard` (scriptId 는 `.clasp.json`)
- 웹 화면(Vercel): https://etf-dashboard-roan.vercel.app/ (`web/` + `api/data.js`, Apps Script 웹앱을 데이터 서버로 사용)
- 현재 배포 버전: Apps Script v33 / Vercel v121 (2026-10-06) — 변경 내역은 `CHANGELOG.md`

## 저장소 구성

| 경로 | 내용 |
|---|---|
| `gas/` | Apps Script 소스 전체. **이 폴더가 Apps Script 프로젝트와 1:1 동기화 대상**(`clasp push/pull`) |
| `gas/Config.gs` | 시트명·컬럼·KRX API 경로·상위 5개사 색상 등 설정 |
| `gas/Util.gs` `Krx.gs` `Load.gs` `Backfill.gs` `Aggregate.gs` | 적재(ETL)·집계 서버 로직 |
| `gas/Api.gs` | 웹앱 진입점(`doGet`) 및 대시보드 데이터 API(`api(action, params)`) |
| `gas/Theme.gs` | 테마 맵: 종목명·기초지수명 키워드 규칙(사용자 수정 시트)으로 테마·상품구조·지역 분류 |
| `gas/Kis.gs` | 종목→ETF 찾기: 한국투자증권 Open API ETF 구성종목 주간 수집·검색 |
| `gas/Buzz.gs` | 관심도: NAVER API HUB(네이버 클라우드) 검색어 트렌드·뉴스 검색 일간 수집 |
| `gas/Setup.gs` | 스프레드시트 메뉴(API 키 설정, 백필, 보정 기능) |
| `gas/Index.html` `Style.html` `App.html` `Tabs.html` | 대시보드 화면(레이아웃·스타일·공용 코어·탭 정의) |
| `gas/appsscript.json` | 매니페스트(시간대 Asia/Seoul, 웹앱 익명 접근) |
| `docs/설치가이드.md` | 신규 설치·초기 적재·운영·문제 해결 |
| `docs/탭추가_가이드.md` | 대시보드 탭 추가 방법 |
| `docs/GitHub_유지관리_가이드.md` | **GitHub 기반 유지관리·배포 절차(단계별)** |
| `test/` | Apps Script 없이 로컬(Node + Playwright)에서 서버 코드 모의 실행·화면 렌더 검증 |
| `.clasp.json` `.claspignore` | clasp 설정(scriptId, 동기화 대상 = `gas/`) |
| `.github/workflows/` | main 브랜치 push 시 Apps Script 자동 반영(선택) |

## 빠른 시작 (유지관리자)

```bash
git clone <이 저장소 URL> && cd etf-dashboard
npm install -g @google/clasp
clasp login                       # 브라우저에서 Google 계정 승인 (yblim.kih@gmail.com)
clasp pull                        # Apps Script 현재 코드 → gas/ (저장소와 차이가 없어야 정상)
# ... gas/ 수정 ...
clasp push                        # gas/ → Apps Script
clasp deploy -i <배포ID> -d "v11: 변경 요약"   # 새 버전을 기존 URL 에 연결
```

세부 절차·주의사항은 `docs/GitHub_유지관리_가이드.md` 참조.

## 보안

- KRX 인증키는 코드에 없음. 스크립트 속성 `KRX_AUTH_KEY` 에만 저장(시트 메뉴 "1. API 키 설정")
- 한국투자증권 Open API·NAVER API HUB 키도 시트 메뉴로 직접 입력, 스크립트 속성에만 저장(시트·화면·저장소에 없음)
- `~/.clasprc.json`(Google OAuth 토큰)은 절대 커밋하지 않음(`.gitignore` 등록). GitHub Actions 사용 시 Secrets 에만 저장
