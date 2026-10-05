-- 正本: migration 20261006100000（ゲストの PIN 再発行）
CREATE OR REPLACE FUNCTION public.reset_private_group_guest_pin(p_invite_code text, p_email text)
RETURNS TABLE(member_id uuid, guest_name text, guest_email text, pin text, scenario_title text, invite_code text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v record; v_group record; v_pin text;
BEGIN
 IF p_invite_code IS NULL OR length(p_invite_code)>64 OR p_email IS NULL OR length(p_email)>320
    OR trim(p_email) !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' THEN RETURN; END IF;
 SELECT g.id, g.invite_code, sm.title INTO v_group FROM public.private_groups g
   LEFT JOIN public.scenario_masters sm ON sm.id=g.scenario_master_id WHERE g.invite_code=p_invite_code;
 IF NOT FOUND THEN RETURN; END IF;
 SELECT pgm.id, pii.guest_name, pii.guest_email INTO v FROM public.private_group_members pgm
   JOIN public.private_group_members_pii pii ON pii.member_id=pgm.id
  WHERE pgm.group_id=v_group.id AND pgm.user_id IS NULL AND pgm.status='joined' AND lower(pii.guest_email)=lower(trim(p_email))
  ORDER BY pgm.id LIMIT 1 FOR UPDATE OF pii;
 IF NOT FOUND THEN RETURN; END IF;
 IF (SELECT count(*) FROM public.private_group_guest_pin_resets r WHERE r.member_id=v.id AND r.created_at>clock_timestamp()-interval '1 hour')>=3 THEN RETURN; END IF;
 v_pin := (1000 + (('x'||encode(extensions.gen_random_bytes(4),'hex'))::bit(32)::bigint % 9000))::text;
 UPDATE public.private_group_members_pii pii
    SET access_pin_hash=extensions.crypt(v_pin, extensions.gen_salt('bf')), access_pin=NULL, failed_attempts=0, locked_until=NULL, updated_at=clock_timestamp()
  WHERE pii.member_id=v.id;
 INSERT INTO public.private_group_guest_pin_resets(member_id) VALUES (v.id);
 DELETE FROM public.private_group_guest_pin_resets WHERE created_at<clock_timestamp()-interval '30 days';
 RETURN QUERY SELECT v.id, v.guest_name, v.guest_email, v_pin, v_group.title, v_group.invite_code;
END $$;
REVOKE ALL ON FUNCTION public.reset_private_group_guest_pin(text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reset_private_group_guest_pin(text,text) TO service_role;
