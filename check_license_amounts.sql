-- ライセンス金額が設定されているシナリオを確認
SELECT 
  title,
  author,
  license_amount,
  gm_test_license_amount,
  play_count
FROM scenarios
WHERE license_amount > 0 OR gm_test_license_amount > 0
ORDER BY title;

