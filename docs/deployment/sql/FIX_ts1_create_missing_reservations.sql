-- =============================================================================
-- FIX TS-1: 予約がないのに current_participants > 0 のイベントに予約を作成
-- =============================================================================
-- 
-- 使い方:
-- 1) まずこのファイルをそのまま実行（Preview のみ）
-- 2) Preview の結果が正しければ、以下を実行してからもう一度このファイルを実行:
--      SELECT set_config('app.do_apply', 'true', false);
--
-- 注意:
-- - reservation_number は UNIQUE 制約があるため、重複しないよう連番で作ります
-- - customer_id が NULL の予約を confirmed で作ると通知トリガーが失敗するため、
--   本SQLは insert の間だけ `trigger_notify_on_reservation_confirmed` を無効化します
--
-- =============================================================================

-- Preview: 作成される予約の一覧
WITH params AS (
  SELECT (COALESCE(NULLIF(current_setting('app.do_apply', true), ''), 'false') = 'true') AS do_apply
),
gap_events AS (
  SELECT 
    se.id AS event_id,
    se.organization_id,
    se.date,
    se.start_time,
    se.scenario,
    se.scenario_id,
    se.store_id,
    COALESCE(se.current_participants, 0) AS current_participants,
    COALESCE(se.max_participants, se.capacity, 8) AS max_participants,
    ROW_NUMBER() OVER (ORDER BY se.date, se.start_time, se.id) AS rn
  FROM public.schedule_events se
  LEFT JOIN public.reservations r ON r.schedule_event_id = se.id
  WHERE COALESCE(se.current_participants, 0) > 0
  GROUP BY se.id, se.organization_id, se.date, se.start_time, se.scenario, 
           se.scenario_id, se.store_id, se.current_participants, se.max_participants, se.capacity
  HAVING COUNT(r.id) = 0
)
SELECT 
  'PREVIEW_will_create' AS section,
  event_id,
  organization_id,
  date,
  start_time,
  scenario,
  current_participants AS participant_count_to_create,
  ('MR-' || to_char(now(), 'YYMMDDHH24MISS') || '-' || LPAD(rn::text, 4, '0')) AS reservation_number_preview,
  '（手動追加分）' AS customer_notes
FROM gap_events
ORDER BY date DESC, start_time DESC;

-- Apply: 実際に予約を作成
-- do_apply=true のときだけ、通知トリガーを insert の前後で OFF/ON します
DO $$
BEGIN
  IF (COALESCE(NULLIF(current_setting('app.do_apply', true), ''), 'false') = 'true') THEN
    EXECUTE 'ALTER TABLE public.reservations DISABLE TRIGGER trigger_notify_on_reservation_confirmed';
  END IF;
END$$;

WITH params AS (
  SELECT (COALESCE(NULLIF(current_setting('app.do_apply', true), ''), 'false') = 'true') AS do_apply
),
gap_events AS (
  SELECT 
    se.id AS event_id,
    se.organization_id,
    se.date,
    se.start_time,
    se.scenario,
    se.scenario_id,
    se.store_id,
    COALESCE(se.current_participants, 0) AS current_participants,
    COALESCE(se.max_participants, se.capacity, 8) AS max_participants,
    ROW_NUMBER() OVER (ORDER BY se.date, se.start_time, se.id) AS rn
  FROM public.schedule_events se
  LEFT JOIN public.reservations r ON r.schedule_event_id = se.id
  WHERE COALESCE(se.current_participants, 0) > 0
  GROUP BY se.id, se.organization_id, se.date, se.start_time, se.scenario, 
           se.scenario_id, se.store_id, se.current_participants, se.max_participants, se.capacity
  HAVING COUNT(r.id) = 0
),
ins AS (
  INSERT INTO public.reservations (
    id,
    organization_id,
    reservation_number,
    title,
    scenario_id,
    store_id,
    customer_id,
    created_by,
    schedule_event_id,
    requested_datetime,
    duration,
    participant_count,
    participant_names,
    base_price,
    options_price,
    total_price,
    discount_amount,
    final_price,
    unit_price,
    payment_method,
    payment_status,
    status,
    customer_notes,
    reservation_source,
    created_at,
    updated_at
  )
  SELECT
    gen_random_uuid(),
    ge.organization_id,
    'MR-' || to_char(now(), 'YYMMDDHH24MISS') || '-' || LPAD(ge.rn::text, 4, '0'),
    COALESCE(ge.scenario, ''),
    ge.scenario_id,
    ge.store_id,
    NULL::uuid,
    NULL::uuid,
    ge.event_id,
    (ge.date + ge.start_time)::timestamptz,
    0,
    ge.current_participants,
    ARRAY[]::text[],
    0, 0, 0, 0, 0, 0,
    'onsite',
    'paid',
    'confirmed',
    '（手動追加分 - システム復元）',
    'manual_restore',
    now(),
    now()
  FROM gap_events ge, params p
  WHERE p.do_apply = true
  RETURNING id, schedule_event_id, participant_count
)
SELECT 
  'APPLIED_created' AS section,
  COUNT(*) AS reservations_created,
  SUM(participant_count) AS total_participants_restored
FROM ins;

DO $$
BEGIN
  IF (COALESCE(NULLIF(current_setting('app.do_apply', true), ''), 'false') = 'true') THEN
    EXECUTE 'ALTER TABLE public.reservations ENABLE TRIGGER trigger_notify_on_reservation_confirmed';
  END IF;
END$$;

