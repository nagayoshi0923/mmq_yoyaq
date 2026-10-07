CREATE OR REPLACE FUNCTION public.remove_coupon_from_group_member(p_member_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE m public.private_group_members; g public.private_groups; usage uuid; coupon uuid;
BEGIN
 PERFORM 1 FROM public.private_groups WHERE id=(SELECT group_id FROM public.private_group_members WHERE id=p_member_id) FOR UPDATE;
 SELECT * INTO m FROM public.private_group_members WHERE id=p_member_id FOR UPDATE;
 IF auth.uid() IS NULL OR m.status IS DISTINCT FROM 'joined' OR(m.user_id IS DISTINCT FROM auth.uid()
 AND public.private_group_actor_role(m.group_id) IS DISTINCT FROM 'staff') THEN
 RAISE EXCEPTION '本人のクーポンだけを変更できます' USING ERRCODE='42501'; END IF;
 -- グループ確定トリガーと同じグループ→顧客→クーポン→メンバーのロック順。
 SELECT * INTO g FROM public.private_groups WHERE id=m.group_id FOR UPDATE;
 PERFORM public.lock_coupon_customer_identity((SELECT customer_id FROM public.customer_coupons WHERE id=m.coupon_id));
 PERFORM 1 FROM public.customers WHERE id=(SELECT customer_id FROM public.customer_coupons WHERE id=m.coupon_id) FOR UPDATE;
 PERFORM 1 FROM public.customer_coupons WHERE id=m.coupon_id FOR UPDATE;
 SELECT * INTO g FROM public.private_groups WHERE id=m.group_id FOR UPDATE;
 SELECT * INTO m FROM public.private_group_members WHERE id=p_member_id FOR UPDATE;
 PERFORM public.release_group_coupon_usage(m.id);
 UPDATE public.private_group_members SET coupon_id=NULL,coupon_discount=0,final_amount=coalesce(payment_amount,g.per_person_price,0) WHERE id=m.id;
 RETURN jsonb_build_object('success',true);
END $$;
REVOKE ALL ON FUNCTION public.remove_coupon_from_group_member(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.remove_coupon_from_group_member(uuid) TO authenticated,service_role;
