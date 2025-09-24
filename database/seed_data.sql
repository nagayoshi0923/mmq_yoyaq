-- Queens Waltz マーダーミステリー店舗管理システム
-- 初期データ投入スクリプト

-- 1. 店舗データ（6店舗）
INSERT INTO stores (name, short_name, address, phone_number, email, manager_name, capacity, rooms, color, notes) VALUES
('高田馬場店', '馬場', '東京都新宿区高田馬場1-1-1', '03-1234-5678', 'takadanobaba@queenswaltz.com', '田中太郎', 8, 2, '#3B82F6', '高田馬場駅徒歩3分'),
('別館①', '別館①', '東京都新宿区高田馬場2-2-2', '03-1234-5679', 'bekkan1@queenswaltz.com', '佐藤花子', 6, 1, '#10B981', '高田馬場店の別館'),
('別館②', '別館②', '東京都新宿区高田馬場3-3-3', '03-1234-5680', 'bekkan2@queenswaltz.com', '鈴木次郎', 6, 1, '#8B5CF6', '高田馬場店の第二別館'),
('大久保店', '大久保', '東京都新宿区大久保1-1-1', '03-1234-5681', 'okubo@queenswaltz.com', '山田三郎', 7, 2, '#F97316', '大久保駅徒歩2分'),
('大塚店', '大塚', '東京都豊島区大塚1-1-1', '03-1234-5682', 'otsuka@queenswaltz.com', '田村四郎', 6, 1, '#EF4444', '大塚駅徒歩5分'),
('埼玉大宮店', '埼玉大宮', '埼玉県さいたま市大宮区1-1-1', '048-1234-5683', 'omiya@queenswaltz.com', '中村五郎', 8, 2, '#F59E0B', '大宮駅徒歩7分');

-- 2. サンプルシナリオデータ（READMEに記載の40個から一部）
INSERT INTO scenarios (title, author, license_amount, duration, player_count_min, player_count_max, difficulty, genre, production_cost, gm_fee, participation_fee, has_pre_reading, notes) VALUES
('人狼村の悲劇', '山田作者', 5000, 180, 6, 8, 3, ARRAY['推理', 'ホラー'], 15000, 3000, 2500, true, '人気の定番シナリオ'),
('密室の謎', '佐藤作者', 8000, 150, 4, 6, 4, ARRAY['推理', 'サスペンス'], 20000, 3500, 3000, false, '上級者向け'),
('学園の秘密', '田中作者', 3000, 120, 5, 7, 2, ARRAY['学園', '青春'], 10000, 2500, 2000, true, '初心者におすすめ'),
('古城の呪い', '鈴木作者', 6000, 200, 6, 8, 4, ARRAY['ホラー', 'ファンタジー'], 18000, 4000, 3500, true, 'ホラー要素強め'),
('企業の陰謀', '高橋作者', 7000, 160, 5, 8, 3, ARRAY['現代', 'サスペンス'], 16000, 3200, 2800, false, 'ビジネス系'),
('海辺の殺人', '伊藤作者', 4500, 140, 4, 6, 3, ARRAY['推理', '夏'], 12000, 2800, 2300, true, '夏季限定'),
('雪山の遭難', '渡辺作者', 5500, 170, 6, 8, 4, ARRAY['サバイバル', 'ホラー'], 17000, 3600, 3200, false, '冬季限定'),
('宇宙船の危機', '中村作者', 9000, 180, 5, 7, 5, ARRAY['SF', 'サスペンス'], 25000, 4500, 4000, true, 'SF上級者向け'),
('魔法学校の事件', '小林作者', 4000, 130, 5, 8, 2, ARRAY['ファンタジー', '学園'], 11000, 2600, 2200, true, 'ファンタジー入門'),
('時代劇殺人事件', '加藤作者', 6500, 190, 6, 8, 3, ARRAY['時代劇', '推理'], 19000, 3800, 3300, false, '和風テイスト');

