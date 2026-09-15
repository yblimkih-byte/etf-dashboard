# GitHub 기반 유지관리·배포 가이드

목적: 대시보드 소스(`gas/`)의 정본을 GitHub 저장소에 두고, 수정 → 검증 → Apps Script 반영 → 웹앱 새 버전 배포 → 기록을 일정한 절차로 반복함. 도구는 Google 공식 CLI `clasp`(Command Line Apps Script Projects) 사용.

```
[로컬 PC 작업 사본] ── git push ──▶ [GitHub 저장소 (정본·이력)]
        │                                   │ (선택) GitHub Actions
        │ clasp push / pull                 ▼ clasp push
        ▼                          [Apps Script 프로젝트] ── 새 버전 배포 ──▶ 웹앱 URL(고정)
```

## 0. 최초 1회 준비

### 0-1. 로컬 PC 도구 설치
1. Git: https://git-scm.com (Windows 는 Git for Windows)
2. Node.js LTS(20 이상): https://nodejs.org → 설치 확인 `node -v`, `npm -v`
3. clasp: `npm install -g @google/clasp` → 확인 `clasp -v`
4. GitHub 계정 및 (권장) GitHub CLI `gh`(https://cli.github.com) — 없어도 브라우저로 대체 가능

> 회사 PC(AhnLab MDS·Google 차단 환경)에서는 `clasp`(Google API 호출)가 막힐 수 있음. 이 경우 (a) 개인 핫스팟에서 clasp 실행, 또는 (b) 로컬은 git 만 사용하고 Apps Script 반영은 GitHub Actions(4장)에 맡기는 방식 권장. GitHub 접속만 되면 (b)로 운영 가능.

### 0-2. Apps Script API 활성화
1. https://script.google.com/home/usersettings 접속(대시보드 소유 계정 yblim.kih@gmail.com)
2. "Google Apps Script API" → **사용**으로 변경 (clasp 가 프로젝트를 읽고 쓰기 위해 필요)

### 0-3. clasp 로그인
```bash
clasp login
```
브라우저가 열리면 대시보드 소유 계정으로 승인. 완료 시 `~/.clasprc.json` 생성(이 파일은 비밀정보 — 커밋 금지).

### 0-4. GitHub 저장소 생성 및 최초 업로드
전달받은 `etf-dashboard-repo.zip` 을 풀면 이미 `git init` 및 최초 커밋이 되어 있음.

**방법 A — GitHub CLI**
```bash
cd etf-dashboard-repo
gh auth login                          # 브라우저 승인
gh repo create etf-dashboard --private --source=. --remote=origin --push
```

**방법 B — 웹 화면**
1. https://github.com/new → Repository name `etf-dashboard`, **Private**, README·.gitignore 추가하지 않음 → Create
2. 생성 화면의 "push an existing repository" 명령 실행
```bash
cd etf-dashboard-repo
git remote add origin https://github.com/<계정>/etf-dashboard.git
git branch -M main
git push -u origin main
```
(비밀번호 대신 Personal Access Token 요구됨: GitHub Settings › Developer settings › Personal access tokens › Fine-grained → 해당 저장소 Contents: Read and write)

### 0-5. 저장소 ↔ Apps Script 일치 확인
```bash
clasp pull            # Apps Script 의 현재 코드를 gas/ 로 내려받음
git status            # 변경 없음(clean)이어야 정상
```
차이가 있으면 편집기에서 직접 고친 내용이 저장소에 없는 것 → `git diff` 로 확인 후 커밋(6장).

### 0-6. 배포 ID 확보(URL 고정 배포용)
```bash
clasp deployments
```
출력 중 웹앱 URL 의 `/s/AKfycbw…/exec` 부분과 같은 ID(`AKfycbwF4iZ_1BilAMgSFAySTPrS8gaEOVdTQdMPE3QaVhEd--A38x1l9sQXJWIk_RXuHbO0dA`)가 **운영 배포 ID**. 이후 새 버전은 항상 이 ID 에 연결해야 URL 이 바뀌지 않음.

## 1. 일상 수정 절차 (표준 사이클)

| 단계 | 명령/행동 | 비고 |
|---|---|---|
| 1 | `git pull origin main` | 최신 정본으로 시작 |
| 2 | `git checkout -b fix/설명` | 작업 브랜치(예: `feat/tab-flow`, `fix/nav-zero`) |
| 3 | `gas/` 파일 수정 | 서버(.gs) / 화면(.html) 구분 인식 |
| 4 | 로컬 검증(2장) | 화면 변경은 스크린샷, 서버 변경은 모의 실행 |
| 5 | `clasp push` | Apps Script 에 반영(**저장만 되며 URL 에는 아직 미반영**) |
| 6 | 테스트 배포 URL 확인 | 편집기 배포 › 테스트 배포 (`/dev` URL) 로 실제 데이터 확인 |
| 7 | `git add -A && git commit -m "v11: 변경 요약"` → `git push -u origin fix/설명` | 커밋 메시지 앞에 버전 |
| 8 | GitHub 에서 Pull Request → 변경 내용 확인 → Merge | 1인 운영이면 셀프 머지 가능. 이력·근거 남기는 용도 |
| 9 | `git checkout main && git pull` → `clasp push` | main 기준으로 다시 push(브랜치 push 와 동일 내용이면 생략 가능) |
| 10 | `clasp deploy -i <배포ID> -d "v11: 변경 요약"` | **새 버전 생성 + 운영 URL 에 연결**. 편집기 "배포 관리 › 수정 › 새 버전"과 동일 |
| 11 | 서버(.gs) 변경 시 시트 메뉴 **ETF Dashboard › 집계 재계산** | API 응답 캐시 무효화(이전 버전 응답이 6시간 남을 수 있음). 화면(.html)만 바뀐 경우 불필요 |
| 12 | `git tag v11 && git push origin v11` | 배포 버전과 Git 태그 일치 → 롤백 지점 |
| 13 | `CHANGELOG.md` 에 한 줄 추가 후 커밋 | 무엇을 왜 바꿨는지 |

Apps Script 버전 번호(배포 관리의 "버전 N")와 커밋 메시지·태그의 vN 을 동일하게 유지하면 이력 대조가 쉬움.

## 2. 로컬 검증 (Apps Script 없이)

`test/` 폴더는 .gs 를 Node 에서 모의 실행하고, 화면을 Playwright(Chromium)로 렌더해 7개 탭 스크린샷을 만듦.

```bash
cd test
npm install                      # chart.js, playwright (최초 1회)
npx playwright install chromium  # 최초 1회
npm run server                   # run_node.js: 백필·적재·집계 모의 실행 → store.json 생성, API 결과 출력
npm run page                     # build_page.js: index.html 생성(Index+Style+App+Tabs 결합, 모의 서버 주입)
npm run shoot                    # shoot.js: 탭별 shot_*.png 저장 + JS 오류 출력
```
- `run_node.js` 는 KRX API 를 호출하지 않고 `shim.js` 의 모의 데이터로 동작함. 실제 수치 검증은 테스트 배포 URL 또는 편집기 실행 로그 사용
- 스크린샷에서 레이블 겹침·잘림, `no js errors` 출력 여부를 확인

## 3. 편집기에서 실행이 필요한 작업

메뉴 기능(백필·보정·집계 재계산)은 시트 메뉴 또는 Apps Script 편집기에서 실행. 코드 변경이 아니므로 Git 과 무관하나, 실행 결과(예: "NAV 0 일자 보정" 실행일)는 CHANGELOG 운영 항목에 기록 권장.

## 4. (선택) GitHub Actions 자동 반영

main 에 `gas/` 변경이 push 되면 자동으로 `clasp push` 실행. 회사 PC 에서 Google 접속이 막혀도 GitHub 만 되면 반영 가능.

1. 로컬(핫스팟)에서 `clasp login` 후 `~/.clasprc.json` 내용 전체 복사
2. GitHub 저장소 › Settings › Secrets and variables › Actions › New repository secret
   - Name `CLASPRC_JSON`, Value = 위 파일 내용
3. `.github/workflows/push-to-apps-script.yml` 이 자동 동작. Actions 탭에서 성공 여부 확인
4. 웹앱 URL 까지 자동 갱신하려면 Secret `DEPLOYMENT_ID`(0-6 의 배포 ID) 추가 후 워크플로 마지막 줄 주석 해제. 단, 자동 배포는 검증 없이 운영에 반영되므로 PR 머지 = 배포라는 규율이 필요함. 초기에는 push 만 자동, deploy 는 수동 권장

## 5. 롤백

| 상황 | 조치 |
|---|---|
| 배포 직후 화면 오류 | 편집기 배포 › 배포 관리 › 수정 › 버전을 **이전 버전(예: 9)**으로 선택 → 배포. URL 유지, 즉시 복구. 또는 `clasp deploy -i <배포ID> -V 9` |
| 코드도 되돌리기 | `git revert <커밋>` → push → `clasp push` → 새 버전 배포 |
| 특정 태그 상태로 복원 | `git checkout v9 -- gas/` → 커밋 → `clasp push` → 배포 |

## 6. 편집기에서 직접 수정한 경우(역방향 동기화)

긴급 수정을 Apps Script 편집기에서 바로 했다면 저장소가 뒤처짐. 다음 작업 전에 반드시:
```bash
clasp pull
git diff              # 편집기 변경 확인
git add -A && git commit -m "hotfix: 편집기 직접 수정 반영"
git push
```
`clasp push` 는 로컬 내용으로 Apps Script 를 **덮어쓰므로**, pull 없이 push 하면 편집기 수정이 사라짐.

## 7. 저장소 운영 규칙(권장)

- 브랜치: `main` = 운영 배포와 동일 상태. 작업은 `feat/…`, `fix/…` 브랜치 → PR → 머지
- 커밋/태그: `vN: 요약` 형식, Apps Script 버전 번호와 일치
- 요구사항·오류 접수는 GitHub Issues 에 등록(스크린샷 첨부) → PR 에 `Closes #번호`
- 설계·운영 문서는 `docs/` 에 함께 커밋(코드와 같은 이력)
- 비밀정보 금지: KRX 키(스크립트 속성), `.clasprc.json`, 시트 공유 링크

## 8. 문제 해결

| 증상 | 조치 |
|---|---|
| `clasp push` 403 / "User has not enabled the Apps Script API" | 0-2 단계 수행 후 재시도 |
| `clasp login` 브라우저 승인 후에도 실패 | 회사 네트워크 차단 → 핫스팟 사용 또는 4장 Actions 방식 |
| push 후 웹앱이 그대로 | 새 버전 배포(1장 10단계) 누락. push 는 저장, deploy 가 반영 |
| 배포 후 기준일자 목록 비어 있음/옛 수치 | 이전 버전 API 캐시 → 시트 메뉴 "집계 재계산" 후 새로고침 |
| 배포마다 URL 이 바뀜 | `clasp deploy` 에 `-i <배포ID>` 누락 → 새 배포가 생성됨. 배포 관리에서 불필요 배포 삭제 |
| `clasp pull` 이 파일을 `gas/` 밖에 생성 | `.clasp.json` 의 `rootDir` 확인 |
| Actions 실패 "Could not read API credentials" | Secret `CLASPRC_JSON` 내용이 파일 전체(JSON)인지 확인, 토큰 만료 시 재로그인 후 갱신 |
