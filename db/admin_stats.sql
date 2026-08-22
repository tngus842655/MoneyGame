-- ============================================================================
-- 관리자 통계: 접속자(하루 1행/기기) + 보상형 광고 시청 기록 + 관리자 화면 조회
-- ============================================================================
-- Supabase 대시보드의 SQL Editor에 이 파일 전체를 붙여넣어 실행하면 됩니다.
-- (몇 번이고 재실행해도 안전. ranking_v2.sql이 먼저 적용되어 있어야 합니다 —
--  kst_week_start()/kst_month_start()를 여기서 재사용합니다.)
--
-- 설계 메모:
--  * 식별자는 랭킹과 같은 기기별 player_id(localStorage 'money-merge-pid')를 쓴다.
--    로그인 없이 관리자를 가리기 위한 것으로, admin_keys에 등록된 ID만
--    get_admin_stats()를 통과한다 — 화면을 숨기는 건 클라이언트지만 데이터를
--    막는 건 이 검사다. 다른 사람의 ID는 어떤 공개 rpc로도 노출되지 않는다.
--  * visits는 (KST 날짜, player_id)당 1행. 날짜는 서버가 계산하므로 클라이언트가
--    날짜를 속일 수 없다. 하루 접속자 수 = 그 날짜의 행 수.
--  * ad_views는 보상형 광고 시청이 확정(userEarnedReward)될 때마다 1행.
--    배너는 기록하지 않는다 — 노출 수·수익은 토스/AdMob 콘솔 지표가 정확하다.
--  * 두 표 모두 anon이 직접 읽고 쓸 수 없고 security definer 함수로만 접근한다.

-- 1) 접속 기록: (날짜, 기기)당 1행 ---------------------------------------------
create table if not exists visits (
  day       date        not null,
  player_id uuid        not null,
  platform  text        not null,
  first_at  timestamptz not null default now(),
  primary key (day, player_id)
);

alter table visits enable row level security;
revoke all on visits from anon, authenticated;

-- 2) 보상형 광고 시청 기록 -----------------------------------------------------
create table if not exists ad_views (
  id         bigint generated always as identity primary key,
  player_id  uuid        not null,
  platform   text        not null,
  placement  text        not null check (placement in ('shake', 'clean', 'revive')),
  created_at timestamptz not null default now()
);

create index if not exists ad_views_created on ad_views (created_at);

alter table ad_views enable row level security;
revoke all on ad_views from anon, authenticated;

-- 3) 관리자 명단 ---------------------------------------------------------------
--    새 기기를 추가하려면: 그 기기에서 홈 타이틀을 7번 탭하면 나오는 ID를
--    아래처럼 insert 하면 된다.
create table if not exists admin_keys (
  player_id uuid primary key,
  label     text
);

alter table admin_keys enable row level security;
revoke all on admin_keys from anon, authenticated;

insert into admin_keys (player_id, label) values
  ('17d71f28-b513-485b-85ac-50ab483d027e', '길동이 (PC)'),
  ('3a220c79-2ac3-4a41-9443-8a88fe7d2d99', '메롱 (아이폰)'),
  ('2c63a199-7699-4c60-8b07-006f2db8ddbf', '용감한 펭귄407 (토스)')
on conflict (player_id) do nothing;

-- 4) 오늘 날짜 (한국 시간) ------------------------------------------------------
create or replace function kst_today() returns date
language sql stable as $$
  select (now() at time zone 'Asia/Seoul')::date
$$;

-- 5) 접속 기록: 하루 1행 upsert -------------------------------------------------
--    클라이언트는 localStorage로 하루 한 번만 부르지만, 지워져서 여러 번 와도
--    pk가 막는다. 이상한 platform 값은 'web'으로 눕힌다.
create or replace function record_visit(p_player_id uuid, p_platform text)
returns void
language sql
security definer
set search_path = public
as $$
  insert into visits (day, player_id, platform)
  select kst_today(), p_player_id,
         case when p_platform in ('toss', 'android') then p_platform else 'web' end
  where p_player_id is not null
  on conflict (day, player_id) do nothing;
