CREATE OR REPLACE FUNCTION public.cancel_reservation_with_lock(p_reservation_id uuid, p_cancellation_reason text DEFAULT NULL::text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
 SET row_security TO 'off'
AS $function$
BEGIN
  RETURN public.cancel_reservation_with_lock(p_reservation_id, NULL::uuid, p_cancellation_reason);
END;
$function$
