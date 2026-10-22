# vibe/radar 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** HN·GitHub·arXiv·GeekNews·Reddit·Hugging Face·AI 도구 릴리즈·보안 권고를 매일 모아 핫이슈로 묶어 보여주는 정적 사이트를 만든다. 화면은 E · 오로라 HUD 테마이고 라이트·다크 토글을 지원한다.

**Architecture:** 데이터 쪽과 화면 쪽을 나눈다.
- **데이터 쪽:** Node 24와 TypeScript CLI가 `collect → analyze → summarize → build` 순서로 돈다. `data/`에 날짜별 JSON을 쌓고, `web/data/`로 화면용 JSON을 내보낸다.
- **화면 쪽:** 프레임워크 없는 브라우저 ES 모듈이다.
  - `web/core/`는 데이터 로딩, 라우팅, 라이트·다크 모드를 맡는다.
  - `web/themes/<name>/`는 `render(ctx) → HTML 문자열`과 CSS를 제공한다.
- 두 쪽 사이의 약속은 `src/schema.ts`의 zod 스키마 하나다.

**Tech Stack:**
- Node 24 (타입 스트리핑으로 `.ts`를 바로 실행), TypeScript(`tsc --noEmit`로 타입 검사만), `node:test`
- zod, fast-xml-parser, node-html-parser
- GitHub Actions, GitHub Pages, GitHub Models

**Spec:** `docs/superpowers/specs/2026-10-22-vibe-radar-design.md` (반드시 같이 읽을 것). 디자인 원본은 `design/mockup-v3-E-light-dark.html`이다.

## Global Constraints

- Node `>=24`이다. `.ts`는 빌드 없이 실행한다.
  - 그래서 enum, namespace, 생성자 parameter property를 쓰지 않는다. `tsconfig`에서 `erasableSyntaxOnly`를 켠다.
  - 상대 import에는 확장자 `.ts`를 붙인다.
- 런타임 의존성은 `zod`, `fast-xml-parser`, `node-html-parser` 세 개만 쓴다. 개발 의존성은 `typescript`, `@types/node`만 쓴다.
- 유료 API 키를 쓰지 않는다. 인증은 `process.env.GITHUB_TOKEN`만 쓴다.
- 모드는 `GITHUB_TOKEN`이 있으면 `'full'`, 없으면 `'reduced'`다. AI 요약과 번역은 토큰이 있을 때만 돈다.
- 날짜는 모두 KST 기준 `YYYY-MM-DD`다. 같은 날 다시 실행하면 그날 파일을 덮어쓴다.
- 화면 문구는 한국어만 쓴다. 원문 목록(HN, GeekNews, Reddit, arXiv) 제목은 번역하지 않는다.
- **지어낸 데이터를 절대 내보내지 않는다.** 값이 없으면 `null`이나 빈 배열로 두고, 화면에서 "없음" 상태를 보여준다.
- 출처 하나가 실패해도 나머지는 계속 진행한다. 실패한 출처는 `SourceStatus.ok=false`로 기록한다.
- 화면용 데이터는 최근 90일만 내보낸다.
- 반응형 경계는 `900px`이다. 그보다 좁으면 한 열로 바뀐다.
- `prefers-reduced-motion`이 켜져 있으면 스캔 라인, 깜빡임, 게이지 애니메이션을 끈다.
- 라이트·다크 모드:
  - 저장 키는 `localStorage['vr-mode']`이고, 값은 `'light' | 'dark'`다.
  - 처음 방문하면 `prefers-color-scheme`을 따른다.
  - 모드 속성은 `<html data-mode>`다.
  - 본문 대비는 4.5:1 이상이다.
- 라이트 색: 바탕 `#f3f5fc`, 청록 `#0e7490`, 보라 `#6d28d9`, 분홍 `#a21caf`. 다크 색은 시안 v3의 `[data-mode="dark"]` 변수를 그대로 쓴다.
- 원본 저장소(`jihoo12/trends`)의 코드를 복사하지 않는다. README에 아이디어 출처로만 밝힌다.

## Review Focus

1. **피드 문자열에 HTML이 섞인 경우:** HN, Reddit, GeekNews 제목이나 레포 설명에 `<img src=x onerror=...>`가 들어와도 글자로만 보여야 한다. → Task 12에 이스케이프 테스트가 있다.
2. **첫날이나 기록이 없는 날:** 이전 daily도 어제 raw도 없을 때 다음처럼 동작해야 한다.
   - 게이지 비교 문구는 숨기고 "기록 쌓는 중 (0/7일)"을 보여준다.
   - 신규 레포를 "전부 신규"로 표시하지 않고 빈 목록으로 둔다.
   - 급상승은 트렌딩 주간 값으로 채운다.
   - → Task 8에 테스트가 있다.
3. **페이지는 200인데 구조가 바뀐 경우:** GitHub Trending이나 Cursor changelog를 파싱한 결과가 0건이면 조용히 빈 값을 내지 않는다. `ok=false`, `error='parsed 0 items'`로 기록한다. → Task 6에 테스트가 있다.
4. **`localStorage`가 막힌 경우:** 읽기나 쓰기에서 예외가 나면 기기 설정을 따르고, 토글은 그 세션 안에서 계속 동작해야 한다. → Task 11에 테스트가 있다.
5. **주소에 없는 날짜나 깨진 날짜가 온 경우:** `#/?d=2020-01-01`이나 `#/?d=abc`가 와도 빈 화면이 되지 않는다. 최신 날짜를 보여주고 "그 날짜 기록이 없어요" 안내를 띄운다. → Task 11(라우터)과 Task 13(화면)에 테스트가 있다.

---

## 파일 구조

```
package.json  tsconfig.json  config.json  .gitignore  README.md
.github/workflows/daily.yml
src/
  schema.ts                 zod 스키마 = 데이터 계약 (Raw, Daily, Index)
  config.ts                 config.json 로드·검증
  lib/dates.ts              KST 날짜 유틸
  lib/http.ts               fetchText/fetchJson (타임아웃, UA, GitHub 토큰)
  lib/text.ts               tokenize, normalizeUrl, stripMarkdown
  collectors/
    types.ts                Collector 인터페이스, CollectCtx
    hn.ts geeknews.ts reddit.ts arxiv.ts huggingface.ts
    trending.ts tools.ts advisories.ts kit.ts stars.ts
    index.ts                ALL_COLLECTORS 목록
  analyze/
    stopwords.ts keywords.ts cluster.ts heat.ts
    gauge.ts alerts.ts tools.ts repos.ts kit.ts
    report.ts               buildDailyReport() 조립
  summarize/
    models.ts               GitHub Models 클라이언트
    translate.ts            번역 캐시 + 묶음 번역
    summarize.ts            핫이슈 요약 + 번역 적용
  cli/
    collect.ts analyze.ts summarize.ts build.ts serve.ts
scripts/capture-fixtures.ts
test/
  fixtures/                 캡처한 실제 응답 (커밋)
  *.test.ts
web/
  index.html  site.config.js
  core/ app.js mode.js router.js data.js format.js (+ *.test.js)
  themes/aurora-hud/ theme.css render.js views/*.js (+ render.test.js)
  themes/plain/ theme.css render.js
  data/                     빌드 결과 (gitignore)
data/
  raw/YYYY-MM-DD.json  daily/YYYY-MM-DD.json
  stars/history.json  cache/translations.json
```

---

### Task 1: 프로젝트 뼈대와 날짜 유틸

**Files:**
- Create: `package.json`, `tsconfig.json`, `.gitignore`, `README.md`, `src/lib/dates.ts`
- Test: `test/dates.test.ts`

**Interfaces:**
- Produces:
  - `kstDate(now: Date): string` → 예: `'2026-10-22'`
  - `addDays(date: string, n: number): string`
  - `daysBetween(a: string, b: string): number` (b − a)
  - `isIsoDate(s: string): boolean`

