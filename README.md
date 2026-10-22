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
3. 로컬에서 원격을 연결하고 push한다. 작업은 `feat/vibe-radar` 브랜치에 있으므로 원격 `main`으로 올린다(또는 먼저 `main`에 병합한 뒤 `git push -u origin main`).
   ```
   git remote add origin https://github.com/<사용자>/<저장소>.git
   git push -u origin feat/vibe-radar:main
   ```
4. **Actions** 탭에서 `daily` 워크플로를 열고 **Run workflow**로 한 번 수동 실행한다.
5. 실행이 끝나면 배포 URL이 job 요약에 표시된다.

GitHub는 저장소에 60일 동안 활동이 없으면 예약(schedule) 워크플로를 끈다. 그러면 **Actions** 탭에서 `daily`를 다시 켠다.

## 축소 모드(reduced)

`GITHUB_TOKEN`이 없으면 축소 모드로 동작한다. 로컬 실행이 이 모드이며 `npm run collect` 출력에 `mode: reduced`가 나온다. 이 모드에서는 AI 요약과 번역, 별 수 추적용 추가 요청을 하지 않는다. Actions에서는 토큰이 자동으로 주어져 전체 모드로 돈다.

## 설정

수집 대상은 루트의 `config.json`에서 고친다.

- `tools`: 추적할 도구와 릴리스 출처
- `kitTopics`: 재료 목록에 넣을 GitHub 토픽
- `watchlist`: npm·pip 패키지 감시 목록
- `securityTerms`: 보안 알림으로 분류할 단어
- `redditSubs`: 수집할 서브레딧
- `arxivMax`, `trackDays`: arXiv 수집 상한과 추적 일수

## GitHub Models 요약

AI 요약은 GitHub Models를 쓰며 Actions에서만 나타난다. 워크플로에 `models: read` 권한과 `GITHUB_TOKEN`이 주어지기 때문이다. 요약이 끝내 나타나지 않으면 Actions 실행 로그에서 `summarize:`로 시작하는 줄을 확인한다.

아이디어 출처: jihoo12/trends
