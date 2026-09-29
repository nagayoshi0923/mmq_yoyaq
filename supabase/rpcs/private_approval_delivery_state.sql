-- 配送直前にも確認する。取消・再承認・担当/日時変更後の旧内容を配送しない。
CREATE OR REPLACE FUNCTION public.is_private_approval_delivery_current(p_delivery_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp SET row_security=off AS $$
 SELECT EXISTS(
  SELECT 1 FROM public.private_booking_approval_deliveries d
  JOIN public.reservations r ON r.id=d.reservation_id AND r.organization_id=d.organization_id
  JOIN public.schedule_events e ON e.id=d.schedule_event_id AND e.organization_id=d.organization_id
  WHERE d.id=p_delivery_id AND r.schedule_event_id=e.id
   AND r.status IN ('confirmed','gm_confirmed','checked_in','completed') AND e.is_cancelled=false
   AND e.date::text=d.snapshot->>'eventDate' AND e.start_time::text=d.snapshot->>'startTime'
   AND e.end_time::text=d.snapshot->>'endTime' AND e.store_id::text=d.snapshot->>'storeId'
   AND to_jsonb(e.gms) IS NOT DISTINCT FROM d.snapshot->'eventGms'
   AND (r.private_group_id IS NULL OR EXISTS(SELECT 1 FROM public.private_groups g
    WHERE g.id=r.private_group_id AND g.organization_id=d.organization_id AND g.reservation_id=r.id AND g.status='confirmed'))
   AND (d.kind='confirmation_email' OR EXISTS(SELECT 1 FROM public.staff s WHERE s.id::text=d.recipient_key
    AND s.organization_id=d.organization_id AND s.status='active' AND s.name=ANY(e.gms)))
 )
$$;
REVOKE ALL ON FUNCTION public.is_private_approval_delivery_current(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.is_private_approval_delivery_current(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.get_private_booking_approval_deliveries(p_reservation_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp SET row_security=off AS $$
DECLARE r public.reservations%ROWTYPE; deliveries jsonb;
BEGIN
 SELECT * INTO r FROM public.reservations WHERE id=p_reservation_id;
 IF auth.uid() IS NULL OR NOT FOUND OR public.get_user_organization_id() IS DISTINCT FROM r.organization_id
  OR NOT coalesce(public.is_org_admin() OR EXISTS(SELECT 1 FROM public.staff s
   WHERE s.user_id=auth.uid() AND s.organization_id=r.organization_id AND s.status='active'),false) THEN
  RAISE EXCEPTION 'UNAUTHORIZED' USING ERRCODE='42501';
 END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',d.id,'kind',d.kind,'status',d.status,
  'recipient_name',CASE WHEN d.kind='confirmation_email' THEN 'お客様' ELSE d.snapshot->>'gmName' END,
  'last_error',d.last_error,'created_at',d.created_at,'updated_at',d.updated_at)
  ORDER BY d.created_at,d.kind,d.id),'[]'::jsonb) INTO deliveries
 FROM public.private_booking_approval_deliveries d WHERE d.reservation_id=r.id AND d.organization_id=r.organization_id
  AND d.schedule_event_id=r.schedule_event_id;
 RETURN jsonb_build_object('reservation_id',r.id,'deliveries',deliveries);
END $$;
REVOKE ALL ON FUNCTION public.get_private_booking_approval_deliveries(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_private_booking_approval_deliveries(uuid) TO authenticated,service_role;

-- 一覧画面で予約ごとのHTTP要求を増やさない。各予約の認可は上の単件RPCに統一する。
CREATE OR REPLACE FUNCTION public.get_private_booking_approval_delivery_status(p_reservation_ids uuid[])
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp SET row_security=off AS $$
DECLARE result jsonb;
BEGIN
 IF p_reservation_ids IS NULL OR cardinality(p_reservation_ids)>100 THEN
  RAISE EXCEPTION 'INVALID_RESERVATION_IDS' USING ERRCODE='22023';
 END IF;
 SELECT coalesce(jsonb_agg(public.get_private_booking_approval_deliveries(id)),'[]'::jsonb) INTO result
 FROM (SELECT DISTINCT unnest(p_reservation_ids) AS id) ids;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.get_private_booking_approval_delivery_status(uuid[]) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_private_booking_approval_delivery_status(uuid[]) TO authenticated,service_role;