- [ ] **Step 1: git 저장소와 package.json을 만든다.** `git init`을 실행한다. `package.json`은 다음과 같다.
  - `"type": "module"`, `"engines": {"node": ">=24"}`
  - scripts:
    - `test`: `node --test "test/**/*.test.ts" "web/**/*.test.js"`
    - `typecheck`: `tsc --noEmit`
    - `collect`: `node src/cli/collect.ts`
    - `analyze`: `node src/cli/analyze.ts`
    - `summarize`: `node src/cli/summarize.ts`
    - `build`: `node src/cli/build.ts`
    - `serve`: `node src/cli/serve.ts`
    - `fixtures`: `node scripts/capture-fixtures.ts`
  - `npm i zod fast-xml-parser node-html-parser`, `npm i -D typescript @types/node`

  `tsconfig.json`의 설정은 `target ES2023`, `module nodenext`, `strict`, `noEmit`, `allowImportingTsExtensions`, `verbatimModuleSyntax`, `erasableSyntaxOnly`이다. include는 `src`, `scripts`, `test`다.

  `.gitignore`에는 `node_modules/`와 `web/data/`를 넣는다.
- [ ] **Step 2: 실패하는 테스트를 쓴다.**

```ts
test('kstDate: UTC 15:00 is next day in KST', () => {
  assert.equal(kstDate(new Date('2026-10-21T15:00:00Z')), '2026-10-22');
  assert.equal(kstDate(new Date('2026-10-21T14:59:59Z')), '2026-10-21');
});
test('addDays / daysBetween across month', () => {
  assert.equal(addDays('2026-10-30', 3), '2026-11-02');
  assert.equal(daysBetween('2026-10-15', '2026-10-22'), 7);
});
test('isIsoDate', () => {
  assert.ok(isIsoDate('2026-10-22'));
  for (const bad of ['abc', '2026-13-01', '2026-02-30', '']) assert.equal(isIsoDate(bad), false);
});
```

- [ ] **Step 3:** `npm test`를 실행한다. 기대 결과: FAIL (모듈 없음)
- [ ] **Step 4: `src/lib/dates.ts`를 구현한다.** UTC 기준으로 9시간을 더하는 계산만 쓰고, 다른 시간대 라이브러리는 쓰지 않는다.
- [ ] **Step 5:** `npm test`와 `npm run typecheck`를 실행한다. 기대 결과: 모두 PASS, 타입 오류 0
- [ ] **Step 6: README를 쓴다.** 프로젝트 소개 한 단락, 로컬 실행 방법(`npm run collect && npm run build && npm run serve`), "아이디어 출처: jihoo12/trends" 한 줄을 넣는다.
- [ ] **Step 7:** 커밋한다. `git add -A && git commit -m "chore: scaffold vibe-radar with KST date utils"`

---

### Task 2: 데이터 계약(스키마)과 설정 파일

**Files:**
- Create: `src/schema.ts`, `config.json`, `src/config.ts`
- Test: `test/schema.test.ts`, `test/config.test.ts`

**Interfaces:**
- Produces: zod 스키마들과 `z.infer` 타입들. 이후 모든 Task가 이 이름을 쓴다.
  - 공통 타입
    - `SourceId = 'hn'|'trending'|'arxiv'|'geeknews'|'reddit'|'huggingface'|'tools'|'advisories'|'kit'|'stars'`
    - `SourceStatus { id: SourceId; ok: boolean; count: number; error: string|null; reduced: boolean }`
  - 수집 결과 항목 타입
    - `HnItem { id:number; title; url; domain; points:number; comments:number; hnUrl }`
    - `NewsItem { id; source:'geeknews'|'reddit'; title; url; domain; sub:string|null; publishedAt:string|null }`
    - `TrendingRepo { fullName; url; description:string|null; language:string|null; stars:number; starsInPeriod:number; period:'daily'|'weekly' }`
    - `Paper { id; title; category; url; publishedAt }`
    - `HfModel { id; url; likes:number; downloads:number; pipeline:string|null }`
    - `ToolRelease { tool; name; version:string|null; publishedAt:string|null; url; note:string|null }`
    - `Advisory { id; summary; severity:'critical'|'high'|'medium'|'low'; type:'reviewed'|'malware'|'unreviewed'; ecosystem; packages:string[]; url; publishedAt }`
    - `KitRepo { fullName; url; description:string|null; stars:number; createdAt:string|null; topics:string[] }`
  - `RawSnapshot { date; collectedAt; mode:'full'|'reduced'; sources: SourceStatus[]; hn: HnItem[]; trending: TrendingRepo[]; arxiv: Paper[]; geeknews: NewsItem[]; reddit: NewsItem[]; hfModels: HfModel[]; tools: ToolRelease[]; advisories: Advisory[]; kit: KitRepo[]; stars: Record<string, number> }`
  - 가공 결과 타입
    - `IssueItem { source: SourceId; title; url; points:number|null; comments:number|null }`
    - `Issue { id; title; title_ko:string|null; summary_ko:string|null; check_ko:string|null; heat:number; heatReason:string; sources:SourceId[]; url; items: IssueItem[] }`
    - `Gauge { value:number; avg7:number|null; label:'hot'|'normal'|'calm'|null; daysOfHistory:number }`
    - `Alert { id; title; title_ko:string|null; url; origin:'news'|'advisory'; severity:'critical'|'high'|null; packages:string[] }`
    - `ToolCard { tool; name; version:string|null; publishedAt:string|null; url; note:string|null; note_ko:string|null; isRecent:boolean }`
    - `RisingRepo { fullName; url; description:string|null; description_ko:string|null; stars:number; delta7:number; deltaSource:'history'|'trending-weekly'; isNew:boolean; series:{date:string; stars:number}[] }`
    - `RepoRef { fullName; url; description:string|null; language:string|null; stars:number }`
    - `KitCard { fullName; url; description:string|null; description_ko:string|null; stars:number; kind:'MCP'|'SKILL'|'RULES'|'CLI'|'AGENT'|'OTHER'; isNew:boolean }`
    - `KeywordTrend { term; today:number; avg7:number|null; delta:number|null; isNew:boolean }`
  - `DailyReport { schemaVersion: 1; date; collectedAt; mode; scanNo:number; sources: SourceStatus[]; gauge: Gauge; issues: Issue[]; alerts: Alert[]; tools: ToolCard[]; rising: RisingRepo[]; newRepos: RepoRef[]; droppedRepos: RepoRef[]; kit: KitCard[]; keywords: KeywordTrend[]; papers: Paper[]; paperCategories:{category:string; count:number}[]; hfModels: HfModel[]; feeds:{ hn: HnItem[]; geeknews: NewsItem[]; reddit: NewsItem[] } }`
  - `SiteIndex { latest: string|null; dates: string[] }` (dates는 최신순)
  - 내보내는 이름: `RawSnapshotSchema`, `DailyReportSchema`, `SiteIndexSchema`. 타입 이름은 위와 같다.
  - `loadConfig(path?: string): Config`
    - `Config { tools: {id:string; name:string; kind:'github-release'|'copilot-feed'|'cursor-page'; repo?:string}[]; kitTopics: string[]; watchlist: { npm: string[]; pip: string[] }; securityTerms: string[]; redditSubs: string[]; arxivMax: number; trackDays: number }`

- [ ] **Step 1: config.json을 만든다.** 아래 값을 그대로 쓴다. 이 값들은 설계 문서에서 정한 것이다.
  - tools
    - `claude-code` (github-release, `anthropics/claude-code`)
    - `codex` (github-release, `openai/codex`)
    - `gemini-cli` (github-release, `google-gemini/gemini-cli`)
    - `copilot` (copilot-feed)
    - `cursor` (cursor-page)
  - `kitTopics`: `["mcp","mcp-server","claude-code","agent-skills","cursor-rules"]`
  - `watchlist`
    - npm: `["openai","@anthropic-ai/sdk","langchain","next","vite","express"]`
    - pip: `["litellm","openai","anthropic","langchain"]`
  - `securityTerms`: `["backdoor","compromised","malware","credential stealer","supply chain","CVE-","vulnerability","exploit","취약점","악성","보안 패치","해킹"]`
  - `redditSubs`: `["ClaudeAI","vibecoding"]`
  - `arxivMax`: `200`
  - `trackDays`: `30`
- [ ] **Step 2: 실패하는 테스트를 쓴다.**