$$;

-- 6) 광고 시청 기록 -------------------------------------------------------------
create or replace function record_ad_view(p_player_id uuid, p_platform text, p_placement text)
returns void
language sql
security definer
set search_path = public
as $$
  insert into ad_views (player_id, platform, placement)
  select p_player_id,
         case when p_platform in ('toss', 'android') then p_platform else 'web' end,
         p_placement
  where p_player_id is not null
    and p_placement in ('shake', 'clean', 'revive');
$$;

-- 7) 관리자 통계 조회 -----------------------------------------------------------
--    관리자가 아니면 예외. 반환 jsonb:
--      daily: 최근 63일 일별 [{day, visitors, shake, clean, revive}] (KST, 빈 날 0)
--      uniq : 주간·월간 순 접속자 {week, last_week, month, last_month}
--             — 일별 접속자를 그냥 더하면 매일 온 사람이 중복으로 세어지므로
--               구간별 distinct는 서버가 계산해 준다. 광고 수는 합산이 가능해
--               클라이언트가 daily에서 더한다.
create or replace function get_admin_stats(p_player_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  from_day date := kst_today() - 62;
begin
  if not exists (select 1 from admin_keys a where a.player_id = p_player_id) then
    raise exception 'not admin';
  end if;

  return jsonb_build_object(
    'daily', (
      with days as (
        select generate_series(from_day::timestamp, kst_today()::timestamp, interval '1 day')::date as d
      ),
      v as (
        select day as d, count(*)::int as n
        from visits where day >= from_day group by day
      ),
      a as (
        select (created_at at time zone 'Asia/Seoul')::date as d,
               count(*) filter (where placement = 'shake')::int  as shake,
               count(*) filter (where placement = 'clean')::int  as clean,
               count(*) filter (where placement = 'revive')::int as revive
        from ad_views
        where created_at >= (from_day::timestamp at time zone 'Asia/Seoul')
        group by 1
      )
      select coalesce(jsonb_agg(jsonb_build_object(
               'day', to_char(days.d, 'YYYY-MM-DD'),
               'visitors', coalesce(v.n, 0),
               'shake',  coalesce(a.shake, 0),
               'clean',  coalesce(a.clean, 0),
               'revive', coalesce(a.revive, 0)
             ) order by days.d), '[]'::jsonb)
      from days
      left join v on v.d = days.d
      left join a on a.d = days.d
    ),
    'uniq', jsonb_build_object(
      'week',       (select count(distinct player_id) from visits
                     where day >= kst_week_start()),
      'last_week',  (select count(distinct player_id) from visits
                     where day >= kst_week_start() - 7 and day < kst_week_start()),
      'month',      (select count(distinct player_id) from visits
                     where day >= kst_month_start()),
      'last_month', (select count(distinct player_id) from visits
                     where day >= (kst_month_start() - interval '1 month')::date
                       and day < kst_month_start())
    )
  );
end
$$;

-- 8) 관리자 여부 (경량) ---------------------------------------------------------
--    홈 화면이 관리자 버튼(📊)을 보일지 결정할 때 부른다. get_admin_stats와 달리
--    집계도 예외도 없이 boolean만 돌려줘서 모든 기기가 시작 시 불러도 부담이 없다.
--    노출되는 정보는 "이 기기가 관리자인가"뿐 — 관리자 ID 목록은 새어나가지 않는다.
create or replace function is_admin(p_player_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from admin_keys a where a.player_id = p_player_id)
$$;

revoke all on function record_visit(uuid, text) from public;
revoke all on function record_ad_view(uuid, text, text) from public;
revoke all on function get_admin_stats(uuid) from public;
revoke all on function is_admin(uuid) from public;
grant execute on function record_visit(uuid, text) to anon, authenticated;
grant execute on function record_ad_view(uuid, text, text) to anon, authenticated;
grant execute on function get_admin_stats(uuid) to anon, authenticated;
grant execute on function is_admin(uuid) to anon, authenticated;
