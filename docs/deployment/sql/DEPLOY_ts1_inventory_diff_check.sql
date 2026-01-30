-- DEPLOY TS-1: 在庫（current_participants）と reservations 集計の整合性チェック
--
-- 使い方:
-- - 推奨: 先に1回だけ以下を実行してから、このSQLを実行する（ファイルの編集不要）
--   SELECT set_config('app.schedule_event_id', 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx', false);
-- - 直接編集する場合は、params の event_id を差し替える

WITH params AS (
  -- 優先順位:
  -- 1) app.schedule_event_id（手動で指定したい場合）
  -- 2) 直近の予約の schedule_event_id（手動指定しない場合のフォールバック）
  SELECT COALESCE(
    NULLIF(current_setting('app.schedule_event_id', true), '')::uuid,
    (
      SELECT r.schedule_event_id
      FROM reservations r
      WHERE r.schedule_event_id IS NOT NULL
      ORDER BY r.created_at DESC
      LIMIT 1
    )
  ) AS event_id
),
status_row AS (
  SELECT
    (SELECT event_id FROM params) AS event_id,
    (SELECT COUNT(*) FROM schedule_events se WHERE se.id = (SELECT event_id FROM params)) AS event_found
),
event_row AS (
  SELECT
    se.id,
    se.scenario,
    se.date,
    se.current_participants,
    se.max_participants
  FROM schedule_events se
  WHERE se.id = (SELECT event_id FROM params)
),
diff_row AS (
  SELECT
    se.id,
    se.current_participants as stored,
    COALESCE(SUM(r.participant_count), 0) as actual,
    se.current_participants - COALESCE(SUM(r.participant_count), 0) as diff
  FROM schedule_events se
  LEFT JOIN reservations r ON r.schedule_event_id = se.id
    AND r.status IN ('pending', 'confirmed', 'gm_confirmed')
  WHERE se.id = (SELECT event_id FROM params)
  GROUP BY se.id, se.current_participants
)
SELECT
  'status' AS row_type,
  s.event_id AS id,
  CASE
    WHEN s.event_id IS NULL THEN 'EVENT_ID_NOT_SET'
    WHEN s.event_found = 0 THEN 'EVENT_NOT_FOUND_OR_RLS'
    ELSE 'OK'
  END AS scenario,
  NULL::date AS date,
  NULL::integer AS current_participants,
  NULL::integer AS max_participants,
  NULL::integer AS stored,
  NULL::integer AS actual,
  NULL::integer AS diff
FROM status_row s

UNION ALL

SELECT
  'event' AS row_type,
  e.id,
  e.scenario,
  e.date,
  e.current_participants,
  e.max_participants,
  NULL::integer AS stored,
  NULL::integer AS actual,
  NULL::integer AS diff
FROM event_row e

UNION ALL

SELECT
  'diff' AS row_type,
  d.id,
  NULL::text AS scenario,
  NULL::date AS date,
  NULL::integer AS current_participants,
  NULL::integer AS max_participants,
  d.stored,
  d.actual,
  d.diff
FROM diff_row d;

