-- 営業時間設定テーブルに特別営業日・休業日カラムを追加
ALTER TABLE business_hours_settings 
  ADD COLUMN IF NOT EXISTS special_open_days JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS special_closed_days JSONB DEFAULT '[]'::jsonb;

-- コメント追加
COMMENT ON COLUMN business_hours_settings.special_open_days IS '特別営業日（祝日など）: [{date: "2026-01-13", note: "成人の日"}]';
COMMENT ON COLUMN business_hours_settings.special_closed_days IS '特別休業日: [{date: "2026-01-01", note: "年末年始"}]';




