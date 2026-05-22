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