```ts
test('DailyReportSchema accepts minimal empty report', () => {
  const r = { schemaVersion: 1, date: '2026-10-22', collectedAt: '2026-10-22T00:05:00Z', mode: 'reduced', scanNo: 1,
    sources: [], gauge: { value: 0, avg7: null, label: null, daysOfHistory: 0 }, issues: [], alerts: [], tools: [],
    rising: [], newRepos: [], droppedRepos: [], kit: [], keywords: [], papers: [], paperCategories: [], hfModels: [],
    feeds: { hn: [], geeknews: [], reddit: [] } };
  assert.ok(DailyReportSchema.safeParse(r).success);
});
test('DailyReportSchema rejects heat out of 0..100', () => { /* issues[0].heat = 120 → success false */ });
test('loadConfig reads repo config and rejects unknown tool kind', () => {
  assert.equal(loadConfig().tools.length, 5);
  // temp file with kind:'rss' → throws
});
```

- [ ] **Step 3:** 테스트를 실행한다. 기대 결과: FAIL
- [ ] **Step 4:** `src/schema.ts`와 `src/config.ts`를 구현한다. `heat`와 `gauge.value`는 `z.number().int().min(0).max(100)`이다.
- [ ] **Step 5:** `npm test`와 `npm run typecheck`를 실행한다. 기대 결과: PASS
- [ ] **Step 6:** 커밋한다. `feat: data contract schemas and config`

---

### Task 3: HTTP 도우미와 실제 응답 캡처(fixtures)

**Files:**
- Create: `src/lib/http.ts`, `scripts/capture-fixtures.ts`, `test/fixtures/*`
- Test: `test/http.test.ts`

**Interfaces:**
- Produces:
  - `type FetchLike = typeof fetch`
  - `fetchText(url: string, opts?: { fetch?: FetchLike; timeoutMs?: number; token?: string|null; headers?: Record<string,string> }): Promise<string>`
  - `fetchJson<T>(url, opts?): Promise<T>`
- 규칙
  - 2xx가 아니면 `HttpError(status, url)`를 던진다.
  - 기본 타임아웃은 20000ms다.
  - UA는 `vibe-radar/1.0 (+https://github.com)`이다.
  - `token`은 호스트가 `api.github.com`이나 `models.github.ai`일 때만 `Authorization: Bearer`로 붙인다.

- [ ] **Step 1: 실패하는 테스트를 쓴다.** 가짜 fetch를 주입해서 검사한다.

```ts
test('fetchJson throws HttpError on 403', async () => {
  const f = async () => new Response('no', { status: 403 });
  await assert.rejects(fetchJson('https://x.test/a', { fetch: f as any }), (e: any) => e.status === 403);
});
test('token header only for api.github.com', async () => { /* capture headers; reddit url → no Authorization */ });
test('timeout aborts', async () => { /* fetch that never resolves + timeoutMs: 10 → rejects */ });
```

- [ ] **Step 2:** 테스트를 실행한다. 기대 결과: FAIL
- [ ] **Step 3:** `src/lib/http.ts`를 구현한다. 타임아웃은 `AbortSignal.timeout`으로 처리한다.
- [ ] **Step 4:** 테스트를 실행한다. 기대 결과: PASS
- [ ] **Step 5: `scripts/capture-fixtures.ts`를 쓰고 실행한다.** 아래 URL의 실제 응답을 `test/fixtures/`에 저장한다.
  - `hn-top.json` (topstories)과 `hn-item-*.json` 3개
  - `geeknews.xml`
  - `reddit-claudeai.xml` (`/r/ClaudeAI/top/.rss?t=day`)
  - `arxiv.xml` (`export.arxiv.org/api/query?search_query=cat:cs.*+OR+cat:stat.ML&sortBy=submittedDate&max_results=20`)
  - `hf-trending.json`
  - `trending-daily.html`, `trending-weekly.html` (`github.com/trending?since=weekly`)
  - `gh-releases-claude-code.json`
  - `copilot-feed.xml`
  - `cursor-changelog.html`
  - `advisories-pip.json` (`/advisories?ecosystem=pip&per_page=30`)
  - `search-mcp.json` (`/search/repositories?q=topic:mcp+created:>…&sort=stars`)

  실행 명령은 `npm run fixtures`다. 기대 결과: 파일 16개가 생기고 모두 0바이트보다 크다.
- [ ] **Step 6:** 커밋한다. `feat: http helper and captured fixtures`

---

### Task 4: 뉴스·논문·모델 수집기 (HN, GeekNews, Reddit, arXiv, HF)

**Files:**
- Create: `src/collectors/types.ts`, `hn.ts`, `geeknews.ts`, `reddit.ts`, `arxiv.ts`, `huggingface.ts`, `src/lib/text.ts`
- Test: `test/collectors-news.test.ts`, `test/text.test.ts`

**Interfaces:**
- Consumes: `fetchText`/`fetchJson`, `Config`, 스키마 타입
- Produces:
  - `CollectCtx { mode:'full'|'reduced'; token:string|null; fetch: FetchLike; now: Date; config: Config; date: string }`
  - `Collector<K extends keyof RawSnapshot> { id: SourceId; key: K; run(ctx: CollectCtx): Promise<{ data: RawSnapshot[K]; reduced: boolean }> }`
  - 파서는 순수 함수로 분리한다.
    - `parseHnItem(json): HnItem|null` (story가 아니면 null)
    - `parseGeekNewsRss(xml): NewsItem[]`
    - `parseRedditRss(xml, sub): NewsItem[]`
    - `parseArxivAtom(xml): Paper[]`
    - `parseHfModels(json): HfModel[]`
  - `src/lib/text.ts`
    - `normalizeUrl(u: string): string` (스킴·`www.`·끝 `/`·`utm_*` 제거, 소문자 호스트)
    - `domainOf(u): string`
    - `stripMarkdown(s): string`
- 정할 값
  - HN은 상위 30개다. `domain`은 url의 호스트이고, url이 없는 글(Ask HN)은 `hnUrl`을 url로 쓴다.
  - Reddit 항목의 `domain`은 `reddit.com`이고 `sub`는 서브레딧 이름이다.
  - arXiv는 `config.arxivMax`개다. `category`는 primary category다.
  - HF는 `sort=trendingScore&limit=20`이다.

- [ ] **Step 1: 실패하는 테스트를 fixture 기준으로 쓴다.**

```ts
test('parseGeekNewsRss returns items with absolute urls', () => {
  const items = parseGeekNewsRss(read('geeknews.xml'));
  assert.ok(items.length >= 10);
  assert.ok(items.every(i => i.source === 'geeknews' && /^https?:\/\//.test(i.url) && i.title.length > 0));
});
test('parseRedditRss sets sub and reddit domain', () => { /* items[0].sub === 'ClaudeAI' */ });
test('parseArxivAtom extracts id like 2610.xxxxx and primary category', () => { /* /^\d{4}\.\d{4,5}/ */ });
test('parseHnItem returns null for job/comment', () => { /* {type:'job'} → null */ });
test('normalizeUrl strips utm and www and trailing slash', () => {
  assert.equal(normalizeUrl('https://www.Example.com/a/?utm_source=x'), 'example.com/a');
});
```

- [ ] **Step 2:** 테스트를 실행한다. 기대 결과: FAIL
- [ ] **Step 3:** 파서와 `Collector` 객체 5개를 구현한다. XML은 `fast-xml-parser`로 파싱한다. HN 항목은 `Promise.all`로 동시에 가져온다.
- [ ] **Step 4:** 테스트를 실행한다. 기대 결과: PASS
- [ ] **Step 5:** 커밋한다. `feat: news, paper, model collectors`

---

### Task 5: GitHub 계열 수집기 (트렌딩, 도구, 보안 권고, 재료, 스타)

**Files:**
- Create: `src/collectors/trending.ts`, `tools.ts`, `advisories.ts`, `kit.ts`, `stars.ts`, `src/collectors/index.ts`
- Test: `test/collectors-github.test.ts`

