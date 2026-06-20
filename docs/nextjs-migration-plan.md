# LinkVault Next.js Migration Plan

## 1. 목적

현재 LinkVault는 단일 `index.html`, Vercel Serverless Function, Supabase를 조합한 가벼운 웹 앱이다. 이 문서는 기존 기능을 보존하면서 Next.js 기반 웹 애플리케이션으로 마이그레이션하기 위한 상세 구현 계획을 정의한다.

마이그레이션의 핵심 목표는 다음과 같다.

- 기존 LinkVault 기능을 Next.js App Router 구조로 이전한다.
- 단일 HTML 파일에 섞여 있는 UI, 상태 관리, API 호출, Supabase 로직을 역할별 모듈로 분리한다.
- Gemini API 키처럼 민감한 값은 서버 전용 환경변수로 유지한다.
- Supabase 스키마와 RLS 정책은 가능한 한 유지하여 데이터베이스 이전 비용을 줄인다.
- Vercel 배포 흐름을 Next.js 표준 배포 흐름으로 정리한다.

## 2. 현재 프로젝트 상태

### 2.1 현재 기술 스택

- Frontend: HTML, CSS, Vanilla JavaScript
- Backend API: Vercel Serverless Functions, Node.js CommonJS
- Database/BaaS: Supabase
- AI: Gemini API (`gemini-2.5-flash`)
- External Source: YouTube metadata, caption, timedtext, Innertube endpoint
- Deployment: Vercel

### 2.2 주요 파일

```txt
index.html
api/youtube-metadata.js
api/analyze-youtube.js
supabase_setup.sql
supabase_mvp_setup.sql
vercel.json
README.md
```

### 2.3 현재 기능

- LinkVault 랜딩/앱 UI 표시
- Supabase 기반 waitlist 등록
- 이메일 기반 saved links 저장/조회/삭제/업데이트
- 북마클릿 생성 및 저장 플로우
- YouTube URL 메타데이터 조회
- YouTube 자막 수집
- Gemini를 통한 한국어 위키 스타일 요약 생성
- 키워드, 토픽, 위키링크 추출
- 로컬 설정값 저장

## 3. 목표 아키텍처

### 3.1 권장 스택

- Next.js App Router
- TypeScript
- React
- Supabase JS v2
- Vercel
- CSS 전략: 1차는 기존 CSS를 `globals.css`로 이전, 2차에서 Tailwind 또는 CSS Modules 검토

### 3.2 목표 디렉터리 구조

```txt
app/
  layout.tsx
  page.tsx
  globals.css
  api/
    youtube-metadata/
      route.ts
    analyze-youtube/
      route.ts
components/
  app-shell/
    AppShell.tsx
    Sidebar.tsx
  home/
    HomeView.tsx
  sources/
    SourcesView.tsx
    SavedLinksList.tsx
    SaveLinkModal.tsx
    BookmarkletBuilder.tsx
  wiki/
    WikiView.tsx
  settings/
    SettingsView.tsx
  waitlist/
    WaitlistForm.tsx
lib/
  supabase/
    client.ts
  youtube/
    ids.ts
    metadata.ts
    transcript.ts
  gemini/
    summarize.ts
  links/
    saved-links.ts
  markdown/
    wiki.ts
types/
  linkvault.ts
  api.ts
```

### 3.3 클라이언트와 서버 책임 분리

클라이언트에서 처리할 것:

- 화면 렌더링
- 탭/페이지 상태
- 저장 링크 목록 표시
- 사용자 입력 처리
- `localStorage` 기반 이메일 및 앱 URL 저장
- Supabase anon key 기반 공개 범위 데이터 요청

서버에서 처리할 것:

- Gemini API 호출
- YouTube 페이지, caption, timedtext fetch
- YouTube URL 분석
- API 응답 정규화
- 민감한 환경변수 접근

## 4. 환경변수 계획

