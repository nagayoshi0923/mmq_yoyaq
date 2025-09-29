-- 既存シナリオの制作費、参加費、担当GMを更新するSQL
-- 平均40万円の制作費、4000-5000円の参加費（500円区切り）、スタッフDBから担当GMを配置

-- 1. 制作費を更新（35万円〜45万円の範囲でランダムに設定）
UPDATE scenarios 
SET production_cost = CASE 
  WHEN id = '550e8400-e29b-41d4-a716-446655440001' THEN 380000  -- 人狼村の悲劇
  WHEN id = '550e8400-e29b-41d4-a716-446655440002' THEN 420000  -- 密室の謎
  WHEN id = '550e8400-e29b-41d4-a716-446655440003' THEN 450000  -- 古城の呪い
  WHEN id = '550e8400-e29b-41d4-a716-446655440004' THEN 360000  -- 企業の陰謀
  WHEN id = '660e8400-e29b-41d4-a716-446655440020' THEN 390000  -- 都市伝説の真実
  WHEN id = '660e8400-e29b-41d4-a716-446655440021' THEN 410000  -- 記憶の迷宮
  WHEN id = '660e8400-e29b-41d4-a716-446655440022' THEN 370000  -- 学園の秘密
  WHEN id = '660e8400-e29b-41d4-a716-446655440023' THEN 400000  -- 時をかける少女
  WHEN id = '660e8400-e29b-41d4-a716-446655440024' THEN 440000  -- 戦国武将の陰謀
  WHEN id = '660e8400-e29b-41d4-a716-446655440025' THEN 380000  -- 江戸の怪奇事件
  WHEN id = '660e8400-e29b-41d4-a716-446655440026' THEN 430000  -- 宇宙ステーションの謎
  WHEN id = '660e8400-e29b-41d4-a716-446655440027' THEN 390000  -- 未来都市の犯罪
  WHEN id = '660e8400-e29b-41d4-a716-446655440028' THEN 420000  -- 古代遺跡の秘密
  WHEN id = '660e8400-e29b-41d4-a716-446655440029' THEN 370000  -- 魔法学校の事件
  ELSE production_cost
END;

-- 2. 参加費を更新（4000-5000円、500円区切り）
UPDATE scenarios 
SET participation_fee = CASE 
  WHEN id = '550e8400-e29b-41d4-a716-446655440001' THEN 4500  -- 人狼村の悲劇
  WHEN id = '550e8400-e29b-41d4-a716-446655440002' THEN 4000  -- 密室の謎
  WHEN id = '550e8400-e29b-41d4-a716-446655440003' THEN 5000  -- 古城の呪い
  WHEN id = '550e8400-e29b-41d4-a716-446655440004' THEN 4000  -- 企業の陰謀
  WHEN id = '660e8400-e29b-41d4-a716-446655440020' THEN 4500  -- 都市伝説の真実
  WHEN id = '660e8400-e29b-41d4-a716-446655440021' THEN 4500  -- 記憶の迷宮
  WHEN id = '660e8400-e29b-41d4-a716-446655440022' THEN 4000  -- 学園の秘密
  WHEN id = '660e8400-e29b-41d4-a716-446655440023' THEN 4500  -- 時をかける少女
  WHEN id = '660e8400-e29b-41d4-a716-446655440024' THEN 5000  -- 戦国武将の陰謀
  WHEN id = '660e8400-e29b-41d4-a716-446655440025' THEN 4500  -- 江戸の怪奇事件
  WHEN id = '660e8400-e29b-41d4-a716-446655440026' THEN 4500  -- 宇宙ステーションの謎
  WHEN id = '660e8400-e29b-41d4-a716-446655440027' THEN 4000  -- 未来都市の犯罪
  WHEN id = '660e8400-e29b-41d4-a716-446655440028' THEN 4500  -- 古代遺跡の秘密
  WHEN id = '660e8400-e29b-41d4-a716-446655440029' THEN 4000  -- 魔法学校の事件
  ELSE participation_fee
END;

