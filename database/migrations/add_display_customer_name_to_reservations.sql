-- reservations テーブルに display_customer_name カラムを追加
-- 編集された予約者名を保存（元の customer_name は保持して比較用に使う）

ALTER TABLE reservations 
ADD COLUMN IF NOT EXISTS display_customer_name TEXT DEFAULT NULL;

-- コメント追加
COMMENT ON COLUMN reservations.display_customer_name IS '編集された予約者名（NULLの場合はcustomer_nameを使用）';