**Interfaces:**
- Consumes: Task 4의 `Collector`, `CollectCtx`
- Produces:
  - 파서
    - `parseTrendingHtml(html, period): TrendingRepo[]`
    - `parseGhRelease(json, tool): ToolRelease|null`
    - `parseCopilotFeed(xml): ToolRelease|null`
    - `parseCursorChangelog(html): ToolRelease|null`
    - `parseAdvisories(json, ecosystem): Advisory[]`
    - `parseSearch(json): KitRepo[]`
  - `starsTargets(history: StarHistory, today: string, trackDays: number, exclude: Set<string>): string[]`
  - `StarHistory = Record<string, { firstSeen: string; lastTrending: string; series: Record<string, number> }>` (파일: `data/stars/history.json`)
  - `ALL_COLLECTORS: Collector<any>[]` (Task 4의 5개 + 이번 Task의 5개)
- 정할 값
  - **트렌딩:** daily와 weekly 두 페이지를 가져와 합친다(`period`로 구분). `starsInPeriod`는 "N stars today/this week"의 숫자다.
  - **도구:** `note`는 릴리즈 본문의 첫 번째 목록 항목을 `stripMarkdown`한 것이고, 최대 120자다. Copilot은 피드에서 제목에 `Copilot`이 들어간 첫 항목이고, `version=null`이다. Cursor는 페이지의 첫 번째 버전 제목과 날짜다. 구체적인 선택자는 fixture를 보고 정한다.
  - **보안 권고:** npm과 pip 각각 `per_page=30`, 최신순이다.
  - **재료:** `created:>${today-30d}`, `sort=stars`, 토픽마다 `per_page=10`이다.
  - **축소 모드 호출 예산:** 토큰이 없으면 GitHub API는 시간당 60회다.
    - 도구는 github-release 3회
    - 보안 권고는 2회
    - 재료는 앞쪽 토픽 2개만 2회
    - 스타는 API 0회. 오늘 트렌딩 페이지의 `stars` 값만 쓴다.
  - **전체 모드:** 재료는 토픽 5개를 모두 쓴다. 스타는 `starsTargets`가 고른 레포마다 `GET /repos/{fullName}`을 한 번씩 호출한다. 동시 실행은 5개로 제한한다.
  - 축소한 수집기는 `run()` 결과에 `reduced: true`를 담는다. Task 6이 이 값을 `SourceStatus.reduced`로 옮긴다.

- [ ] **Step 1: 실패하는 테스트를 쓴다.**

```ts
test('parseTrendingHtml daily returns ~25 repos with numbers', () => {
  const r = parseTrendingHtml(read('trending-daily.html'), 'daily');
  assert.ok(r.length >= 10);
  assert.ok(r.every(x => /^[\w.-]+\/[\w.-]+$/.test(x.fullName) && x.stars > 0 && x.period === 'daily'));
});
test('parseGhRelease picks tag and first bullet note ≤120 chars', () => { /* version non-empty; note?.length <= 120 */ });
test('parseCursorChangelog returns a version or null, never throws', () => {});
test('starsTargets keeps only repos trending within trackDays and excludes today\'s trending', () => {
  const h = { 'a/x': { firstSeen: '2026-09-01', lastTrending: '2026-09-15', series: {} },
              'b/y': { firstSeen: '2026-10-10', lastTrending: '2026-10-20', series: {} },
              'c/z': { firstSeen: '2026-10-21', lastTrending: '2026-10-22', series: {} } };
  assert.deepEqual(starsTargets(h, '2026-10-22', 30, new Set(['c/z'])), ['b/y']);
});
test('kit collector in reduced mode issues exactly 2 search calls', async () => { /* counting fake fetch */ });
test('stars collector in reduced mode makes 0 API calls', async () => {});
```

- [ ] **Step 2:** 테스트를 실행한다. 기대 결과: FAIL
- [ ] **Step 3:** 파서, 수집기, `ALL_COLLECTORS`를 구현한다. HTML은 `node-html-parser`로 파싱한다.
- [ ] **Step 4:** 테스트를 실행한다. 기대 결과: PASS
- [ ] **Step 5:** 커밋한다. `feat: github-side collectors with reduced-mode budget`

---

### Task 6: 수집 CLI (실패 격리, 스타 기록)

**Files:**
- Create: `src/collectors/run.ts`, `src/cli/collect.ts`
- Test: `test/collect.test.ts`

**Interfaces:**
- Consumes: `ALL_COLLECTORS`, `RawSnapshotSchema`, `StarHistory`
- Produces:
  - `runCollectors(collectors, ctx, opts: { failIds?: Set<SourceId>; timeoutMs?: number }): Promise<{ snapshot: RawSnapshot; }>`
    - 실패한 수집기의 키는 빈 값(`[]` 또는 `{}`)으로 채운다.
  - `updateStarHistory(history: StarHistory, snapshot: RawSnapshot): StarHistory`
    - 오늘 트렌딩 레포는 `lastTrending=date`가 되고, 처음 보면 `firstSeen=date`가 된다.
    - `series[date]`는 `snapshot.stars[fullName]`이 있으면 그 값, 없으면 트렌딩의 `stars` 값이다.
  - CLI가 하는 일
    - `data/raw/<date>.json`을 쓰고 `data/stars/history.json`을 갱신한다.
    - 실패 출처를 표로 출력한다.
    - 종료 코드는 출처가 하나라도 성공하면 0, 전부 실패하면 1이다.
- 정할 값
  - `VR_FAIL_SOURCES=reddit,hn` 환경변수에 적힌 수집기는 실행하지 않고 실패로 기록한다(`error='forced failure'`). 완료 기준 검증에 쓴다.
  - 수집기 하나의 타임아웃은 30000ms다.
  - **결과가 0건이면 실패로 기록한다**(`ok=false`, `error='parsed 0 items'`). 대상은 `trending`, `hn`, `tools`다. → Review Focus 3

- [ ] **Step 1: 실패하는 테스트를 쓴다.** 가짜 수집기로 검사한다.

```ts
test('one throwing collector does not stop others', async () => {
  const { snapshot } = await runCollectors([okHn, throwingReddit], ctx, {});
  assert.equal(snapshot.hn.length, 2);
  assert.deepEqual(snapshot.reddit, []);
  assert.equal(snapshot.sources.find(s => s.id === 'reddit')!.ok, false);
});
test('failIds forces failure with message', async () => { /* error === 'forced failure' */ });
test('trending returning [] is recorded as parsed 0 items', async () => {});
test('updateStarHistory sets firstSeen once and appends series', () => {});
test('snapshot passes RawSnapshotSchema', async () => {});
```

- [ ] **Step 2:** 테스트를 실행한다. 기대 결과: FAIL
- [ ] **Step 3:** `run.ts`와 CLI를 구현한다. 날짜는 `kstDate(new Date())`이고, 모드는 `GITHUB_TOKEN`이 있는지로 정한다.
- [ ] **Step 4:** 테스트를 실행한다. 기대 결과: PASS
- [ ] **Step 5: 실제로 한 번 실행해서 확인한다.** `npm run collect`를 실행한다.
  - 기대 결과: `data/raw/<오늘>.json`이 생기고, 7개 이상 출처가 `ok`이다. 표에 `mode: reduced`가 나온다.
  - Reddit은 실패해도 괜찮다.
- [ ] **Step 6:** 커밋한다. `feat: collect CLI with failure isolation` (오늘 raw 파일도 같이 커밋한다)

---

### Task 7: 키워드, 핫이슈 묶기, 열기 점수

**Files:**
- Create: `src/analyze/stopwords.ts`, `keywords.ts`, `cluster.ts`, `heat.ts`, `src/lib/text.ts`(수정: `tokenize` 추가)
- Test: `test/keywords.test.ts`, `test/cluster.test.ts`, `test/heat.test.ts`

