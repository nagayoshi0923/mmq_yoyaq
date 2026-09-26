CREATE OR REPLACE FUNCTION public.claim_scheduled_reminder(
 p_organization_id uuid,p_reservation_id uuid,p_event_id uuid,p_event_date date,p_days_before integer,p_send_time time
) RETURNS TABLE(delivery_id uuid,lease_token uuid)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
 IF p_days_before NOT BETWEEN 0 AND 365 OR p_days_before IS NULL OR p_send_time IS NULL THEN
  RAISE EXCEPTION 'invalid reminder schedule' USING ERRCODE='22023';
 END IF;
 IF NOT EXISTS(SELECT 1 FROM public.reservations r JOIN public.schedule_events e ON e.id=r.schedule_event_id
   WHERE r.id=p_reservation_id AND r.organization_id=p_organization_id AND e.organization_id=p_organization_id
    AND e.id=p_event_id AND e.date=p_event_date AND COALESCE(e.is_cancelled,false)=false
    AND r.status IN ('confirmed','pending','gm_confirmed')) THEN
  RAISE EXCEPTION 'reservation is not eligible' USING ERRCODE='42501';
 END IF;
 RETURN QUERY INSERT INTO public.scheduled_reminder_deliveries AS d
  (organization_id,reservation_id,schedule_event_id,event_date,days_before,send_time,status)
 VALUES(p_organization_id,p_reservation_id,p_event_id,p_event_date,p_days_before,p_send_time,'sending')
 ON CONFLICT(reservation_id,schedule_event_id,event_date,days_before,send_time) DO UPDATE
  SET status='sending',lease_token=gen_random_uuid(),attempted_at=now()
  WHERE (d.status='failed' OR (d.status='sending' AND d.attempted_at<now()-interval '15 minutes'))
    -- プロバイダの冪等キー有効期間外では自動再送しない。
    AND d.created_at>now()-interval '23 hours'
 RETURNING d.id,d.lease_token;
END;
$$;
REVOKE ALL ON FUNCTION public.claim_scheduled_reminder(uuid,uuid,uuid,date,integer,time) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_scheduled_reminder(uuid,uuid,uuid,date,integer,time) TO service_role;
