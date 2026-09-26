-- 同作品の過去利用判定を旧仕様と同じ本人全履歴・タイトル補完へ戻す。データ変更なし。
CREATE OR REPLACE FUNCTION public.coupon_discount_for_event(
 p_coupon uuid,p_event uuid,p_amount integer,p_customer uuid,p_reservation uuid DEFAULT NULL)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE cc public.customer_coupons; e public.schedule_events; locked_reservation public.reservations; rules jsonb;
 prior record; scenario_key uuid; slot text; discount integer; used_amount integer:=0;
BEGIN
 -- 顧客行で直列化し、別クーポンを同時利用した場合にも併用/同作品制限を守る。
 PERFORM 1 FROM public.customers WHERE id=p_customer FOR UPDATE;
 SELECT * INTO cc FROM public.customer_coupons WHERE id=p_coupon FOR UPDATE;
 IF NOT FOUND OR cc.customer_id IS DISTINCT FROM p_customer THEN
  RAISE EXCEPTION 'クーポンが見つかりません' USING ERRCODE='P0028';
 END IF;
 IF cc.status<>'active' OR cc.uses_remaining<=0 OR (cc.expires_at IS NOT NULL AND cc.expires_at<now()) THEN
  RAISE EXCEPTION 'このクーポンは利用できません（残り回数・有効期限を確認してください）' USING ERRCODE='P0028';
 END IF;
 IF p_reservation IS NOT NULL THEN
  SELECT * INTO locked_reservation FROM public.reservations WHERE id=p_reservation FOR UPDATE;
  IF locked_reservation.id IS NULL OR locked_reservation.organization_id IS DISTINCT FROM cc.organization_id OR locked_reservation.status NOT IN ('confirmed','checked_in')
   OR NOT public.can_use_coupon_reservation(cc.customer_id,locked_reservation.id) THEN
   RAISE EXCEPTION '利用可能なご本人の予約を指定してください' USING ERRCODE='P0028';
  END IF;
  -- ロック前に取得された値は使わない。並行する人数変更・取消後の値で再判定する。
  p_amount:=locked_reservation.total_price;
  p_event:=locked_reservation.schedule_event_id;
 END IF;
 SELECT * INTO e FROM public.schedule_events WHERE id=p_event AND organization_id=cc.organization_id;
 IF NOT FOUND OR COALESCE(e.is_cancelled,false) THEN
  RAISE EXCEPTION 'この公演には利用できません' USING ERRCODE='P0028';
 END IF;
 IF p_reservation IS NULL THEN
  IF NOT (public.resolve_operating_setting(cc.organization_id,'coupon_usage_enabled','true'::jsonb,NULL,NULL,p_event)->>'value')::boolean THEN
   RAISE EXCEPTION 'この公演ではクーポンを利用できません' USING ERRCODE='P0028';
  END IF;
 ELSE
  IF EXISTS(SELECT 1 FROM public.reservations WHERE id=p_reservation AND coupon_usage_enabled_snapshot=false) THEN
   RAISE EXCEPTION 'この予約ではクーポンを利用できません' USING ERRCODE='P0028';
  END IF;
 END IF;
 rules:=cc.rules_snapshot;
 IF rules IS NULL OR p_amount IS NULL OR p_amount<=0 THEN
  RAISE EXCEPTION '利用条件または予約金額を確認できません' USING ERRCODE='P0028';
 END IF;
 IF (rules->>'usage_valid_from')::timestamptz>now() OR (rules->>'usage_valid_until')::timestamptz<now() THEN
  RAISE EXCEPTION 'クーポンの利用期間外です' USING ERRCODE='P0028';
 END IF;
 IF COALESCE((rules->>'murder_mystery_only')::boolean,false) AND NOT public.is_murder_mystery_coupon_event(e.category,
  e.scenario_master_id IS NOT NULL OR e.organization_scenario_id IS NOT NULL OR e.scenario_id IS NOT NULL) THEN
  RAISE EXCEPTION 'マーダーミステリーの通常公演・貸切のみで利用できます' USING ERRCODE='P0028';
 END IF;
 IF rules->>'target_type'='specific_organization' AND NOT COALESCE(rules->'target_ids' ? e.organization_id::text,false) THEN
  RAISE EXCEPTION '対象組織ではありません' USING ERRCODE='P0028';
 END IF;
 IF rules->>'target_type'='specific_scenarios' AND NOT (
  COALESCE(rules->'target_ids' ? e.organization_scenario_id::text,false) OR
  COALESCE(rules->'target_ids' ? e.scenario_master_id::text,false) OR
  COALESCE(rules->'target_ids' ? e.scenario_id::text,false)) THEN
  RAISE EXCEPTION '対象シナリオではありません' USING ERRCODE='P0028';
 END IF;
 IF jsonb_typeof(rules->'target_store_ids')='array' AND jsonb_array_length(rules->'target_store_ids')>0
  AND NOT COALESCE(rules->'target_store_ids' ? e.store_id::text,false) THEN
  RAISE EXCEPTION '対象店舗ではありません' USING ERRCODE='P0028';
 END IF;
 IF p_amount<COALESCE((rules->>'min_order_amount')::integer,0) THEN
  RAISE EXCEPTION '最低利用金額に達していません' USING ERRCODE='P0028';
 END IF;
 IF jsonb_typeof(rules->'allowed_weekdays')='array' AND jsonb_array_length(rules->'allowed_weekdays')>0 AND NOT
  rules->'allowed_weekdays' @> jsonb_build_array(extract(dow from e.date)::integer) THEN
  RAISE EXCEPTION '利用可能な曜日ではありません' USING ERRCODE='P0028';
 END IF;
 slot:=CASE WHEN e.time_slot IN ('朝','朝公演','午前','morning') THEN '朝'
  WHEN e.time_slot IN ('昼','昼公演','午後','afternoon') THEN '昼'
  WHEN e.time_slot IN ('夜','夜公演','夜間','evening') THEN '夜'
  WHEN e.start_time<'12:00' THEN '朝' WHEN e.start_time<'18:00' THEN '昼' ELSE '夜' END;
 IF jsonb_typeof(rules->'allowed_time_slots')='array' AND jsonb_array_length(rules->'allowed_time_slots')>0
  AND NOT (rules->'allowed_time_slots' ? slot OR rules->'allowed_time_slots' ? (slot||'公演')) THEN
  RAISE EXCEPTION '利用可能な時間帯ではありません' USING ERRCODE='P0028';
 END IF;
 IF p_reservation IS NOT NULL THEN
  SELECT COALESCE(sum(discount_amount),0)::integer INTO used_amount FROM public.coupon_usages WHERE reservation_id=p_reservation;
 END IF;
 scenario_key:=COALESCE(e.scenario_master_id,e.scenario_id,e.organization_scenario_id);
 FOR prior IN SELECT u.*,c.customer_id AS previous_customer,c.rules_snapshot AS previous_rules,
  COALESCE(se.scenario_master_id,se.scenario_id,se.organization_scenario_id) AS previous_scenario, se.scenario AS previous_title
  FROM public.coupon_usages u JOIN public.customer_coupons c ON c.id=u.customer_coupon_id
  JOIN public.reservations r ON r.id=u.reservation_id JOIN public.schedule_events se ON se.id=r.schedule_event_id
  WHERE c.customer_id=p_customer OR u.reservation_id=p_reservation
 LOOP
  IF prior.reservation_id=p_reservation THEN
   IF prior.customer_coupon_id=p_coupon THEN RAISE EXCEPTION 'この予約には使用済みです' USING ERRCODE='P0028'; END IF;
   IF NOT COALESCE((rules->>'combinable')::boolean,true) OR NOT COALESCE((prior.previous_rules->>'combinable')::boolean,true) THEN
    RAISE EXCEPTION '他のクーポンと併用できません' USING ERRCODE='P0028';
   END IF;
  ELSIF prior.previous_customer=p_customer AND ((scenario_key IS NOT NULL AND scenario_key=prior.previous_scenario) OR
   ((scenario_key IS NULL OR prior.previous_scenario IS NULL) AND NULLIF(btrim(e.scenario),'') IS NOT NULL AND btrim(e.scenario)=btrim(prior.previous_title))) AND COALESCE((rules->>'same_scenario_once')::boolean,true) THEN
   RAISE EXCEPTION 'この作品には既にクーポンをご利用済みです' USING ERRCODE='P0028';
  END IF;
 END LOOP;
 discount:=CASE rules->>'discount_type' WHEN 'fixed' THEN (rules->>'discount_amount')::integer
  WHEN 'percentage' THEN round(p_amount::numeric*(rules->>'discount_amount')::numeric/100)::integer END;
 discount:=LEAST(discount,GREATEST(p_amount-used_amount,0));
 IF discount IS NULL OR discount<=0 THEN RAISE EXCEPTION '割引できる金額がありません' USING ERRCODE='P0028'; END IF;
 RETURN discount;
END;
$$;
REVOKE ALL ON FUNCTION public.coupon_discount_for_event(uuid,uuid,integer,uuid,uuid) FROM PUBLIC,anon,authenticated;

NOTIFY pgrst, 'reload schema';
