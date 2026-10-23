# vibe-radar

매일 개발 뉴스를 수집·분석해 정적 대시보드로 보여주는 프로젝트다. Node 24와 TypeScript CLI(빌드 없이 타입 스트리핑으로 실행)가 데이터를 모으고, 프레임워크 없는 웹 프런트엔드가 결과를 표시한다.

## 기능

- Hacker News, GeekNews, Reddit, arXiv, Hugging Face, GitHub Trending, 도구 릴리스, 보안 권고를 매일 수집한다.
- 출처를 가로질러 같은 이슈를 묶어 핫 이슈 순위와 게이지를 만든다.
- 키워드 급상승, 도구 릴리스 변화, 보안 알림, MCP·스킬·규칙 파일 같은 재료 목록을 보여준다.
- 출처 하나가 실패해도 나머지는 정상 표시하고, 실패한 출처는 상태 화면에 표시한다.
- 라이트·다크 모드와 반응형(900px 기준) 화면을 지원한다. 선택한 모드는 브라우저에 저장된다.
- 테마는 `web/site.config.js`의 `theme` 값으로 교체한다. 기본값은 `aurora-hud`, 대체 테마는 `plain`이다.

## 로컬 실행

```
npm install
npm run collect && npm run analyze && npm run build && npm run serve
```

`npm run build`도 raw가 daily보다 새로우면(같은 날 다시 수집했으면) 그날을 자동으로 다시 분석하지만, 분석 단계를 분명히 하려고 `npm run analyze`를 따로 적어 둔다.

브라우저에서 http://localhost:4173 을 연다. 테스트는 `npm test`, 타입 검사는 `npm run typecheck`다.

## 배포 (GitHub Pages)

`.github/workflows/daily.yml`이 매일 00:00 UTC(한국 시간 09:00)에 수집·분석·요약·빌드를 돌리고, `data/`를 커밋한 뒤 Pages에 배포한다. `main`에 `web/**`나 `src/**` 변경이 push되면 수집 없이 빌드와 배포만 한다.

새 공개 저장소에 올리는 절차는 다음과 같다. **Pages 설정을 push보다 먼저** 해야 한다. 그러지 않으면 첫 push로 시작된 워크플로가 배포 단계에서 실패한다.

1. GitHub 웹에서 새 **공개(Public)** 저장소를 만든다. README나 .gitignore는 추가하지 않는다.
2. 저장소 **Settings → Pages → Source**를 **GitHub Actions**로 먼저 설정한다.
3. 로컬 `main` 브랜치에서 원격을 연결하고 push한다.
   ```
   git remote add origin https://github.com/<사용자>/<저장소>.git
   git push -u origin main
   ```
4. **Actions** 탭에서 `daily` 워크플로를 열고 **Run workflow**로 한 번 수동 실행한다.
5. 실행이 끝나면 `deploy` job의 환경 링크(github-pages)에 배포 URL이 표시된다.

GitHub는 저장소에 60일 동안 활동이 없으면 예약(schedule) 워크플로를 끈다. 그러면 **Actions** 탭에서 `daily`를 다시 켠다.

## 축소 모드(reduced)

`GITHUB_TOKEN`이 없으면 축소 모드로 동작한다. 로컬 실행이 이 모드이며 `npm run collect` 출력에 `mode: reduced`가 나온다. 이 모드에서는 별 수 추적용 추가 요청을 하지 않는다. Actions에서는 토큰이 자동으로 주어져 전체 모드로 돈다. AI 요약은 이와 별개로 `GEMINI_API_KEY`가 있을 때만 돈다(아래 참고).

## 설정

수집 대상은 루트의 `config.json`에서 고친다.

- `tools`: 추적할 도구와 릴리스 출처
- `kitTopics`: 재료 목록에 넣을 GitHub 토픽
- `watchlist`: npm·pip 패키지 감시 목록
- `securityTerms`: 보안 알림으로 분류할 단어
- `redditSubs`: 수집할 서브레딧
- `arxivMax`, `trackDays`: arXiv 수집 상한과 추적 일수
- `ai`: AI 요약에 쓸 OpenAI 호환 API. `baseUrl`(주소), `keyEnv`(API 키를 담을 환경변수 이름), `models`(앞에서부터 시도할 모델 이름 목록. 이름이 없거나 응답이 제한 시간을 넘으면 다음 모델로 넘어간다), `timeoutMs`(요청 한 번의 제한 시간)

## AI 요약 (Gemini 무료 API)

AI 한국어 요약과 번역은 Google Gemini API의 무료 등급을 쓴다. (GitHub Models는 2026년 7월 30일에 종료됐다.)

1. https://aistudio.google.com/apikey 에서 API 키를 만든다.
2. 저장소 **Settings → Secrets and variables → Actions → New repository secret**에서 이름을 `GEMINI_API_KEY`로, 값에 키를 넣어 저장한다.
3. Actions에서 `daily`를 다시 실행한다.

키가 없으면 요약 단계만 건너뛰고 나머지는 정상으로 돈다. 로컬에서도 환경변수 `GEMINI_API_KEY`를 설정하면 `npm run summarize`로 요약할 수 있다. 모델 이름이 바뀌면 `config.json`의 `ai.models`만 고치면 된다. 다른 OpenAI 호환 서비스로 바꾸려면 `ai.baseUrl`과 `ai.keyEnv`를 바꾼다. 무료 등급에 보낸 내용(공개 뉴스 제목 등)은 Google이 서비스 개선에 쓸 수 있다.

지어낸 내용을 막기 위해 요약은 기사 본문 발췌를 근거로만 쓰고, 출처에 없는 숫자나 문장이 있으면 규칙 검사와 AI 재검증에서 버린다. 버려진 이슈는 한국어 제목과 원문 목록만 보인다. 로그의 `summarize: N summaries kept, M dropped` 줄에서 몇 건이 버려졌는지 볼 수 있다.

요약이 나타나지 않으면 Actions 실행 로그에서 `summarize:`, `ai:`로 시작하는 줄을 확인한다.

아이디어 출처: jihoo12/trends
