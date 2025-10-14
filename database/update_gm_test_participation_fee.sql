-- GMテスト参加費を一括更新
-- 通常参加費から1000円引いた金額を設定（0円未満にはしない）
--
-- 実行前の確認:
-- SELECT title, participation_fee, gm_test_participation_fee 
-- FROM scenarios 
-- WHERE participation_fee > 0 
-- ORDER BY participation_fee DESC 
-- LIMIT 20;

-- GMテスト参加費を更新
UPDATE scenarios
SET 
  gm_test_participation_fee = GREATEST(0, participation_fee - 1000),
  updated_at = NOW()
WHERE 
  participation_fee > 0;

-- 更新結果の確認
SELECT 
  '更新完了' as status,
  COUNT(*) as updated_count,
  COUNT(CASE WHEN gm_test_participation_fee > 0 THEN 1 END) as scenarios_with_gm_test_fee
FROM scenarios
WHERE participation_fee > 0;

-- サンプルデータの確認
SELECT 
  title,
  participation_fee as 通常参加費,
  gm_test_participation_fee as GMテスト参加費,
  (participation_fee - gm_test_participation_fee) as 差額,
  license_amount as 通常ライセンス料,
  gm_test_license_amount as GMテストライセンス料
FROM scenarios
WHERE participation_fee > 0
ORDER BY participation_fee DESC
LIMIT 20;

