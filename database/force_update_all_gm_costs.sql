-- 全シナリオのgm_costsを時給計算した値に強制更新
-- 既存のデータは全て上書きされます

-- 全シナリオのgm_costsを時給ベースで統一（通常 + GMテスト）
UPDATE scenarios
SET gm_costs = jsonb_build_array(
  -- 通常公演用のGM報酬
  jsonb_build_object(
    'role', 'main',
    'reward', CASE 
      WHEN CEIL(duration / 30.0) <= 10 THEN 875 * CEIL(duration / 30.0)
      ELSE (875 * 10) + (500 * (CEIL(duration / 30.0) - 10))
    END,
    'category', 'normal'
  ),
  -- GMテスト用のGM報酬（時給1250円 = 30分あたり625円）
  jsonb_build_object(
    'role', 'main',
    'reward', CASE 
      WHEN CEIL(duration / 30.0) <= 10 THEN 625 * CEIL(duration / 30.0)
      ELSE (625 * 10) + (500 * (CEIL(duration / 30.0) - 10))
    END,
    'category', 'gmtest'
  )
)
WHERE duration IS NOT NULL;

-- 更新結果を確認
SELECT 
  title,
  duration,
  ROUND(duration / 60.0, 1) as 時間,
  -- 通常公演の計算結果
  CASE 
    WHEN CEIL(duration / 30.0) <= 10 THEN 875 * CEIL(duration / 30.0)
    ELSE (875 * 10) + (500 * (CEIL(duration / 30.0) - 10))
  END as 通常公演_計算値,
  (gm_costs->0->>'reward')::int as 通常公演_設定値,
  -- GMテストの計算結果
  CASE 
    WHEN CEIL(duration / 30.0) <= 10 THEN 625 * CEIL(duration / 30.0)
    ELSE (625 * 10) + (500 * (CEIL(duration / 30.0) - 10))
  END as GMテスト_計算値,
  (gm_costs->1->>'reward')::int as GMテスト_設定値,
  -- 一致確認
  CASE 
    WHEN (
      CASE 
        WHEN CEIL(duration / 30.0) <= 10 THEN 875 * CEIL(duration / 30.0)
        ELSE (875 * 10) + (500 * (CEIL(duration / 30.0) - 10))
      END = (gm_costs->0->>'reward')::int
      AND
      CASE 
        WHEN CEIL(duration / 30.0) <= 10 THEN 625 * CEIL(duration / 30.0)
        ELSE (625 * 10) + (500 * (CEIL(duration / 30.0) - 10))
      END = (gm_costs->1->>'reward')::int
    ) THEN '✅'
    ELSE '❌'
  END as 一致,
  jsonb_pretty(gm_costs) as gm_costs
FROM scenarios
WHERE duration IS NOT NULL
ORDER BY duration, title
LIMIT 50;

-- 統計情報を表示
SELECT 
  ROUND(duration / 60.0, 1) as 時間,
  CASE 
    WHEN CEIL(duration / 30.0) <= 10 THEN 875 * CEIL(duration / 30.0)
    ELSE (875 * 10) + (500 * (CEIL(duration / 30.0) - 10))
  END as 通常公演GM給与,
  CASE 
    WHEN CEIL(duration / 30.0) <= 10 THEN 625 * CEIL(duration / 30.0)
    ELSE (625 * 10) + (500 * (CEIL(duration / 30.0) - 10))
  END as GMテストGM給与,
  COUNT(*) as シナリオ数
FROM scenarios
WHERE duration IS NOT NULL
GROUP BY duration
ORDER BY duration;

