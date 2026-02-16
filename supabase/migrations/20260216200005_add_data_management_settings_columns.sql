-- data_management_settings テーブルに不足カラムを追加
ALTER TABLE public.data_management_settings
ADD COLUMN IF NOT EXISTS backup_frequency TEXT DEFAULT 'daily',
ADD COLUMN IF NOT EXISTS data_retention_years INTEGER DEFAULT 5,
ADD COLUMN IF NOT EXISTS auto_archive_enabled BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS export_format TEXT DEFAULT 'excel';

COMMENT ON COLUMN public.data_management_settings.backup_frequency IS 'バックアップ頻度（daily/weekly/monthly）';
COMMENT ON COLUMN public.data_management_settings.data_retention_years IS 'データ保持年数';
COMMENT ON COLUMN public.data_management_settings.auto_archive_enabled IS '自動アーカイブ有効';
COMMENT ON COLUMN public.data_management_settings.export_format IS 'エクスポート形式（excel/csv/json）';
