-- =============================================================================
-- 臨時会場システムのリファクタリング
-- =============================================================================
-- 
-- 【変更内容】
-- 1. temporary_date (DATE) を temporary_dates (JSONB) に変更
-- 2. 臨時1〜5を事前作成
-- 3. 既存の臨時会場データを新しい形式に移行
--
-- 【目的】
-- - 臨時会場を再利用可能にする
-- - 複数の日付で同じ臨時会場を使用できる
-- - データベースの肥大化を防ぐ
-- 
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Step 1: 既存の臨時会場データをバックアップ
-- -----------------------------------------------------------------------------
CREATE TEMP TABLE temp_venues_backup AS
SELECT * FROM stores WHERE is_temporary = true;

-- -----------------------------------------------------------------------------
-- Step 2: temporary_dates カラムを追加
-- -----------------------------------------------------------------------------
ALTER TABLE stores
ADD COLUMN IF NOT EXISTS temporary_dates JSONB DEFAULT '[]'::jsonb;

-- 既存の temporary_date データを temporary_dates に移行
UPDATE stores
SET temporary_dates = jsonb_build_array(temporary_date::text)
WHERE is_temporary = true AND temporary_date IS NOT NULL;

-- -----------------------------------------------------------------------------
-- Step 3: 既存の臨時会場を削除
-- -----------------------------------------------------------------------------
DELETE FROM stores WHERE is_temporary = true;

-- -----------------------------------------------------------------------------
-- Step 4: 臨時1〜5を事前作成
-- -----------------------------------------------------------------------------
INSERT INTO stores (
  name,
  short_name,
  is_temporary,
  temporary_dates,
  address,
  phone_number,
  email,
  opening_date,
  manager_name,
  status,
  capacity,
  rooms,
  color
) VALUES
  ('臨時会場1', '臨時1', true, '[]'::jsonb, '', '', '', CURRENT_DATE, '', 'active', 8, 1, 'gray'),
  ('臨時会場2', '臨時2', true, '[]'::jsonb, '', '', '', CURRENT_DATE, '', 'active', 8, 1, 'gray'),
  ('臨時会場3', '臨時3', true, '[]'::jsonb, '', '', '', CURRENT_DATE, '', 'active', 8, 1, 'gray'),
  ('臨時会場4', '臨時4', true, '[]'::jsonb, '', '', '', CURRENT_DATE, '', 'active', 8, 1, 'gray'),
  ('臨時会場5', '臨時5', true, '[]'::jsonb, '', '', '', CURRENT_DATE, '', 'active', 8, 1, 'gray')
ON CONFLICT DO NOTHING;

-- -----------------------------------------------------------------------------
-- Step 5: カラムにコメントを追加
-- -----------------------------------------------------------------------------
COMMENT ON COLUMN stores.temporary_dates IS '臨時会場が使用される日付の配列（例: ["2025-11-01", "2025-11-05"]）';
COMMENT ON COLUMN stores.temporary_date IS '【非推奨】temporary_dates を使用してください';

-- -----------------------------------------------------------------------------
-- 完了メッセージ
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  RAISE NOTICE '✅ 臨時会場システムのリファクタリングが完了しました';
  RAISE NOTICE '   - 臨時1〜5を作成しました';
  RAISE NOTICE '   - temporary_dates カラムを追加しました';
  RAISE NOTICE '   - 既存のデータを移行しました';
END $$;

