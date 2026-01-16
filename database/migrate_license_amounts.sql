-- ライセンス金額のマイグレーション
-- 
-- 背景：
-- 元々 franchise_license_amount に設定されていた金額は
-- 「他社からの公演料」（他社がMMQに払う金額）だった。
-- 
-- 変更内容：
-- 1. franchise_license_amount → external_license_amount にコピー
-- 2. franchise_license_amount = 元の値 - 2000（マージン差引後 = 作者への支払い）
-- 3. GMテスト版も同様（-2000）

-- 実行前の確認（dry run）
SELECT 
  id,
  title,
  franchise_license_amount as "現在の他店用（→他社公演料に移動）",
  COALESCE(franchise_license_amount, 0) - 2000 as "新しい作者への支払い",
  2000 as "マージン",
  franchise_gm_test_license_amount as "現在のGMテスト他店用",
  COALESCE(franchise_gm_test_license_amount, 0) - 2000 as "新しいGMテスト作者への支払い"
FROM scenarios
WHERE franchise_license_amount IS NOT NULL AND franchise_license_amount > 0
ORDER BY title;

-- マイグレーション実行（上記確認後にコメント解除して実行）
/*
UPDATE scenarios
SET 
  -- 元の値を「他社からの公演料」に移動
  external_license_amount = franchise_license_amount,
  external_gm_test_license_amount = franchise_gm_test_license_amount,
  -- 作者への支払い = 元の値 - 2000（マージン）
  franchise_license_amount = GREATEST(0, COALESCE(franchise_license_amount, 0) - 2000),
  franchise_gm_test_license_amount = GREATEST(0, COALESCE(franchise_gm_test_license_amount, 0) - 2000),
  updated_at = NOW()
WHERE franchise_license_amount IS NOT NULL AND franchise_license_amount > 0;
*/

-- 確認クエリ（実行後）
/*
SELECT 
  id,
  title,
  external_license_amount as "他社からの公演料",
  franchise_license_amount as "作者への支払い",
  external_license_amount - franchise_license_amount as "マージン",
  external_gm_test_license_amount as "GMテスト他社公演料",
  franchise_gm_test_license_amount as "GMテスト作者への支払い"
FROM scenarios
WHERE external_license_amount IS NOT NULL AND external_license_amount > 0
ORDER BY title;
*/

