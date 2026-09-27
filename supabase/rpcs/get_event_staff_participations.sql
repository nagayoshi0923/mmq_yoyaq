CREATE FUNCTION public.get_event_staff_participations(p_event_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE v_org uuid:=public.get_user_organization_id(); v_links jsonb; v_options jsonb; v_event public.schedule_events;
BEGIN
 IF auth.uid() IS NULL OR v_org IS NULL OR NOT EXISTS(SELECT 1 FROM public.users WHERE id=auth.uid() AND role::text IN ('admin','staff','license_admin'))
 OR NOT EXISTS(SELECT 1 FROM public.schedule_events WHERE id=p_event_id AND organization_id=v_org) THEN
  RAISE EXCEPTION 'この公演のスタッフ参加を確認する権限がありません' USING ERRCODE='42501';
 END IF;
 SELECT * INTO v_event FROM public.schedule_events WHERE id=p_event_id AND organization_id=v_org FOR SHARE;
 SELECT coalesce(jsonb_agg(jsonb_build_object('staff_id',l.staff_id,'mode',l.mode,'reservation_id',l.reservation_id,
  'needs_confirmation',coalesce(r.id IS NULL OR r.schedule_event_id IS DISTINCT FROM l.event_id OR r.organization_id IS DISTINCT FROM l.organization_id
   OR r.status NOT IN ('pending','confirmed','gm_confirmed','checked_in') OR r.participant_count<1
   OR (l.mode='included' AND r.participant_count<(SELECT count(*) FROM public.event_staff_participations x WHERE x.reservation_id=l.reservation_id AND x.mode='included'))
   OR (l.mode='additional' AND (r.reservation_source IS DISTINCT FROM 'staff_entry' OR r.participant_count<>1 OR r.payment_method IS DISTINCT FROM 'staff' OR r.customer_id IS NOT NULL OR coalesce(r.base_price,0)<>0 OR coalesce(r.options_price,0)<>0 OR coalesce(r.discount_amount,0)<>0 OR coalesce(r.total_price,0)<>0 OR coalesce(r.final_price,0)<>0)),true)) ORDER BY l.staff_id),'[]') INTO v_links
 FROM public.event_staff_participations l LEFT JOIN public.reservations r ON r.id=l.reservation_id
 WHERE l.event_id=p_event_id AND l.organization_id=v_org;
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',r.id,'label',coalesce(nullif(r.customer_name,''),array_to_string(r.participant_names,'・'),r.reservation_number),
 'participant_count',r.participant_count,'reservation_number',r.reservation_number) ORDER BY r.created_at,r.id),'[]') INTO v_options
 FROM public.reservations r WHERE r.schedule_event_id=p_event_id AND r.organization_id=v_org AND r.status IN ('pending','confirmed','gm_confirmed','checked_in')
 AND r.participant_count>0 AND NOT EXISTS(SELECT 1 FROM public.event_staff_participations l WHERE l.reservation_id=r.id AND l.mode='additional');
 RETURN jsonb_build_object('entries',v_links,'reservations',v_options,'assignment',jsonb_build_object('gms',coalesce(v_event.gms,ARRAY[]::text[]),'gm_roles',coalesce(v_event.gm_roles,'{}'::jsonb)));
END $$;
REVOKE ALL ON FUNCTION public.get_event_staff_participations(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_event_staff_participations(uuid) TO authenticated,service_role;
