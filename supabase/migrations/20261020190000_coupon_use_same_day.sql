-- マイページ › クーポンで、予約したあとで既存の予約にクーポンを当てる操作（API の action=use）は、
-- 公演当日（Asia/Tokyo）だけ受け付ける（社長決定、2026-10-20）。
-- この操作だけが使う use_customer_coupon に日付の確認を足す。
-- 予約時にクーポンを付ける経路（create_reservation_with_lock_v2 が coupon_usages へ直接入れる）は
-- この関数を通らないので、今までどおり日付の制限はない。
--
-- 公演日は、予約の公演（schedule_events.date、日本時間の日付そのもの）を正とし、公演の無い予約だけ
-- reservations.requested_datetime を Asia/Tokyo の日付にしたものを使う。
-- （予約作成の関数は requested_datetime を「日付＋開始時刻」をセッションの時間帯で解釈して入れるため、
--   夕方以降の公演ではそのまま日本時間にすると翌日になることがある。画面の候補も schedule_events.date を出している。）
-- 公演当日でなければ ERRCODE 'P0028'・HINT 'not_performance_day' で「公演当日にお使いください」を返す。
-- 既に同じ予約に使っているとき（already_used）は、日付にかかわらず今までどおり成功を返す（二度押し・再送）。
BEGIN;

CREATE OR REPLACE FUNCTION public.use_customer_coupon(p_user uuid,p_coupon uuid,p_reservation uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE cc public.customer_coupons; r public.reservations; uid uuid; amount integer; performance_day date;
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
 -- 20261020190000: 予約後に当てるのは公演当日（日本時間）だけ。
 SELECT COALESCE(se.date,(r.requested_datetime AT TIME ZONE 'Asia/Tokyo')::date) INTO performance_day
 FROM (SELECT 1) one LEFT JOIN public.schedule_events se ON se.id=r.schedule_event_id;
 IF performance_day IS NULL OR performance_day<>(now() AT TIME ZONE 'Asia/Tokyo')::date THEN
  RAISE EXCEPTION '公演当日にお使いください' USING ERRCODE='P0028', HINT='not_performance_day';
 END IF;
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
