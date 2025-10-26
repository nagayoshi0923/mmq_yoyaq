-- 全シナリオのgm_costsを時給計算した値に強制更新
-- 既存のデータは全て上書きされます

-- 全シナリオのgm_costsを時給ベースで統一
UPDATE scenarios
SET gm_costs = jsonb_build_array(
  jsonb_build_object(
    'role', 'main',
    'reward', CASE 
      WHEN CEIL(duration / 30.0) <= 10 THEN 875 * CEIL(duration / 30.0)
      ELSE (875 * 10) + (500 * (CEIL(duration / 30.0) - 10))
    END,
    'category', 'normal'
  )
)
WHERE duration IS NOT NULL;

-- 更新結果を確認
SELECT 
  title,
  duration,
  ROUND(duration / 60.0, 1) as 時間,
  CASE 
    WHEN CEIL(duration / 30.0) <= 10 THEN 875 * CEIL(duration / 30.0)
    ELSE (875 * 10) + (500 * (CEIL(duration / 30.0) - 10))
  END as 計算結果,
  (gm_costs->0->>'reward')::int as 設定値,
  CASE 
    WHEN CEIL(duration / 30.0) <= 10 THEN 875 * CEIL(duration / 30.0)
    ELSE (875 * 10) + (500 * (CEIL(duration / 30.0) - 10))
  END = (gm_costs->0->>'reward')::int as 一致,
  jsonb_pretty(gm_costs) as gm_costs
FROM scenarios
WHERE duration IS NOT NULL
ORDER BY duration, title
LIMIT 50;

-- 統計情報を表示
SELECT 
  CASE 
    WHEN CEIL(duration / 30.0) <= 10 THEN 875 * CEIL(duration / 30.0)
    ELSE (875 * 10) + (500 * (CEIL(duration / 30.0) - 10))
  END as GM給与,
  ROUND(duration / 60.0, 1) as 時間,
  COUNT(*) as シナリオ数
FROM scenarios
WHERE duration IS NOT NULL
GROUP BY duration
ORDER BY duration;

