-- GMテスト関連の料金を一括更新
-- 1. GMテスト参加費: participation_fee - 1000円
-- 2. GMテストライセンス料: gm_test_license_amount が 0 の場合、license_amount をコピー

-- ===========================
-- ステップ1: GMテスト参加費を更新
-- ===========================
UPDATE scenarios
SET 
  gm_test_participation_fee = GREATEST(0, participation_fee - 1000),
  updated_at = NOW()
WHERE 
  participation_fee > 0;

-- 中間確認
SELECT 
  'GMテスト参加費更新完了' as status,
  COUNT(*) as updated_count
FROM scenarios
WHERE gm_test_participation_fee > 0;

-- ===========================
-- ステップ2: GMテストライセンス料を更新
-- ===========================
UPDATE scenarios
SET 
  gm_test_license_amount = license_amount,
  updated_at = NOW()
WHERE 
  gm_test_license_amount = 0 
  AND license_amount > 0;

-- 最終確認
SELECT 
  'GMテストライセンス料更新完了' as status,
  COUNT(*) as updated_count
FROM scenarios
WHERE gm_test_license_amount > 0;

-- ===========================
-- 更新結果のサマリー
-- ===========================
SELECT 
  '全体サマリー' as category,
  COUNT(*) as total_scenarios,
  COUNT(CASE WHEN participation_fee > 0 THEN 1 END) as with_participation_fee,
  COUNT(CASE WHEN gm_test_participation_fee > 0 THEN 1 END) as with_gm_test_fee,
  COUNT(CASE WHEN license_amount > 0 THEN 1 END) as with_license,
  COUNT(CASE WHEN gm_test_license_amount > 0 THEN 1 END) as with_gm_test_license
FROM scenarios;

-- ===========================
-- サンプルデータの確認（上位20件）
-- ===========================
SELECT 
  title,
  author,
  participation_fee as 通常参加費,
  gm_test_participation_fee as GMテスト参加費,
  license_amount as 通常ライセンス料,
  gm_test_license_amount as GMテストライセンス料,
  CASE 
    WHEN gm_test_license_amount = license_amount THEN '同額'
    WHEN gm_test_license_amount < license_amount AND gm_test_license_amount > 0 THEN '割引あり'
    ELSE '-'
  END as 料金設定
FROM scenarios
WHERE license_amount > 0
ORDER BY license_amount DESC
LIMIT 20;

