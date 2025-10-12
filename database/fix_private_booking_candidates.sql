-- 確定済み貸切リクエストの候補を1つだけに修正するスクリプト
-- 実行前に必ずバックアップを取ってください

-- 1. 現在の状態を確認
SELECT 
  id, 
  status, 
  customer_name,
  candidate_datetimes->'candidates' as candidates,
  jsonb_array_length(candidate_datetimes->'candidates') as candidate_count
FROM reservations 
WHERE reservation_source = 'web_private' 
  AND status = 'confirmed'
  AND jsonb_array_length(candidate_datetimes->'candidates') > 1;

-- 2. 複数の候補がある場合、status='confirmed'の最初の1つだけを残す
-- 注意: このクエリは実際にデータを更新します。実行前に確認してください。

-- まず、UPDATE文を生成して確認
SELECT 
  id,
  customer_name,
  jsonb_set(
    candidate_datetimes,
    '{candidates}',
    jsonb_build_array(
      (
        SELECT elem
        FROM jsonb_array_elements(candidate_datetimes->'candidates') elem
        WHERE elem->>'status' = 'confirmed'
        LIMIT 1
      )
    )
  ) as new_candidate_datetimes
FROM reservations 
WHERE reservation_source = 'web_private' 
  AND status = 'confirmed'
  AND jsonb_array_length(candidate_datetimes->'candidates') > 1;

-- 3. 問題がなければ、以下のUPDATE文を実行
-- （コメントを外して実行）

/*
UPDATE reservations
SET 
  candidate_datetimes = jsonb_set(
    candidate_datetimes,
    '{candidates}',
    jsonb_build_array(
      (
        SELECT elem
        FROM jsonb_array_elements(candidate_datetimes->'candidates') elem
        WHERE elem->>'status' = 'confirmed'
        LIMIT 1
      )
    )
  ),
  updated_at = NOW()
WHERE reservation_source = 'web_private' 
  AND status = 'confirmed'
  AND jsonb_array_length(candidate_datetimes->'candidates') > 1;
*/

-- 4. 更新後の状態を確認
SELECT 
  id, 
  status, 
  customer_name,
  candidate_datetimes->'candidates' as candidates,
  jsonb_array_length(candidate_datetimes->'candidates') as candidate_count
FROM reservations 
WHERE reservation_source = 'web_private' 
  AND status = 'confirmed';

