-- 新しい作者のシナリオを追加

INSERT INTO scenarios (
  id,
  title,
  description,
  author,
  duration,
  player_count_min,
  player_count_max,
  difficulty,
  genre,
  status,
  license_costs,
  participation_fee
) VALUES
-- 月影のシナリオ
('660e8400-e29b-41d4-a716-446655440020', '都市伝説の真実', '都市に伝わる怪談の真相を探る。現代的なホラー要素を含む推理シナリオ。', '月影', 180, 4, 7, 3, '{"horror", "mystery", "urban-legend"}', 'available', '[{"time_slot": "通常", "amount": 4500}]'::jsonb, 3200),
('660e8400-e29b-41d4-a716-446655440021', '記憶の迷宮', '記憶を失った主人公が過去の真実を探る。心理的な要素が強いシナリオ。', '月影', 240, 3, 6, 4, '{"psychological", "mystery", "memory"}', 'available', '[{"time_slot": "通常", "amount": 5500}]'::jsonb, 3600),

-- 桜咲のシナリオ
('660e8400-e29b-41d4-a716-446655440022', '学園の秘密', '古い学校に隠された秘密を探る。青春要素とミステリーが融合したシナリオ。', '桜咲', 200, 4, 8, 2, '{"school", "mystery", "youth"}', 'available', '[{"time_slot": "通常", "amount": 3500}]'::jsonb, 2800),
('660e8400-e29b-41d4-a716-446655440023', '時をかける少女', '時間を操る能力を持つ少女の物語。SF要素とロマンスが織りなすシナリオ。', '桜咲', 220, 3, 7, 3, '{"sci-fi", "romance", "time-travel"}', 'available', '[{"time_slot": "通常", "amount": 4200}]'::jsonb, 3000),

-- 龍神のシナリオ
('660e8400-e29b-41d4-a716-446655440024', '戦国武将の陰謀', '戦国時代を舞台にした政治的な陰謀を描く。歴史要素と推理が融合したシナリオ。', '龍神', 300, 5, 8, 4, '{"historical", "political", "warring-states"}', 'available', '[{"time_slot": "通常", "amount": 6500}]'::jsonb, 4200),
('660e8400-e29b-41d4-a716-446655440025', '江戸の怪奇事件', '江戸時代の町で起こる不可解な事件。時代劇要素とミステリーが融合したシナリオ。', '龍神', 250, 4, 7, 3, '{"historical", "mystery", "edo-period"}', 'available', '[{"time_slot": "通常", "amount": 4800}]'::jsonb, 3400),

-- 星雲のシナリオ
('660e8400-e29b-41d4-a716-446655440026', '宇宙ステーションの謎', '宇宙ステーションで起こる不可解な事件。SF要素とクローズドサークルミステリー。', '星雲', 280, 4, 8, 4, '{"sci-fi", "space", "mystery"}', 'available', '[{"time_slot": "通常", "amount": 7200}]'::jsonb, 4500),
('660e8400-e29b-41d4-a716-446655440027', '未来都市の犯罪', '近未来の都市で起こるサイバー犯罪を追う。テクノロジー要素が強いシナリオ。', '星雲', 260, 5, 9, 3, '{"sci-fi", "cyberpunk", "crime"}', 'available', '[{"time_slot": "通常", "amount": 5800}]'::jsonb, 3800),

-- 古都のシナリオ
('660e8400-e29b-41d4-a716-446655440028', '古代遺跡の秘密', '古代文明の遺跡で発見された謎を解く。冒険要素とミステリーが融合したシナリオ。', '古都', 320, 4, 8, 4, '{"adventure", "ancient", "mystery"}', 'available', '[{"time_slot": "通常", "amount": 7500}]'::jsonb, 4800),
('660e8400-e29b-41d4-a716-446655440029', '魔法学校の事件', '魔法学校で起こる事件を解決する。ファンタジー要素とミステリーが融合したシナリオ。', '古都', 240, 4, 7, 3, '{"fantasy", "magic", "school", "mystery"}', 'available', '[{"time_slot": "通常", "amount": 5200}]'::jsonb, 3600);

-- 確認用クエリ
SELECT id, title, author, license_costs, participation_fee FROM scenarios WHERE author IN ('月影', '桜咲', '龍神', '星雲', '古都') ORDER BY author, title;
