-- =====================================================
-- customersテーブルにnickname, addressカラムを追加
-- =====================================================

-- 1. nicknameカラムを追加（表示用のニックネーム）
ALTER TABLE customers ADD COLUMN IF NOT EXISTS nickname VARCHAR(100);

-- 2. addressカラムを追加（住所）
ALTER TABLE customers ADD COLUMN IF NOT EXISTS address TEXT;

-- 確認クエリ
-- SELECT id, name, nickname, address FROM customers LIMIT 10;

COMMENT ON COLUMN customers.nickname IS '表示用ニックネーム（公開プロフィール用）';
COMMENT ON COLUMN customers.address IS '住所';