-- 3. 担当GMを更新（スタッフDBから適切なGMを配置）
UPDATE scenarios 
SET available_gms = CASE 
  WHEN id = '550e8400-e29b-41d4-a716-446655440001' THEN '{"田中 太郎", "佐藤 花子"}'  -- 人狼村の悲劇
  WHEN id = '550e8400-e29b-41d4-a716-446655440002' THEN '{"鈴木 一郎", "高橋 美咲"}'  -- 密室の謎
  WHEN id = '550e8400-e29b-41d4-a716-446655440003' THEN '{"田中 太郎", "佐藤 花子"}'  -- 古城の呪い
  WHEN id = '550e8400-e29b-41d4-a716-446655440004' THEN '{"鈴木 一郎", "伊藤 健太"}'  -- 企業の陰謀
  WHEN id = '660e8400-e29b-41d4-a716-446655440020' THEN '{"佐藤 花子", "渡辺 由美"}'  -- 都市伝説の真実
  WHEN id = '660e8400-e29b-41d4-a716-446655440021' THEN '{"高橋 美咲", "伊藤 健太"}'  -- 記憶の迷宮
  WHEN id = '660e8400-e29b-41d4-a716-446655440022' THEN '{"佐藤 花子", "渡辺 由美"}'  -- 学園の秘密
  WHEN id = '660e8400-e29b-41d4-a716-446655440023' THEN '{"高橋 美咲", "伊藤 健太"}'  -- 時をかける少女
  WHEN id = '660e8400-e29b-41d4-a716-446655440024' THEN '{"田中 太郎", "鈴木 一郎"}'  -- 戦国武将の陰謀
  WHEN id = '660e8400-e29b-41d4-a716-446655440025' THEN '{"高橋 美咲", "渡辺 由美"}'  -- 江戸の怪奇事件
  WHEN id = '660e8400-e29b-41d4-a716-446655440026' THEN '{"鈴木 一郎", "高橋 美咲"}'  -- 宇宙ステーションの謎
  WHEN id = '660e8400-e29b-41d4-a716-446655440027' THEN '{"伊藤 健太", "渡辺 由美"}'  -- 未来都市の犯罪
  WHEN id = '660e8400-e29b-41d4-a716-446655440028' THEN '{"田中 太郎", "高橋 美咲"}'  -- 古代遺跡の秘密
  WHEN id = '660e8400-e29b-41d4-a716-446655440029' THEN '{"佐藤 花子", "伊藤 健太"}'  -- 魔法学校の事件
  ELSE available_gms
END;

-- 4. GM報酬を更新（gm_assignments JSONB配列に設定）
UPDATE scenarios 
SET gm_assignments = CASE 
  WHEN id = '550e8400-e29b-41d4-a716-446655440001' THEN '[{"role": "main", "reward": 3000}]'::jsonb  -- 人狼村の悲劇（中級）
  WHEN id = '550e8400-e29b-41d4-a716-446655440002' THEN '[{"role": "main", "reward": 3500}]'::jsonb  -- 密室の謎（上級）
  WHEN id = '550e8400-e29b-41d4-a716-446655440003' THEN '[{"role": "main", "reward": 4000}]'::jsonb  -- 古城の呪い（最高級）
  WHEN id = '550e8400-e29b-41d4-a716-446655440004' THEN '[{"role": "main", "reward": 2500}]'::jsonb  -- 企業の陰謀（中級）
  WHEN id = '660e8400-e29b-41d4-a716-446655440020' THEN '[{"role": "main", "reward": 3000}]'::jsonb  -- 都市伝説の真実（中級）
  WHEN id = '660e8400-e29b-41d4-a716-446655440021' THEN '[{"role": "main", "reward": 3500}]'::jsonb  -- 記憶の迷宮（上級）
  WHEN id = '660e8400-e29b-41d4-a716-446655440022' THEN '[{"role": "main", "reward": 2500}]'::jsonb  -- 学園の秘密（初級）
  WHEN id = '660e8400-e29b-41d4-a716-446655440023' THEN '[{"role": "main", "reward": 3000}]'::jsonb  -- 時をかける少女（中級）
  WHEN id = '660e8400-e29b-41d4-a716-446655440024' THEN '[{"role": "main", "reward": 4000}]'::jsonb  -- 戦国武将の陰謀（上級）
  WHEN id = '660e8400-e29b-41d4-a716-446655440025' THEN '[{"role": "main", "reward": 3000}]'::jsonb  -- 江戸の怪奇事件（中級）
  WHEN id = '660e8400-e29b-41d4-a716-446655440026' THEN '[{"role": "main", "reward": 3500}]'::jsonb  -- 宇宙ステーションの謎（上級）
  WHEN id = '660e8400-e29b-41d4-a716-446655440027' THEN '[{"role": "main", "reward": 3000}]'::jsonb  -- 未来都市の犯罪（中級）
  WHEN id = '660e8400-e29b-41d4-a716-446655440028' THEN '[{"role": "main", "reward": 3500}]'::jsonb  -- 古代遺跡の秘密（上級）
  WHEN id = '660e8400-e29b-41d4-a716-446655440029' THEN '[{"role": "main", "reward": 2500}]'::jsonb  -- 魔法学校の事件（初級）
  ELSE gm_assignments
END;

