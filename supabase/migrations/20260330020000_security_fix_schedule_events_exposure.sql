-- =============================================================================
-- セキュリティ修正: schedule_events の非公開レコード・内部カラム漏洩を修正
-- =============================================================================
-- 問題1（行レベル）: is_cancelled = false のみでフィルタしていたため、
--   - is_reservation_enabled = false の非公開公演
--   - category = 'gm_test' の内部テスト公演
--   - is_private_booking = true の貸切公演
--   - is_tentative = true の仮公演
--   が anon ユーザーに見えていた
--
-- 問題2（カラムレベル）: select=* で以下の内部カラムが取得可能だった
--   gms, gm_roles, notes, reservation_info,
--   venue_rental_fee, total_revenue, gm_cost, license_cost,
--   reservation_name, cancellation_reason 等
-- =============================================================================

-- =============================================================================
-- 1. RLS ポリシーを更新（行レベル制限を強化）
-- =============================================================================
DROP POLICY IF EXISTS "schedule_events_select_public_safe" ON public.schedule_events;

CREATE POLICY "schedule_events_select_public_safe" ON public.schedule_events
  FOR SELECT
  USING (
    -- anon / 一般顧客: 公開条件を全て満たすレコードのみ
    (
      is_cancelled = false
      AND is_reservation_enabled = true
      AND category IN ('open', 'offsite')
      AND (is_private_booking IS NULL OR is_private_booking = false)
      AND (is_tentative IS NULL OR is_tentative = false)
    )
    -- staff / admin: 自組織の全イベントを閲覧可能
    OR (
      auth.uid() IS NOT NULL
      AND organization_id = get_user_organization_id()
    )
  );

-- =============================================================================
-- 2. 内部カラムの anon SELECT 権限を剥奪（カラムレベルセキュリティ）
-- =============================================================================
-- GM・運営情報（スタッフのみ閲覧すべき）
REVOKE SELECT (gms)                          ON public.schedule_events FROM anon;
REVOKE SELECT (gm_roles)                     ON public.schedule_events FROM anon;
REVOKE SELECT (notes)                        ON public.schedule_events FROM anon;
REVOKE SELECT (reservation_info)             ON public.schedule_events FROM anon;
REVOKE SELECT (reservation_notes)            ON public.schedule_events FROM anon;

-- 財務情報（絶対非公開）
REVOKE SELECT (venue_rental_fee)             ON public.schedule_events FROM anon;
REVOKE SELECT (total_revenue)                ON public.schedule_events FROM anon;
REVOKE SELECT (gm_cost)                      ON public.schedule_events FROM anon;
REVOKE SELECT (license_cost)                 ON public.schedule_events FROM anon;
REVOKE SELECT (participant_count)            ON public.schedule_events FROM anon;

-- 予約者個人情報
REVOKE SELECT (reservation_name)             ON public.schedule_events FROM anon;
REVOKE SELECT (reservation_id)               ON public.schedule_events FROM anon;
REVOKE SELECT (is_reservation_name_overwritten) ON public.schedule_events FROM anon;

-- キャンセル理由（内部情報）
REVOKE SELECT (cancellation_reason)          ON public.schedule_events FROM anon;
REVOKE SELECT (cancelled_at)                 ON public.schedule_events FROM anon;

-- 内部フラグ
REVOKE SELECT (is_private_request)           ON public.schedule_events FROM anon;

DO $$
BEGIN
  RAISE NOTICE '🔒 schedule_events: RLS ポリシーを強化し、公開条件を is_reservation_enabled + category でフィルタ';
  RAISE NOTICE '🔒 schedule_events: 内部カラム（gms, gm_roles, 財務情報等）の anon SELECT を禁止';
END $$;
