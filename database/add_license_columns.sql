-- 既存のシナリオにライセンス料金と参加費を設定
-- license_costsは配列形式なので、適切な構造で設定

UPDATE scenarios SET 
  license_costs = '[{"time_slot": "通常", "amount": 5000}]'::jsonb, 
  participation_fee = 3000 
WHERE id = '550e8400-e29b-41d4-a716-446655440001';

UPDATE scenarios SET 
  license_costs = '[{"time_slot": "通常", "amount": 3000}]'::jsonb, 
  participation_fee = 2500 
WHERE id = '550e8400-e29b-41d4-a716-446655440002';

UPDATE scenarios SET 
  license_costs = '[{"time_slot": "通常", "amount": 2500}]'::jsonb, 
  participation_fee = 2000 
WHERE id = '550e8400-e29b-41d4-a716-446655440003';

UPDATE scenarios SET 
  license_costs = '[{"time_slot": "通常", "amount": 8000}]'::jsonb, 
  participation_fee = 4000 
WHERE id = '550e8400-e29b-41d4-a716-446655440004';

-- 他の作者のシナリオも追加
UPDATE scenarios SET 
  license_costs = '[{"time_slot": "通常", "amount": 6000}]'::jsonb, 
  participation_fee = 3500 
WHERE id = '550e8400-e29b-41d4-a716-446655440005';

UPDATE scenarios SET 
  license_costs = '[{"time_slot": "通常", "amount": 4000}]'::jsonb, 
  participation_fee = 2800 
WHERE id = '550e8400-e29b-41d4-a716-446655440006';

UPDATE scenarios SET 
  license_costs = '[{"time_slot": "通常", "amount": 7000}]'::jsonb, 
  participation_fee = 3800 
WHERE id = '550e8400-e29b-41d4-a716-446655440007';

-- 既存の店舗IDを確認して使用
-- 店舗IDの変更は外部キー制約のため行わない
-- 既存の店舗IDをそのまま使用する

-- 確認用クエリ
SELECT id, title, author, license_costs, participation_fee FROM scenarios WHERE id IN (
  '550e8400-e29b-41d4-a716-446655440001',
  '550e8400-e29b-41d4-a716-446655440002',
  '550e8400-e29b-41d4-a716-446655440003',
  '550e8400-e29b-41d4-a716-446655440004'
);

-- 既存の店舗IDを確認
SELECT id, name FROM stores ORDER BY name;