Next.js에서는 브라우저에 노출 가능한 값과 서버 전용 값을 명확히 분리한다.

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
GEMINI_API_KEY=
GEMINI_MODEL=gemini-2.5-flash
```

주의사항:

- `NEXT_PUBLIC_` 접두사가 붙은 값은 브라우저 번들에 포함된다.
- `GEMINI_API_KEY`는 반드시 서버 Route Handler에서만 접근한다.
- Supabase anon key는 브라우저 노출이 가능하지만, 보안은 RLS 정책으로 통제해야 한다.

## 5. 단계별 구현 계획

## Phase 1. Next.js 프로젝트 기반 구성

목표:

- 현재 저장소를 Next.js 앱 구조로 전환한다.
- TypeScript 기반 개발 환경을 만든다.

작업:

1. `package.json` 및 pnpm workspace 설정 생성
2. Next.js, React, TypeScript 의존성 추가
3. `tsconfig.json`, `next.config.ts`, `eslint.config` 구성
4. `app/layout.tsx`, `app/page.tsx`, `app/globals.css` 생성
5. 기존 `vercel.json` 설정과 충돌 여부 확인

예상 산출물:

```txt
package.json
app/layout.tsx
app/page.tsx
app/globals.css
tsconfig.json
next.config.ts
```

완료 기준:

- `pnpm dev`로 Next.js 앱이 실행된다.
- 기본 페이지가 브라우저에서 렌더링된다.
- Vercel 배포 가능 구조가 유지된다.

## Phase 2. 기존 UI를 React 컴포넌트로 이전

목표:

- `index.html`에 들어 있는 HTML 구조와 CSS를 React 기반 구조로 옮긴다.
- 기능 변경 없이 화면을 먼저 재현한다.

작업:

1. `index.html`의 `<style>` 내용을 `app/globals.css`로 이동
2. 주요 화면을 컴포넌트로 분리
3. 기존 `onclick` 기반 이벤트를 React 이벤트 핸들러로 변경
4. `showAppPage()` 기반 화면 전환을 React state로 변경
5. Save modal, library list, wiki view, settings view를 컴포넌트화

권장 컴포넌트 분리:

```txt
AppShell
Sidebar
HomeView
SourcesView
SavedLinksList
SaveLinkModal
BookmarkletBuilder
WikiView
SettingsView
WaitlistForm
```

완료 기준:

- 기존 주요 화면이 Next.js 앱에서 표시된다.
- 홈, 소스, 위키, 설정 화면 전환이 동작한다.
- UI가 기존과 큰 차이 없이 렌더링된다.

## Phase 3. 타입 정의 추가

목표:

- API 응답, Supabase row, UI state에 대한 타입을 정의한다.
- 마이그레이션 중 런타임 실수를 줄인다.

작업:

1. `types/linkvault.ts` 생성
2. `SavedLink`, `WaitlistEntry`, `AnalyzeYouTubeResponse`, `YouTubeMetadataResponse` 정의
3. 컴포넌트 props 타입 정의
4. Supabase insert/update payload 타입 정의

예시 타입:

```ts
export type SavedLink = {
  id: string;
  owner_email: string;
  source_url: string;
  canonical_source_url?: string | null;
  title: string;
  platform: string;
  summary?: string | null;
  keywords?: string[] | null;
  topics?: string[] | null;
  wikilinks?: string[] | null;
  markdown_source?: string | null;
  markdown_summary?: string | null;
  transcript_status?: string | null;
  transcript_excerpt?: string | null;
  created_at: string;
};
```

완료 기준:

- 주요 데이터 구조가 타입으로 표현된다.
- API 호출 결과를 `any` 없이 다룰 수 있다.

## Phase 4. Supabase 클라이언트 이전

목표:

- Supabase 초기화 로직을 `lib/supabase/client.ts`로 분리한다.
- 기존 저장/조회/삭제/업데이트 기능을 React 환경에서 동작하게 한다.

작업:

1. `@supabase/supabase-js` 설치
2. `lib/supabase/client.ts` 작성
3. 기존 `supabaseClient` 전역 변수를 모듈 import 방식으로 변경
4. saved links 관련 함수를 `lib/links/saved-links.ts`로 분리
5. waitlist 등록 함수 분리

권장 함수:

```txt
findExistingSavedLink(email, url)
loadSavedLinks(email)
saveLink(payload)
deleteSavedLink(id)
updateSavedLinkAnalysis(id, payload)
joinWaitlist(payload)
```

완료 기준:

- 이메일 입력 후 saved links 목록을 불러올 수 있다.
- 새 링크를 저장할 수 있다.
- 기존 링크 삭제가 가능하다.
- 재분석 결과 업데이트가 가능하다.

## Phase 5. YouTube metadata API 이전

목표:

- `api/youtube-metadata.js`를 Next.js Route Handler로 이전한다.

현재 파일:

```txt
api/youtube-metadata.js
```

목표 파일:

```txt
app/api/youtube-metadata/route.ts
lib/youtube/ids.ts
lib/youtube/metadata.ts
```

작업:

1. `getVideoId()`를 `lib/youtube/ids.ts`로 이동
2. `fetchOEmbedTitle()`과 `fetchPageTitle()`을 `lib/youtube/metadata.ts`로 이동
3. `POST` Route Handler 작성
4. 요청 body validation 추가
5. 응답 타입 정의

완료 기준:

- 클라이언트에서 `/api/youtube-metadata`로 POST 요청 가능
- YouTube watch, shorts, embed, youtu.be URL에서 video id 추출 가능
- 제목을 정상 반환하거나 안전하게 빈 문자열 반환

## Phase 6. YouTube analysis API 이전

목표:

- `api/analyze-youtube.js`를 Next.js Route Handler와 라이브러리 모듈로 분리한다.

현재 파일:

```txt
api/analyze-youtube.js
```

목표 파일:

```txt
app/api/analyze-youtube/route.ts
lib/youtube/transcript.ts
lib/gemini/summarize.ts
lib/markdown/wiki.ts
```

작업:

1. YouTube URL 검증 및 video id 추출 로직 재사용
2. 자막 트랙 추출 함수 분리
3. timedtext fetch 함수 분리
4. transcript parser 분리
5. markdown source 생성 함수 분리
6. Gemini 요약 함수 분리
7. Gemini key가 없을 때 fallback summary 유지
8. API 응답 스키마 정리

완료 기준:

- `/api/analyze-youtube`가 기존 API와 호환되는 JSON을 반환한다.
- 자막이 있는 YouTube 영상은 transcript를 가져온다.
- `GEMINI_API_KEY`가 있으면 Gemini 2.5 Flash로 요약을 생성한다.
- `GEMINI_API_KEY`가 없으면 기존처럼 fallback preview를 반환한다.

## Phase 7. 북마클릿 플로우 이전

목표:

- 기존 북마클릿 기반 저장 흐름을 Next.js에서도 유지한다.

작업:

1. URL query parameter 처리 로직 구현
2. `?save=1&url=...&title=...&text=...` 진입 시 save modal 자동 표시
3. 앱 주소 입력값을 `localStorage`에 저장
4. bookmarklet code 생성 로직을 React 함수로 이전
5. 배포 URL 기준 동작 확인

완료 기준:

- Next.js 앱에서 북마클릿 생성 가능
- 외부 페이지에서 북마클릿 실행 시 LinkVault 저장 모달이 열린다.
- URL, title, selected text가 정상 전달된다.

## Phase 8. Wiki/Concept View 이전

목표:

- 저장된 링크들의 keywords, topics, wikilinks, markdown summary를 기반으로 위키 뷰를 재구성한다.

작업:

1. 기존 `wikilinksFromMarkdown()` 이전
2. concept aggregation 함수 분리
3. 검색/필터 상태 구현
4. 연결 콘텐츠 표시 구현
5. 빈 상태와 로딩 상태 정리

완료 기준:

- saved links 데이터에서 위키 개념 목록이 생성된다.
- 개념별 연결 콘텐츠를 볼 수 있다.
- 데이터가 없을 때 자연스러운 빈 상태가 표시된다.

## Phase 9. 품질 점검 및 테스트

목표:

- 기능 회귀를 줄이고 배포 전에 핵심 플로우를 검증한다.

권장 테스트 범위:

- `getVideoId()` 단위 테스트
- YouTube URL 종류별 metadata parsing 테스트
- markdown wikilink 추출 테스트
- saved links payload 생성 테스트
- API Route Handler smoke test

수동 검증 체크리스트:

- 홈 화면 렌더링
- 소스 화면 렌더링
- 위키 화면 렌더링
- 설정 화면 렌더링
- waitlist 등록
- saved links 조회
- saved links 저장
- saved links 삭제
- YouTube 링크 저장 시 제목 조회
- YouTube 링크 저장 시 자막 분석
- Gemini key가 없을 때 fallback 동작
- 북마클릿 생성
- 북마클릿으로 외부 페이지 저장

완료 기준:

- 핵심 플로우가 로컬에서 모두 통과한다.
- Vercel preview 배포에서 동일하게 동작한다.
- 브라우저 콘솔에 주요 런타임 오류가 없다.

## Phase 10. 배포 전환

목표:

- 기존 Vercel 정적 배포를 Next.js 배포로 전환한다.

작업:

1. Vercel 프로젝트의 framework preset이 Next.js로 감지되는지 확인
2. 환경변수 등록
3. preview deployment 생성
4. Supabase URL 허용 도메인 확인
5. production deployment 전환
6. 기존 `index.html` 기반 배포 산출물 제거 여부 결정

완료 기준:

- Vercel production URL에서 Next.js 앱이 서비스된다.
- API Route가 production에서 정상 동작한다.
- Supabase 데이터 저장/조회가 정상 동작한다.
- Gemini 요약이 production에서 정상 동작한다.

## 6. 주요 리스크와 대응

### 6.1 YouTube 자막 수집 안정성

리스크:

- YouTube 페이지 구조, Innertube 응답, timedtext endpoint는 변경될 수 있다.

대응:

- transcript 수집 로직을 `lib/youtube/transcript.ts`에 격리한다.
- 실패 상태를 `no_caption_track`, `caption_fetch_failed`, `youtube_page_failed`처럼 명확히 반환한다.
- 자막 실패 시에도 링크 저장 자체는 가능하게 유지한다.

### 6.2 Gemini 응답 파싱 실패

리스크:

- 모델 응답이 JSON 스키마를 완전히 지키지 않을 수 있다.

대응:

- JSON 추출 fallback 유지
- parsing 실패 시 서버 에러 메시지를 제한적으로 반환
- API 응답에 fallback summary 경로 유지

### 6.3 Supabase RLS 정책

리스크:

- 클라이언트에서 anon key로 접근하므로 RLS 정책이 실제 보안 경계다.

대응:

- 기존 SQL 정책을 유지하되, owner email 기반 조회/삭제/업데이트 조건을 재확인한다.
- production 전에 Supabase Table Editor에서 row 접근 범위를 수동 검증한다.

### 6.4 단일 파일에서 컴포넌트 구조로 이전할 때 기능 누락

리스크:

- `index.html`에 많은 함수가 있어 이벤트 연결이나 상태 갱신이 누락될 수 있다.

대응:

- 1차 마이그레이션에서는 디자인 개선을 하지 않는다.
- 기존 함수명을 참고하여 기능별로 하나씩 이전한다.
- 각 Phase마다 브라우저에서 직접 확인한다.

## 7. 권장 작업 순서 요약

```txt
1. Next.js + TypeScript 기반 생성
2. 기존 CSS와 화면 구조 이전
3. 컴포넌트 분리
4. 타입 정의
5. Supabase client 및 saved links 기능 이전
6. youtube-metadata API 이전
7. analyze-youtube API 이전
8. 북마클릿 플로우 이전
9. 위키/개념 뷰 이전
10. 로컬 검증
11. Vercel preview 배포
12. production 전환
```

## 8. 마이그레이션 완료 정의

다음 조건이 모두 만족되면 Next.js 마이그레이션을 완료로 본다.

- Next.js 앱이 로컬에서 정상 실행된다.
- 기존 핵심 화면이 모두 React 컴포넌트로 렌더링된다.
- Supabase saved links CRUD가 동작한다.
- waitlist 등록이 동작한다.
- YouTube 제목 조회가 동작한다.
- YouTube 자막 분석이 동작한다.
- Gemini 요약 생성이 동작한다.
- Gemini key가 없을 때 fallback preview가 동작한다.
- 북마클릿 저장 플로우가 동작한다.
- Vercel production 배포가 성공한다.
- 기존 Supabase 데이터와 호환된다.

## 9. 1차 마이그레이션 이후 개선 후보

1차 목표는 기능 보존이다. 마이그레이션 완료 후 다음 개선을 별도 작업으로 진행하는 것이 좋다.

- Supabase Auth 기반 사용자 계정 도입
- owner email 기반 접근 모델 개선
- saved links 검색, 필터, 태그 편집 강화
- YouTube 분석 작업을 비동기 job 구조로 분리
- Gemini structured output schema 유지 및 개선
- Supabase generated types 도입
- Playwright 기반 E2E 테스트 추가
- UI 디자인 시스템 정리
- Tailwind 또는 CSS Modules로 스타일 체계화
- README 재작성 및 배포 가이드 최신화

## 10. 현재 구현 상태

2026-06-20 기준으로 1차 전환형 구현을 시작했다.

완료된 항목:

- Next.js App Router 기반 파일 구조 추가
- `package.json`, `tsconfig.json`, `next.config.ts`, ESLint 설정 추가
- `app/layout.tsx`, `app/page.tsx`, `app/globals.css` 추가
- 기존 `index.html`을 `public/legacy/index.html`로 보존
- Next 페이지를 React 기반 `LinkVaultApp`으로 전환
- legacy iframe 컴포넌트는 보존했지만 기본 진입점에서는 사용하지 않음
- bookmarklet 진입 query string을 React 앱에서 처리
- 홈, 소스, 위키, 설정 탭을 React state 기반으로 구현
- 저장 모달, quick URL 저장, saved links 조회/삭제/재분석 구현
- 위키 개념 집계와 북마클릿 생성 패널 구현
- 기존 Vercel Serverless Function을 `legacy-api/`로 보존 이동
- `/api/youtube-metadata`를 `app/api/youtube-metadata/route.ts`로 이전
- `/api/analyze-youtube`를 `app/api/analyze-youtube/route.ts`로 이전
- YouTube id, metadata, transcript 로직을 `lib/youtube/*`로 분리
- Gemini 요약 로직을 `lib/gemini/summarize.ts`로 분리
- OpenAI Responses API를 Gemini API로 교체
- 기본 모델을 `gemini-2.5-flash`로 설정
- Gemini structured JSON output 적용
- Gemini API 단독 smoke test 통과
- `/api/analyze-youtube` 통합 smoke test 통과
- markdown/wiki helper를 `lib/markdown/wiki.ts`로 분리
- Supabase client scaffold와 saved links helper 추가
- `.env.example` 추가

남은 항목:

- `pnpm install` 및 `pnpm-lock.yaml` 생성 완료
- `pnpm lint` 통과
- TypeScript `tsc --noEmit` 통과
- `pnpm build` 통과
- 기존 `index.html`의 하단 랜딩/마케팅 섹션을 필요한 경우 React 컴포넌트로 추가 이전
- React UI 세부 디자인 QA 및 반응형 화면 검증
- API route production smoke test
- Vercel 환경변수 등록 및 preview deployment 검증
