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

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'waitlist'
      and policyname = 'anyone can join waitlist'
  ) then
    create policy "anyone can join waitlist"
      on public.waitlist
      for insert
      to anon
      with check (true);
  end if;
end $$;

-- Bookmarklet saved links
create table if not exists public.saved_links (
  id              uuid primary key default gen_random_uuid(),
  owner_email     text not null,
  source_url      text not null,
  canonical_source_url text,
  title           text,
  selected_text   text,
  source_platform text,
  created_at      timestamptz not null default now()
);

alter table public.saved_links enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'saved_links'
      and policyname = 'anyone can save a link'
  ) then
    create policy "anyone can save a link"
      on public.saved_links
      for insert
      to anon, authenticated
      with check (
        owner_email <> ''
        and source_url <> ''
      );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'saved_links'
      and policyname = 'anyone can read saved links'
  ) then
    create policy "anyone can read saved links"
      on public.saved_links
      for select
      to anon, authenticated
      using (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'saved_links'
      and policyname = 'anyone can delete a saved link'
  ) then
    create policy "anyone can delete a saved link"
      on public.saved_links
      for delete
      to anon, authenticated
      using (true);
  end if;
end $$;

create index if not exists saved_links_owner_email_created_at_idx
  on public.saved_links (owner_email, created_at desc);

-- AI analysis fields for YouTube transcript summaries
alter table public.saved_links
  add column if not exists canonical_source_url text,
  add column if not exists summary text,
  add column if not exists keywords text[] not null default '{}',
  add column if not exists topics text[] not null default '{}',
  add column if not exists wikilinks text[] not null default '{}',
  add column if not exists markdown_source text,
  add column if not exists markdown_summary text,
  add column if not exists transcript_status text,
  add column if not exists transcript_excerpt text,
  add column if not exists analyzed_at timestamptz;

create unique index if not exists saved_links_owner_email_canonical_source_url_uidx
  on public.saved_links (owner_email, canonical_source_url)
  where canonical_source_url is not null;
