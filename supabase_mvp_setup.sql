-- ============================================================
-- LinkVault MVP Supabase setup
-- Safe version for a new Supabase project.
-- No DROP statements are included.
-- ============================================================

-- Waitlist signups
create table if not exists public.waitlist (
  id          uuid primary key default gen_random_uuid(),
  email       text not null unique,
  use_case    text,
  created_at  timestamptz not null default now()
);

alter table public.waitlist enable row level security;

create policy "anyone can join waitlist"
  on public.waitlist
  for insert
  to anon
  with check (true);

-- Bookmarklet saved links
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

create policy "anyone can save a link"
  on public.saved_links
  for insert
  to anon, authenticated
  with check (
    owner_email <> ''
    and source_url <> ''
  );

create index if not exists saved_links_owner_email_created_at_idx
  on public.saved_links (owner_email, created_at desc);
