-- QW-20261011-001: 手動追加の INSERT RLS が公演→予約へ循環する経路を廃止。
-- 対象組織の業務権限を必須とし、管理者の手入力の料金・人数の扱いを維持する。
CREATE FUNCTION public.add_manual_reservations(p_rows jsonb)
RETURNS SETOF public.reservations
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_input jsonb;
  v_row public.reservations;
  v_saved public.reservations;
  v_event public.schedule_events;
  v_customer public.customers;
  v_master_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'ログインし直してください' USING ERRCODE = '28000';
  END IF;
  IF jsonb_typeof(p_rows) IS DISTINCT FROM 'array'
     OR jsonb_array_length(p_rows) NOT BETWEEN 1 AND 100 THEN
    RAISE EXCEPTION '参加者の追加内容が正しくありません' USING ERRCODE = '22023';
  END IF;
  -- 同一公演への追加を直列化。複数公演のバッチでも UUID 順でロックする。
  PERFORM se.id FROM public.schedule_events se
  WHERE se.id IN (SELECT (item->>'schedule_event_id')::uuid FROM jsonb_array_elements(p_rows) item)
  ORDER BY se.id FOR NO KEY UPDATE;

  FOR v_input IN SELECT value FROM jsonb_array_elements(p_rows) LOOP
    v_row := jsonb_populate_record(NULL::public.reservations, v_input);
    SELECT * INTO v_event FROM public.schedule_events WHERE id = v_row.schedule_event_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION '対象の公演が見つかりません' USING ERRCODE = 'P0002';
    END IF;
    IF NOT COALESCE(public.reservation_actor_is_org_operator(v_event.organization_id), false) THEN
      RAISE EXCEPTION 'この店舗の公演に参加者を追加する権限がありません' USING ERRCODE = '42501';
    END IF;
    IF v_event.is_cancelled IS TRUE THEN
      RAISE EXCEPTION '中止済みの公演には参加者を追加できません' USING ERRCODE = '22023';
    END IF;
    IF v_row.participant_count IS NULL OR v_row.participant_count < 1
       OR COALESCE(v_row.duration, 0) < 1
       OR COALESCE(v_row.reservation_source, '') NOT IN ('walk_in', 'staff_participation', 'demo', 'demo_auto')
       OR COALESCE(v_row.status, 'confirmed') <> 'confirmed'
       OR COALESCE(v_row.base_price, 0) < 0
       OR COALESCE(v_row.total_price, 0) < 0
       OR COALESCE(v_row.final_price, 0) < 0 THEN
      RAISE EXCEPTION '参加者の追加内容が正しくありません' USING ERRCODE = '22023';
    END IF;
    v_customer := NULL;
    IF v_row.customer_id IS NOT NULL THEN
      SELECT * INTO v_customer FROM public.customers WHERE id = v_row.customer_id;
      IF NOT FOUND OR (v_customer.organization_id IS NOT NULL
        AND v_customer.organization_id IS DISTINCT FROM v_event.organization_id) THEN
        RAISE EXCEPTION '対象の顧客をこの店舗で登録できません' USING ERRCODE = '42501';
      END IF;
      IF v_customer.organization_id IS NULL
         AND v_customer.user_id IS DISTINCT FROM auth.uid()
         AND NOT public.customer_has_org_connection(v_customer.id, v_event.organization_id)
         AND NOT EXISTS (SELECT 1 FROM public.staff s WHERE s.user_id = v_customer.user_id
           AND s.organization_id = v_event.organization_id AND s.status = 'active') THEN
        RAISE EXCEPTION '対象の顧客をこの店舗で登録できません' USING ERRCODE = '42501';
      END IF;
    END IF;
    v_master_id := v_event.scenario_master_id;
    IF v_master_id IS NULL AND v_event.organization_scenario_id IS NOT NULL THEN
      SELECT scenario_master_id INTO v_master_id FROM public.organization_scenarios
      WHERE id = v_event.organization_scenario_id AND organization_id = v_event.organization_id;
    END IF;
    INSERT INTO public.reservations (
      schedule_event_id, organization_id, title, scenario_master_id, store_id,
      customer_id, customer_name, customer_email, customer_phone, customer_notes,
      reservation_number, requested_datetime, duration, participant_count, participant_names,
      assigned_staff, base_price, options_price, total_price, discount_amount, final_price,
      unit_price, payment_method, payment_status, status, reservation_source, created_by
    ) VALUES (
      v_event.id, v_event.organization_id, v_event.scenario, v_master_id, v_event.store_id,
      v_row.customer_id,
      CASE WHEN v_row.customer_id IS NOT NULL THEN v_customer.name ELSE v_row.customer_name END,
      CASE WHEN v_row.customer_id IS NOT NULL THEN v_customer.email ELSE v_row.customer_email END,
      CASE WHEN v_row.customer_id IS NOT NULL THEN v_customer.phone ELSE v_row.customer_phone END,
      v_row.customer_notes, COALESCE(NULLIF(v_row.reservation_number, ''), public.generate_reservation_number()),
      (v_event.date + v_event.start_time) AT TIME ZONE 'Asia/Tokyo', v_row.duration,
      v_row.participant_count, COALESCE(v_row.participant_names, '{}'::text[]),
      COALESCE(v_event.gms, '{}'::text[]), COALESCE(v_row.base_price, 0), COALESCE(v_row.options_price, 0),
      COALESCE(v_row.total_price, 0), COALESCE(v_row.discount_amount, 0), COALESCE(v_row.final_price, 0),
      v_row.unit_price, v_row.payment_method, COALESCE(v_row.payment_status, 'pending'),
      'confirmed', v_row.reservation_source, auth.uid()
    ) RETURNING * INTO v_saved;
    RETURN NEXT v_saved;
  END LOOP;
END;
$function$;
REVOKE ALL ON FUNCTION public.add_manual_reservations(jsonb) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.add_manual_reservations(jsonb) TO authenticated;
COMMENT ON FUNCTION public.add_manual_reservations(jsonb) IS '同じ組織の業務担当者による参加者手動追加。公演の組織・日時・作品をサーバーで確定。';
