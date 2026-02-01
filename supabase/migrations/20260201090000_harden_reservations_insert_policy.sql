-- =============================================================================
-- 20260201090000: reservations INSERT ポリシーを強化（SEC-P0）
-- =============================================================================
--
-- 問題:
-- - reservations の INSERT ポリシーが `customer_id IS NULL` を無条件に許可しており、
--   authenticated ユーザーなら誰でも customer_id=NULL の予約を直接INSERTできた。
--   これにより、料金・人数・ステータス等をフロント/DB-RPCの検証を経ずに改ざん可能。
--
-- 修正:
-- - customer_id=NULL のINSERTは admin または自組織staffのみに制限
-- - customer_id がある場合は「本人の customer」でのみ許可（既存方針維持）
--
-- =============================================================================

BEGIN;

DO $$
BEGIN
  -- 既存ポリシーを差し替え
  DROP POLICY IF EXISTS "reservations_insert_self_or_own_org" ON public.reservations;

  CREATE POLICY "reservations_insert_self_or_own_org" ON public.reservations
    FOR INSERT
    WITH CHECK (
      -- (A) 顧客予約: 本人の customer_id のみ
      customer_id IN (
        SELECT id FROM public.customers WHERE user_id = auth.uid()
      )
      OR
      -- (B) customer_id=NULL の予約は、admin または自組織の staff のみ
      (
        customer_id IS NULL
        AND (
          is_admin()
          OR EXISTS (
            SELECT 1
            FROM public.staff s
            WHERE s.user_id = auth.uid()
              AND s.organization_id = organization_id
              AND s.status = 'active'
          )
        )
      )
    );
END $$;

COMMIT;

