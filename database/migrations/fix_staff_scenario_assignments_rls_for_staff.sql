-- =============================================================================
-- staff_scenario_assignments: staffロールが自分の担当作品を編集できるように修正
-- =============================================================================
-- 問題:
--   INSERT / UPDATE / DELETE ポリシーが is_admin() のみで、
--   staff ロールのユーザーが担当作品ページから保存できない。
--
-- 修正:
--   admin は自組織の全スタッフを編集可能（既存通り）
--   staff は自分自身のレコードのみ INSERT / UPDATE / DELETE 可能
-- =============================================================================

BEGIN;

-- =============================================================================
-- 1. INSERT ポリシー: staff は自分のレコードのみ作成可能
-- =============================================================================
DROP POLICY IF EXISTS "staff_scenario_assignments_insert_admin" ON public.staff_scenario_assignments;

CREATE POLICY "staff_scenario_assignments_insert_admin_or_self" 
  ON public.staff_scenario_assignments
  FOR INSERT WITH CHECK (
    -- admin/license_admin: 自組織のスタッフに対して
    (is_admin() AND staff_id IN (
      SELECT id FROM staff WHERE organization_id = get_user_organization_id()
    ))
    OR
    -- staff: 自分自身のレコードのみ（user_id で紐づくスタッフID）
    (is_staff_or_admin() AND staff_id IN (
      SELECT id FROM staff WHERE user_id = auth.uid()
    ))
  );

-- =============================================================================
-- 2. UPDATE ポリシー: staff は自分のレコードのみ更新可能
-- =============================================================================
DROP POLICY IF EXISTS "staff_scenario_assignments_update_admin" ON public.staff_scenario_assignments;

CREATE POLICY "staff_scenario_assignments_update_admin_or_self"
  ON public.staff_scenario_assignments
  FOR UPDATE USING (
    (is_admin() AND staff_id IN (
      SELECT id FROM staff WHERE organization_id = get_user_organization_id()
    ))
    OR
    (is_staff_or_admin() AND staff_id IN (
      SELECT id FROM staff WHERE user_id = auth.uid()
    ))
  );

-- =============================================================================
-- 3. DELETE ポリシー: staff は自分のレコードのみ削除可能
-- =============================================================================
DROP POLICY IF EXISTS "staff_scenario_assignments_delete_admin" ON public.staff_scenario_assignments;

CREATE POLICY "staff_scenario_assignments_delete_admin_or_self"
  ON public.staff_scenario_assignments
  FOR DELETE USING (
    (is_admin() AND staff_id IN (
      SELECT id FROM staff WHERE organization_id = get_user_organization_id()
    ))
    OR
    (is_staff_or_admin() AND staff_id IN (
      SELECT id FROM staff WHERE user_id = auth.uid()
    ))
  );

-- =============================================================================
-- 4. SELECT ポリシー: 変更なし（is_staff_or_admin() で既にOK）
--    念のため存在確認
-- =============================================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' 
      AND tablename = 'staff_scenario_assignments'
      AND cmd = 'SELECT'
  ) THEN
    CREATE POLICY "staff_scenario_assignments_select_staff_or_admin"
      ON public.staff_scenario_assignments
      FOR SELECT
      USING (
        is_staff_or_admin() AND organization_id = get_user_organization_id()
      );
    RAISE NOTICE '✅ SELECT ポリシーを作成しました';
  ELSE
    RAISE NOTICE '✅ SELECT ポリシーは既に存在します';
  END IF;
END $$;

-- =============================================================================
-- 5. 検証
-- =============================================================================
DO $$
DECLARE
  v_count INT;
BEGIN
  SELECT COUNT(*) INTO v_count
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename = 'staff_scenario_assignments';
  
  RAISE NOTICE '✅ staff_scenario_assignments のポリシー数: %', v_count;

  -- INSERT/UPDATE/DELETE が staff_or_admin を含むか確認
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'staff_scenario_assignments'
      AND cmd = 'INSERT'
      AND qual::text ILIKE '%auth.uid()%'
  ) OR EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'staff_scenario_assignments'
      AND cmd = 'INSERT'
      AND with_check::text ILIKE '%auth.uid()%'
  ) THEN
    RAISE NOTICE '✅ INSERT ポリシーに self チェックあり';
  ELSE
    RAISE WARNING '❌ INSERT ポリシーに self チェックがありません';
  END IF;
END $$;

COMMIT;
