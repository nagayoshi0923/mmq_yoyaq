-- GMテストライセンス料を一括更新
-- gm_test_license_amount が 0 で、license_amount が設定されている場合、
-- license_amount の値を gm_test_license_amount にコピーする
--
-- 実行前の確認:
SELECT 
  title,
  license_amount as 通常ライセンス料,
  gm_test_license_amount as GMテストライセンス料,
  CASE 
    WHEN gm_test_license_amount = 0 AND license_amount > 0 THEN '更新対象'
    ELSE '対象外'
  END as status
FROM scenarios
WHERE license_amount > 0
ORDER BY license_amount DESC
LIMIT 20;

-- GMテストライセンス料を更新
UPDATE scenarios
SET 
  gm_test_license_amount = license_amount,
  updated_at = NOW()
WHERE 
  gm_test_license_amount = 0 
  AND license_amount > 0;

-- 更新結果の確認
SELECT 
  '更新完了' as status,
  COUNT(*) as updated_count
FROM scenarios
WHERE license_amount > 0;

-- サンプルデータの確認
SELECT 
  title,
  author,
  participation_fee as 通常参加費,
  gm_test_participation_fee as GMテスト参加費,
  license_amount as 通常ライセンス料,
  gm_test_license_amount as GMテストライセンス料,
  CASE 
    WHEN gm_test_license_amount = license_amount THEN '同額'
    WHEN gm_test_license_amount < license_amount THEN '割引あり'
    ELSE '異なる'
  END as 料金比較
FROM scenarios
WHERE license_amount > 0
ORDER BY license_amount DESC
LIMIT 30;

