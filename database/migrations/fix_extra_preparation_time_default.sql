-- extra_preparation_time の意図しないデフォルト値(30)をクリアし、
-- テーブルのデフォルト値を DEFAULT 0 から DEFAULT NULL に変更する
-- 作成日: 2026-02-09
-- 概要: extra_preparation_time が未設定のシナリオに意図せず+30が表示される問題を修正

-- ============================================================
-- 1. 現状確認
-- ============================================================
SELECT 'organization_scenarios: extra_preparation_time の分布' as check_name;
SELECT 
  extra_preparation_time,
  COUNT(*) as count
FROM organization_scenarios
GROUP BY extra_preparation_time
ORDER BY extra_preparation_time;

SELECT 'scenarios: extra_preparation_time の分布' as check_name;
SELECT 
  extra_preparation_time,
  COUNT(*) as count
FROM scenarios
GROUP BY extra_preparation_time
ORDER BY extra_preparation_time;

-- ============================================================
-- 2. organization_scenarios テーブルのデフォルト値を変更
--    DEFAULT 0 → DEFAULT NULL (未設定 = 追加準備なし)
-- ============================================================
ALTER TABLE organization_scenarios 
ALTER COLUMN extra_preparation_time SET DEFAULT NULL;

-- ============================================================
-- 3. 既存データのクリア
--    extra_preparation_time = 30 のレコードを NULL に更新
--    （意図的に30を設定したケースがある場合は要確認）
-- ============================================================

-- organization_scenarios テーブル
UPDATE organization_scenarios
SET extra_preparation_time = NULL
WHERE extra_preparation_time = 30;

-- scenarios テーブル
UPDATE scenarios
SET extra_preparation_time = NULL
WHERE extra_preparation_time = 30;

-- ============================================================
-- 4. extra_preparation_time = 0 のレコードも NULL に統一
--    0 = 追加準備なし = NULL と同じ意味なので統一
-- ============================================================

UPDATE organization_scenarios
SET extra_preparation_time = NULL
WHERE extra_preparation_time = 0;

UPDATE scenarios
SET extra_preparation_time = NULL
WHERE extra_preparation_time = 0;

-- ============================================================
-- 5. 修正後の確認
-- ============================================================
SELECT 'organization_scenarios: 修正後の分布' as check_name;
SELECT 
  extra_preparation_time,
  COUNT(*) as count
FROM organization_scenarios
GROUP BY extra_preparation_time
ORDER BY extra_preparation_time;

SELECT 'scenarios: 修正後の分布' as check_name;
SELECT 
  extra_preparation_time,
  COUNT(*) as count
FROM scenarios
GROUP BY extra_preparation_time
ORDER BY extra_preparation_time;
