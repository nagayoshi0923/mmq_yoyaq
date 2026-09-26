-- 予約前の確認専用。本人・公演・価格をDBで確認し、クーポンは消費しない。
CREATE OR REPLACE FUNCTION public.preview_booking_coupon(p_user uuid, p_coupon uuid, p_event uuid, p_participants integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
 cc public.customer_coupons;
 e public.schedule_events;
 fee integer;
 costs jsonb;
 title text;
 holiday boolean;
 amount integer;
 discount integer;
BEGIN
 IF p_participants IS NULL OR p_participants < 1 OR p_participants > 100 THEN
  RAISE EXCEPTION '参加人数を確認してください' USING ERRCODE='P0028';
 END IF;
 SELECT c.* INTO cc FROM public.customer_coupons c JOIN public.customers cu ON cu.id=c.customer_id
 WHERE c.id=p_coupon AND cu.user_id=p_user;
 IF cc.id IS NULL THEN RAISE EXCEPTION 'ご本人のクーポンを指定してください' USING ERRCODE='P0028'; END IF;
 SELECT * INTO e FROM public.schedule_events WHERE id=p_event AND is_cancelled=false AND organization_id=cc.organization_id;
 IF e.id IS NULL THEN RAISE EXCEPTION '対象の公演が見つかりません' USING ERRCODE='P0028'; END IF;
 IF e.organization_scenario_id IS NOT NULL THEN
  SELECT os.participation_fee, os.participation_costs, COALESCE(os.override_title,sm.title)
  INTO fee,costs,title FROM public.organization_scenarios os JOIN public.scenario_masters sm ON sm.id=os.scenario_master_id
  WHERE os.id=e.organization_scenario_id AND os.organization_id=e.organization_id;
 ELSIF e.scenario_id IS NOT NULL THEN
  SELECT participation_fee,participation_costs,s.title INTO fee,costs,title FROM public.scenarios_v2 s WHERE id=e.scenario_id;
  IF NOT FOUND THEN
   SELECT participation_fee,participation_costs,s.title INTO fee,costs,title FROM public.scenarios s WHERE id=e.scenario_id;
  END IF;
 END IF;
 IF fee IS NULL AND title IS NULL THEN RAISE EXCEPTION '公演の料金を確認できません' USING ERRCODE='P0028'; END IF;
 SELECT COALESCE(bool_or(COALESCE(os.custom_holidays,'[]'::jsonb) ? e.date::text),false)
 INTO holiday FROM public.organization_settings os WHERE os.organization_id=e.organization_id;
 amount := public.calculate_booking_participation_fee(fee,costs,e.date,e.start_time,holiday) * p_participants;
 discount := public.coupon_discount_for_event(cc.id,e.id,amount,cc.customer_id,NULL);
 RETURN jsonb_build_object('success',true,'total_price',amount,'discount_amount',discount,'final_price',amount-discount);
END;
$$;
REVOKE ALL ON FUNCTION public.preview_booking_coupon(uuid,uuid,uuid,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.preview_booking_coupon(uuid,uuid,uuid,integer) TO service_role;
NOTIFY pgrst, 'reload schema';
