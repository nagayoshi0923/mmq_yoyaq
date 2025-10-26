-- ライセンス料金が正しく設定されているか確認

-- 全シナリオのライセンス料金を確認
SELECT 
  title,
  license_amount,
  gm_test_license_amount,
  participation_fee,
  gm_test_participation_fee
FROM scenarios
ORDER BY title;

-- ライセンス料金が0円のシナリオ
SELECT 
  title,
  license_amount,
  gm_test_license_amount
FROM scenarios
WHERE license_amount = 0 OR license_amount IS NULL
ORDER BY title;

-- 最近の公演でライセンス料が計算されているか確認
SELECT 
  se.date,
  se.scenario,
  se.category,
  s.license_amount,
  s.gm_test_license_amount
FROM schedule_events se
LEFT JOIN scenarios s ON se.scenario_id = s.id
WHERE se.date >= CURRENT_DATE - INTERVAL '7 days'
  AND se.is_cancelled = false
ORDER BY se.date DESC
LIMIT 20;

