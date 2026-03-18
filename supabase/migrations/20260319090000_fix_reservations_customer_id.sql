-- 既存の予約に customer_id を設定
-- participant_names から顧客名を検索して customer_id を設定

-- 1. participant_names の最初の要素が顧客名と一致する場合、customer_id を設定
UPDATE reservations r
SET customer_id = c.id
FROM customers c
WHERE r.customer_id IS NULL
  AND r.participant_names IS NOT NULL
  AND array_length(r.participant_names, 1) > 0
  AND r.participant_names[1] = c.name
  AND (r.organization_id = c.organization_id OR r.organization_id IS NULL);

-- 2. customer_notes が顧客名と一致する場合、customer_id を設定
UPDATE reservations r
SET customer_id = c.id
FROM customers c
WHERE r.customer_id IS NULL
  AND r.customer_notes IS NOT NULL
  AND r.customer_notes = c.name
  AND (r.organization_id = c.organization_id OR r.organization_id IS NULL);

-- 更新件数を確認
DO $$
DECLARE
  with_customer_id INTEGER;
  without_customer_id INTEGER;
BEGIN
  SELECT COUNT(*) INTO with_customer_id
  FROM reservations
  WHERE customer_id IS NOT NULL;
  
  SELECT COUNT(*) INTO without_customer_id
  FROM reservations
  WHERE customer_id IS NULL
    AND status IN ('confirmed', 'pending', 'checked_in');
  
  RAISE NOTICE 'reservations: customer_id 設定済み = %, 未設定（アクティブ） = %', with_customer_id, without_customer_id;
END $$;
