-- シナリオに男女比カラムを追加
-- 男女比がないシナリオはNULLのまま（男女問わず）

ALTER TABLE scenarios
ADD COLUMN IF NOT EXISTS male_count INTEGER DEFAULT NULL,
ADD COLUMN IF NOT EXISTS female_count INTEGER DEFAULT NULL;

-- コメントを追加
COMMENT ON COLUMN scenarios.male_count IS '男性プレイヤー数（NULLの場合は男女比指定なし）';
COMMENT ON COLUMN scenarios.female_count IS '女性プレイヤー数（NULLの場合は男女比指定なし）';
