# Vercel 프런트엔드 배포 가이드

구조: **구글시트·Apps Script(적재·집계·API) 그대로** → `api/data.js`(Vercel 서버 함수, 10분 CDN 캐시) → `web/public`(정적 화면).
화면 로직(`gas/App.html`, `gas/Tabs.html`)은 Apps Script 웹앱과 **한 벌을 공유**하며, Vercel 빌드 시 `web/build.js` 가 그대로 가져감. 외형만 `web/src/`(index.html · web.css · shell.js)에서 덮어씀. 기존 Apps Script 웹앱 URL 은 계속 동작함.

## 1. Apps Script 쪽 (1회, Apps Script v11 배포 · Vercel 화면은 v101~)
1. 편집기에서 두 파일을 저장소의 최신본으로 교체
   - `Api.gs` : `doGet` 첫머리에 JSON 분기 6줄 추가 (`?action=` 이 있으면 JSON, 없으면 기존 화면)
   - `App.html` : `call()` 에 `window.API_BASE` 분기 1줄 추가 (Apps Script 안에서는 영향 없음)
2. 배포 › 배포 관리 › 수정 › 새 버전 › 배포 (URL 유지, 액세스 "모든 사용자" 유지)
3. 확인: 브라우저에서 `<웹앱 URL>?action=meta` → `{"ok":true,"data":{...}}` 가 보이면 정상

## 2. GitHub
변경·추가 파일을 저장소에 반영: `api/data.js`, `vercel.json`, `web/`, `gas/Api.gs`, `gas/App.html`, `test/`, `docs/`, `.gitignore`, `CHANGELOG.md`

## 3. Vercel (1회)
1. vercel.com › GitHub 계정으로 가입(Hobby) › Add New › Project › `etf-dashboard` Import
2. 설정은 기본값 그대로(`vercel.json` 이 빌드 명령·출력 폴더 지정). Root Directory 는 비워 둠
3. Environment Variables: `GAS_URL` = Apps Script 웹앱 `/exec` 주소 (끝에 `?` 없이)
4. Deploy → `https://<프로젝트명>.vercel.app`. 이후 GitHub 에 push 하면 자동 재배포, Deployments 에서 이전 버전 즉시 복원 가능

## 운영
- 데이터 반영: 적재(08:30 / 19:00) 후 최대 10분 내 자동 반영(CDN 캐시 `s-maxage=600`, 이후 하루까지는 이전 값을 먼저 보여주고 뒤에서 갱신). 즉시 반영이 필요하면 Vercel › Deployments › Redeploy
- 화면 기능 수정: `gas/App.html` · `gas/Tabs.html` 을 고치면 두 화면 모두에 반영(Apps Script 는 새 버전 배포, Vercel 은 push). 외형만 바꿀 때는 `web/src/web.css`
- 로컬 검증: `cd test && npm i && node run_node.js && node build_web.js && node shoot.js web.html web_d 1360` (모바일: `… web_m 390`), 기존 화면: `node build_page.js && node shoot.js`
- 장애 시: 기존 Apps Script 웹앱 URL 을 그대로 사용
