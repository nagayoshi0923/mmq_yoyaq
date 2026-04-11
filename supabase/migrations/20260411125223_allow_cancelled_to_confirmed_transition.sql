-- 貸切予約の却下→再承認を可能にするため、cancelled → confirmed の遷移を許可する
-- 元の検証関数は cancelled からの全遷移を禁止していた

CREATE OR REPLACE FUNCTION public.validate_reservation_status_transition(
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
