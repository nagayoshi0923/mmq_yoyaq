-- =============================================================================
-- S9: miscellaneous_transactions の RLS 組織境界の穴を封鎖 + GRANT 最小化
-- =============================================================================
-- 背景（本番実測 2026-07-04・pg_policies / pg_get_functiondef で確認）:
--
--  1. miscellaneous_transactions_select_staff_or_admin (FOR SELECT)
--       qual = is_staff_or_admin()
--       → is_staff_or_admin() はロールのみ判定し organization_id を見ない。
--         他組織の staff/admin が全組織の雑収支を SELECT できる穴。
--
--  2. miscellaneous_transactions_strict (FOR ALL)
--       qual = (organization_id = get_user_organization_id()) OR is_org_admin()
--       → is_org_admin() もロールのみ判定。他組織 admin に全行の ALL
--         (SELECT/INSERT/UPDATE/DELETE) が開いている穴の本体。
--
--  健全なポリシー（org 境界あり・そのまま残す）:
--    - miscellaneous_transactions_insert_admin  (WITH CHECK: is_admin() AND org 一致)
--    - miscellaneous_transactions_update_admin  (USING: is_admin() AND org 一致)
--    - miscellaneous_transactions_delete_admin  (USING: is_admin() AND org 一致)
--
--  GRANT（本番実測）: authenticated に
--    INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER が付与されている。
--
-- 封鎖内容:
--  1. select_staff_or_admin を org 境界付きで再作成
--  2. _strict（穴の本体）を削除。org スコープの正当なアクセスは
--     上記 SELECT ＋ 既存の insert/update/delete_admin ポリシーで全コマンドをカバー済み。
--  3. TRUNCATE, REFERENCES, TRIGGER の GRANT を authenticated / anon から剥奪。
--     SELECT/INSERT/UPDATE/DELETE は RLS が門番なので残す。
--
-- 効果の注記:
--  修正後の書き込み（INSERT/UPDATE/DELETE）は admin（自組織）のみ・
--  staff は自組織の SELECT のみになる。従来は _strict の
--  (organization_id = get_user_organization_id()) 経由で自組織 staff も
--  書き込めていた可能性があるが、雑収支 UI は管理者向けページのため意図どおり。
--
-- 冪等: 各ステップは IF EXISTS / 例外握りで再実行安全。
-- =============================================================================

-- =============================================================================
-- 1. SELECT ポリシーを org 境界付きで再作成
-- =============================================================================
DO $$
BEGIN
  DROP POLICY IF EXISTS "miscellaneous_transactions_select_staff_or_admin" ON public.miscellaneous_transactions;
  CREATE POLICY "miscellaneous_transactions_select_staff_or_admin" ON public.miscellaneous_transactions
    FOR SELECT USING (
      is_staff_or_admin() AND organization_id = get_user_organization_id()
    );
  RAISE NOTICE '✅ miscellaneous_transactions_select_staff_or_admin: org 境界を追加';
EXCEPTION WHEN undefined_table THEN
  RAISE NOTICE '⏭️ miscellaneous_transactions テーブルなし、スキップ';
END $$;

-- =============================================================================
-- 2. _strict（穴の本体）を削除
-- =============================================================================
DO $$
BEGIN
  DROP POLICY IF EXISTS "miscellaneous_transactions_strict" ON public.miscellaneous_transactions;
  RAISE NOTICE '✅ miscellaneous_transactions_strict: 削除（is_org_admin() の org 境界なし ALL 穴を封鎖）';
EXCEPTION WHEN undefined_table THEN
  RAISE NOTICE '⏭️ miscellaneous_transactions テーブルなし、スキップ';
END $$;

-- =============================================================================
-- 3. GRANT 最小化: TRUNCATE, REFERENCES, TRIGGER を剥奪
-- =============================================================================
DO $$
BEGIN
  REVOKE TRUNCATE, REFERENCES, TRIGGER ON public.miscellaneous_transactions FROM authenticated, anon;
  RAISE NOTICE '✅ miscellaneous_transactions: TRUNCATE/REFERENCES/TRIGGER を authenticated/anon から剥奪';
EXCEPTION WHEN undefined_table THEN
  RAISE NOTICE '⏭️ miscellaneous_transactions テーブルなし、スキップ';
END $$;

-- =============================================================================
-- 検証: org 境界なしポリシーが残っていないこと
-- =============================================================================
DO $$
DECLARE
  v_count INTEGER;
  v_details TEXT;
BEGIN
  SELECT COUNT(*), string_agg(policyname, ', ')
    INTO v_count, v_details
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename = 'miscellaneous_transactions'
    AND (qual IS NOT NULL OR with_check IS NOT NULL)
    AND COALESCE(qual, '') NOT ILIKE '%organization_id%'
    AND COALESCE(with_check, '') NOT ILIKE '%organization_id%';

  IF v_count > 0 THEN
    RAISE WARNING '⚠️ miscellaneous_transactions に org 境界なしポリシーが % 件残存: %', v_count, v_details;
  ELSE
    RAISE NOTICE '✅ miscellaneous_transactions: 全ポリシーに org 境界チェックあり';
  END IF;
END $$;
