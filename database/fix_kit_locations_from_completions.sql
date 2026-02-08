-- kit_transfer_completionsの設置完了データを基にキットの所在地を修正
-- 設置完了(delivered_at IS NOT NULL)のレコードを参照して、scenario_kit_locationsを更新

-- まず確認: 設置完了しているキット移動の一覧
SELECT 
  ktc.scenario_id,
  s.title as scenario_title,
  ktc.kit_number,
  ktc.performance_date,
  ktc.from_store_id,
  fs.short_name as from_store,
  ktc.to_store_id,
  ts.short_name as to_store,
  ktc.delivered_at,
  skl.store_id as current_location_id,
  cls.short_name as current_location
FROM kit_transfer_completions ktc
JOIN scenarios s ON s.id = ktc.scenario_id
JOIN stores fs ON fs.id = ktc.from_store_id
JOIN stores ts ON ts.id = ktc.to_store_id
LEFT JOIN scenario_kit_locations skl ON skl.scenario_id = ktc.scenario_id AND skl.kit_number = ktc.kit_number
LEFT JOIN stores cls ON cls.id = skl.store_id
WHERE ktc.delivered_at IS NOT NULL
ORDER BY ktc.delivered_at DESC;

-- 修正実行: 設置完了したキットの位置を正しい移動先に更新
-- 同じシナリオ・キット番号で複数の完了レコードがある場合は最新のものを使用
WITH latest_deliveries AS (
  SELECT DISTINCT ON (scenario_id, kit_number)
    scenario_id,
    kit_number,
    to_store_id,
    delivered_at,
    organization_id
  FROM kit_transfer_completions
  WHERE delivered_at IS NOT NULL
  ORDER BY scenario_id, kit_number, delivered_at DESC
)
UPDATE scenario_kit_locations skl
SET 
  store_id = ld.to_store_id,
  updated_at = NOW()
FROM latest_deliveries ld
WHERE skl.scenario_id = ld.scenario_id
  AND skl.kit_number = ld.kit_number
  AND skl.store_id != ld.to_store_id;

-- 結果確認: 更新後のキット位置
SELECT 
  s.title as scenario_title,
  skl.kit_number,
  st.short_name as current_store,
  skl.condition,
  skl.updated_at
FROM scenario_kit_locations skl
JOIN scenarios s ON s.id = skl.scenario_id
JOIN stores st ON st.id = skl.store_id
ORDER BY s.title, skl.kit_number;
