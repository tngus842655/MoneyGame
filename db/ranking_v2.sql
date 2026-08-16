-- ============================================================================
-- 랭킹 저장 구조 v2: "판마다 행 추가" → "아이디당 구간별 최고기록 1행(upsert)"
-- ============================================================================
-- Supabase 대시보드의 SQL Editor에 이 파일 전체를 붙여넣어 실행하면 됩니다.
--
-- 적용 전에도 게임은 기존 방식(scores 테이블 insert/select)으로 계속 동작합니다.
-- js/ranking.js가 아래 함수의 존재 여부를 자동 감지해서 v2/v1을 전환합니다.
--
-- 설계 메모:
--  * 구간(period)은 'week'(월요일 시작)와 'month'(1일 시작) 두 종류만 저장한다.
--    명예의전당(지난달)은 별도 구간이 아니라 "지난달 month 버킷"을 그대로 읽는다.
--  * 점수 제출 시 이번주/이번달 두 버킷에 upsert하고, 기존 기록보다 낮은 점수는
--    greatest()로 무시한다. → 같은 아이디가 같은 구간에 몇 번을 제출해도 행은 1개.
--  * 구간 경계는 한국 시간(Asia/Seoul) 기준. 클라이언트(월요일 시작 로컬 시간)와 일치.
--  * best_scores는 anon이 직접 읽고 쓸 수 없고, 아래 security definer 함수로만
--    접근한다 (player_id 노출 방지 + 임의 update 차단).

-- 1) 구간별 최고기록 테이블 --------------------------------------------------
create table if not exists best_scores (
  player_id    uuid        not null,
  nickname     text        not null,
  score        bigint      not null,
  period       text        not null check (period in ('week', 'month')),
  period_start date        not null,
  updated_at   timestamptz not null default now(),
  primary key (player_id, period, period_start)
);

create index if not exists best_scores_rank
  on best_scores (period, period_start, score desc);

alter table best_scores enable row level security;
revoke all on best_scores from anon, authenticated;

-- 2) 구간 계산 (한국 시간 기준) ----------------------------------------------
create or replace function kst_week_start() returns date
language sql stable as $$
  select date_trunc('week', (now() at time zone 'Asia/Seoul'))::date
$$;

create or replace function kst_month_start() returns date
language sql stable as $$
  select date_trunc('month', (now() at time zone 'Asia/Seoul'))::date
$$;

-- 3) 점수 제출: 이번주/이번달 두 버킷에 upsert (낮은 점수는 무시) ------------
create or replace function submit_score(p_player_id uuid, p_nickname text, p_score bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_player_id is null or p_score is null or p_score <= 0 then
    return;
  end if;
  insert into best_scores (player_id, nickname, score, period, period_start)
  values
    (p_player_id, left(btrim(coalesce(p_nickname, '')), 10), p_score, 'week',  kst_week_start()),
    (p_player_id, left(btrim(coalesce(p_nickname, '')), 10), p_score, 'month', kst_month_start())
  on conflict (player_id, period, period_start) do update
    set score      = greatest(best_scores.score, excluded.score),
        nickname   = excluded.nickname,
        updated_at = now();
end
$$;

-- 4) 랭킹 조회: week/month는 현재 버킷, hall은 지난달 month 버킷 — 모두 TOP 100
--    p_player_id를 넘기면 내 행에 is_me=true가 찍힌다 (player_id 자체는 비노출).
--    ※ 이 함수만 바뀐 경우 이 블록만 다시 실행하면 된다 (create or replace).
create or replace function get_ranking(p_period text, p_player_id uuid default null)
returns table (nickname text, score bigint, is_me boolean)
language sql
stable
security definer
set search_path = public
as $$
  select b.nickname, b.score,
         (p_player_id is not null and b.player_id = p_player_id) as is_me
  from best_scores b
  where (p_period = 'week'  and b.period = 'week'  and b.period_start = kst_week_start())
     or (p_period = 'month' and b.period = 'month' and b.period_start = kst_month_start())
     or (p_period = 'hall'  and b.period = 'month'
         and b.period_start = (kst_month_start() - interval '1 month')::date)
  order by b.score desc
  limit 100
$$;

-- 5) 닉네임 변경: 기존 rename_player를 새 테이블 기준으로 교체 ---------------
create or replace function rename_player(p_player_id uuid, p_nickname text)
returns void
language sql
security definer
set search_path = public
as $$
  update best_scores
     set nickname = left(btrim(p_nickname), 10),
         updated_at = now()
   where player_id = p_player_id
     and btrim(coalesce(p_nickname, '')) <> '';
$$;

revoke all on function submit_score(uuid, text, bigint) from public;
revoke all on function get_ranking(text, uuid) from public;
revoke all on function rename_player(uuid, text) from public;
grant execute on function submit_score(uuid, text, bigint) to anon, authenticated;
grant execute on function get_ranking(text, uuid) to anon, authenticated;
grant execute on function rename_player(uuid, text) to anon, authenticated;

-- 6) (선택) 기존 scores 데이터 이관 ------------------------------------------
-- 쌓여 있는 행들을 주/월 버킷별 최고기록 1개씩으로 요약해 옮깁니다.
-- player_id가 없는 옛 행은 닉네임을 시드로 한 고정 uuid로 묶습니다.
-- scores 테이블이 이미 삭제됐으면 자동으로 건너뛰므로, 이 파일 전체를
-- 몇 번이고 다시 실행해도 안전합니다.
do $migrate$
begin
  if to_regclass('public.scores') is null then
    raise notice 'scores 테이블이 없어 이관을 건너뜁니다 (이미 이관·삭제 완료)';
    return;
  end if;
  insert into best_scores (player_id, nickname, score, period, period_start)
  select player_id, nickname, score, period, period_start
  from (
    select distinct on (pid, period, period_start)
           pid as player_id, nickname, score, period, period_start
    from (
      select coalesce(s.player_id, md5('legacy:' || s.nickname)::uuid) as pid,
             s.nickname, s.score, p.period,
             case p.period
               when 'week' then date_trunc('week',  (s.created_at at time zone 'Asia/Seoul'))::date
               else             date_trunc('month', (s.created_at at time zone 'Asia/Seoul'))::date
             end as period_start
      from scores s
      cross join (values ('week'), ('month')) as p(period)
      where s.score > 0
    ) x
    order by pid, period, period_start, score desc
  ) best
  on conflict (player_id, period, period_start) do update
    set score = greatest(best_scores.score, excluded.score);
end
$migrate$;

-- 7) (선택) 정리 --------------------------------------------------------------
-- 이관을 확인했으면 기존 테이블은 삭제해도 됩니다 (클라이언트는 rpc만 사용):
-- drop table if exists scores;
--
-- 오래된 주간 버킷은 랭킹에서 다시 조회되지 않으므로 주기적으로 지워도 됩니다.
-- (월간 버킷은 명예의전당 이력이므로 남겨두는 것을 권장)
-- delete from best_scores
--  where period = 'week' and period_start < kst_week_start() - interval '8 weeks';
