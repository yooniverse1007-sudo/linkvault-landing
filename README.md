# LinkVault

저장한 링크를 Supabase에 보관하고, YouTube 자막을 Gemini로 분석해 위키형 지식 노트로 만드는 Next.js 애플리케이션입니다.

## Stack

- Next.js 15 App Router
- React 19
- TypeScript
- pnpm 11
- Supabase
- Gemini API (`gemini-2.5-flash`)
- Vercel

## Requirements

- Node.js 20.9 이상
- pnpm 11.5.3

## Setup

```bash
pnpm install
```

`.env.example`을 참고해 `.env.local`을 설정합니다.

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
GEMINI_API_KEY=
GEMINI_MODEL=gemini-2.5-flash
```

## Development

```bash
pnpm dev
```

기본 주소는 `http://localhost:3000`입니다.

## Verification

```bash
pnpm lint
pnpm typecheck
pnpm build
```

## Database

새 Supabase 프로젝트에는 `supabase_mvp_setup.sql`을 실행합니다.

기존 스키마와 YouTube 연결 테이블까지 포함한 설정은 `supabase_setup.sql`을 참고합니다.

## Structure

```txt
app/                  Next.js pages and route handlers
components/           React UI
lib/                  Supabase, YouTube, Gemini, URL helpers
types/                Shared TypeScript types
public/legacy/        Previous single-file app snapshot
legacy-api/           Previous Vercel function snapshot
docs/                 Migration plan and implementation status
```