-- 5. 制作費の詳細項目を更新（production_cost_items配列）
UPDATE scenarios 
SET production_cost_items = CASE 
  WHEN id = '550e8400-e29b-41d4-a716-446655440001' THEN '[{"item": "小道具・衣装", "amount": 150000}, {"item": "印刷費", "amount": 80000}, {"item": "音響・照明", "amount": 100000}, {"item": "その他", "amount": 50000}]'::jsonb
  WHEN id = '550e8400-e29b-41d4-a716-446655440002' THEN '[{"item": "小道具", "amount": 120000}, {"item": "印刷費", "amount": 100000}, {"item": "音響・照明", "amount": 120000}, {"item": "その他", "amount": 80000}]'::jsonb
  WHEN id = '550e8400-e29b-41d4-a716-446655440003' THEN '[{"item": "小道具・衣装", "amount": 200000}, {"item": "印刷費", "amount": 100000}, {"item": "音響・照明", "amount": 100000}, {"item": "その他", "amount": 50000}]'::jsonb
  WHEN id = '550e8400-e29b-41d4-a716-446655440004' THEN '[{"item": "小道具", "amount": 100000}, {"item": "印刷費", "amount": 80000}, {"item": "音響・照明", "amount": 100000}, {"item": "その他", "amount": 80000}]'::jsonb
  WHEN id = '660e8400-e29b-41d4-a716-446655440020' THEN '[{"item": "小道具", "amount": 130000}, {"item": "印刷費", "amount": 90000}, {"item": "音響・照明", "amount": 100000}, {"item": "その他", "amount": 70000}]'::jsonb
  WHEN id = '660e8400-e29b-41d4-a716-446655440021' THEN '[{"item": "小道具", "amount": 140000}, {"item": "印刷費", "amount": 100000}, {"item": "音響・照明", "amount": 100000}, {"item": "その他", "amount": 70000}]'::jsonb
  WHEN id = '660e8400-e29b-41d4-a716-446655440022' THEN '[{"item": "小道具", "amount": 120000}, {"item": "印刷費", "amount": 80000}, {"item": "音響・照明", "amount": 100000}, {"item": "その他", "amount": 70000}]'::jsonb
  WHEN id = '660e8400-e29b-41d4-a716-446655440023' THEN '[{"item": "小道具", "amount": 130000}, {"item": "印刷費", "amount": 90000}, {"item": "音響・照明", "amount": 100000}, {"item": "その他", "amount": 80000}]'::jsonb
  WHEN id = '660e8400-e29b-41d4-a716-446655440024' THEN '[{"item": "小道具・衣装", "amount": 180000}, {"item": "印刷費", "amount": 100000}, {"item": "音響・照明", "amount": 100000}, {"item": "その他", "amount": 60000}]'::jsonb
  WHEN id = '660e8400-e29b-41d4-a716-446655440025' THEN '[{"item": "小道具・衣装", "amount": 150000}, {"item": "印刷費", "amount": 90000}, {"item": "音響・照明", "amount": 100000}, {"item": "その他", "amount": 40000}]'::jsonb
  WHEN id = '660e8400-e29b-41d4-a716-446655440026' THEN '[{"item": "小道具", "amount": 160000}, {"item": "印刷費", "amount": 100000}, {"item": "音響・照明", "amount": 100000}, {"item": "その他", "amount": 70000}]'::jsonb
  WHEN id = '660e8400-e29b-41d4-a716-446655440027' THEN '[{"item": "小道具", "amount": 130000}, {"item": "印刷費", "amount": 90000}, {"item": "音響・照明", "amount": 100000}, {"item": "その他", "amount": 70000}]'::jsonb
  WHEN id = '660e8400-e29b-41d4-a716-446655440028' THEN '[{"item": "小道具", "amount": 150000}, {"item": "印刷費", "amount": 100000}, {"item": "音響・照明", "amount": 100000}, {"item": "その他", "amount": 70000}]'::jsonb
  WHEN id = '660e8400-e29b-41d4-a716-446655440029' THEN '[{"item": "小道具", "amount": 120000}, {"item": "印刷費", "amount": 80000}, {"item": "音響・照明", "amount": 100000}, {"item": "その他", "amount": 70000}]'::jsonb
  ELSE production_cost_items
END;

-- 6. 実行確認
SELECT 
  title,
  author,
  production_cost,
  participation_fee,
  gm_assignments,
  available_gms,
  difficulty
FROM scenarios 
ORDER BY author, title;

-- 7. 統計情報
SELECT 
  '制作費統計' as category,
  MIN(production_cost) as min_cost,
  MAX(production_cost) as max_cost,
  AVG(production_cost)::INTEGER as avg_cost,
  COUNT(*) as count
FROM scenarios
UNION ALL
SELECT 
  '参加費統計' as category,
  MIN(participation_fee) as min_fee,
  MAX(participation_fee) as max_fee,
  AVG(participation_fee)::INTEGER as avg_fee,
  COUNT(*) as count
FROM scenarios
UNION ALL
SELECT 
  'GM報酬統計' as category,
  MIN((gm_assignments->0->>'reward')::INTEGER) as min_fee,
  MAX((gm_assignments->0->>'reward')::INTEGER) as max_fee,
  AVG((gm_assignments->0->>'reward')::INTEGER)::INTEGER as avg_fee,
  COUNT(*) as count
FROM scenarios
WHERE jsonb_array_length(gm_assignments) > 0;