**Interfaces:**
- Consumes: `RawSnapshot`, `normalizeUrl`
- Produces:
  - `tokenize(s: string): string[]`
    - 소문자로 바꾸고, 영문은 3자 이상, 한글은 2자 이상만 남긴다.
    - 불용어와 숫자만 있는 토큰을 뺀다.
  - `extractTerms(docs: string[]): Map<string, number>`
    - 문서 빈도(한 문서에서 여러 번 나와도 1)를 센다.
    - 인접한 두 토큰이 둘 다 불용어가 아니면 `"a b"` 형태의 2단어 구문으로 포함한다.
  - `keywordTrends(today: Map<string,number>, previous: Map<string,number>[], topN = 20): KeywordTrend[]`
    - `avg7`는 `previous.length >= 7`일 때만 계산하고, 아니면 `null`이다.
    - `delta = today - avg7`
    - `isNew`는 previous가 1개 이상이고 그 어디에도 없을 때 true다.
  - `clusterIssues(raw: RawSnapshot): Issue[]` (heat가 채워진 상태, heat 내림차순)
  - `issueHeat(input: { hnPoints: number; comments: number; sourceCount: number; starDelta: number }): { heat: number; reason: string }`
- 정할 값
  - **열기 공식:** `n(x, cap) = min(1, ln(1+x)/ln(1+cap))`
    - `heat = round(100 * (0.40*n(hnPoints,1000) + 0.15*n(comments,500) + 0.20*min(sourceCount-1,2)/2 + 0.25*n(starDelta,5000)))`
    - `reason`은 0이 아닌 항목만 `·`로 이어 붙인다. 예: `"HN 974점 · 댓글 535 · 출처 2곳"`
  - **묶기 대상:** HN 30개, GeekNews, Reddit, 트렌딩 daily 상위 10개
  - **묶기 규칙:** 다음 중 하나라도 맞으면 union-find로 같은 이슈로 묶는다.
    - (a) `normalizeUrl`이 같다.
    - (b) 한쪽 url에 `github.com/{fullName}`이 들어 있고, 다른 쪽이 그 트렌딩 레포다.
    - (c) 제목 토큰 Jaccard ≥ 0.35이면서 공통 토큰이 2개 이상이다.
  - **이슈 속성**
    - 대표 제목: HN 항목 중 points가 가장 높은 것, 없으면 첫 항목
    - `hnPoints`: 묶음 안 HN points의 최댓값
    - `comments`: 묶음 안 HN 댓글의 합
    - `starDelta`: 트렌딩 daily의 `starsInPeriod`
    - `sources`: 묶음 안 항목들의 출처 목록(중복 제거)
    - `id`: 대표 URL을 `normalizeUrl`한 값의 짧은 해시
  - **불용어:** 영어 일반 불용어와 HN 상투어(`show`, `ask`, `hn`, `launch`, `release`, `new`, `using`, `via`, `thought`, `uncover` 등), 한국어 조사·상투어(`이번`, `공개`, `출시` 등)

- [ ] **Step 1: 실패하는 테스트를 쓴다.**

```ts
test('tokenize drops stopwords like thought/uncover', () => {
  assert.deepEqual(tokenize('We uncover a thought about PHP security'), ['php', 'security']);
});
test('extractTerms counts bigrams by document', () => {
  const m = extractTerms(['supply chain attack on PyPI', 'Another supply chain issue']);
  assert.equal(m.get('supply chain'), 2);
});
test('keywordTrends avg7 null with <7 days', () => { /* previous.length 3 → avg7 null, delta null */ });
test('issueHeat matches mockup scale', () => {
  const { heat, reason } = issueHeat({ hnPoints: 974, comments: 535, sourceCount: 2, starDelta: 0 });
  assert.ok(heat >= 60 && heat <= 70);       // 0.4*0.997+0.15*1+0.1 ≈ 0.65
  assert.equal(reason, 'HN 974점 · 댓글 535 · 출처 2곳');
});
test('clusterIssues merges two HN posts about PHP security release', () => {
  // fixture: 'PHP 8.2.35' (github.com/php/php-src/releases/...) + "Today's PHP security release, and how we're strengthening security"
  // + GeekNews 'PHP 보안 릴리즈' with same thephp.foundation url → one issue with sources ['hn','geeknews']
});
test('clusterIssues links HN post to trending repo by github url', () => {});
```

- [ ] **Step 2:** 테스트를 실행한다. 기대 결과: FAIL
- [ ] **Step 3:** 구현한다.
- [ ] **Step 4:** 테스트를 실행한다. 기대 결과: PASS
- [ ] **Step 5:** 커밋한다. `feat: keywords, issue clustering, heat score`

---

### Task 8: 게이지, 보안 경보, 도구·레포·재료 카드, 일일 리포트 조립

**Files:**
- Create: `src/analyze/gauge.ts`, `alerts.ts`, `tools.ts`, `repos.ts`, `kit.ts`, `report.ts`, `src/cli/analyze.ts`
- Test: `test/report.test.ts`

**Interfaces:**
- Consumes: Task 7의 함수들, `StarHistory`, `Config`
- Produces:
  - `computeGauge(issues: Issue[], previous: DailyReport[]): Gauge`
    - `value`는 상위 5개 heat의 평균(반올림)이고, 이슈가 없으면 0이다.
    - `daysOfHistory = min(previous.length, 7)`
    - `avg7`는 `previous.length >= 7`일 때 직전 7개 `gauge.value`의 평균이고, 아니면 null이다.
    - `label`은 `value >= avg7+10`이면 `'hot'`, `<= avg7-10`이면 `'calm'`, 그 사이면 `'normal'`, avg7이 null이면 null이다.
  - `pickAlerts(raw: RawSnapshot, config: Config): Alert[]`
    - **뉴스:** HN과 GeekNews 제목이 `securityTerms` 중 하나를 대소문자 구분 없이 포함하는 것. HN points순이다.
    - **권고:** `type==='reviewed'`, severity가 critical 또는 high, `publishedAt`이 `collectedAt`으로부터 24시간 이내, packages가 watchlist(해당 생태계)와 겹치는 것
    - 뉴스를 먼저 두고 최대 3건이다. 같은 URL은 하나로 합친다. malware는 제외한다.
  - `toolCards(raw: RawSnapshot): ToolCard[]`
    - `isRecent`는 `publishedAt`이 7일 이내인지다.
    - 정렬은 isRecent 먼저, 그다음 publishedAt 최신순이다.
  - `risingRepos(raw: RawSnapshot, history: StarHistory, topN = 10): RisingRepo[]`
    - history에 7일 이상 지난 값이 있으면 `delta7 = 오늘 - 그 값`, `deltaSource='history'`
    - 없으면 weekly 트렌딩의 `starsInPeriod`를 쓰고 `deltaSource='trending-weekly'`
    - 둘 다 없으면 제외한다.
    - `series`는 최근 30일이다.
  - `repoChanges(raw: RawSnapshot, prevRaw: RawSnapshot|null): { newRepos: RepoRef[]; droppedRepos: RepoRef[] }`
    - 오늘과 이전 raw의 트렌딩(daily+weekly) 레포 집합을 비교한다.
    - **`prevRaw`가 null이면 둘 다 빈 배열이다.** → Review Focus 2
  - `kitCards(raw: RawSnapshot, config: Config, topN = 12): KitCard[]`
    - 재료 검색 결과와, 토픽이나 설명이 kitTopics 또는 `mcp|skill|agent|rules` 정규식에 맞는 트렌딩 레포를 합친다. fullName으로 중복을 없애고 스타순으로 정렬한다.
    - kind는 이름+설명+토픽을 아래 순서로 검사해 처음 맞는 것이다.
      1. `mcp` → MCP
      2. `skill` → SKILL
      3. `cursor-rules|rules|claude.md|agents.md` → RULES
      4. `cli` → CLI
      5. `agent` → AGENT
      6. 그 외 → OTHER
    - `isNew`는 createdAt이 30일 이내인지다.
  - `buildDailyReport(input: { raw: RawSnapshot; prevRaw: RawSnapshot|null; previous: DailyReport[]; history: StarHistory; config: Config }): DailyReport`
    - 반환 전에 `DailyReportSchema.parse`로 검증한다.
    - `scanNo = previous.length + 1`
    - `title_ko`, `summary_ko`, `check_ko`, `note_ko`, `description_ko`는 모두 null로 둔다.
    - `paperCategories`는 count 내림차순이다.
    - `feeds.hn`은 points순 30개다.
  - `analyzeDate(date: string, dataDir = 'data'): DailyReport`
    - `data/raw/<date>.json`, 그 이전 raw 하나, `data/daily/`의 그 이전 7개를 읽어 `data/daily/<date>.json`을 쓴다.
  - CLI: `npm run analyze [-- --date YYYY-MM-DD]`

