-- GMアサインメントデータの修正
-- 
-- 問題: 全てのスタッフが体験済み扱いになっており、GM可能フラグが設定されていない
-- 解決: 既存データのフラグを修正、または新しいデータで上書き

-- ===========================
-- オプション1: 既存データにデフォルト値を設定
-- ===========================

-- NULLを全てfalseに設定
UPDATE staff_scenario_assignments
SET 
  can_main_gm = COALESCE(can_main_gm, false),
  can_sub_gm = COALESCE(can_sub_gm, false),
  is_experienced = COALESCE(is_experienced, false)
WHERE 
  can_main_gm IS NULL 
  OR can_sub_gm IS NULL 
  OR is_experienced IS NULL;

SELECT '✅ NULLをfalseに設定しました' as status;

-- ===========================
-- オプション2: 古いデータを全て削除
-- ===========================

-- ⚠️ 警告: 全てのGMアサインメントデータが削除されます
-- 実行後、import_all_gm_assignments.sql 等で再インポートしてください

-- DELETE FROM staff_scenario_assignments;
-- SELECT '✅ 全てのGMアサインメントを削除しました。新しいデータをインポートしてください。' as status;

-- ===========================
-- オプション3: 旧データを新システムに移行
-- ===========================

-- staff_scenario_assignmentsにレコードはあるが、can_main_gm等が未設定の場合
-- 一旦全員をGM可能として設定（後で手動調整が必要）

-- UPDATE staff_scenario_assignments
-- SET 
--   can_main_gm = true,
--   can_sub_gm = false,
--   is_experienced = false,
--   can_gm_at = NOW()
-- WHERE 
--   can_main_gm IS NULL 
--   OR (can_main_gm = false AND can_sub_gm = false AND is_experienced = false);
-- 
-- SELECT '✅ 既存データを全てメインGM可能に設定しました' as status;

-- ===========================
-- 確認クエリ
-- ===========================

-- 修正後の状態確認
SELECT 
  '修正後の状態' as category,
  COUNT(*) as 総レコード数,
  COUNT(*) FILTER (WHERE can_main_gm = true) as メインGM可能,
  COUNT(*) FILTER (WHERE can_sub_gm = true) as サブGM可能,
  COUNT(*) FILTER (WHERE is_experienced = true) as 体験済みのみ,
  COUNT(*) FILTER (WHERE can_main_gm = false AND can_sub_gm = false AND is_experienced = false) as 全てfalse
FROM staff_scenario_assignments;

-- GM可能なスタッフがいるシナリオ
SELECT 
  sc.title as シナリオ名,
  COUNT(*) FILTER (WHERE ssa.can_main_gm = true OR ssa.can_sub_gm = true) as GM可能人数,
  STRING_AGG(
    CASE 
      WHEN ssa.can_main_gm = true OR ssa.can_sub_gm = true THEN s.name 
    END,
    ', '
  ) as GM可能スタッフ
FROM scenarios sc
LEFT JOIN staff_scenario_assignments ssa ON sc.id = ssa.scenario_id
LEFT JOIN staff s ON ssa.staff_id = s.id
GROUP BY sc.title
HAVING COUNT(*) FILTER (WHERE ssa.can_main_gm = true OR ssa.can_sub_gm = true) > 0
ORDER BY sc.title
LIMIT 30;