-- 3. サンプルスタッフデータ
INSERT INTO staff (name, line_name, x_account, role, stores, availability, experience, status, email, phone, notes) VALUES
('田中GM', 'tanaka_gm', '@tanaka_gm', ARRAY['GM', 'マネージャー'], ARRAY['高田馬場店', '別館①'], ARRAY['月', '火', '水', '木', '金'], 3, 'active', 'tanaka@queenswaltz.com', '090-1234-5678', '経験豊富なメインGM'),
('佐藤スタッフ', 'sato_staff', '@sato_staff', ARRAY['スタッフ'], ARRAY['別館②', '大久保店'], ARRAY['土', '日', '月'], 1, 'active', 'sato@queenswaltz.com', '090-1234-5679', '新人スタッフ'),
('鈴木GM', 'suzuki_gm', '@suzuki_gm', ARRAY['GM'], ARRAY['大塚店', '埼玉大宮店'], ARRAY['水', '木', '金', '土', '日'], 5, 'active', 'suzuki@queenswaltz.com', '090-1234-5680', 'ベテランGM'),
('山田企画', 'yamada_plan', '@yamada_plan', ARRAY['企画スタッフ', 'GM'], ARRAY['高田馬場店'], ARRAY['火', '水', '木'], 2, 'active', 'yamada@queenswaltz.com', '090-1234-5681', '企画・運営担当'),
('田村サポート', 'tamura_support', '@tamura_support', ARRAY['スタッフ'], ARRAY['大久保店', '大塚店'], ARRAY['金', '土', '日'], 1, 'active', 'tamura@queenswaltz.com', '090-1234-5682', 'サポートスタッフ');

-- 4. 公演キット在庫データ
INSERT INTO performance_kits (scenario_id, scenario_title, kit_number, condition, store_id, notes) VALUES
((SELECT id FROM scenarios WHERE title = '人狼村の悲劇'), '人狼村の悲劇', 1, 'excellent', (SELECT id FROM stores WHERE short_name = '馬場'), 'メインキット'),
((SELECT id FROM scenarios WHERE title = '人狼村の悲劇'), '人狼村の悲劇', 2, 'good', (SELECT id FROM stores WHERE short_name = '別館①'), 'サブキット'),
((SELECT id FROM scenarios WHERE title = '密室の謎'), '密室の謎', 1, 'excellent', (SELECT id FROM stores WHERE short_name = '大久保'), 'メインキット'),
((SELECT id FROM scenarios WHERE title = '学園の秘密'), '学園の秘密', 1, 'good', (SELECT id FROM stores WHERE short_name = '大塚'), 'メインキット'),
((SELECT id FROM scenarios WHERE title = '古城の呪い'), '古城の呪い', 1, 'excellent', (SELECT id FROM stores WHERE short_name = '埼玉大宮'), 'メインキット');

-- 5. スタッフ⇔シナリオの担当関係
INSERT INTO staff_scenario_assignments (staff_id, scenario_id, notes) VALUES
((SELECT id FROM staff WHERE name = '田中GM'), (SELECT id FROM scenarios WHERE title = '人狼村の悲劇'), 'メイン担当'),
((SELECT id FROM staff WHERE name = '田中GM'), (SELECT id FROM scenarios WHERE title = '学園の秘密'), 'サブ担当'),
((SELECT id FROM staff WHERE name = '鈴木GM'), (SELECT id FROM scenarios WHERE title = '密室の謎'), 'メイン担当'),
((SELECT id FROM staff WHERE name = '鈴木GM'), (SELECT id FROM scenarios WHERE title = '古城の呪い'), 'メイン担当'),
((SELECT id FROM staff WHERE name = '山田企画'), (SELECT id FROM scenarios WHERE title = '企業の陰謀'), 'メイン担当');

-- 6. サンプルスケジュールイベント
INSERT INTO schedule_events (date, venue, scenario, gms, start_time, end_time, category, notes, scenario_id, store_id) VALUES
('2024-12-25', '高田馬場店', '人狼村の悲劇', ARRAY['田中GM'], '14:00', '17:00', 'open', 'クリスマス特別公演', 
 (SELECT id FROM scenarios WHERE title = '人狼村の悲劇'), (SELECT id FROM stores WHERE short_name = '馬場')),
('2024-12-26', '大久保店', '密室の謎', ARRAY['鈴木GM'], '19:00', '21:30', 'private', '貸切公演',
 (SELECT id FROM scenarios WHERE title = '密室の謎'), (SELECT id FROM stores WHERE short_name = '大久保')),
('2024-12-27', '別館①', '学園の秘密', ARRAY['田中GM'], '15:00', '17:00', 'open', '年末公演',
 (SELECT id FROM scenarios WHERE title = '学園の秘密'), (SELECT id FROM stores WHERE short_name = '別館①'));

-- 完了メッセージ
SELECT 'データベース初期化完了！' as message,
       (SELECT COUNT(*) FROM stores) as stores_count,
       (SELECT COUNT(*) FROM scenarios) as scenarios_count,
       (SELECT COUNT(*) FROM staff) as staff_count,
       (SELECT COUNT(*) FROM performance_kits) as kits_count;
