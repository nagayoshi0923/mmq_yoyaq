-- gm_costsの現状を確認

-- 1. gm_costsがどんな形式になっているか確認
SELECT 
  title,
  duration,
  gm_costs,
  jsonb_typeof(gm_costs) as gm_costs_type,
  CASE 
    WHEN gm_costs IS NULL THEN 'NULL'
    WHEN jsonb_typeof(gm_costs) = 'array' THEN 'ARRAY (' || jsonb_array_length(gm_costs)::text || '件)'
    ELSE jsonb_typeof(gm_costs)
  END as 状態
FROM scenarios
ORDER BY title
LIMIT 20;

-- 2. gm_costsがある/ない/空の数を集計
SELECT 
  CASE 
    WHEN gm_costs IS NULL THEN 'NULL'
    WHEN jsonb_typeof(gm_costs) = 'array' AND jsonb_array_length(gm_costs) = 0 THEN '空配列'
    WHEN jsonb_typeof(gm_costs) = 'array' AND jsonb_array_length(gm_costs) > 0 THEN 'データあり'
    ELSE 'その他'
  END as 状態,
  COUNT(*) as シナリオ数
FROM scenarios
GROUP BY 
  CASE 
    WHEN gm_costs IS NULL THEN 'NULL'
    WHEN jsonb_typeof(gm_costs) = 'array' AND jsonb_array_length(gm_costs) = 0 THEN '空配列'
    WHEN jsonb_typeof(gm_costs) = 'array' AND jsonb_array_length(gm_costs) > 0 THEN 'データあり'
    ELSE 'その他'
  END;

-- 3. gm_costsの中身の例を表示
SELECT 
  title,
  duration,
  jsonb_pretty(gm_costs) as gm_costs内容
FROM scenarios
WHERE gm_costs IS NOT NULL 
  AND jsonb_typeof(gm_costs) = 'array'
  AND jsonb_array_length(gm_costs) > 0
LIMIT 5;

