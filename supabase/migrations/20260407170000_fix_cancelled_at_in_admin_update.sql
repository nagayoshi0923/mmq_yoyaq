-- =============================================================================
-- マイグレーション: cancelled_at の自動設定 + バックフィル
-- =============================================================================
--
-- 問題:
--   cancel_reservation_with_lock RPC では cancelled_at = NOW() が設定されるが、
--   admin_update_reservation_fields 経由（syncStaffReservations 等）で
--   ステータスを 'cancelled' に変更した場合、cancelled_at が記録されない。
--
-- 修正:
--   1. BEFORE UPDATE トリガーで、status が cancelled に変わったら cancelled_at を自動設定
--   2. 既存の cancelled_at IS NULL なキャンセル済み予約を updated_at でバックフィル
-- =============================================================================

-- =============================================================================
-- 1. トリガー関数: status が cancelled に変わったら cancelled_at を自動設定
-- =============================================================================
CREATE OR REPLACE FUNCTION public.set_cancelled_at_on_cancel()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.status = 'cancelled'
    AND (OLD.status IS DISTINCT FROM 'cancelled')
    AND NEW.cancelled_at IS NULL
  THEN
    NEW.cancelled_at = NOW();
  END IF;
  RETURN NEW;
END;
$$;

-- 既存のトリガーがあれば削除してから作成
DROP TRIGGER IF EXISTS trg_set_cancelled_at ON public.reservations;

CREATE TRIGGER trg_set_cancelled_at
  BEFORE UPDATE OF status ON public.reservations
  FOR EACH ROW
  EXECUTE FUNCTION public.set_cancelled_at_on_cancel();

-- =============================================================================
-- 2. 既存データのバックフィル: cancelled_at IS NULL のキャンセル済み予約に updated_at を設定
-- =============================================================================
UPDATE public.reservations
SET cancelled_at = updated_at
WHERE status = 'cancelled'
  AND cancelled_at IS NULL;
