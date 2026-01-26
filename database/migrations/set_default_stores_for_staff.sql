-- スタッフの担当店舗が未設定の場合、東京の店舗を一括設定
-- 作成日: 2026-01-27
-- 概要: stores が空配列のスタッフに対して、東京都内の店舗を担当店舗として設定

-- まず東京の店舗IDを確認（実行前に確認用）
-- SELECT id, name, region FROM stores WHERE region = '東京都' OR region LIKE '%東京%';

-- 担当店舗が未設定（空配列）のスタッフに東京の店舗を設定
UPDATE staff
SET stores = (
  SELECT COALESCE(
    jsonb_agg(s.id)::text[],
    ARRAY[]::text[]
  )
  FROM stores s
  WHERE (s.region = '東京都' OR s.region LIKE '%東京%')
    AND s.is_temporary IS NOT TRUE
    AND s.status = 'active'
    AND s.ownership_type != 'office'
),
updated_at = NOW()
WHERE stores IS NULL 
   OR stores = '{}'
   OR array_length(stores, 1) IS NULL;

-- 更新結果を確認
SELECT name, stores 
FROM staff 
WHERE array_length(stores, 1) > 0
ORDER BY name;

-- 確認用：東京以外の店舗（交通費が発生する店舗）
SELECT id, name, region, transport_allowance 
FROM stores 
WHERE region != '東京都' AND region NOT LIKE '%東京%'
  AND is_temporary IS NOT TRUE;

