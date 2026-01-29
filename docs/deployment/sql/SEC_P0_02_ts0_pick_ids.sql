-- SEC-P0-02 TS-0: 使えるIDを取得（1行返る）
WITH
event AS (
  SELECT id, organization_id, date, start_time
  FROM schedule_events
  WHERE is_cancelled = false
    AND date >= CURRENT_DATE
    AND EXISTS (
      SELECT 1 FROM customers c
      WHERE c.organization_id = schedule_events.organization_id
        AND c.user_id IS NOT NULL
    )
  ORDER BY date ASC, start_time ASC
  LIMIT 1
),
cust AS (
  SELECT id, user_id
  FROM customers
  WHERE organization_id = (SELECT organization_id FROM event)
    AND user_id IS NOT NULL
  ORDER BY created_at DESC
  LIMIT 1
)
SELECT
  (SELECT id FROM event) AS event_id,
  (SELECT organization_id FROM event) AS organization_id,
  (SELECT id FROM cust) AS customer_id,
  (SELECT user_id FROM cust) AS customer_user_id;

