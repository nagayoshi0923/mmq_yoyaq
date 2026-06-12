-- =============================================================================
-- 20260612234000: reservations.cancelled_by（キャンセル/却下の操作者）を追加
-- =============================================================================
-- 目的:
--   却下・確定後キャンセルについて「誰が・いつ」を台帳に残す
--   （confirmed_at / confirmed_by の承認記録と対になる）。
--   cancelled_at は既存。操作者の記録が無かったため追加。
--
-- 方式:
--   status が cancelled に遷移した時、BEFORE トリガーで auth.uid() から
--   同組織のスタッフを引いて自動記録する。
--   - 却下フロー（cancel_reservation_with_lock RPC）・削除フロー
--     （admin_update_reservation_fields RPC）はどちらもユーザーJWTで実行される
--     ため auth.uid() が取れる＝一点で全経路をカバー
--   - 顧客自身のキャンセルは staff にいないため NULL のまま（=顧客操作と区別可能）
--   - service role 経由（auth.uid() なし）も NULL のまま
-- =============================================================================

ALTER TABLE reservations
  ADD COLUMN IF NOT EXISTS cancelled_by uuid REFERENCES staff(id);

CREATE OR REPLACE FUNCTION set_reservation_cancelled_by()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_staff_id uuid;
BEGIN
  IF NEW.status = 'cancelled'
     AND (OLD.status IS DISTINCT FROM 'cancelled')
     AND NEW.cancelled_by IS NULL THEN
    SELECT id INTO v_staff_id
    FROM staff
    WHERE user_id = auth.uid()
      AND organization_id = NEW.organization_id
    LIMIT 1;
    IF v_staff_id IS NOT NULL THEN
      NEW.cancelled_by := v_staff_id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_reservation_cancelled_by ON reservations;
CREATE TRIGGER trg_set_reservation_cancelled_by
  BEFORE UPDATE OF status ON reservations
  FOR EACH ROW EXECUTE FUNCTION set_reservation_cancelled_by();
