-- サンプルシナリオデータの挿入

INSERT INTO scenarios (
  id, title, description, author, duration, player_count_min, player_count_max, 
  difficulty, genre, status, license_costs, participation_fee, has_pre_reading
) VALUES
-- MMQ制作チームのシナリオ
('550e8400-e29b-41d4-a716-446655440001', '人狼村の悲劇', '人狼ゲームをベースにした推理シナリオ。村人たちの裏切りと真実を探る。', 'MMQ制作チーム', 240, 4, 8, 3, '{"horror", "mystery"}', 'available', '[{"time_slot": "通常", "amount": 5000}, {"time_slot": "GMテスト", "amount": 2500}]'::jsonb, 3000, true),
('550e8400-e29b-41d4-a716-446655440002', '密室の謎', '閉鎖された空間での連続殺人事件。限られた手がかりから真犯人を特定する。', 'MMQ制作チーム', 180, 4, 6, 4, '{"mystery", "suspense"}', 'available', '[{"time_slot": "通常", "amount": 4500}, {"time_slot": "GMテスト", "amount": 2250}]'::jsonb, 2800, false),
('550e8400-e29b-41d4-a716-446655440003', '古城の呪い', '中世の古城を舞台にしたホラーシナリオ。呪いの真実を解き明かす。', 'MMQ制作チーム', 300, 5, 7, 5, '{"horror", "fantasy"}', 'available', '[{"time_slot": "通常", "amount": 6000}, {"time_slot": "GMテスト", "amount": 3000}]'::jsonb, 3500, true),
('550e8400-e29b-41d4-a716-446655440004', '企業の陰謀', '大企業の内部で起こる権力闘争と陰謀を描く現代サスペンス。', 'MMQ制作チーム', 200, 4, 8, 3, '{"suspense", "drama"}', 'available', '[{"time_slot": "通常", "amount": 4000}, {"time_slot": "GMテスト", "amount": 2000}]'::jsonb, 2500, false),

-- 月影のシナリオ
('660e8400-e29b-41d4-a716-446655440020', '都市伝説の真実', '都市に伝わる怪談の真相を探る。現代的なホラー要素を含む推理シナリオ。', '月影', 180, 4, 7, 3, '{"horror", "mystery", "urban-legend"}', 'available', '[{"time_slot": "通常", "amount": 4500}, {"time_slot": "GMテスト", "amount": 2250}]'::jsonb, 3200, true),
('660e8400-e29b-41d4-a716-446655440021', '記憶の迷宮', '記憶を失った主人公が過去の真実を探る心理サスペンス。', '月影', 220, 3, 6, 4, '{"mystery", "psychological", "suspense"}', 'available', '[{"time_slot": "通常", "amount": 5000}, {"time_slot": "GMテスト", "amount": 2500}]'::jsonb, 3000, false),

-- 桜咲のシナリオ
('660e8400-e29b-41d4-a716-446655440022', '学園の秘密', '学園で起こる不可解な事件を解決する青春ミステリー。', '桜咲', 160, 4, 8, 2, '{"mystery", "school", "drama"}', 'available', '[{"time_slot": "通常", "amount": 4000}, {"time_slot": "GMテスト", "amount": 2000}]'::jsonb, 2500, false),
('660e8400-e29b-41d4-a716-446655440023', '時をかける少女', 'タイムトラベルをテーマにしたロマンチックなファンタジー。', '桜咲', 200, 3, 6, 3, '{"fantasy", "romance", "time-travel"}', 'available', '[{"time_slot": "通常", "amount": 4500}, {"time_slot": "GMテスト", "amount": 2250}]'::jsonb, 2800, true),

-- 龍神のシナリオ
('660e8400-e29b-41d4-a716-446655440024', '戦国武将の陰謀', '戦国時代を舞台にした歴史ミステリー。武将たちの策略を読み解く。', '龍神', 300, 5, 8, 4, '{"historical", "mystery", "strategy"}', 'available', '[{"time_slot": "通常", "amount": 5500}, {"time_slot": "GMテスト", "amount": 2750}]'::jsonb, 3500, true),
('660e8400-e29b-41d4-a716-446655440025', '江戸の怪奇事件', '江戸時代の町で起こる怪奇事件を解決する時代劇ミステリー。', '龍神', 240, 4, 7, 3, '{"historical", "mystery", "supernatural"}', 'available', '[{"time_slot": "通常", "amount": 4800}, {"time_slot": "GMテスト", "amount": 2400}]'::jsonb, 3000, false),

-- 星雲のシナリオ
('660e8400-e29b-41d4-a716-446655440026', '宇宙ステーションの謎', '宇宙ステーションで起こる謎の事件を解決するSFミステリー。', '星雲', 280, 4, 8, 4, '{"sci-fi", "mystery", "space"}', 'available', '[{"time_slot": "通常", "amount": 5200}, {"time_slot": "GMテスト", "amount": 2600}]'::jsonb, 3200, true),
('660e8400-e29b-41d4-a716-446655440027', '未来都市の犯罪', '近未来の都市で起こるサイバー犯罪を追うサイバーパンクミステリー。', '星雲', 220, 4, 7, 3, '{"sci-fi", "cyberpunk", "mystery"}', 'available', '[{"time_slot": "通常", "amount": 4600}, {"time_slot": "GMテスト", "amount": 2300}]'::jsonb, 2800, false),

-- 古都のシナリオ
('660e8400-e29b-41d4-a716-446655440028', '古代遺跡の秘密', '古代遺跡で発見された謎の文字を解読する考古学ミステリー。', '古都', 260, 4, 8, 4, '{"mystery", "archaeology", "adventure"}', 'available', '[{"time_slot": "通常", "amount": 5000}, {"time_slot": "GMテスト", "amount": 2500}]'::jsonb, 3000, true),
('660e8400-e29b-41d4-a716-446655440029', '魔法学校の事件', '魔法学校で起こる不可解な事件を解決するファンタジーミステリー。', '古都', 200, 4, 7, 3, '{"fantasy", "mystery", "magic"}', 'available', '[{"time_slot": "通常", "amount": 4400}, {"time_slot": "GMテスト", "amount": 2200}]'::jsonb, 2700, false);

-- 実行確認
SELECT COUNT(*) as inserted_scenarios FROM scenarios;
SELECT author, COUNT(*) as scenario_count FROM scenarios GROUP BY author ORDER BY author;
