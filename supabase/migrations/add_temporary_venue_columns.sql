-- storesテーブルに臨時会場用のカラムを追加

-- is_temporary: 臨時会場かどうか（デフォルト: false）
ALTER TABLE stores
ADD COLUMN IF NOT EXISTS is_temporary BOOLEAN DEFAULT FALSE;

-- temporary_date: 臨時会場の有効日付（臨時会場の場合のみ設定）
ALTER TABLE stores
ADD COLUMN IF NOT EXISTS temporary_date DATE;

-- 既存の店舗はすべて通常の店舗として扱う
UPDATE stores
SET is_temporary = FALSE
WHERE is_temporary IS NULL;

-- コメント追加
COMMENT ON COLUMN stores.is_temporary IS '臨時会場フラグ（true: 臨時会場、false: 通常の店舗）';
COMMENT ON COLUMN stores.temporary_date IS '臨時会場の有効日付（臨時会場の場合のみ設定）';

