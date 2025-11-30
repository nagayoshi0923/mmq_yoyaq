-- reservationsテーブルとcustomersテーブルの外部キー制約を確認・再作成
-- これにより、PostgRESTのリレーションエラー（Could not find a relationship...）を解消します

-- 既存の制約があれば削除
ALTER TABLE reservations 
  DROP CONSTRAINT IF EXISTS reservations_customer_id_fkey;

-- 制約を再追加
ALTER TABLE reservations
  ADD CONSTRAINT reservations_customer_id_fkey
  FOREIGN KEY (customer_id)
  REFERENCES customers(id)
  ON UPDATE CASCADE
  ON DELETE SET NULL;

-- スキーマキャッシュを更新するためにコメントを追加
COMMENT ON CONSTRAINT reservations_customer_id_fkey ON reservations IS 'Foreign key to customers table';

