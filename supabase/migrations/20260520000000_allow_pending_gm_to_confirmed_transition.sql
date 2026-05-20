-- pending_gm → confirmed を許可する
-- approve_private_booking RPC が管理者による直接承認で confirmed にセットするが、
-- validate_reservation_status_transition が pending_gm → confirmed を弾いていたため 500 エラーになっていた

DROP TRIGGER IF EXISTS trigger_check_status_transition ON reservations;
DROP FUNCTION IF EXISTS public.validate_reservation_status_transition(TEXT, TEXT);
DROP FUNCTION IF EXISTS public.check_reservation_status_transition();

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
    -- confirmed を追加: 管理者が直接承認する場合（approve_private_booking RPC）
    IF p_new_status IN ('confirmed', 'gm_confirmed', 'cancelled') THEN
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

CREATE TRIGGER trigger_check_status_transition
  BEFORE UPDATE OF status ON reservations
  FOR EACH ROW
  EXECUTE FUNCTION public.check_reservation_status_transition();

GRANT EXECUTE ON FUNCTION public.validate_reservation_status_transition(TEXT, TEXT) TO authenticated;

DO $$
BEGIN
  IF public.validate_reservation_status_transition('pending_gm', 'confirmed') THEN
    RAISE NOTICE 'OK: pending_gm → confirmed is now allowed';
  ELSE
    RAISE EXCEPTION 'FAIL: pending_gm → confirmed is still blocked!';
  END IF;
END;
$$;
