-- validate_reservation_status_transition を完全に再作成
-- CREATE OR REPLACE では反映されないケースがあるため、DROP → CREATE で確実に更新する

-- 1. トリガーを一旦削除（関数に依存しているため）
DROP TRIGGER IF EXISTS trigger_check_status_transition ON reservations;

-- 2. 関数を完全削除
DROP FUNCTION IF EXISTS public.validate_reservation_status_transition(TEXT, TEXT);
DROP FUNCTION IF EXISTS public.check_reservation_status_transition();

-- 3. バリデーション関数を新規作成
CREATE FUNCTION public.validate_reservation_status_transition(
  p_old_status TEXT,
  p_new_status TEXT
) RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_old_status = p_new_status THEN
    RETURN TRUE;
  END IF;

  -- cancelled → confirmed のみ許可（貸切予約の却下後再承認）
  IF p_old_status = 'cancelled' THEN
    IF p_new_status = 'confirmed' THEN
      RETURN TRUE;
    END IF;
    RETURN FALSE;
  END IF;

  IF p_old_status = 'completed' THEN
    IF p_new_status IN ('cancelled', 'no_show') THEN
      RETURN TRUE;
    ELSE
      RETURN FALSE;
    END IF;
  END IF;

  IF p_old_status = 'no_show' THEN
    RETURN FALSE;
  END IF;

  IF p_old_status = 'pending' THEN
    IF p_new_status IN ('confirmed', 'cancelled', 'pending_gm', 'gm_confirmed') THEN
      RETURN TRUE;
    END IF;
  END IF;

  IF p_old_status = 'pending_gm' THEN
    IF p_new_status IN ('gm_confirmed', 'cancelled') THEN
      RETURN TRUE;
    END IF;
  END IF;

  IF p_old_status = 'pending_store' THEN
    IF p_new_status IN ('confirmed', 'cancelled') THEN
      RETURN TRUE;
    END IF;
  END IF;

  IF p_old_status = 'gm_confirmed' THEN
    IF p_new_status IN ('confirmed', 'cancelled', 'pending_store') THEN
      RETURN TRUE;
    END IF;
  END IF;

  IF p_old_status = 'confirmed' THEN
    IF p_new_status IN ('completed', 'cancelled', 'no_show') THEN
      RETURN TRUE;
    END IF;
  END IF;

  RETURN FALSE;
END;
$$;

-- 4. トリガー関数を新規作成
CREATE FUNCTION public.check_reservation_status_transition()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    IF NOT public.validate_reservation_status_transition(OLD.status, NEW.status) THEN
      RAISE EXCEPTION 'INVALID_STATUS_TRANSITION: % → % is not allowed', OLD.status, NEW.status
        USING ERRCODE = 'P0200';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- 5. トリガーを再作成
CREATE TRIGGER trigger_check_status_transition
  BEFORE UPDATE OF status ON reservations
  FOR EACH ROW
  EXECUTE FUNCTION public.check_reservation_status_transition();

-- 6. 権限
GRANT EXECUTE ON FUNCTION public.validate_reservation_status_transition(TEXT, TEXT) TO authenticated;

-- 確認用RAISE
DO $$
BEGIN
  IF public.validate_reservation_status_transition('cancelled', 'confirmed') THEN
    RAISE NOTICE 'OK: cancelled → confirmed is now allowed';
  ELSE
    RAISE EXCEPTION 'FAIL: cancelled → confirmed is still blocked!';
  END IF;
END;
$$;
