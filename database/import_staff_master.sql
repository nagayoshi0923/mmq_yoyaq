-- スタッフマスターデータのインポート
-- 
-- 実行前に既存データをクリアする場合はコメントアウトを外してください
-- DELETE FROM staff;

INSERT INTO staff (
  name,
  line_name,
  x_account,
  stores,
  ng_days,
  want_to_learn,
  role,
  notes,
  status
) VALUES
-- 社長・マネージャー
('えいきち', 'まい（えいきち）', NULL, '{}', '{}', '{}', '{admin}', '社長', 'active'),
('江波（えなみん）', 'えな', NULL, '{}', '{}', '{}', '{admin,staff}', '制作企画・監修・シフト作成業務', 'active'),
('ソラ', 'きょーくん', NULL, '{}', '{土曜,日曜}', '{}', '{manager}', 'マネージャー', 'active'),
('八継じの', 'やぎ', NULL, '{}', '{}', '{}', '{manager}', 'マネージャー', 'active'),
('つばめ', 'あかり', NULL, '{}', '{}', '{}', '{manager}', 'マネージャー', 'active'),

-- 事務スタッフ
('さく', '奈倉さき', NULL, '{}', '{土曜,日曜}', '{}', '{staff}', '事務', 'active'),

-- GM可能スタッフ
('きゅう', 'Kanon👿（Q）', NULL, '{}', '{}', '{}', '{gm,staff}', NULL, 'active'),
('松井（まつい）', 'マツケン', NULL, '{}', '{}', '{}', '{gm,staff}', NULL, 'active'),
('れいにー', 'Reine', NULL, '{}', '{}', '{}', '{gm,staff}', '4月以降会社の様子見', 'active'),
('Remia（れみあ）', '田端亮哉', NULL, '{}', '{}', '{}', '{gm,staff}', NULL, 'active'),
('みずき', 'MizuKi', NULL, '{}', '{}', '{}', '{gm,staff}', '平日9時~17時30分仕事', 'active'),
('りえぞー', '渡辺りえぞー', NULL, '{}', '{水曜昼,金曜昼,月曜夜}', '{}', '{gm,staff}', '大宮店のみ公演終了22時半希望', 'active'),
('えりん', 'みほ（えりん）', NULL, '{}', '{平日昼}', '{}', '{gm,staff}', NULL, 'active'),
('ぽんちゃん', ':）pon．', NULL, '{}', '{水曜,金曜夜,土曜,日曜,祝日}', '{}', '{gm,staff}', NULL, 'active'),
('しらやま', 'まつだゆいか', '@mt_shira(個人) @mt_waltz(店舗)', '{}', '{月曜,金曜1日,火曜朝昼,水曜朝昼,木曜朝昼,土曜朝昼}', '{}', '{gm,staff}', '予定調整のため、プレイヤー参加は一度ご相談ください。', 'active'),
('崎', 'かな', NULL, '{}', '{平日}', '{}', '{gm,staff}', NULL, 'active'),
('ぴよな', 'かまぼこ', NULL, '{}', '{}', '{}', '{gm,staff}', NULL, 'active'),
('あんころ', 'あん', NULL, '{}', '{}', '{}', '{gm,staff}', NULL, 'active'),
('りんな', 'アンナ', NULL, '{}', '{月曜夜,水曜夜,金曜夜}', '{}', '{gm,staff}', NULL, 'active'),
('labo', 'TERU(labo)', NULL, '{}', '{}', '{}', '{gm,staff}', NULL, 'active'),
('イワセモリシ', '岩瀬守志', NULL, '{}', '{}', '{}', '{gm,staff}', NULL, 'active'),
('藤崎ソルト', 'しおん', NULL, '{}', '{}', '{}', '{gm,staff}', NULL, 'active'),

-- 作品制作者（基本GMなし）
('ほがらか', '鶴田', NULL, '{}', '{}', '{}', '{author}', '自作のみのGM', 'active'),
('みくみん', '住吉美紅', NULL, '{}', '{}', '{}', '{author}', '作品制作者、基本GMなし', 'active'),
('古賀', 'みずき', NULL, '{}', '{}', '{}', '{staff}', 'マダミス以外のイベント担当、基本GMなし', 'active')

ON CONFLICT (name) DO UPDATE SET
  line_name = EXCLUDED.line_name,
  x_account = EXCLUDED.x_account,
  stores = EXCLUDED.stores,
  ng_days = EXCLUDED.ng_days,
  want_to_learn = EXCLUDED.want_to_learn,
  role = EXCLUDED.role,
  notes = EXCLUDED.notes,
  status = EXCLUDED.status,
  updated_at = NOW();

-- インポート完了メッセージ
SELECT 
  '✅ スタッフデータのインポートが完了しました' as status,
  COUNT(*) as total_staff,
  COUNT(CASE WHEN 'gm' = ANY(role) THEN 1 END) as gm_staff,
  COUNT(CASE WHEN 'manager' = ANY(role) THEN 1 END) as managers,
  COUNT(CASE WHEN 'admin' = ANY(role) THEN 1 END) as admins,
  COUNT(CASE WHEN 'author' = ANY(role) THEN 1 END) as authors
FROM staff;

-- スタッフ一覧の確認
SELECT 
  name as 名前,
  line_name as LINE名,
  x_account as Xアカウント,
  CASE 
    WHEN 'admin' = ANY(role) THEN '管理者'
    WHEN 'manager' = ANY(role) THEN 'マネージャー'
    WHEN 'gm' = ANY(role) THEN 'GMスタッフ'
    WHEN 'author' = ANY(role) THEN '作者'
    ELSE 'スタッフ'
  END as 役割,
  array_to_string(ng_days, ', ') as NG曜日,
  notes as 備考,
  status as ステータス
FROM staff
ORDER BY 
  CASE 
    WHEN 'admin' = ANY(role) THEN 1
    WHEN 'manager' = ANY(role) THEN 2
    WHEN 'gm' = ANY(role) THEN 3
    WHEN 'author' = ANY(role) THEN 4
    ELSE 5
  END,
  name;

