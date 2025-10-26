-- GM報酬が反映されていないシナリオを特定

-- 1. gm_costsがNULLまたは空のシナリオ
SELECT 
  title,
  duration,
  gm_costs,
  'gm_costsが未設定' as 理由
FROM scenarios
WHERE gm_costs IS NULL 
   OR jsonb_typeof(gm_costs) != 'array'
   OR jsonb_array_length(gm_costs) = 0
ORDER BY title
LIMIT 20;

-- 2. gm_costsはあるが、時給計算と違う値になっているシナリオ
WITH calculated AS (
  SELECT 
    id,
    title,
    duration,
    gm_costs,
    CEIL(duration / 30.0) * 30 as rounded_minutes,
    CASE 
      WHEN CEIL(duration / 30.0) <= 10 THEN 875 * CEIL(duration / 30.0)
      ELSE (875 * 10) + (500 * (CEIL(duration / 30.0) - 10))
    END as expected_wage,
    (gm_costs->0->>'reward')::int as actual_reward
  FROM scenarios
  WHERE gm_costs IS NOT NULL 
    AND jsonb_typeof(gm_costs) = 'array'
    AND jsonb_array_length(gm_costs) > 0
)
SELECT 
  title,
  duration,
  rounded_minutes / 60.0 as 時間,
  expected_wage as 期待される給与,
  actual_reward as 実際の給与,
  expected_wage - actual_reward as 差額,
  '時給計算と不一致' as 理由
FROM calculated
WHERE expected_wage != actual_reward
ORDER BY ABS(expected_wage - actual_reward) DESC
LIMIT 20;

-- 3. 全シナリオの給与を時給計算した値に一括更新（修正版）
-- NULLまたは空の場合は新規作成、既存の場合は更新
UPDATE scenarios
SET gm_costs = CASE 
  -- gm_costsがNULLまたは空の場合: 新規作成
  WHEN gm_costs IS NULL 
    OR jsonb_typeof(gm_costs) != 'array'
    OR jsonb_array_length(gm_costs) = 0 
  THEN jsonb_build_array(
    jsonb_build_object(
      'role', 'main',
      'reward', CASE 
        WHEN CEIL(duration / 30.0) <= 10 THEN 875 * CEIL(duration / 30.0)
        ELSE (875 * 10) + (500 * (CEIL(duration / 30.0) - 10))
      END,
      'category', 'normal'
    )
  )
  -- gm_costsがある場合: rewardだけ更新
  ELSE (
    SELECT jsonb_agg(
      jsonb_set(
        gm_cost,
        '{reward}',
        to_jsonb(
          CASE 
            WHEN CEIL(duration / 30.0) <= 10 THEN 875 * CEIL(duration / 30.0)
            ELSE (875 * 10) + (500 * (CEIL(duration / 30.0) - 10))
          END
        )
      )
    )
    FROM jsonb_array_elements(gm_costs) AS gm_cost
  )
END
WHERE duration IS NOT NULL;

-- 4. 更新結果を確認
SELECT 
  title,
  duration,
  ROUND(duration / 60.0, 1) as 時間,
  CASE 
    WHEN CEIL(duration / 30.0) <= 10 THEN 875 * CEIL(duration / 30.0)
    ELSE (875 * 10) + (500 * (CEIL(duration / 30.0) - 10))
  END as 計算結果,
  (gm_costs->0->>'reward')::int as 設定値,
  gm_costs
FROM scenarios
WHERE gm_costs IS NOT NULL
ORDER BY duration
LIMIT 30;

