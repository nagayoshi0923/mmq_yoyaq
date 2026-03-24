-- =============================================================================
-- マイグレーション: kit_transfer_completions RLSポリシー修正
-- =============================================================================
-- 
-- 作成日: 2026-02-04
-- 
-- 問題:
--   セキュリティP0修正（20260202120000）で kit_transfer_completions の
--   UPDATE/INSERTポリシーが管理者のみに制限されたが、この機能は
--   現場スタッフ（全スタッフ）が使用するため、403エラーが発生していた。
-- 
-- 修正内容:
--   - UPDATE/INSERTポリシーを「組織のスタッフ全員」に変更
--   - チェック付け/解除は現場作業なので管理者制限は不要
-- 
-- =============================================================================

-- UPDATEポリシーを修正（組織のスタッフなら誰でも更新可能）
DROP POLICY IF EXISTS "kit_transfer_completions_update_policy" ON public.kit_transfer_completions;

CREATE POLICY "kit_transfer_completions_update_policy" ON public.kit_transfer_completions
  FOR UPDATE USING (
    organization_id IN (
      SELECT organization_id FROM staff WHERE user_id = auth.uid()
    )
  )
  WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM staff WHERE user_id = auth.uid()
    )
  );

-- INSERTポリシーも念のため再作成（組織のスタッフなら誰でも挿入可能）
DROP POLICY IF EXISTS "kit_transfer_completions_insert_policy" ON public.kit_transfer_completions;

CREATE POLICY "kit_transfer_completions_insert_policy" ON public.kit_transfer_completions
  FOR INSERT WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM staff WHERE user_id = auth.uid()
    )
  );

-- DELETEポリシーも確認（チェック解除時に使用される可能性）
DROP POLICY IF EXISTS "kit_transfer_completions_delete_policy" ON public.kit_transfer_completions;

CREATE POLICY "kit_transfer_completions_delete_policy" ON public.kit_transfer_completions
  FOR DELETE USING (
    organization_id IN (
      SELECT organization_id FROM staff WHERE user_id = auth.uid()
    )
  );

-- =============================================================================
-- 完了確認
-- =============================================================================

DO $$ 
BEGIN
  RAISE NOTICE '===========================================';
  RAISE NOTICE '✅ kit_transfer_completions RLSポリシー修正完了';
  RAISE NOTICE '  - UPDATE: 組織スタッフ全員が可能に';
  RAISE NOTICE '  - INSERT: 組織スタッフ全員が可能に';
  RAISE NOTICE '  - DELETE: 組織スタッフ全員が可能に';
  RAISE NOTICE '===========================================';
END $$;
