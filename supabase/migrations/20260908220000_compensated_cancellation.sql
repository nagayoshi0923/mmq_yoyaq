-- Commit cancellation, compensation and the customer notice as one transaction.
CREATE TABLE public.compensated_cancellations (
  event_id uuid PRIMARY KEY REFERENCES public.schedule_events(id),
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  created_by uuid NOT NULL REFERENCES auth.users(id),
  snapshot jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.compensated_cancellation_notices (
  reservation_id uuid PRIMARY KEY REFERENCES public.reservations(id),
  event_id uuid NOT NULL REFERENCES public.compensated_cancellations(event_id),
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  payload jsonb NOT NULL,
  compensation_text text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','sending','sent','failed')),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.compensated_cancellations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.compensated_cancellation_notices ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.compensated_cancellations,public.compensated_cancellation_notices FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.compensated_cancellations TO service_role;
GRANT SELECT,UPDATE ON public.compensated_cancellation_notices TO service_role;

CREATE FUNCTION public.compensated_cancellation(
  p_event_id uuid,p_apply boolean DEFAULT false,p_expected jsonb DEFAULT NULL,
  p_reason text DEFAULT NULL,p_bodies jsonb DEFAULT '{}'::jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE e public.schedule_events; c public.coupon_campaigns; v_org uuid; v_actor uuid:=auth.uid();
  v_start timestamptz; v_days integer; v_amount integer; v_count integer; v_rows jsonb;
  v_snapshot jsonb; item jsonb; v_result jsonb; v_token text; v_text text; v_exp timestamptz;
  v_store text; v_ids jsonb; v_quantity integer; v_campaigns uuid[];
BEGIN
  SELECT organization_id INTO v_org FROM public.users WHERE id=v_actor AND role IN ('admin','staff','license_admin');
  IF v_org IS NULL OR NOT (public.is_org_admin() OR EXISTS(SELECT 1 FROM public.staff WHERE user_id=v_actor AND organization_id=v_org AND status='active')) THEN
    RAISE EXCEPTION 'スタッフ権限を確認できません'; END IF;
  SELECT * INTO e FROM public.schedule_events WHERE id=p_event_id AND organization_id=v_org FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION '公演を確認できません'; END IF;
  IF EXISTS(SELECT 1 FROM public.compensated_cancellations WHERE event_id=e.id AND organization_id=v_org) THEN
    SELECT jsonb_agg(reservation_id ORDER BY reservation_id) INTO v_ids FROM public.compensated_cancellation_notices WHERE event_id=e.id;
    RETURN jsonb_build_object('already_completed',true,'reservation_ids',v_ids);
  END IF;
  IF e.is_cancelled OR e.category NOT IN ('open','private') OR
    (e.scenario_id IS NULL AND e.scenario_master_id IS NULL AND e.organization_scenario_id IS NULL) THEN
    RAISE EXCEPTION '開催予定のマーダーミステリー公演を選択してください'; END IF;
  v_start:=coalesce(e.start_at,(e.date+e.start_time) AT TIME ZONE 'Asia/Tokyo');
  v_days:=(v_start AT TIME ZONE 'Asia/Tokyo')::date-(now() AT TIME ZONE 'Asia/Tokyo')::date;
  v_amount:=CASE WHEN v_days=0 AND v_start>=now() THEN CASE WHEN v_start-now()<=interval '2 hours' THEN 5000 ELSE 2000 END WHEN v_days=1 THEN 1000 END;
  IF v_amount IS NULL THEN RAISE EXCEPTION 'この時期の補償額は未確定です。個別に確認してください'; END IF;
  SELECT array_agg(id) INTO v_campaigns FROM public.coupon_campaigns
    WHERE organization_id=v_org AND is_active AND name LIKE '店舗都合中止のお詫び｜%'
      AND discount_type='fixed' AND discount_amount=v_amount AND coupon_expiry_months=6
      AND murder_mystery_only AND trigger_type='manual' AND max_uses_per_customer=1;
  IF cardinality(v_campaigns) IS DISTINCT FROM 1 THEN RAISE EXCEPTION '補償用クーポンを1種類に特定できません'; END IF;
  SELECT * INTO c FROM public.coupon_campaigns WHERE id=v_campaigns[1] FOR SHARE;
  PERFORM 1 FROM public.reservations WHERE schedule_event_id=e.id AND organization_id=v_org ORDER BY id FOR UPDATE;
  SELECT jsonb_agg(jsonb_build_object('id',r.id,'customer_id',r.customer_id,
    'name',coalesce(cu.name,r.customer_name),'email',coalesce(nullif(r.customer_email,''),cu.email),
    'quantity',r.participant_count,'status',r.status,'updated_at',r.updated_at,
    'reservation_number',r.reservation_number,'total_price',r.total_price,'user_id',cu.user_id) ORDER BY r.id)
  INTO v_rows FROM public.reservations r LEFT JOIN public.customers cu ON cu.id=r.customer_id
  WHERE r.schedule_event_id=e.id AND r.organization_id=v_org AND r.status<>'cancelled';
  IF v_rows IS NULL THEN RAISE EXCEPTION '参加予定の予約がありません'; END IF;
  FOR item IN SELECT value FROM jsonb_array_elements(v_rows) LOOP
    IF item->>'status' NOT IN ('confirmed','gm_confirmed','checked_in') OR
      coalesce((item->>'quantity')::integer,0) NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION '未確定の予約または人数を確認してください'; END IF;
    IF nullif(item->>'email','') IS NULL THEN RAISE EXCEPTION 'メールアドレス未登録の予約があります'; END IF;
    IF e.category='open' AND item->>'user_id' IS NULL THEN RAISE EXCEPTION '予約者のMMQアカウントを確認してください'; END IF;
    IF nullif(p_bodies->>(item->>'id'),'') IS NULL AND p_apply THEN RAISE EXCEPTION '全対象者のメール本文を確認してください'; END IF;
  END LOOP;
  v_snapshot:=jsonb_build_object('event_id',e.id,'category',e.category,'start',v_start,'event_updated_at',e.updated_at,
    'amount',v_amount,'campaign_id',c.id,'coupon_name',coalesce(c.display_name,c.name),'recipients',v_rows);
  IF NOT p_apply THEN RETURN jsonb_build_object('already_completed',false,'snapshot',v_snapshot); END IF;
  IF p_expected IS DISTINCT FROM v_snapshot THEN RAISE EXCEPTION '予約や補償額が変わりました。中止画面を開き直してください'; END IF;
  IF nullif(trim(p_reason),'') IS NULL THEN RAISE EXCEPTION '中止理由を入力してください'; END IF;
  SELECT name INTO v_store FROM public.stores WHERE id=e.store_id;
  INSERT INTO public.compensated_cancellations(event_id,organization_id,created_by,snapshot) VALUES(e.id,v_org,v_actor,v_snapshot);
  UPDATE public.schedule_events SET is_cancelled=true,cancelled_at=now(),cancellation_reason=p_reason,updated_at=now() WHERE id=e.id;
  FOR item IN SELECT value FROM jsonb_array_elements(v_rows) LOOP
    PERFORM public.cancel_reservation_with_lock((item->>'id')::uuid,(item->>'customer_id')::uuid,p_reason);
    IF e.category='private' THEN
      UPDATE public.private_groups SET status='cancelled',updated_at=now()
        WHERE id=(SELECT private_group_id FROM public.reservations WHERE id=(item->>'id')::uuid);
      v_token:=replace(gen_random_uuid()::text,'-','')||replace(gen_random_uuid()::text,'-','');
      INSERT INTO public.private_coupon_claim_links(organization_id,reservation_id,event_id,campaign_id,token,discount_amount,max_claims,created_by)
        VALUES(v_org,(item->>'id')::uuid,e.id,c.id,v_token,v_amount,(item->>'quantity')::integer,v_actor)
        RETURNING expires_at INTO v_exp;
      v_text:=format(E'■ お詫びクーポン\n%s\n参加予定のお客様1人につき1枚、各自のMMQアカウントでお受け取りください。\n受け取りURL：https://mmq.game/coupon-claim#%s\n受け取り期限：%s（発行から3か月）\nクーポンの有効期限：受け取った日から6か月。実際の期限は受け取り画面で確認できます。',coalesce(c.display_name,c.name),v_token,to_char(v_exp AT TIME ZONE 'Asia/Tokyo','YYYY/MM/DD HH24:MI'));
    ELSE
      v_result:=public.grant_representative_compensation(v_org,(item->>'id')::uuid,v_actor,false,NULL);
      v_result:=public.grant_representative_compensation(v_org,(item->>'id')::uuid,v_actor,true,v_result->'snapshot');
      v_text:=format(E'■ お詫びクーポン\n%s × %s枚を予約者様のアカウントへ付与しました。\n有効期限：%s（付与から6か月）\nマイページ：https://mmq.game/mypage',coalesce(c.display_name,c.name),item->>'quantity',to_char((v_result->>'expires_at')::timestamptz AT TIME ZONE 'Asia/Tokyo','YYYY/MM/DD HH24:MI'));
    END IF;
    v_text:=v_text||E'\n対象：マーダーミステリーの通常公演・貸切。作品制限はありません。ボードゲーム・箱開け会には利用できません。';
    INSERT INTO public.compensated_cancellation_notices(reservation_id,event_id,organization_id,compensation_text,payload)
    VALUES((item->>'id')::uuid,e.id,v_org,v_text,jsonb_build_object(
      'organizationId',v_org,'storeId',e.store_id,'reservationId',item->>'id','customerEmail',item->>'email',
      'customerName',item->>'name','scenarioTitle',e.scenario,'eventDate',e.date,'startTime',e.start_time,'endTime',e.end_time,
      'storeName',v_store,'participantCount',(item->>'quantity')::integer,'totalPrice',item->'total_price',
      'reservationNumber',item->>'reservation_number','cancelledBy','store','cancellationReason',p_reason,
      'customEmailBody',p_bodies->>(item->>'id')));
  END LOOP;
  SELECT jsonb_agg(reservation_id ORDER BY reservation_id) INTO v_ids FROM public.compensated_cancellation_notices WHERE event_id=e.id;
  RETURN jsonb_build_object('already_completed',false,'reservation_ids',v_ids);
END;
$$;
REVOKE ALL ON FUNCTION public.compensated_cancellation(uuid,boolean,jsonb,text,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.compensated_cancellation(uuid,boolean,jsonb,text,jsonb) TO authenticated;