- [ ] **Step 1: 실패하는 테스트를 쓴다.**

```ts
test('first day: no previous → gauge label null, daysOfHistory 0, no new/dropped', () => {
  const r = buildDailyReport({ raw: fixtureRaw, prevRaw: null, previous: [], history: {}, config });
  assert.equal(r.gauge.label, null); assert.equal(r.gauge.daysOfHistory, 0);
  assert.deepEqual(r.newRepos, []); assert.deepEqual(r.droppedRepos, []);
  assert.ok(r.rising.every(x => x.deltaSource === 'trending-weekly'));
});
test('gauge hot when value ≥ avg7+10', () => { /* 7 previous at 60, today issues heat avg 75 → 'hot' */ });
test('pickAlerts excludes malware and non-watchlist advisories, caps at 3', () => {});
test('pickAlerts includes HN post titled "Compromised LiteLLM ... Backdoor"', () => {});
test('risingRepos prefers history delta when 7-day-old point exists', () => {});
test('kitCards classifies cloudflare/security-audit-skill as SKILL', () => {});
test('buildDailyReport output passes schema', () => {});
```

  `fixtureRaw`는 Task 6에서 만든 실제 raw 파일을 `test/fixtures/raw-sample.json`으로 복사해 쓴다.
- [ ] **Step 2:** 테스트를 실행한다. 기대 결과: FAIL
- [ ] **Step 3:** 구현한다.
- [ ] **Step 4:** `npm test`를 실행하고, 이어서 `npm run analyze`를 실행한다. 기대 결과: PASS이고, `data/daily/<오늘>.json`이 생긴다. 이 파일을 `test/fixtures/daily-sample.json`으로 복사한다. Task 12와 13의 화면 테스트가 이 파일을 쓴다.
- [ ] **Step 5:** 커밋한다. `feat: daily report assembly`

---

### Task 9: AI 요약과 번역 (GitHub Models, 실패해도 진행)

**Files:**
- Create: `src/summarize/models.ts`, `translate.ts`, `summarize.ts`, `src/cli/summarize.ts`
- Test: `test/summarize.test.ts`

**Interfaces:**
- Consumes: `DailyReport`, `fetchJson`
- Produces:
  - `chat(messages: {role:'system'|'user'; content:string}[], opts: { token: string; fetch?: FetchLike; model?: string }): Promise<string>`
    - `POST https://models.github.ai/inference/chat/completions`
    - 기본 모델은 `openai/gpt-4.1-mini`, `temperature: 0.2`, 응답은 JSON 모드다.
  - `TranslationCache = Record<string, string>` (파일: `data/cache/translations.json`)
    - 키 규칙은 `repo:{fullName}`, `release:{tool}:{version ?? publishedAt}`, `advisory:{id}`, `news:{normalizeUrl(url)}`이다.
  - `translateBatch(items: {key:string; text:string}[], cache: TranslationCache, chatFn): Promise<TranslationCache>`
    - 캐시에 없는 것만 보낸다.
    - 40개씩 한 번에 보내고 `{key: 번역}` JSON으로 받는다.
    - 실패한 묶음은 건너뛴다.
  - `summarizeReport(report: DailyReport, cache: TranslationCache, chatFn): Promise<{ report: DailyReport; cache: TranslationCache }>`
    - 상위 5개 이슈의 `title_ko`, `summary_ko`(2~3문장), `check_ko`(1문장)를 한 번의 호출로 채운다.
    - `tools.note_ko`, `rising/kit.description_ko`, `alerts.title_ko`는 `translateBatch`로 채운다.
  - CLI 동작
    - `GITHUB_TOKEN`이 없으면 `"summarize: skipped (no GITHUB_TOKEN)"`을 출력하고 종료 코드 0으로 끝낸다.
    - 어떤 오류든 기록만 하고 종료 코드 0으로 끝낸다.
    - 성공하면 daily 파일과 캐시를 덮어쓴다.
- 정할 값
  - 요약 프롬프트(system, 그대로 쓴다): `"너는 한국 개발자, 특히 AI로 코딩하는 바이브코더를 위한 뉴스 편집자다. 과장 없이, 사실만, 존댓말 해요체로 쓴다. 주어진 정보에 없는 사실은 만들지 않는다."`
  - 응답 형식: `{"issues":[{"id":"...","title_ko":"...","summary_ko":"...","check_ko":"..."}]}`

- [ ] **Step 1: 실패하는 테스트를 쓴다.** 가짜 chatFn을 주입해서 검사한다.

```ts
test('translateBatch only sends uncached keys', async () => { /* cache has repo:a/x → chatFn receives 1 of 2 */ });
test('summarizeReport fills top issues and keeps others null', async () => {});
test('chat failure leaves report unchanged and does not throw', async () => {
  const bad = async () => { throw new Error('429'); };
  const { report } = await summarizeReport(sample, {}, bad);
  assert.equal(report.issues[0].summary_ko, null);
});
test('model returning ids not in report are ignored', async () => {});
```

- [ ] **Step 2:** 테스트를 실행한다. 기대 결과: FAIL
- [ ] **Step 3:** 구현한다.
- [ ] **Step 4:** 테스트를 실행한다. 기대 결과: PASS. 이어서 `npm run summarize`를 실행한다. 기대 결과: `skipped (no GITHUB_TOKEN)`이 나오고 종료 코드 0이다.
- [ ] **Step 5:** 커밋한다. `feat: GitHub Models summaries and cached translations`

---

### Task 10: 화면용 데이터 내보내기와 로컬 서버

**Files:**
- Create: `src/cli/build.ts`, `src/cli/serve.ts`
- Test: `test/build.test.ts`

**Interfaces:**
- Consumes: `analyzeDate`, `DailyReportSchema`, `SiteIndexSchema`
- Produces:
  - `exportSite(opts: { dataDir: string; outDir: string; today: string; keepDays?: number }): SiteIndex`
    1. `raw`는 있는데 `daily`가 없는 날짜(최근 90일)는 `analyzeDate`로 만든다. 이미 있는 daily는 다시 만들지 않는다. CI에서 붙인 요약이 지워지지 않게 하기 위해서다.
    2. 최근 `keepDays=90`일의 daily를 검증한 뒤 `outDir/days/<date>.json`으로 복사한다.
    3. `outDir/latest.json`(가장 최신 리포트)과 `outDir/index.json`을 쓴다.
    4. `outDir/days/`에서 90일보다 오래된 파일은 지운다.
  - `serve`: `web/`을 `http://localhost:4173`에서 서빙한다. `node:http`만 쓰고, 경로 탈출(`..`)은 403으로 막는다.

- [ ] **Step 1: 실패하는 테스트를 쓴다.** 임시 폴더로 검사한다.

```ts
test('exportSite writes latest/index/days and keeps newest first', () => {});
test('exportSite does not overwrite existing daily (keeps summary_ko)', () => {});
test('exportSite drops days older than 90', () => {});
test('invalid daily file fails build with file name in error', () => {});
```

- [ ] **Step 2:** 테스트를 실행한다. 기대 결과: FAIL
- [ ] **Step 3:** 구현한다.
- [ ] **Step 4:** 테스트를 실행한다. 기대 결과: PASS. 이어서 `npm run build`를 실행한다. 기대 결과: `web/data/latest.json`, `index.json`, `days/<오늘>.json`이 생긴다.
- [ ] **Step 5:** 커밋한다. `feat: site export and local server`

---

### Task 11: 화면 공통부(core)와 빈 테스트용 테마

**Files:**
- Create: `web/index.html`, `web/site.config.js`, `web/core/app.js`, `mode.js`, `router.js`, `data.js`, `format.js`, `web/themes/plain/render.js`, `web/themes/plain/theme.css`
- Test: `web/core/mode.test.js`, `router.test.js`, `format.test.js`

