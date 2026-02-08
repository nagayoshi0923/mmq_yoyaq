-- ============================================
-- 未チェックのキット移動完了記録を修正
-- 
-- 公演日が過ぎているのにpicked_up_atがnullのレコードを
-- 自動的に完了としてマークする
-- ============================================

-- まず対象レコードを確認
SELECT 
  s.title,
  ktc.kit_number,
  ktc.performance_date,
  fs.short_name as from_store,
  ts.short_name as to_store,
  ktc.created_at
FROM kit_transfer_completions ktc
JOIN scenarios s ON s.id = ktc.scenario_id
JOIN stores fs ON fs.id = ktc.from_store_id
JOIN stores ts ON ts.id = ktc.to_store_id
WHERE ktc.picked_up_at IS NULL
  AND ktc.performance_date < CURRENT_DATE
ORDER BY ktc.performance_date, s.title;

-- ============================================
-- 修正実行（上記で確認後に実行）
-- ============================================

-- picked_up_atがnullで、公演日が過ぎているレコードを更新
-- picked_up_at: created_atの日付（または公演日の前日の午前9時）
-- delivered_at: picked_up_atの1時間後
UPDATE kit_transfer_completions
SET 
  picked_up_at = CASE 
    -- created_atが公演日より前ならcreated_atを使用
    WHEN DATE(created_at) < performance_date THEN created_at
    -- そうでなければ公演日の前日の午前9時（JST）
    ELSE (performance_date - INTERVAL '1 day' + INTERVAL '9 hours')::timestamptz
  END,
  delivered_at = CASE 
    WHEN DATE(created_at) < performance_date THEN created_at + INTERVAL '1 hour'
    ELSE (performance_date - INTERVAL '1 day' + INTERVAL '10 hours')::timestamptz
  END,
  -- システムによる自動修正を示すためにnullのままにする（または特定のスタッフIDを設定）
  updated_at = NOW()
WHERE picked_up_at IS NULL
  AND performance_date < CURRENT_DATE;

-- delivered_atがnullだがpicked_up_atがあるレコードも修正
UPDATE kit_transfer_completions
SET 
  delivered_at = picked_up_at + INTERVAL '1 hour',
  updated_at = NOW()
WHERE picked_up_at IS NOT NULL
  AND delivered_at IS NULL
  AND performance_date < CURRENT_DATE;

-- 修正後の確認
SELECT 
  s.title,
  ktc.kit_number,
  ktc.performance_date,
  ktc.picked_up_at,
  ktc.delivered_at,
  fs.short_name as from_store,
  ts.short_name as to_store
FROM kit_transfer_completions ktc
JOIN scenarios s ON s.id = ktc.scenario_id
JOIN stores fs ON fs.id = ktc.from_store_id
JOIN stores ts ON ts.id = ktc.to_store_id
WHERE ktc.performance_date < CURRENT_DATE
ORDER BY ktc.performance_date, s.title;

-- ============================================
-- キット位置も移動先に更新
-- ============================================

-- 完了した移動のキット位置を移動先店舗に更新
UPDATE scenario_kit_locations skl
SET 
  store_id = ktc.to_store_id,
  updated_at = NOW()
FROM (
  SELECT DISTINCT ON (scenario_id, kit_number)
    scenario_id,
    kit_number,
    to_store_id,
    organization_id,
    delivered_at
  FROM kit_transfer_completions
  WHERE delivered_at IS NOT NULL
  ORDER BY scenario_id, kit_number, delivered_at DESC
) ktc
WHERE skl.scenario_id = ktc.scenario_id
  AND skl.kit_number = ktc.kit_number
  AND skl.organization_id = ktc.organization_id
  AND skl.store_id != ktc.to_store_id;
