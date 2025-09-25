-- スタッフデモデータの挿入
-- 実行前に既存データをクリア（必要に応じて）
-- DELETE FROM staff;

INSERT INTO staff (
  id,
  name,
  line_name,
  x_account,
  role,
  stores,
  ng_days,
  want_to_learn,
  available_scenarios,
  notes,
  phone,
  email,
  availability,
  experience,
  special_scenarios,
  status
) VALUES
-- 管理者・ベテランGM
('550e8400-e29b-41d4-a716-446655440101', '田中 太郎', 'tanaka_gm', '@tanaka_gm', '{"admin", "gm", "trainer"}', '{"高田馬場店", "別館①"}', '{}', '{}', '{"人狼村の悲劇", "密室の謎", "雪山山荘殺人事件", "完全犯罪計画"}', '店舗責任者。新人研修担当。', '090-1234-5678', 'tanaka@mmq.example.com', '{"平日夜", "土日"}', 5, '{"完全犯罪計画", "多重人格の謎"}', 'active'),

('550e8400-e29b-41d4-a716-446655440102', '佐藤 花子', 'sato_hanako', '@sato_hanako', '{"gm", "staff"}', '{"高田馬場店", "別館②"}', '{"水曜日"}', '{"新シナリオ"}', '{"消えた宝石", "企業スパイ", "学園の七不思議"}', 'ホラー系シナリオが得意。', '090-2345-6789', 'sato@mmq.example.com', '{"平日夜", "土日祝"}', 4, '{"学園の七不思議", "時空の歪み"}', 'active'),

-- 中堅GM
('550e8400-e29b-41d4-a716-446655440103', '鈴木 一郎', 'suzuki_gm', '@suzuki_gm', '{"gm", "staff"}', '{"大久保店", "大塚店"}', '{"月曜日"}', '{"心理系シナリオ"}', '{"密室の謎", "消えた宝石", "クリスマスの奇跡"}', '推理系が得意。論理的な進行が評判。', '090-3456-7890', 'suzuki@mmq.example.com', '{"平日夜", "土曜日"}', 3, '{"企業スパイ"}', 'active'),

('550e8400-e29b-41d4-a716-446655440104', '高橋 美咲', 'takahashi_misaki', '@misaki_gm', '{"gm", "staff"}', '{"埼玉大宮店", "別館①"}', '{"日曜日"}', '{"SF系シナリオ"}', '{"時空の歪み", "夏祭りの謎", "移動型推理"}', '出張公演の経験豊富。', '090-4567-8901', 'takahashi@mmq.example.com', '{"平日夜", "土曜日"}', 3, '{"移動型推理", "コンパクト謎解き"}', 'active'),

-- 新人・研修中GM
('550e8400-e29b-41d4-a716-446655440105', '伊藤 健太', 'ito_kenta', '@kenta_newgm', '{"gm", "trainee"}', '{"高田馬場店"}', '{}', '{"上級シナリオ", "ホラー系"}', '{"テスト用短編", "新人研修用", "密室の謎"}', '新人GM。意欲的で成長中。', '090-5678-9012', 'ito@mmq.example.com', '{"平日夜", "土日"}', 1, '{}', 'active'),

('550e8400-e29b-41d4-a716-446655440106', '渡辺 由美', 'watanabe_yumi', '@yumi_gm', '{"gm", "trainee"}', '{"別館②", "大久保店"}', '{"火曜日", "木曜日"}', '{"長時間シナリオ"}', '{"新人研修用", "消えた宝石", "夏祭りの謎"}', '学生GM。週末メイン。', '090-6789-0123', 'watanabe@mmq.example.com', '{"土日祝"}', 1, '{}', 'active'),

-- スタッフ（GM補助・運営）
('550e8400-e29b-41d4-a716-446655440107', '山田 次郎', 'yamada_jiro', '@yamada_staff', '{"staff", "support"}', '{"高田馬場店", "別館①", "別館②"}', '{}', '{"GM技術"}', '{}', '受付・案内担当。顧客対応が得意。', '090-7890-1234', 'yamada@mmq.example.com', '{"平日夜", "土日"}', 0, '{}', 'active'),

('550e8400-e29b-41d4-a716-446655440108', '中村 愛', 'nakamura_ai', '@ai_support', '{"staff", "support"}', '{"大塚店", "埼玉大宮店"}', '{"月曜日"}', '{"イベント企画"}', '{}', 'イベント企画・SNS運営担当。', '090-8901-2345', 'nakamura@mmq.example.com', '{"平日夜", "土日"}', 0, '{}', 'active'),

-- 専門スタッフ
('550e8400-e29b-41d4-a716-446655440109', '小林 拓也', 'kobayashi_takuya', '@takuya_tech', '{"staff", "tech"}', '{"高田馬場店"}', '{}', '{}', '{}', 'システム管理・機材担当。', '090-9012-3456', 'kobayashi@mmq.example.com', '{"平日"}', 0, '{}', 'active'),

('550e8400-e29b-41d4-a716-446655440110', '加藤 麻衣', 'kato_mai', '@mai_design', '{"staff", "design"}', '{}', '{"土曜日"}', '{"シナリオ制作"}', '{}', 'デザイン・制作担当。シナリオ小道具作成。', '090-0123-4567', 'kato@mmq.example.com', '{"平日", "日曜日"}', 0, '{}', 'active'),

-- アルバイト・パートタイム
('550e8400-e29b-41d4-a716-446655440111', '松本 大輔', 'matsumoto_daisuke', '@daisuke_part', '{"staff", "part-time"}', '{"別館②", "大久保店"}', '{"平日"}', '{"GM技術"}', '{"テスト用短編"}', '大学生アルバイト。将来GM希望。', '090-1234-5670', 'matsumoto@mmq.example.com', '{"土日祝"}', 0, '{}', 'active'),

('550e8400-e29b-41d4-a716-446655440112', '森田 彩香', 'morita_ayaka', '@ayaka_weekend', '{"staff", "part-time"}', '{"大塚店", "埼玉大宮店"}', '{"平日"}', '{"接客技術"}', '{}', '週末専門スタッフ。接客経験豊富。', '090-2345-6701', 'morita@mmq.example.com', '{"土日祝"}', 0, '{}', 'active');

-- 実行確認
SELECT COUNT(*) as inserted_staff FROM staff;
SELECT name, role, stores, experience, status 
FROM staff 
ORDER BY experience DESC, name;
