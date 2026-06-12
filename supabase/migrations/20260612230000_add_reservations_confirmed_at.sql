-- =============================================================================
-- 20260612230000: reservations.confirmed_at（承認日時）を追加
-- =============================================================================
-- 問題:
--   承認日時の専用カラムが無く「status='confirmed' の間だけ updated_at で代用」
--   していたため、確定後キャンセルになると承認日時が永久に失われ、
--   台帳（誰がいつ承認したか）として不完全だった。
--
-- 変更:
--   1. confirmed_at カラムを追加
--   2. 現在 confirmed の行は updated_at で近似バックフィル
--   3. status が confirmed に遷移したとき自動で now() を記録する BEFORE トリガー
--      （承認経路が RPC / 管理画面のどちらでも漏れなく記録される）
-- =============================================================================

ALTER TABLE reservations ADD COLUMN IF NOT EXISTS confirmed_at timestamptz;

-- 現在承認中のものは更新日時で近似（キャンセル済みの過去分は復元不能のため NULL のまま）
UPDATE reservations
SET confirmed_at = updated_at
WHERE status = 'confirmed' AND confirmed_at IS NULL;

CREATE OR REPLACE FUNCTION set_reservation_confirmed_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.status = 'confirmed' AND (OLD.status IS DISTINCT FROM 'confirmed') THEN
    NEW.confirmed_at := now();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_reservation_confirmed_at ON reservations;
CREATE TRIGGER trg_set_reservation_confirmed_at
  BEFORE UPDATE OF status ON reservations
  FOR EACH ROW EXECUTE FUNCTION set_reservation_confirmed_at();
