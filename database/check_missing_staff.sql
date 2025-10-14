-- 使用されているスタッフ名の存在チェック
--
-- GMデータで使用されているスタッフ名がデータベースに存在するかチェック

-- ===========================
-- 1. 存在しないスタッフ
-- ===========================

WITH required_staff AS (
  SELECT UNNEST(ARRAY[
    'BB',
  'Remia（れみあ）',
  'kanade',
  'labo',
  'あんころ',
  'えりん',
  'きゅう',
  'しらやま',
  'だいこん',
  'つばめ',
  'ぴよな',
  'ほがらか',
  'ぽったー',
  'ぽん',
  'みくみん',
  'みずき',
  'らの',
  'りえぞー',
  'りんな',
  'れいにー',
  'イワセモリシ',
  'ソウタン',
  'ソラ',
  'ミカノハ',
  '八継じの',
  '古賀',
  '奏兎',
  '崎',
  '松井（まつい）',
  '江波（えなみん）',
  '渚咲',
  '温風リン',
  '藤崎ソルト'
  ]) AS name
),
existing_staff AS (
  SELECT name FROM staff
)
SELECT 
  '存在しないスタッフ' as category,
  rs.name as スタッフ名,
  '新規追加が必要' as 状態
FROM required_staff rs
LEFT JOIN existing_staff es ON rs.name = es.name
WHERE es.name IS NULL
ORDER BY rs.name;

-- ===========================
-- 2. 存在するスタッフ
-- ===========================

WITH required_staff AS (
  SELECT UNNEST(ARRAY[
    'BB',
  'Remia（れみあ）',
  'kanade',
  'labo',
  'あんころ',
  'えりん',
  'きゅう',
  'しらやま',
  'だいこん',
  'つばめ',
  'ぴよな',
  'ほがらか',
  'ぽったー',
  'ぽん',
  'みくみん',
  'みずき',
  'らの',
  'りえぞー',
  'りんな',
  'れいにー',
  'イワセモリシ',
  'ソウタン',
  'ソラ',
  'ミカノハ',
  '八継じの',
  '古賀',
  '奏兎',
  '崎',
  '松井（まつい）',
  '江波（えなみん）',
  '渚咲',
  '温風リン',
  '藤崎ソルト'
  ]) AS name
),
existing_staff AS (
  SELECT name FROM staff
)
SELECT 
  '存在するスタッフ' as category,
  COUNT(*) as 件数
FROM required_staff rs
INNER JOIN existing_staff es ON rs.name = es.name;
