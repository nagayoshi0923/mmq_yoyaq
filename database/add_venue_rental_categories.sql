-- 場所貸しカテゴリを追加するマイグレーション
-- 既存のチェック制約を削除して、新しいカテゴリを含む制約を追加

-- 既存のチェック制約を削除
ALTER TABLE schedule_events
DROP CONSTRAINT IF EXISTS schedule_events_category_check;

-- 新しいチェック制約を追加（場所貸しと場所貸無料を含む）
ALTER TABLE schedule_events
ADD CONSTRAINT schedule_events_category_check
CHECK (category IN ('open', 'private', 'gmtest', 'testplay', 'offsite', 'venue_rental', 'venue_rental_free'));

-- 確認用クエリ
SELECT constraint_name, check_clause
FROM information_schema.check_constraints
WHERE constraint_name = 'schedule_events_category_check';

