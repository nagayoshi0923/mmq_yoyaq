-- =============================================================================
-- shift_submissions INSERT ポリシーの修正
-- =============================================================================
-- 
-- 問題: 既存のINSERTポリシーに演算子優先度のバグがあり、
--       スタッフロールでシフト提出ができない
-- 
-- 原因: AND が OR より優先されるため、条件が正しく評価されていない
--       また、shift_submissions.staff_id の参照がINSERT時に機能しない
-- 
-- 修正: 括弧を追加し、staff_id のみを参照するように変更
-- =============================================================================

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'shift_submissions'
  ) THEN
    -- 既存のポリシーを削除
    DROP POLICY IF EXISTS "shift_submissions_insert_self_or_admin" ON public.shift_submissions;

    -- 修正版ポリシーを作成
    -- スタッフは自分のシフトのみ挿入可能（organization_id も自分のものと一致する必要あり）
    CREATE POLICY "shift_submissions_insert_self_or_admin" ON public.shift_submissions
      FOR INSERT
      WITH CHECK (
        is_admin()
        OR (
          -- スタッフは自分自身のシフトのみ挿入可能
          staff_id IN (SELECT id FROM public.staff WHERE user_id = auth.uid())
          -- organization_id は staff の organization_id と一致する必要がある
          AND organization_id = (SELECT s.organization_id FROM public.staff s WHERE s.id = staff_id)
        )
      );
  END IF;
END $$;

-- =============================================================================
-- 完了
-- =============================================================================
