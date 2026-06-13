-- ============================================================
-- LinkVault 사전 등록(waitlist) 테이블 생성 스크립트
-- Supabase 대시보드 → SQL Editor 에 붙여넣고 RUN 하세요.
-- ============================================================

-- 1. waitlist 테이블 생성
create table if not exists public.waitlist (
  id          uuid primary key default gen_random_uuid(),
  email       text not null unique,
  use_case    text,
  created_at  timestamptz not null default now()
);

-- 2. Row Level Security 활성화
alter table public.waitlist enable row level security;

-- 3. 익명 사용자(anon)가 "등록(insert)"만 할 수 있도록 허용
--    - 조회/수정/삭제는 불가 → 다른 사람 이메일을 읽을 수 없어 안전
create policy "anyone can join waitlist"
  on public.waitlist
  for insert
  to anon
  with check (true);

-- 4. (선택) 등록 현황을 관리자만 보고 싶다면,
--    Supabase 대시보드의 Table Editor에서 직접 확인하면 됩니다.
--    service_role 키는 절대 프론트엔드에 넣지 마세요.

-- 확인용: 정상 생성되었는지 조회
-- select * from public.waitlist order by created_at desc;

-- ============================================================
-- Optional: LinkVault app data tables for YouTube playlist import
-- Supabase Auth users can connect YouTube and store imported videos.
-- ============================================================

create table if not exists public.youtube_connections (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users(id) on delete cascade,
  google_subject    text,
  channel_title     text,
  connected_at      timestamptz not null default now(),
  unique(user_id)
);

create table if not exists public.saved_youtube_videos (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  playlist_id     text not null,
  video_id        text not null,
  title           text not null,
  channel_title   text,
  thumbnail_url   text,
  source_url      text not null,
  summary         text,
  tags            text[] not null default '{}',
  saved_at        timestamptz not null default now(),
  unique(user_id, video_id)
);

alter table public.youtube_connections enable row level security;
alter table public.saved_youtube_videos enable row level security;

create policy "users can read own youtube connection"
  on public.youtube_connections
  for select
  to authenticated
  using (auth.uid() = user_id);

create policy "users can upsert own youtube connection"
  on public.youtube_connections
  for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "users can manage own saved youtube videos"
  on public.saved_youtube_videos
  for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ============================================================
-- MVP: Bookmarklet saved links
-- Users can save the current page through the Save to LinkVault bookmarklet.
-- This first version stores a lightweight owner email instead of requiring auth,
-- so it can be tested today from a static landing page.
-- ============================================================

create table if not exists public.saved_links (
  id              uuid primary key default gen_random_uuid(),
  owner_email     text not null,
  source_url      text not null,
  title           text,
  selected_text   text,
  source_platform text,
  created_at      timestamptz not null default now()
);

alter table public.saved_links enable row level security;

drop policy if exists "anyone can save a link" on public.saved_links;
drop policy if exists "anyone can read saved links" on public.saved_links;

create policy "anyone can save a link"
  on public.saved_links
  for insert
  to anon, authenticated
  with check (
    owner_email <> ''
    and source_url <> ''
  );

create policy "anyone can read saved links"
  on public.saved_links
  for select
  to anon, authenticated
  using (true);

create index if not exists saved_links_owner_email_created_at_idx
  on public.saved_links (owner_email, created_at desc);
