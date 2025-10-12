-- 確定済み貸切リクエストの候補を1つだけに修正
-- status='confirmed' のリクエストで、candidate.status='confirmed' の候補だけを残す

-- 1. 現在の状態を確認
SELECT 
  id,
  customer_name,
  status,
  jsonb_array_length(candidate_datetimes->'candidates') as candidate_count,
  candidate_datetimes->'candidates' as candidates
FROM reservations 
WHERE reservation_source = 'web_private' 
  AND status = 'confirmed'
  AND jsonb_array_length(candidate_datetimes->'candidates') > 1;

-- 2. UPDATE実行前のプレビュー（確認用）
SELECT 
  id,
  customer_name,
  jsonb_build_object(
    'candidates', jsonb_build_array(
      (
        SELECT elem
        FROM jsonb_array_elements(candidate_datetimes->'candidates') elem
        WHERE elem->>'status' = 'confirmed'
        LIMIT 1
      )
    ),
    'requestedStores', candidate_datetimes->'requestedStores',
    'confirmedStore', candidate_datetimes->'confirmedStore'
  ) as new_candidate_datetimes
FROM reservations 
WHERE reservation_source = 'web_private' 
  AND status = 'confirmed'
  AND jsonb_array_length(candidate_datetimes->'candidates') > 1;

-- 3. 実際にUPDATE（コメントを外して実行）
/*
UPDATE reservations
SET 
  candidate_datetimes = jsonb_build_object(
    'candidates', jsonb_build_array(
      (
        SELECT elem
        FROM jsonb_array_elements(candidate_datetimes->'candidates') elem
        WHERE elem->>'status' = 'confirmed'
        LIMIT 1
      )
    ),
    'requestedStores', candidate_datetimes->'requestedStores',
    'confirmedStore', candidate_datetimes->'confirmedStore'
  ),
  updated_at = NOW()
WHERE reservation_source = 'web_private' 
  AND status = 'confirmed'
  AND jsonb_array_length(candidate_datetimes->'candidates') > 1;
*/

-- 4. 更新後の確認
SELECT 
  id,
  customer_name,
  status,
  jsonb_array_length(candidate_datetimes->'candidates') as candidate_count,
  candidate_datetimes->'candidates'->0->>'date' as confirmed_date,
  candidate_datetimes->'candidates'->0->>'timeSlot' as confirmed_slot,
  candidate_datetimes->'candidates'->0->>'status' as confirmed_status
FROM reservations 
WHERE reservation_source = 'web_private' 
  AND status = 'confirmed'
ORDER BY created_at DESC;