**Interfaces:**
- Produces (테마가 쓰는 계약):
  - `site.config.js`: `export default { theme: 'aurora-hud' }`
  - 테마 모듈: `export default { name: string, render(ctx: ViewCtx): string }` + `theme.css`
  - `ViewCtx`의 필드
    - `report: DailyReport`
    - `index: SiteIndex`
    - `route: Route`
    - `mode: 'light'|'dark'`
    - `notice: string|null` (예: 없는 날짜 안내)
    - `fmt` (format.js의 함수 묶음)
  - 테마가 HTML에 다는 동작 속성(core가 이벤트를 연결한다)
    - `data-action="toggle-mode"`
    - `<select data-date-select>`
    - `<a href="#/...">`
  - `router.js`
    - `parseRoute(hash: string, dates: string[]): { route: Route; notice: string|null }`
    - `Route { view: 'briefing'|'tools'|'kit'|'repos'|'papers'|'sources'; date: string|null; params: Record<string,string> }`
    - `toHash(route: Route): string`
    - 모르는 view는 briefing으로 바꾼다.
    - `d`가 형식에 맞지 않거나 `dates`에 없으면 `date=null`이고 notice는 `'그 날짜 기록이 없어요. 최신 브리핑을 보여드려요.'`다.
  - `mode.js`
    - `initialMode(storage: Storage|null, prefersDark: boolean): 'light'|'dark'`
    - `createModeController({ root: HTMLElement, storage, prefersDark }): { get(): Mode; toggle(): Mode }`
    - storage 읽기·쓰기 예외는 삼킨다.
  - `data.js`
    - `loadIndex(fetchFn = fetch): Promise<SiteIndex>`
    - `loadDay(date: string|null, fetchFn): Promise<DailyReport>` (null이면 `data/latest.json`)
  - `format.js`
    - `esc(s: unknown): string` (`& < > " '` 이스케이프, null은 `''`)
    - `count(n)` → `16000`→`'16.0K'`, `3681`→`'3,681'`, `358000`→`'358K'` (1만 미만은 콤마, 1만 이상 10만 미만은 소수 1자리 K, 10만 이상은 정수 K)
    - `signed(n)` → `'+3,681'`
    - `ago(iso, now)` → `'2시간 전'`, `'어제'`, `'3일 전'`
    - `kstStamp(iso)` → `'2026.10.22 THU · 09:08 KST'`
    - `koOr(ko, orig)` → ko가 있으면 ko, 없으면 orig
- 정할 값
  - `index.html`의 `<head>` 안에는 **렌더링 전에 실행되는 인라인 스크립트**를 둔다. `vr-mode`를 읽고(try/catch), 없으면 `matchMedia('(prefers-color-scheme: dark)')`로 정해서 `data-mode`를 단다.
  - 같은 `<head>`의 인라인 `<style>`에 `html[data-mode=dark]{background:#070814} html[data-mode=light]{background:#f3f5fc}`를 넣어 첫 화면이 번쩍이지 않게 한다.
  - `app.js`가 하는 일
    1. config를 읽고 테마 CSS `<link>`를 추가한 뒤, 테마 모듈을 동적 import한다.
    2. `hashchange`가 오면 다시 그린다.
    3. 데이터를 불러오지 못하면 `#app`에 `'데이터를 불러오지 못했어요'`를 보여준다.
  - `plain` 테마는 리포트 날짜, 이슈 제목 목록, 토글 버튼만 그린다. 라이트·다크 CSS 변수도 갖춘다. 완료 기준의 "테마 교체 확인"에 쓴다.

- [ ] **Step 1: 실패하는 테스트를 쓴다.**

```js
test('initialMode falls back to system when storage throws', () => {
  const s = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } };
  assert.equal(initialMode(s, true), 'dark');
});
test('toggle works even when storage throws', () => { /* fake root {dataset:{}} → toggle() twice → 'light','dark' alternation */ });
test('stored mode wins over system', () => { /* getItem → 'light', prefersDark true → 'light' */ });
test('parseRoute unknown date gives notice and null date', () => {
  const { route, notice } = parseRoute('#/?d=2020-01-01', ['2026-10-22']);
  assert.equal(route.date, null); assert.match(notice, /기록이 없어요/);
});
test('parseRoute garbage view → briefing', () => {});
test('parseRoute keeps params: #/papers?cat=cs.CL&d=2026-10-22', () => {});
test('esc escapes markup', () => { assert.equal(esc('<img src=x onerror=a>'), '&lt;img src=x onerror=a&gt;'); });
test('count formats like mockup', () => { assert.equal(count(16000), '16.0K'); assert.equal(count(3681), '3,681'); assert.equal(count(358000), '358K'); });
```

- [ ] **Step 2:** `npm test`를 실행한다. 기대 결과: FAIL
- [ ] **Step 3:** core, index.html, plain 테마를 구현한다.
- [ ] **Step 4:** `npm test`를 실행한다. 기대 결과: PASS
- [ ] **Step 5: 브라우저로 확인한다.** `site.config.js`를 `plain`으로 바꾸고 `npm run serve`를 실행한 뒤 `http://localhost:4173`을 연다.
  - 기대 결과: 이슈 목록이 보이고, 토글을 누르면 `data-mode`가 바뀌고, 새로고침해도 유지된다.
  - 확인한 뒤 config를 `aurora-hud`로 되돌린다.
- [ ] **Step 6:** 커밋한다. `feat: web core (mode, router, data) and plain theme`

---

### Task 12: 오로라 HUD 테마 — 공통 틀과 브리핑 화면

**Files:**
- Create: `web/themes/aurora-hud/theme.css`, `render.js`, `views/shell.js`, `views/briefing.js`
- Test: `web/themes/aurora-hud/render.test.js`

**Interfaces:**
- Consumes: Task 11의 `ViewCtx`와 `fmt`
- Produces:
  - `render(ctx)`는 `shell(ctx, body)`로 감싼 화면 HTML을 돌려준다.
  - `views/*.js`는 각각 `(ctx) => string`이다.
- 디자인 기준은 `design/mockup-v3-E-light-dark.html`이다. CSS 변수 두 벌(`[data-mode="light"]`, `[data-mode="dark"]`)과 `.hud`, `.lab`, `.gauge`, `.lead`, `.alert`, `.row` 스타일을 그대로 옮긴다.
- 정할 값
  - **shell (상단)**
    - 로고 `vibe<span>/</span>radar`
    - 메뉴 6개(브리핑·도구·재료·레포·논문·출처). 현재 view에는 `.on`을 붙인다.
    - 시계 자리는 `<select data-date-select>`다. 옵션은 `index.dates`이고, 표시는 `kstStamp(report.collectedAt) · SCAN #{scanNo}`이다.
    - 출처 상태는 `● {ok 개수}/{전체} 출처`이고, 실패한 출처 이름은 title 속성에 넣는다.
    - `mode==='reduced'`이면 `축소 모드` 딱지를 단다.
    - 토글 버튼은 `data-action="toggle-mode"`이고, 해와 달 아이콘 스위치다.
    - `notice`가 있으면 상단에 안내 띠를 띄운다.
  - **브리핑**
    - **게이지:** `gauge.value`
      - 문구는 label에 따라 `hot→'평소보다 뜨거움'`, `normal→'평소 수준'`, `calm→'조용한 편'`, `null→'기록 쌓는 중 ({daysOfHistory}/7일)'`이다.
      - 링의 `stroke-dashoffset = 314 * (1 - value/100)`
      - 아래에 상위 이슈의 `heatReason`을 한 줄로 쓴다.
    - **1면:** `issues[0]`
      - 제목은 `koOr(title_ko, title)`이다.
      - 본문은 `summary_ko`가 있으면 그것을 쓰고, 없으면 `items`를 "출처 · 점수 · 댓글" 목록으로 보여준다.
      - `check_ko`가 있을 때만 "바이브코더 체크" 칸을 보여준다.
      - `issues[1..3]`은 바로가기 칸이다.
      - 이슈가 0개면 `'오늘은 아직 모인 이슈가 없어요'`를 보여준다.
    - **경보 띠:** `alerts`가 0개면 아예 그리지 않는다. 있으면 각 경보를 한 줄씩 보여준다.
    - **3열 패널:** 도구 5개, 급상승 5개, 재료 5개. 각 패널 하단에 해당 view로 가는 "더 보기" 링크를 둔다.
      - `deltaSource==='trending-weekly'`인 값에는 작은 `주간 트렌딩 기준` 표시를 붙인다.
  - **모든 문자열은 `fmt.esc`를 거친다.** 링크는 `target="_blank" rel="noopener"`다. → Review Focus 1
  - `@media (max-width:900px)`이면 한 열로 바꾸고 메뉴는 가로 스크롤로 만든다. `@media (prefers-reduced-motion: reduce)`이면 애니메이션을 끈다.

