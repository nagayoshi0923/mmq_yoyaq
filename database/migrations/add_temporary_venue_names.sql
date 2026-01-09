-- 臨時会場の日付ごとのカスタム名を保存するためのカラムを追加
-- 例: {"2025-11-01": "スペースマーケット渋谷", "2025-11-05": "レンタルスペース新宿"}

-- カラムが存在しない場合のみ追加
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'stores' AND column_name = 'temporary_venue_names'
  ) THEN
    ALTER TABLE stores ADD COLUMN temporary_venue_names jsonb DEFAULT '{}'::jsonb;
    COMMENT ON COLUMN stores.temporary_venue_names IS '日付ごとの臨時会場カスタム名（例: {"2025-11-01": "スペースマーケット渋谷"}）';
  END IF;
END $$;

