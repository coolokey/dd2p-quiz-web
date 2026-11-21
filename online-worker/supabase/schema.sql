-- DDP 知識對決：網路雙人對戰 Supabase PostgreSQL Schema & Atomic RPCs
-- 設計原則：
-- 1. 啟用 RLS 且不授予 anon/authenticated 直接讀寫資料表權限。
-- 2. 所有操作均透過嚴格驗證的 SECURITY DEFINER RPC（set search_path = ''）執行。
-- 3. 搶答與狀態變更皆以 SELECT ... FOR UPDATE 列級鎖定，確保多人同時搶答的原子裁定。
-- 4. 僅保存暫時性房間與對戰狀態，不儲存帳號、Email 或學生真實個資；過期自動清理。

create table if not exists public.ddp_online_rooms (
  room_code text primary key,
  status text not null check (status in ('waiting', 'playing', 'ended')),
  version integer not null default 1,
  quiz_id text not null,
  quiz_name text not null,
  arena_id text not null,
  rule_mode text not null check (rule_mode in ('questions', 'time')),
  rule_limit integer not null check (rule_limit >= 1 and rule_limit <= 1000),
  question_count integer not null check (question_count >= 1),
  question_seed integer,
  host_player_id text not null,
  host_token_hash text not null,
  host_name text not null,
  host_character_id text,
  host_ready boolean not null default false,
  host_last_seen_at timestamptz not null default now(),
  guest_player_id text,
  guest_token_hash text,
  guest_name text,
  guest_character_id text,
  guest_ready boolean not null default false,
  guest_last_seen_at timestamptz,
  phase text not null default 'regulation' check (phase in ('regulation', 'sudden-death', 'ended')),
  question_index integer not null default 0,
  eligible_players text[] not null default array['left', 'right']::text[],
  health_left integer not null default 100 check (health_left >= 0 and health_left <= 100),
  health_right integer not null default 100 check (health_right >= 0 and health_right <= 100),
  score_left integer not null default 0 check (score_left >= 0),
  score_right integer not null default 0 check (score_right >= 0),
  winner text check (winner in ('left', 'right')),
  end_reason text check (end_reason in ('ko', 'score', 'sudden-death', 'forfeit', 'host-closed')),
  event_seq integer not null default 0,
  last_event jsonb,
  rematch_left boolean not null default false,
  rematch_right boolean not null default false,
  started_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '30 minutes')
);

create index if not exists idx_ddp_online_rooms_expires_at
  on public.ddp_online_rooms (expires_at);

alter table public.ddp_online_rooms enable row level security;
revoke all on table public.ddp_online_rooms from public, anon, authenticated;

-- 內部輔助：序列化公開房間快照（絕不包含 *_token_hash）
create or replace function public._ddp_serialize_room(r public.ddp_online_rooms)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'roomCode', r.room_code,
    'status', r.status,
    'version', r.version,
    'quizId', r.quiz_id,
    'quizName', r.quiz_name,
    'arenaId', r.arena_id,
    'ruleMode', r.rule_mode,
    'ruleLimit', r.rule_limit,
    'questionCount', r.question_count,
    'questionSeed', r.question_seed,
    'phase', r.phase,
    'questionIndex', r.question_index,
    'eligiblePlayers', to_jsonb(r.eligible_players),
    'health', jsonb_build_object('left', r.health_left, 'right', r.health_right),
    'scores', jsonb_build_object('left', r.score_left, 'right', r.score_right),
    'winner', r.winner,
    'endReason', r.end_reason,
    'eventSeq', r.event_seq,
    'lastEvent', r.last_event,
    'rematch', jsonb_build_object('left', r.rematch_left, 'right', r.rematch_right),
    'startedAt', r.started_at,
    'updatedAt', r.updated_at,
    'expiresAt', r.expires_at,
    'serverTime', now(),
    'players', jsonb_build_object(
      'left', jsonb_build_object(
        'playerId', r.host_player_id,
        'name', r.host_name,
        'characterId', r.host_character_id,
        'ready', r.host_ready,
        'connected', (r.host_last_seen_at >= now() - interval '45 seconds'),
        'lastSeenAt', r.host_last_seen_at
      ),
      'right', case when r.guest_player_id is null then null else jsonb_build_object(
        'playerId', r.guest_player_id,
        'name', r.guest_name,
        'characterId', r.guest_character_id,
        'ready', r.guest_ready,
        'connected', (r.guest_last_seen_at is not null and r.guest_last_seen_at >= now() - interval '45 seconds'),
        'lastSeenAt', r.guest_last_seen_at
      ) end
    )
  );
