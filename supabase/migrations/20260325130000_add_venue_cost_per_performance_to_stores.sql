-- 1公演あたりの家賃（会場費）を店舗に追加
ALTER TABLE stores ADD COLUMN IF NOT EXISTS venue_cost_per_performance integer DEFAULT 0;

-- 常設店舗に¥7,000を設定（臨時会場は除外）
UPDATE stores
SET venue_cost_per_performance = 7000
WHERE is_temporary = false OR is_temporary IS NULL;

-- anon/authenticated ロールへの SELECT 許可は RLS で制御済み
COMMENT ON COLUMN stores.venue_cost_per_performance IS '1公演あたりの会場費（家賃按分）';
