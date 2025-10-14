-- スタッフ名の揺らぎを確認
-- 
-- GMデータとstaffテーブルの名前の不一致を検出

-- ===========================
-- 1. 現在登録されているスタッフ名一覧
-- ===========================

SELECT 
  '登録済みスタッフ' as category,
  name as スタッフ名
FROM staff
ORDER BY name;

-- ===========================
-- 2. GMデータに登場するユニークな名前（サンプル）
-- ===========================

-- ここでGMデータから抽出したユニークな名前をリスト化
-- 以下は例（実際にはparse_gm_data.pyで抽出）

WITH gm_names AS (
  SELECT UNNEST(ARRAY[
    'えなみ', 'きゅう', 'れみあ', 'れいにー', 'ぽん', 'ソウタン', 
    'しらやま', 'りんな', 'つばめ', 'えりん', 'labo', 'じの', 
    '崎', 'ぽったー', 'ソルト', 'ほがらか', 'みずき', 'りえぞー', 
    'まつい', 'モリシ', 'ぴよな', 'あんころ', 'だいこん', 'ソラ', 
    'ミカノハ', 'みくみん', '古賀', 'kanade', '渚咲', '温風リン', 
    '奏兎', 'らぼ', 'らの', 'BB', '楽', 'キュウ', 'キュキュウ', 
    'ポッター', 'もりし', 'みかのは', 'こが', 'えなみん'
  ]) as name
)
SELECT 
  '不一致の可能性' as category,
  gn.name as GMデータの名前,
  s.name as スタッフテーブルの名前
FROM gm_names gn
LEFT JOIN staff s ON gn.name = s.name
WHERE s.name IS NULL
ORDER BY gn.name;

-- ===========================
-- 3. 名前の揺らぎパターンを検出
-- ===========================

-- 類似した名前を検出（部分一致）
SELECT 
  '名前の揺らぎ候補' as category,
  s1.name as スタッフ名1,
  s2.name as スタッフ名2,
  '類似している可能性' as 備考
FROM staff s1
CROSS JOIN staff s2
WHERE s1.id < s2.id
  AND (
    s1.name LIKE '%' || s2.name || '%' OR
    s2.name LIKE '%' || s1.name || '%' OR
    LOWER(s1.name) = LOWER(s2.name)
  )
ORDER BY s1.name;

