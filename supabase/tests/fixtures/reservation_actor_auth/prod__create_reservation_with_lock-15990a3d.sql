CREATE OR REPLACE FUNCTION public.create_reservation_with_lock(p_schedule_event_id uuid, p_participant_count integer, p_customer_id uuid, p_customer_name text, p_customer_email text, p_customer_phone text, p_notes text DEFAULT NULL::text, p_how_found text DEFAULT NULL::text, p_reservation_number text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN create_reservation_with_lock_v2(
    p_schedule_event_id,
    p_participant_count,
    p_customer_id,
    p_customer_name,
    p_customer_email,
    p_customer_phone,
    p_notes,
    p_how_found,
    p_reservation_number,
    NULL
  );
END;
$function$
