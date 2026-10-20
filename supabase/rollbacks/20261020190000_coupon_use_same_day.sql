-- 20261020190000_coupon_use_same_day の巻き戻し。
-- 予約後にクーポンを当てる関数（use_customer_coupon）を、公演当日の確認を入れる前（20261007110002 の時点）の本文に戻す。
-- 使用履歴・予約の金額は変えない。
BEGIN;

CREATE OR REPLACE FUNCTION public.use_customer_coupon(p_user uuid,p_coupon uuid,p_reservation uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE cc public.customer_coupons; r public.reservations; uid uuid; amount integer;
BEGIN
 SELECT c.* INTO cc FROM public.customer_coupons c JOIN public.customers cu ON cu.id=c.customer_id
 WHERE c.id=p_coupon AND cu.user_id=p_user;
 IF cc.id IS NULL THEN RAISE EXCEPTION 'クーポンが見つかりません' USING ERRCODE='P0028'; END IF;
 SELECT * INTO r FROM public.reservations WHERE id=p_reservation AND organization_id=cc.organization_id;
 IF r.id IS NULL OR NOT public.can_use_coupon_reservation(cc.customer_id,r.id) THEN
  RAISE EXCEPTION 'ご本人の予約を指定してください' USING ERRCODE='P0028';
 END IF;
 PERFORM public.lock_coupon_customer_identity(cc.customer_id);
 PERFORM 1 FROM public.customers WHERE id=cc.customer_id FOR UPDATE;
 SELECT id,discount_amount INTO uid,amount FROM public.coupon_usages WHERE customer_coupon_id=p_coupon AND reservation_id=p_reservation LIMIT 1;
 IF uid IS NOT NULL THEN RETURN jsonb_build_object('success',true,'usage_id',uid,'discount_amount',amount,'already_used',true); END IF;
 INSERT INTO public.coupon_usages(customer_coupon_id,reservation_id,discount_amount)
 VALUES(p_coupon,p_reservation,1) RETURNING id,discount_amount INTO uid,amount;
 -- 最新20261002160000の金額正本を保持。履歴と請求を同じTXで一度だけ更新。
 IF COALESCE(amount,0)>0 THEN
  UPDATE public.reservations SET discount_amount=COALESCE(discount_amount,0)+amount,
   final_price=GREATEST(COALESCE(final_price,total_price,0)-amount,0),updated_at=now() WHERE id=p_reservation;
 END IF;
 INSERT INTO public.coupon_usage_billing_applied(usage_id,applied_amount) VALUES(uid,coalesce(amount,0));
 RETURN jsonb_build_object('success',true,'usage_id',uid,'discount_amount',amount);
END;
$$;
REVOKE ALL ON FUNCTION public.use_customer_coupon(uuid,uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.use_customer_coupon(uuid,uuid,uuid) TO service_role;

COMMIT;
