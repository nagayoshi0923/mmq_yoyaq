-- scenariosテーブルにgm_countカラムを追加
-- このカラムは、公演に必要なGM数を保存します

ALTER TABLE scenarios
ADD COLUMN IF NOT EXISTS gm_count INTEGER DEFAULT 1;

COMMENT ON COLUMN scenarios.gm_count IS '必要GM数（公演に必要なGMの人数）';

-- 注意: gm_costs配列には「通常公演」と「GMテスト」の2エントリが含まれる
-- 実際の必要GM数は gm_count で管理し、gm_costs の長さとは無関係

-- gm_countが未設定(NULL)の場合のみデフォルト値1を設定
UPDATE scenarios
SET gm_count = 1
WHERE gm_count IS NULL;

-- 確認クエリ
SELECT 
  title,
  gm_count as "必要GM数",
  jsonb_array_length(gm_costs) as "gm_costs配列長",
  CASE 
    WHEN jsonb_array_length(gm_costs) = 2 THEN '✅ 通常+GMテスト'
    ELSE '⚠️ 要確認'
  END as "gm_costs状態",
  jsonb_pretty(gm_costs) as gm_costs_detail
FROM scenarios
ORDER BY title
LIMIT 10;

