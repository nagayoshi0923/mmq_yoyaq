-- シナリオデモデータの挿入
-- 実行前に既存データをクリア（必要に応じて）
-- DELETE FROM scenarios;

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
  status
) VALUES
-- オープン公演向けシナリオ
('550e8400-e29b-41d4-a716-446655440001', '人狼村の悲劇', '閉ざされた村で起こる連続殺人事件。プレイヤーは村人となって真犯人を見つけ出す。', 'MMQ制作チーム', 240, 4, 8, 3, '{"mystery", "murder"}', 'available'),
('550e8400-e29b-41d4-a716-446655440002', '密室の謎', '豪邸の書斎で発見された不可解な殺人事件。密室トリックを解き明かせ。', 'MMQ制作チーム', 180, 3, 6, 2, '{"mystery", "locked-room"}', 'available'),
('550e8400-e29b-41d4-a716-446655440003', '消えた宝石', '美術館から盗まれた宝石の行方を追う。複数の容疑者の中から真犯人を見つけよう。', 'MMQ制作チーム', 150, 4, 7, 2, '{"mystery", "theft"}', 'available'),
('550e8400-e29b-41d4-a716-446655440004', '雪山山荘殺人事件', '雪で閉ざされた山荘で起こる連続殺人。外部との連絡が取れない中、犯人を見つけ出せ。', 'MMQ制作チーム', 270, 5, 8, 4, '{"mystery", "isolated", "murder"}', 'available'),

-- 貸切公演向けシナリオ
('550e8400-e29b-41d4-a716-446655440005', '企業スパイ', '大企業内部で起こるスパイ活動。誰が敵で誰が味方なのか？', 'MMQ制作チーム', 200, 6, 10, 3, '{"thriller", "spy"}', 'available'),
('550e8400-e29b-41d4-a716-446655440006', '学園の七不思議', '古い学校に伝わる怪談の真相を探る。ホラー要素を含む推理シナリオ。', 'MMQ制作チーム', 180, 4, 8, 3, '{"horror", "school", "mystery"}', 'available'),
('550e8400-e29b-41d4-a716-446655440007', '時空の歪み', 'タイムパラドックスが起こった世界で、時間軸を修正する冒険。', 'MMQ制作チーム', 240, 5, 9, 4, '{"sci-fi", "time-travel"}', 'available'),

-- GMテスト・テストプレイ向けシナリオ
('550e8400-e29b-41d4-a716-446655440008', 'テスト用短編', 'GM練習用の短時間シナリオ。基本的な推理要素を含む。', 'MMQ制作チーム', 90, 3, 5, 1, '{"mystery", "tutorial"}', 'available'),
('550e8400-e29b-41d4-a716-446655440009', '新人研修用', '初心者向けのチュートリアルシナリオ。ルール説明を含む。', 'MMQ制作チーム', 60, 2, 4, 1, '{"tutorial", "beginner"}', 'available'),

-- 出張公演向けシナリオ
('550e8400-e29b-41d4-a716-446655440010', '移動型推理', '会場を移動しながら進行する推理ゲーム。出張公演に最適。', 'MMQ制作チーム', 120, 4, 6, 3, '{"mystery", "mobile"}', 'available'),
('550e8400-e29b-41d4-a716-446655440011', 'コンパクト謎解き', '少ない道具で楽しめる謎解きシナリオ。持ち運び簡単。', 'MMQ制作チーム', 90, 3, 6, 2, '{"puzzle", "compact"}', 'available'),

-- 季節・イベント向けシナリオ
('550e8400-e29b-41d4-a716-446655440012', 'クリスマスの奇跡', 'クリスマスパーティーで起こる事件。季節感のある推理シナリオ。', 'MMQ制作チーム', 180, 4, 8, 3, '{"mystery", "christmas", "seasonal"}', 'available'),
('550e8400-e29b-41d4-a716-446655440013', '夏祭りの謎', '夏祭りの会場で起こる不可解な事件。お祭り気分で楽しめる。', 'MMQ制作チーム', 150, 5, 9, 2, '{"mystery", "festival", "seasonal"}', 'available'),

-- 上級者向けシナリオ
('550e8400-e29b-41d4-a716-446655440014', '完全犯罪計画', '複雑なトリックと心理戦が織りなす上級者向けシナリオ。', 'MMQ制作チーム', 300, 6, 8, 5, '{"mystery", "complex", "psychological"}', 'available'),
('550e8400-e29b-41d4-a716-446655440015', '多重人格の謎', '心理学的要素を含む複雑な推理シナリオ。上級者におすすめ。', 'MMQ制作チーム', 240, 4, 7, 5, '{"psychological", "complex", "mystery"}', 'available');

-- 実行確認
SELECT COUNT(*) as inserted_scenarios FROM scenarios;
SELECT title, genre, duration, player_count_min, player_count_max, difficulty, status
FROM scenarios 
ORDER BY difficulty, duration;
