# ETF Dashboard

KRX Open API 기반 국내 ETF 시장 데이터를 Google 스프레드시트에 매일 적재하고, Google Apps Script 웹앱으로 대시보드(7개 탭)를 제공하는 프로젝트.

- 웹앱(배포 URL, 익명 접근): https://script.google.com/macros/s/AKfycbwF4iZ_1BilAMgSFAySTPrS8gaEOVdTQdMPE3QaVhEd--A38x1l9sQXJWIk_RXuHbO0dA/exec
- 데이터 시트: `ETF_Dashboard` (spreadsheetId `1Wlz32KuXGS8fnh8z5U1ZhuwQK7vQkVKre5nOdeJBd4U`)
- Apps Script 프로젝트: 시트에 바운드된 `ETF Dashboard` (scriptId 는 `.clasp.json`)
- 현재 배포 버전: v10 (2026-09-15)

## 저장소 구성

| 경로 | 내용 |
|---|---|
| `gas/` | Apps Script 소스 전체. **이 폴더가 Apps Script 프로젝트와 1:1 동기화 대상**(`clasp push/pull`) |
| `gas/Config.gs` | 시트명·컬럼·KRX API 경로·상위 5개사 색상 등 설정 |
| `gas/Util.gs` `Krx.gs` `Load.gs` `Backfill.gs` `Aggregate.gs` | 적재(ETL)·집계 서버 로직 |
| `gas/Api.gs` | 웹앱 진입점(`doGet`) 및 대시보드 데이터 API(`api(action, params)`) |
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
- `~/.clasprc.json`(Google OAuth 토큰)은 절대 커밋하지 않음(`.gitignore` 등록). GitHub Actions 사용 시 Secrets 에만 저장
