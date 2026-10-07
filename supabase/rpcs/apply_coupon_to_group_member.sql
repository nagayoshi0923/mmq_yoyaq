CREATE OR REPLACE FUNCTION public.apply_coupon_to_group_member(p_member_id uuid,p_coupon_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE m public.private_group_members;
BEGIN
 PERFORM 1 FROM public.private_groups WHERE id=(SELECT group_id FROM public.private_group_members WHERE id=p_member_id) FOR UPDATE;
 SELECT * INTO m FROM public.private_group_members WHERE id=p_member_id FOR UPDATE;
 IF auth.uid() IS NULL OR m.status IS DISTINCT FROM 'joined' OR(m.user_id IS DISTINCT FROM auth.uid()
 AND public.private_group_actor_role(m.group_id) IS DISTINCT FROM 'staff') THEN
 RAISE EXCEPTION '本人のクーポンだけを変更できます' USING ERRCODE='42501'; END IF;
 IF m.coupon_id IS NOT NULL AND m.coupon_id IS DISTINCT FROM p_coupon_id THEN
  PERFORM public.remove_coupon_from_group_member(p_member_id);
 END IF;
 RETURN public.validate_group_coupon(p_member_id,p_coupon_id);
END $$;
REVOKE ALL ON FUNCTION public.apply_coupon_to_group_member (uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.apply_coupon_to_group_member(uuid,uuid) TO authenticated,service_role;
