-- メンバー本人または同組織の有効スタッフだけが割引を設定する。
-- private_group_members への直接アクセス権限は追加しない。
CREATE OR REPLACE FUNCTION public.apply_coupon_to_group_member(p_member_id uuid,p_coupon_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE m public.private_group_members%ROWTYPE; g public.private_groups%ROWTYPE;
 c public.customer_coupons%ROWTYPE; campaign public.coupon_campaigns%ROWTYPE;
 group_id uuid; amount integer; discount integer; rules jsonb;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'ログインしてください' USING ERRCODE='42501'; END IF;
 SELECT pm.group_id INTO group_id FROM public.private_group_members pm WHERE pm.id=p_member_id;
 SELECT * INTO g FROM public.private_groups pg WHERE pg.id=group_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION '参加情報が見つかりません' USING ERRCODE='42501'; END IF;
 SELECT * INTO m FROM public.private_group_members pm WHERE pm.id=p_member_id AND pm.group_id=g.id FOR UPDATE;
 IF NOT FOUND OR m.status IS DISTINCT FROM 'joined' OR
   (m.user_id IS DISTINCT FROM auth.uid() AND public.private_group_actor_role(g.id) IS DISTINCT FROM 'staff') THEN
  RAISE EXCEPTION '本人のクーポンだけを変更できます' USING ERRCODE='42501';
 END IF;
 SELECT cc.* INTO c FROM public.customer_coupons cc JOIN public.customers owner ON owner.id=cc.customer_id
 WHERE cc.id=p_coupon_id AND owner.user_id=m.user_id AND cc.organization_id=g.organization_id FOR SHARE OF cc;
 IF NOT FOUND THEN RAISE EXCEPTION 'このクーポンは利用できません' USING ERRCODE='22023'; END IF;
 SELECT * INTO campaign FROM public.coupon_campaigns cp WHERE cp.id=c.campaign_id AND cp.organization_id=g.organization_id;
 IF NOT FOUND OR NOT campaign.is_active OR c.status<>'active' OR c.uses_remaining<1 OR c.expires_at<now() THEN
  RAISE EXCEPTION 'このクーポンは利用できません（残り回数・有効期限を確認してください）' USING ERRCODE='22023';
 END IF;
 rules:=coalesce(c.rules_snapshot,'{}'::jsonb);
 amount:=greatest(0,coalesce(m.payment_amount,g.per_person_price,0));
 discount:=CASE coalesce(rules->>'discount_type',campaign.discount_type)
  WHEN 'percentage' THEN floor(amount*coalesce((rules->>'discount_amount')::numeric,campaign.discount_amount)/100)::integer
  ELSE coalesce((rules->>'discount_amount')::integer,campaign.discount_amount) END;
 discount:=least(amount,greatest(0,discount));
 UPDATE public.private_group_members pm SET coupon_id=c.id,coupon_discount=discount,
  payment_amount=amount,final_amount=amount-discount WHERE pm.id=m.id;
 RETURN jsonb_build_object('success',true,'discount',discount,'final_amount',amount-discount);
END $$;

CREATE OR REPLACE FUNCTION public.remove_coupon_from_group_member(p_member_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE m public.private_group_members%ROWTYPE; g public.private_groups%ROWTYPE; group_id uuid;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'ログインしてください' USING ERRCODE='42501'; END IF;
 SELECT pm.group_id INTO group_id FROM public.private_group_members pm WHERE pm.id=p_member_id;
 SELECT * INTO g FROM public.private_groups pg WHERE pg.id=group_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION '参加情報が見つかりません' USING ERRCODE='42501'; END IF;
 SELECT * INTO m FROM public.private_group_members pm WHERE pm.id=p_member_id AND pm.group_id=g.id FOR UPDATE;
 IF NOT FOUND OR m.status IS DISTINCT FROM 'joined' OR
   (m.user_id IS DISTINCT FROM auth.uid() AND public.private_group_actor_role(g.id) IS DISTINCT FROM 'staff') THEN
  RAISE EXCEPTION '本人のクーポンだけを変更できます' USING ERRCODE='42501';
 END IF;
 UPDATE public.private_group_members pm SET coupon_id=NULL,coupon_discount=0,
  final_amount=coalesce(m.payment_amount,g.per_person_price,0) WHERE pm.id=m.id;
 RETURN jsonb_build_object('success',true);
END $$;

REVOKE ALL ON FUNCTION public.apply_coupon_to_group_member(uuid,uuid) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.remove_coupon_from_group_member(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.apply_coupon_to_group_member(uuid,uuid) TO authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.remove_coupon_from_group_member(uuid) TO authenticated,service_role;