- [ ] **Step 1: 실패하는 테스트를 쓴다.** 샘플 리포트 `test/fixtures/daily-sample.json`을 `readFileSync`로 읽어 검사한다.

```js
test('escapes hostile titles', () => {
  const r = structuredClone(sample); r.issues[0].title = '<img src=x onerror=alert(1)>';
  const html = theme.render(ctx(r));
  assert.ok(!html.includes('<img src=x')); assert.ok(html.includes('&lt;img'));
});
test('no alerts → no alert band markup', () => { /* !html.includes('class="hud alert') */ });
test('gauge null label shows 기록 쌓는 중 (0/7일)', () => {});
test('falls back to original title when title_ko null', () => {});
test('reduced mode shows 축소 모드 badge', () => {});
test('toggle button present with data-action', () => {});
test('never renders the word 예시', () => { assert.ok(!html.includes('예시')); });
```

- [ ] **Step 2:** `npm test`를 실행한다. 기대 결과: FAIL
- [ ] **Step 3:** 구현한다.
- [ ] **Step 4:** `npm test`를 실행한다. 기대 결과: PASS
- [ ] **Step 5: 브라우저로 확인한다.** `npm run serve`를 실행하고, 1280px에서 라이트와 다크를 각각 스크린샷으로 남긴다.
  - 기대 결과: 시안 v3와 같은 구성이고, 실제 오늘 데이터가 나오고, 토글이 동작한다.
- [ ] **Step 6:** 커밋한다. `feat: aurora-hud shell and briefing view`

---

### Task 13: 오로라 HUD — 도구·재료·레포·논문·출처 화면

**Files:**
- Create: `web/themes/aurora-hud/views/tools.js`, `kit.js`, `repos.js`, `papers.js`, `sources.js`
- Modify: `web/themes/aurora-hud/render.js` (view 분기), `theme.css`
- Test: `web/themes/aurora-hud/render.test.js` (추가)

**Interfaces:**
- Consumes: Task 12의 `shell`과 CSS 클래스
- 정할 값
  - **도구:** 카드 그리드다. 카드마다 도구 이름, 버전(없으면 날짜만), `ago(publishedAt)`, `koOr(note_ko, note)`, 릴리즈 링크를 보여준다. `isRecent`이면 `NEW` 딱지를 단다.
  - **재료:** kind 필터 칩(전체·MCP·SKILL·RULES·CLI·AGENT)을 둔다. 필터는 `#/kit?kind=MCP` 주소로 동작한다. 카드에는 스타, 설명, `isNew` 딱지를 보여준다.
  - **레포**
    - 급상승 10개: 각 줄에 인라인 SVG 스파크라인(`series`, 점이 2개 미만이면 생략)과 `signed(delta7)`를 보여준다.
    - 신규 목록과 빠진 목록을 보여준다. 비어 있으면 `'비교할 이전 기록이 아직 없어요'`를 보여준다.
    - 키워드 칩: `delta`가 있으면 ▲/▼ 값을, `isNew`이면 `신규`를, 둘 다 없으면 오늘 빈도만 보여준다.
  - **논문**
    - 분야 칩(`paperCategories`)을 `#/papers?cat=cs.CL`로 필터한다.
    - 논문 목록(제목 원문, 분야, arXiv 링크)을 보여준다.
    - 하단에 HF 트렌딩 모델 10개(likes, pipeline)를 보여준다.
  - **출처:** HN 30개(점수·댓글·도메인), GeekNews, Reddit(서브레딧 표시)을 세 열로 보여준다. 출처가 실패했으면 그 열에 `'오늘은 이 출처를 가져오지 못했어요'`를 보여준다.
  - 모든 view에서 데이터가 비어 있으면 비었다는 상태를 보여준다. 지어낸 값은 넣지 않는다.

- [ ] **Step 1: 실패하는 테스트를 쓴다.**

```js
test('kit filter by kind', () => { /* route.params.kind='MCP' → only MCP cards */ });
test('papers filter by cat', () => {});
test('repos with no previous shows 비교할 이전 기록이 아직 없어요', () => {});
test('sources shows failure message for failed reddit', () => {});
test('sparkline omitted when series < 2 points', () => {});
test('unknown date notice renders on any view', () => {});
```

- [ ] **Step 2:** 테스트를 실행한다. 기대 결과: FAIL
- [ ] **Step 3:** 구현한다.
- [ ] **Step 4:** 테스트를 실행한다. 기대 결과: PASS
- [ ] **Step 5:** 커밋한다. `feat: aurora-hud secondary views`

---

### Task 14: GitHub Actions 워크플로와 최종 검증

**Files:**
- Create: `.github/workflows/daily.yml`
- Modify: `README.md` (배포 방법 추가)

**Interfaces:**
- Consumes: 모든 npm 스크립트
- 정할 값 (`daily.yml`)
  - 트리거
    - `schedule: cron '0 0 * * *'`
    - `workflow_dispatch`
    - `push`: `branches: [main]`, `paths: ['web/**','src/**']`
  - `permissions`: `contents: write`, `pages: write`, `id-token: write`, `models: read`
  - `concurrency: { group: pages, cancel-in-progress: false }`
  - job `update`
    1. checkout
    2. setup-node `24`
    3. `npm ci`
    4. **push 이벤트가 아닐 때만** `npm run collect`, `npm run analyze`, `npm run summarize`를 실행한다. env `GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}`
    5. `npm run build`
    6. push가 아니면 `data/`를 커밋하고 push한다. 커밋할 변경이 없으면 넘어간다. 작성자는 `github-actions[bot]`이다.
    7. `actions/upload-pages-artifact`(path `web`)
  - job `deploy`: `actions/deploy-pages`
  - README에 "새 공개 저장소를 만들고, Settings → Pages → Source를 GitHub Actions로 설정"하는 절차를 쓴다.

- [ ] **Step 1:** 워크플로를 작성한다. `npx --yes @action-validator/cli .github/workflows/daily.yml`로 문법을 검사한다. 이 도구를 쓸 수 없으면 YAML 파싱만 확인한다. 기대 결과: 오류 0
- [ ] **Step 2: 전체 흐름을 로컬에서 확인한다.** `npm test && npm run typecheck && npm run collect && npm run build`를 실행한다. 기대 결과: 모두 성공이고, 출력에 `mode: reduced`가 나온다.
- [ ] **Step 3: 실패 격리를 확인한다.** `VR_FAIL_SOURCES=reddit npm run collect && npm run build`를 실행한 뒤 브라우저로 본다. 기대 결과: 출처 상태에 실패 1개가 표시되고, 출처 화면 Reddit 열에 실패 안내가 나오고, 나머지는 정상이다.
- [ ] **Step 4: 브라우저 4가지 조합을 확인한다.** 1280px·375px × 라이트·다크로 각 view를 스크린샷한다. 기대 결과: 가로 스크롤이 없고, 글자가 겹치지 않고, `예시`라는 글자가 없다.
- [ ] **Step 5: 토글이 유지되는지 확인한다.** 다크로 바꾸고 새로고침한다. 기대 결과: 다크가 유지된다.
- [ ] **Step 6: 테마 교체를 확인한다.** `site.config.js`를 `plain`으로 바꾸고 새로고침한다. 기대 결과: core와 데이터를 고치지 않아도 동작한다. 확인한 뒤 되돌린다.
- [ ] **Step 7:** 커밋한다. `ci: daily collect and pages deploy workflow`
- [ ] **Step 8: 사용자에게 넘길 내용을 정리한다.** 아래 두 가지는 아직 확인하지 못했다고 명시한다.
  - 저장소 생성과 push 방법
  - GitHub Models 요약은 Actions 첫 실행에서 확인해야 한다는 점
