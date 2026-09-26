-- QW-20260917-001 A01: failed attempts must commit; do not raise after incrementing.
CREATE OR REPLACE FUNCTION public.authenticate_guest_by_pin_v2(p_group_id uuid, p_email text, p_pin text)
RETURNS TABLE(member_id uuid, guest_name text, guest_email text, locked boolean)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO public, extensions
AS $function$
DECLARE
  v_member record;
  v_attempts integer;
  v_now timestamptz;
BEGIN
  IF p_group_id IS NULL OR p_email IS NULL OR length(p_email) > 320 OR p_pin IS NULL OR p_pin !~ '^[0-9]{4}$' THEN RETURN; END IF;
  SELECT pgm.id, pii.guest_name, pii.guest_email, pii.access_pin_hash,
         pii.failed_attempts, pii.locked_until
  INTO v_member
  FROM public.private_group_members pgm
  JOIN public.private_group_members_pii pii ON pii.member_id = pgm.id
  WHERE pgm.group_id = p_group_id AND pgm.user_id IS NULL
    AND lower(pii.guest_email) = lower(trim(p_email)) AND pgm.status = 'joined'
  ORDER BY pgm.id
  LIMIT 1 FOR UPDATE OF pii;
  IF NOT FOUND THEN RETURN; END IF;
  v_now := clock_timestamp();
  IF v_member.locked_until > v_now THEN
    RETURN QUERY SELECT NULL::uuid, NULL::text, NULL::text, true;
    RETURN;
  END IF;
  v_attempts := CASE WHEN v_member.locked_until IS NOT NULL THEN 0 ELSE v_member.failed_attempts END;
  IF v_member.access_pin_hash IS NOT NULL
     AND extensions.crypt(p_pin, v_member.access_pin_hash) = v_member.access_pin_hash THEN
    UPDATE public.private_group_members_pii pii SET failed_attempts = 0, locked_until = NULL,
      updated_at = v_now WHERE pii.member_id = v_member.id;
    RETURN QUERY SELECT v_member.id, v_member.guest_name, v_member.guest_email, false;
    RETURN;
  END IF;
  v_attempts := coalesce(v_attempts, 0) + 1;
  UPDATE public.private_group_members_pii pii SET failed_attempts = v_attempts,
    locked_until = CASE WHEN v_attempts >= 10 THEN v_now + interval '15 minutes' ELSE NULL END,
    updated_at = v_now WHERE pii.member_id = v_member.id;
  IF v_attempts >= 10 THEN RETURN QUERY SELECT NULL::uuid, NULL::text, NULL::text, true; END IF;
END;
$function$;
REVOKE ALL ON FUNCTION public.authenticate_guest_by_pin_v2(uuid,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.authenticate_guest_by_pin_v2(uuid,text,text) TO anon, authenticated, service_role;

-- Old tabs use the same locked counter and cannot bypass it through the old RPC.
CREATE OR REPLACE FUNCTION public.authenticate_guest_by_pin(p_group_id uuid, p_email text, p_pin text)
RETURNS TABLE(member_id uuid, guest_name text, guest_email text)
LANGUAGE sql SECURITY DEFINER SET search_path TO public
AS $function$
 SELECT result.member_id, result.guest_name, result.guest_email
 FROM public.authenticate_guest_by_pin_v2(p_group_id, p_email, p_pin) result
 WHERE NOT result.locked AND result.member_id IS NOT NULL;
$function$;
REVOKE ALL ON FUNCTION public.authenticate_guest_by_pin(uuid,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.authenticate_guest_by_pin(uuid,text,text) TO anon, authenticated, service_role;

-- This legacy entrypoint is only used by initial guest registration.
-- It must not overwrite an existing PIN or clear a lock with a public member UUID.
CREATE OR REPLACE FUNCTION public.save_guest_access_pin(p_member_id uuid, p_pin text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO public, extensions
AS $function$
DECLARE v_member record; v_pii record;
BEGIN
 IF p_pin IS NULL OR p_pin !~ '^[0-9]{4}$' THEN RAISE EXCEPTION 'PIN must contain four digits' USING ERRCODE='22023'; END IF;
 SELECT id,user_id,status INTO v_member FROM public.private_group_members WHERE id=p_member_id FOR UPDATE;
 IF NOT FOUND OR v_member.user_id IS NOT NULL OR v_member.status<>'joined' THEN
   RAISE EXCEPTION 'Guest member not found' USING ERRCODE='42501';
 END IF;
 SELECT access_pin_hash,access_pin INTO v_pii FROM public.private_group_members_pii WHERE member_id=p_member_id FOR UPDATE;
 IF FOUND AND (v_pii.access_pin_hash IS NOT NULL OR v_pii.access_pin IS NOT NULL) THEN
   RAISE EXCEPTION 'PIN is already configured. Authenticate before changing it.' USING ERRCODE='42501';
 END IF;
 INSERT INTO public.private_group_members_pii(member_id,access_pin_hash,access_pin,failed_attempts,locked_until,updated_at)
 VALUES(p_member_id,extensions.crypt(p_pin,extensions.gen_salt('bf')),NULL,0,NULL,clock_timestamp())
 ON CONFLICT(member_id) DO UPDATE SET access_pin_hash=EXCLUDED.access_pin_hash,access_pin=NULL,
   failed_attempts=0,locked_until=NULL,updated_at=EXCLUDED.updated_at;
 RETURN true;
END;
$function$;
REVOKE ALL ON FUNCTION public.save_guest_access_pin(uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.save_guest_access_pin(uuid,text) TO anon, authenticated, service_role;
