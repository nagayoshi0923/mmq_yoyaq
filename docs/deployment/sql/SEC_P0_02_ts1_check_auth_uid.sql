-- SEC-P0-02 TS-1: auth.uid() が期待通りか確認（1行返る / 置換不要）
--
-- 目的:
-- - SQL Editor 上で set_config による擬似JWTが有効か（auth.uid() が埋まるか）を確認する
--
-- 注意:
-- - customers.user_id が NULL の環境では検証できません（TS-0の条件で除外しています）
--
WITH
event AS (
  SELECT id, organization_id
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
  (SELECT user_id FROM cust) AS customer_user_id,
  set_config('request.jwt.claim.sub', (SELECT user_id::text FROM cust), true) AS _sub,
  set_config('request.jwt.claims', json_build_object('sub', (SELECT user_id FROM cust))::text, true) AS _claims,
  auth.uid() AS uid,
  current_setting('request.jwt.claim.sub', true) AS claim_sub;

