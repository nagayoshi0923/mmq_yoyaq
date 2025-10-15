-- gm_availability_responsesテーブルに一意制約を追加
-- これにより、同じreservation_idとstaff_idの組み合わせで複数のレコードが作成されるのを防ぐ

-- 既存の重複レコードがある場合は削除（最新のもの以外）
WITH ranked_responses AS (
  SELECT 
    id,
    ROW_NUMBER() OVER (
      PARTITION BY reservation_id, staff_id 
      ORDER BY responded_at DESC NULLS LAST, created_at DESC
    ) as rn
  FROM gm_availability_responses
)
DELETE FROM gm_availability_responses
WHERE id IN (
  SELECT id FROM ranked_responses WHERE rn > 1
);

-- 一意制約を追加
ALTER TABLE gm_availability_responses
DROP CONSTRAINT IF EXISTS gm_availability_responses_reservation_staff_unique;

ALTER TABLE gm_availability_responses
ADD CONSTRAINT gm_availability_responses_reservation_staff_unique 
UNIQUE (reservation_id, staff_id);

-- 確認用コメント
COMMENT ON CONSTRAINT gm_availability_responses_reservation_staff_unique 
ON gm_availability_responses 
IS '同じ予約に対して、同じスタッフは1つの回答のみ持つことができる';