$$;

revoke all on function public._ddp_serialize_room(public.ddp_online_rooms) from public, anon, authenticated;

-- 1. 健康檢查 RPC
create or replace function public.ddp_online_health()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'ok', true,
    'service', 'ddp-online-battle',
    'database_time', statement_timestamp(),
    'active_rooms', (select count(*) from public.ddp_online_rooms where expires_at > now())
  );
$$;

-- 2. 建立房間 RPC
create or replace function public.ddp_online_create_room(
  p_room_code text,
  p_player_id text,
  p_token_hash text,
  p_player_name text,
  p_quiz_id text,
  p_quiz_name text,
  p_arena_id text,
  p_rule_mode text,
  p_rule_limit integer,
  p_question_count integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_room public.ddp_online_rooms;
begin
  delete from public.ddp_online_rooms where expires_at <= now();

  if exists (select 1 from public.ddp_online_rooms where room_code = p_room_code) then
    return jsonb_build_object('ok', false, 'code', 'ROOM_CODE_CONFLICT');
  end if;

  insert into public.ddp_online_rooms (
    room_code, status, version,
    quiz_id, quiz_name, arena_id,
    rule_mode, rule_limit, question_count,
    host_player_id, host_token_hash, host_name,
    host_last_seen_at, expires_at
  ) values (
    p_room_code, 'waiting', 1,
    p_quiz_id, p_quiz_name, p_arena_id,
    p_rule_mode, p_rule_limit, p_question_count,
    p_player_id, p_token_hash, p_player_name,
    now(), now() + interval '30 minutes'
  )
  returning * into v_room;

  return jsonb_build_object(
    'ok', true,
    'seat', 'left',
    'room', public._ddp_serialize_room(v_room)
  );
end;
$$;

-- 3. 加入或恢復房間 RPC
create or replace function public.ddp_online_join_room(
  p_room_code text,
  p_player_id text,
  p_token_hash text,
  p_player_name text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_room public.ddp_online_rooms;
begin
  select * into v_room
  from public.ddp_online_rooms
  where room_code = p_room_code
  for update;

  if not found or v_room.expires_at <= now() then
    return jsonb_build_object('ok', false, 'code', 'ROOM_NOT_FOUND');
  end if;

  -- 原房主重連
  if v_room.host_player_id = p_player_id and v_room.host_token_hash = p_token_hash then
    update public.ddp_online_rooms
    set host_last_seen_at = now(), updated_at = now()
    where room_code = p_room_code
    returning * into v_room;
    return jsonb_build_object('ok', true, 'seat', 'left', 'resumed', true, 'room', public._ddp_serialize_room(v_room));
  end if;

  -- 原挑戰者重連
  if v_room.guest_player_id = p_player_id and v_room.guest_token_hash = p_token_hash then
    update public.ddp_online_rooms
    set guest_last_seen_at = now(), updated_at = now()
    where room_code = p_room_code
    returning * into v_room;
    return jsonb_build_object('ok', true, 'seat', 'right', 'resumed', true, 'room', public._ddp_serialize_room(v_room));
  end if;

  if v_room.status <> 'waiting' then
    return jsonb_build_object('ok', false, 'code', 'ROOM_ALREADY_STARTED');
  end if;

  if v_room.guest_player_id is not null then
    return jsonb_build_object('ok', false, 'code', 'ROOM_FULL');
  end if;

  update public.ddp_online_rooms
  set
    guest_player_id = p_player_id,
    guest_token_hash = p_token_hash,
    guest_name = p_player_name,
    guest_character_id = null,
    guest_ready = false,
    guest_last_seen_at = now(),
    version = version + 1,
    updated_at = now(),
    expires_at = greatest(expires_at, now() + interval '30 minutes')
  where room_code = p_room_code
  returning * into v_room;

  return jsonb_build_object(
    'ok', true,
    'seat', 'right',
    'resumed', false,
    'room', public._ddp_serialize_room(v_room)
  );
end;
$$;

-- 4. 取得房間狀態與心跳 RPC
create or replace function public.ddp_online_get_state(
  p_room_code text,
  p_player_id text,
  p_token_hash text,
  p_since_version integer default 0
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_room public.ddp_online_rooms;
  v_seat text;
begin
  select * into v_room
  from public.ddp_online_rooms
  where room_code = p_room_code;

  if not found or v_room.expires_at <= now() then
    return jsonb_build_object('ok', false, 'code', 'ROOM_NOT_FOUND');
  end if;

  if v_room.host_player_id = p_player_id and v_room.host_token_hash = p_token_hash then
    v_seat := 'left';
    update public.ddp_online_rooms
    set host_last_seen_at = now()
    where room_code = p_room_code
    returning * into v_room;
  elsif v_room.guest_player_id = p_player_id and v_room.guest_token_hash = p_token_hash then
    v_seat := 'right';
    update public.ddp_online_rooms
    set guest_last_seen_at = now()
    where room_code = p_room_code
    returning * into v_room;
  else
    return jsonb_build_object('ok', false, 'code', 'UNAUTHORIZED');
  end if;

  if p_since_version is not null and p_since_version >= v_room.version then
    return jsonb_build_object(
      'ok', true,
      'changed', false,
      'seat', v_seat,
      'version', v_room.version,
      'serverTime', now()
    );
  end if;

  return jsonb_build_object(
    'ok', true,
    'changed', true,
    'seat', v_seat,
    'room', public._ddp_serialize_room(v_room)
  );
end;
$$;

-- 5. 選擇角色 RPC
create or replace function public.ddp_online_select_character(
  p_room_code text,
  p_player_id text,
  p_token_hash text,
  p_character_id text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_room public.ddp_online_rooms;
  v_seat text;
begin
  select * into v_room
  from public.ddp_online_rooms
  where room_code = p_room_code
  for update;

  if not found or v_room.expires_at <= now() then
    return jsonb_build_object('ok', false, 'code', 'ROOM_NOT_FOUND');
  end if;

  if v_room.host_player_id = p_player_id and v_room.host_token_hash = p_token_hash then
    v_seat := 'left';
  elsif v_room.guest_player_id = p_player_id and v_room.guest_token_hash = p_token_hash then
    v_seat := 'right';
  else
    return jsonb_build_object('ok', false, 'code', 'UNAUTHORIZED');
  end if;

  if v_room.status <> 'waiting' then
    return jsonb_build_object('ok', false, 'code', 'INVALID_ROOM_STATE', 'room', public._ddp_serialize_room(v_room));
  end if;

  if v_seat = 'left' and v_room.guest_character_id = p_character_id then
    return jsonb_build_object('ok', false, 'code', 'CHARACTER_TAKEN', 'room', public._ddp_serialize_room(v_room));
  end if;
  if v_seat = 'right' and v_room.host_character_id = p_character_id then
    return jsonb_build_object('ok', false, 'code', 'CHARACTER_TAKEN', 'room', public._ddp_serialize_room(v_room));
  end if;

  if v_seat = 'left' then
    update public.ddp_online_rooms
    set host_character_id = p_character_id,
        host_ready = false,
        host_last_seen_at = now(),
        version = version + 1,
        updated_at = now()
    where room_code = p_room_code
    returning * into v_room;
  else
    update public.ddp_online_rooms
    set guest_character_id = p_character_id,
        guest_ready = false,
        guest_last_seen_at = now(),
        version = version + 1,
        updated_at = now()
    where room_code = p_room_code
    returning * into v_room;
  end if;

  return jsonb_build_object('ok', true, 'seat', v_seat, 'room', public._ddp_serialize_room(v_room));
end;
$$;

-- 6. 切換準備狀態（雙方皆就緒即自動開局）RPC
create or replace function public.ddp_online_set_ready(
  p_room_code text,
  p_player_id text,
  p_token_hash text,
  p_ready boolean,
  p_question_seed integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_room public.ddp_online_rooms;
  v_seat text;
  v_host_ready boolean;
  v_guest_ready boolean;
  v_seed integer;
begin
  select * into v_room
  from public.ddp_online_rooms
  where room_code = p_room_code
  for update;

  if not found or v_room.expires_at <= now() then
    return jsonb_build_object('ok', false, 'code', 'ROOM_NOT_FOUND');
  end if;

  if v_room.host_player_id = p_player_id and v_room.host_token_hash = p_token_hash then
    v_seat := 'left';
  elsif v_room.guest_player_id = p_player_id and v_room.guest_token_hash = p_token_hash then
    v_seat := 'right';
  else
    return jsonb_build_object('ok', false, 'code', 'UNAUTHORIZED');
  end if;

  if v_room.status <> 'waiting' then
    return jsonb_build_object('ok', true, 'seat', v_seat, 'room', public._ddp_serialize_room(v_room));
  end if;

  if p_ready then
    if (v_seat = 'left' and v_room.host_character_id is null) or (v_seat = 'right' and v_room.guest_character_id is null) then
      return jsonb_build_object('ok', false, 'code', 'CHARACTER_REQUIRED', 'room', public._ddp_serialize_room(v_room));
    end if;
  end if;

  v_host_ready := case when v_seat = 'left' then p_ready else v_room.host_ready end;
  v_guest_ready := case when v_seat = 'right' then p_ready else v_room.guest_ready end;

  if v_host_ready and v_guest_ready and v_room.guest_player_id is not null
     and v_room.host_character_id is not null and v_room.guest_character_id is not null then
    v_seed := coalesce(p_question_seed, floor(random() * 2147483000)::integer + 1);
    update public.ddp_online_rooms
    set
      host_ready = true,
      guest_ready = true,
      host_last_seen_at = case when v_seat = 'left' then now() else host_last_seen_at end,
      guest_last_seen_at = case when v_seat = 'right' then now() else guest_last_seen_at end,
      status = 'playing',
      phase = 'regulation',
      question_index = 0,
      eligible_players = array['left', 'right']::text[],
      health_left = 100,
      health_right = 100,
      score_left = 0,
      score_right = 0,
      winner = null,
      end_reason = null,
      rematch_left = false,
      rematch_right = false,
      question_seed = v_seed,
      started_at = now(),
      version = version + 1,
      updated_at = now(),
      expires_at = now() + interval '45 minutes'
    where room_code = p_room_code
    returning * into v_room;
  else
    update public.ddp_online_rooms
    set
      host_ready = v_host_ready,
      guest_ready = v_guest_ready,
      host_last_seen_at = case when v_seat = 'left' then now() else host_last_seen_at end,
      guest_last_seen_at = case when v_seat = 'right' then now() else guest_last_seen_at end,
      version = version + 1,
      updated_at = now()
    where room_code = p_room_code
    returning * into v_room;
  end if;

  return jsonb_build_object('ok', true, 'seat', v_seat, 'room', public._ddp_serialize_room(v_room));
end;
$$;

-- 7. 原子搶答裁定 RPC
create or replace function public.ddp_online_submit_answer(
  p_room_code text,
  p_player_id text,
  p_token_hash text,
  p_question_index integer,
  p_answer_index integer,
  p_correct_answer_index integer,
  p_attack_type text default 'energy'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_room public.ddp_online_rooms;
  v_seat text;
  v_opponent text;
  v_correct boolean;
  v_health_left integer;
  v_health_right integer;
  v_score_left integer;
  v_score_right integer;
  v_phase text;
  v_status text;
  v_winner text;
  v_end_reason text;
  v_question_index integer;
  v_eligible text[];
  v_question_advanced boolean := false;
  v_next_seq integer;
  v_attack text;
  v_event jsonb;
begin
  select * into v_room
  from public.ddp_online_rooms
  where room_code = p_room_code
  for update;

  if not found or v_room.expires_at <= now() then
    return jsonb_build_object('ok', false, 'code', 'ROOM_NOT_FOUND');
  end if;

  if v_room.host_player_id = p_player_id and v_room.host_token_hash = p_token_hash then
    v_seat := 'left';
    v_opponent := 'right';
  elsif v_room.guest_player_id = p_player_id and v_room.guest_token_hash = p_token_hash then
    v_seat := 'right';
    v_opponent := 'left';
  else
    return jsonb_build_object('ok', false, 'code', 'UNAUTHORIZED');
  end if;

  if v_room.status <> 'playing' then
    return jsonb_build_object('ok', true, 'accepted', false, 'reason', 'NOT_PLAYING', 'room', public._ddp_serialize_room(v_room));
  end if;

  if v_room.question_index <> p_question_index or not (v_seat = any(v_room.eligible_players)) then
    return jsonb_build_object('ok', true, 'accepted', false, 'reason', 'ALREADY_CLAIMED', 'room', public._ddp_serialize_room(v_room));
  end if;

  v_correct := (p_answer_index = p_correct_answer_index);
  v_health_left := v_room.health_left;
  v_health_right := v_room.health_right;
  v_score_left := v_room.score_left;
  v_score_right := v_room.score_right;
  v_phase := v_room.phase;
  v_status := v_room.status;
  v_winner := v_room.winner;
  v_end_reason := v_room.end_reason;
  v_question_index := v_room.question_index;
  v_eligible := v_room.eligible_players;
  v_attack := case when p_attack_type in ('energy', 'punch', 'kick') then p_attack_type else 'energy' end;

  if v_correct then
    if v_seat = 'left' then
      v_score_left := v_score_left + 1;
      v_health_right := greatest(0, v_health_right - 10);
    else
      v_score_right := v_score_right + 1;
      v_health_left := greatest(0, v_health_left - 10);
    end if;

    v_question_index := v_question_index + 1;
    v_eligible := array['left', 'right']::text[];
    v_question_advanced := true;

    if (v_seat = 'left' and v_health_right = 0) or (v_seat = 'right' and v_health_left = 0) then
      v_status := 'ended';
      v_phase := 'ended';
      v_winner := v_seat;
      v_end_reason := 'ko';
    elsif v_phase = 'sudden-death' then
      v_status := 'ended';
      v_phase := 'ended';
      v_winner := v_seat;
      v_end_reason := 'sudden-death';
    elsif v_room.rule_mode = 'questions' and v_phase = 'regulation'
          and v_question_index >= least(v_room.rule_limit, v_room.question_count) then
      if v_score_left = v_score_right then
        v_phase := 'sudden-death';
      else
        v_status := 'ended';
        v_phase := 'ended';
        v_winner := case when v_score_left > v_score_right then 'left' else 'right' end;
        v_end_reason := 'score';
      end if;
    end if;
  else
    v_eligible := array_remove(v_eligible, v_seat);
    if coalesce(array_length(v_eligible, 1), 0) = 0 then
      v_question_index := v_question_index + 1;
      v_eligible := array['left', 'right']::text[];
      v_question_advanced := true;

      if v_room.rule_mode = 'questions' and v_phase = 'regulation'
         and v_question_index >= least(v_room.rule_limit, v_room.question_count) then
        if v_score_left = v_score_right then
          v_phase := 'sudden-death';
        else
          v_status := 'ended';
          v_phase := 'ended';
          v_winner := case when v_score_left > v_score_right then 'left' else 'right' end;
          v_end_reason := 'score';
        end if;
      end if;
    end if;
  end if;

  v_next_seq := v_room.event_seq + 1;
  v_event := jsonb_build_object(
    'seq', v_next_seq,
    'type', 'answer',
    'player', v_seat,
    'opponent', v_opponent,
    'questionIndex', p_question_index,
    'answerIndex', p_answer_index,
    'correctAnswerIndex', p_correct_answer_index,
    'correct', v_correct,
    'damage', case when v_correct then 10 else 0 end,
    'attackType', v_attack,
    'questionAdvanced', v_question_advanced,
    'phaseAfter', v_phase,
    'ended', (v_status = 'ended'),
    'winner', v_winner,
    'endReason', v_end_reason
  );

  update public.ddp_online_rooms
  set
    status = v_status,
    phase = v_phase,
    question_index = v_question_index,
    eligible_players = v_eligible,
    health_left = v_health_left,
    health_right = v_health_right,
    score_left = v_score_left,
    score_right = v_score_right,
    winner = v_winner,
    end_reason = v_end_reason,
    event_seq = v_next_seq,
    last_event = v_event,
    host_last_seen_at = case when v_seat = 'left' then now() else host_last_seen_at end,
    guest_last_seen_at = case when v_seat = 'right' then now() else guest_last_seen_at end,
    version = version + 1,
    updated_at = now(),
    expires_at = case when v_status = 'ended' then now() + interval '15 minutes' else expires_at end
  where room_code = p_room_code
  returning * into v_room;

  return jsonb_build_object(
    'ok', true,
    'accepted', true,
    'seat', v_seat,
    'room', public._ddp_serialize_room(v_room)
  );
end;
$$;

-- 8. 限時制到期結算 RPC
create or replace function public.ddp_online_finish_time(
  p_room_code text,
  p_player_id text,
  p_token_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_room public.ddp_online_rooms;
  v_seat text;
  v_next_seq integer;
begin
  select * into v_room
  from public.ddp_online_rooms
  where room_code = p_room_code
  for update;

  if not found or v_room.expires_at <= now() then
    return jsonb_build_object('ok', false, 'code', 'ROOM_NOT_FOUND');
  end if;

  if v_room.host_player_id = p_player_id and v_room.host_token_hash = p_token_hash then
    v_seat := 'left';
  elsif v_room.guest_player_id = p_player_id and v_room.guest_token_hash = p_token_hash then
    v_seat := 'right';
  else
    return jsonb_build_object('ok', false, 'code', 'UNAUTHORIZED');
  end if;

  if v_room.status <> 'playing' or v_room.rule_mode <> 'time' or v_room.phase <> 'regulation' then
    return jsonb_build_object('ok', true, 'changed', false, 'room', public._ddp_serialize_room(v_room));
  end if;

  if v_room.started_at is null or now() < v_room.started_at + make_interval(secs => v_room.rule_limit) then
    return jsonb_build_object('ok', true, 'changed', false, 'room', public._ddp_serialize_room(v_room));
  end if;

  v_next_seq := v_room.event_seq + 1;

  if v_room.score_left = v_room.score_right then
    update public.ddp_online_rooms
    set
      phase = 'sudden-death',
      question_index = question_index + 1,
      eligible_players = array['left', 'right']::text[],
      event_seq = v_next_seq,
      last_event = jsonb_build_object('seq', v_next_seq, 'type', 'timeout', 'phaseAfter', 'sudden-death', 'ended', false),
      version = version + 1,
      updated_at = now()
    where room_code = p_room_code
    returning * into v_room;
  else
    update public.ddp_online_rooms
    set
      status = 'ended',
      phase = 'ended',
      winner = case when score_left > score_right then 'left' else 'right' end,
      end_reason = 'score',
      event_seq = v_next_seq,
      last_event = jsonb_build_object(
        'seq', v_next_seq,
        'type', 'timeout',
        'phaseAfter', 'ended',
        'ended', true,
        'winner', case when score_left > score_right then 'left' else 'right' end,
        'endReason', 'score'
      ),
      version = version + 1,
      updated_at = now(),
      expires_at = now() + interval '15 minutes'
    where room_code = p_room_code
    returning * into v_room;
  end if;

  return jsonb_build_object('ok', true, 'changed', true, 'room', public._ddp_serialize_room(v_room));
end;
$$;

-- 9. 再戰一局 RPC
create or replace function public.ddp_online_request_rematch(
  p_room_code text,
  p_player_id text,
  p_token_hash text,
  p_question_seed integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_room public.ddp_online_rooms;
  v_seat text;
  v_left boolean;
  v_right boolean;
  v_seed integer;
  v_next_seq integer;
begin
  select * into v_room
  from public.ddp_online_rooms
  where room_code = p_room_code
  for update;

  if not found or v_room.expires_at <= now() then
    return jsonb_build_object('ok', false, 'code', 'ROOM_NOT_FOUND');
  end if;

  if v_room.host_player_id = p_player_id and v_room.host_token_hash = p_token_hash then
    v_seat := 'left';
  elsif v_room.guest_player_id = p_player_id and v_room.guest_token_hash = p_token_hash then
    v_seat := 'right';
  else
    return jsonb_build_object('ok', false, 'code', 'UNAUTHORIZED');
  end if;

  if v_room.status <> 'ended' or v_room.end_reason in ('forfeit', 'host-closed') then
    return jsonb_build_object('ok', false, 'code', 'REMATCH_UNAVAILABLE', 'room', public._ddp_serialize_room(v_room));
  end if;

  v_left := case when v_seat = 'left' then true else v_room.rematch_left end;
  v_right := case when v_seat = 'right' then true else v_room.rematch_right end;

  if v_left and v_right then
    v_seed := coalesce(p_question_seed, floor(random() * 2147483000)::integer + 1);
    v_next_seq := v_room.event_seq + 1;
    update public.ddp_online_rooms
    set
      status = 'playing',
      phase = 'regulation',
      question_index = 0,
      eligible_players = array['left', 'right']::text[],
      health_left = 100,
      health_right = 100,
      score_left = 0,
      score_right = 0,
      winner = null,
      end_reason = null,
      rematch_left = false,
      rematch_right = false,
      question_seed = v_seed,
      started_at = now(),
      event_seq = v_next_seq,
      last_event = jsonb_build_object('seq', v_next_seq, 'type', 'rematch', 'questionSeed', v_seed),
      version = version + 1,
      updated_at = now(),
      expires_at = now() + interval '45 minutes'
    where room_code = p_room_code
    returning * into v_room;
  else
    update public.ddp_online_rooms
    set
      rematch_left = v_left,
      rematch_right = v_right,
      version = version + 1,
      updated_at = now()
    where room_code = p_room_code
    returning * into v_room;
  end if;

  return jsonb_build_object('ok', true, 'seat', v_seat, 'room', public._ddp_serialize_room(v_room));
end;
$$;

-- 10. 離開房間 RPC
create or replace function public.ddp_online_leave_room(
  p_room_code text,
  p_player_id text,
  p_token_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_room public.ddp_online_rooms;
  v_seat text;
  v_opponent text;
  v_next_seq integer;
begin
  select * into v_room
  from public.ddp_online_rooms
  where room_code = p_room_code
  for update;

  if not found then
    return jsonb_build_object('ok', true, 'left', true);
  end if;

  if v_room.host_player_id = p_player_id and v_room.host_token_hash = p_token_hash then
    v_seat := 'left';
    v_opponent := 'right';
  elsif v_room.guest_player_id = p_player_id and v_room.guest_token_hash = p_token_hash then
    v_seat := 'right';
    v_opponent := 'left';
  else
    return jsonb_build_object('ok', false, 'code', 'UNAUTHORIZED');
  end if;

  if v_room.status = 'waiting' then
    if v_seat = 'right' then
      update public.ddp_online_rooms
      set
        guest_player_id = null,
        guest_token_hash = null,
        guest_name = null,
        guest_character_id = null,
        guest_ready = false,
        guest_last_seen_at = null,
        host_ready = false,
        version = version + 1,
        updated_at = now()
      where room_code = p_room_code
      returning * into v_room;
    else
      update public.ddp_online_rooms
      set
        status = 'ended',
        phase = 'ended',
        end_reason = 'host-closed',
        version = version + 1,
        updated_at = now(),
        expires_at = now() + interval '5 minutes'
      where room_code = p_room_code
      returning * into v_room;
    end if;
  elsif v_room.status = 'playing' then
    v_next_seq := v_room.event_seq + 1;
    update public.ddp_online_rooms
    set
      status = 'ended',
      phase = 'ended',
      winner = v_opponent,
      end_reason = 'forfeit',
      event_seq = v_next_seq,
      last_event = jsonb_build_object(
        'seq', v_next_seq,
        'type', 'forfeit',
        'player', v_seat,
        'winner', v_opponent,
        'endReason', 'forfeit',
        'ended', true
      ),
      version = version + 1,
      updated_at = now(),
      expires_at = now() + interval '10 minutes'
    where room_code = p_room_code
    returning * into v_room;
  else
    update public.ddp_online_rooms
    set
      end_reason = coalesce(end_reason, 'host-closed'),
      rematch_left = false,
      rematch_right = false,
      version = version + 1,
      updated_at = now()
    where room_code = p_room_code
    returning * into v_room;
  end if;

  return jsonb_build_object('ok', true, 'left', true, 'room', public._ddp_serialize_room(v_room));
end;
$$;

-- 權限收斂：移除 public 執行權，僅授予 anon 執行公開 RPC
revoke all on function public.ddp_online_health() from public;
revoke all on function public.ddp_online_create_room(text, text, text, text, text, text, text, text, integer, integer) from public;
revoke all on function public.ddp_online_join_room(text, text, text, text) from public;
revoke all on function public.ddp_online_get_state(text, text, text, integer) from public;
revoke all on function public.ddp_online_select_character(text, text, text, text) from public;
revoke all on function public.ddp_online_set_ready(text, text, text, boolean, integer) from public;
revoke all on function public.ddp_online_submit_answer(text, text, text, integer, integer, integer, text) from public;
revoke all on function public.ddp_online_finish_time(text, text, text) from public;
revoke all on function public.ddp_online_request_rematch(text, text, text, integer) from public;
revoke all on function public.ddp_online_leave_room(text, text, text) from public;

grant execute on function public.ddp_online_health() to anon;
grant execute on function public.ddp_online_create_room(text, text, text, text, text, text, text, text, integer, integer) to anon;
grant execute on function public.ddp_online_join_room(text, text, text, text) to anon;
grant execute on function public.ddp_online_get_state(text, text, text, integer) to anon;
grant execute on function public.ddp_online_select_character(text, text, text, text) to anon;
grant execute on function public.ddp_online_set_ready(text, text, text, boolean, integer) to anon;
grant execute on function public.ddp_online_submit_answer(text, text, text, integer, integer, integer, text) to anon;
grant execute on function public.ddp_online_finish_time(text, text, text) to anon;
grant execute on function public.ddp_online_request_rematch(text, text, text, integer) to anon;
grant execute on function public.ddp_online_leave_room(text, text, text) to anon;
