-- scenariosテーブルにgm_countカラムを追加
-- このカラムは、公演に必要なGM数を保存します

ALTER TABLE scenarios
ADD COLUMN IF NOT EXISTS gm_count INTEGER DEFAULT 1;

COMMENT ON COLUMN scenarios.gm_count IS '必要GM数（公演に必要なGMの人数）';

-- 既存のシナリオに対して、gm_costsの配列長からgm_countを設定
UPDATE scenarios
SET gm_count = CASE 
  WHEN gm_costs IS NOT NULL AND jsonb_array_length(gm_costs) > 0 
  THEN jsonb_array_length(gm_costs)
  ELSE 1
END
WHERE gm_count IS NULL OR gm_count = 0;

-- 確認クエリ
SELECT 
  title,
  gm_count,
  jsonb_array_length(gm_costs) as gm_costs_count,
  CASE 
    WHEN gm_count = jsonb_array_length(gm_costs) THEN '✅ 一致'
    ELSE '❌ 不一致'
  END as status
FROM scenarios
ORDER BY title
LIMIT 20;

