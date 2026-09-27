CREATE OR REPLACE FUNCTION public.get_private_booking_delivery_history(p_reservation_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp SET row_security=off AS $$
DECLARE r public.reservations%ROWTYPE; result jsonb;
BEGIN
 SELECT * INTO r FROM public.reservations WHERE id=p_reservation_id;
 IF auth.uid() IS NULL OR NOT FOUND OR public.get_user_organization_id() IS DISTINCT FROM r.organization_id
  OR NOT coalesce(public.is_org_admin() OR EXISTS(SELECT 1 FROM public.staff WHERE user_id=auth.uid()
   AND organization_id=r.organization_id AND status='active'),false) THEN
  RAISE EXCEPTION 'UNAUTHORIZED' USING ERRCODE='42501';
 END IF;
 SELECT coalesce(jsonb_agg(to_jsonb(d) ORDER BY d.created_at DESC,d.id),'[]'::jsonb) INTO result FROM (
  SELECT 'approval' AS delivery_kind,id,kind AS channel,status,snapshot->>'gmName' AS recipient_name,created_at,updated_at,last_error,
   status='failed' AND first_attempt_at IS NULL AND provider_message_id IS NULL AS can_retry,
   status IN ('uncertain','superseded','failed') AND first_attempt_at IS NOT NULL AS can_reconcile,
   status='uncertain' AND first_attempt_at IS NULL AND preparation_attempted_at IS NOT NULL AND provider_payload IS NULL AS can_resume_preparation
  FROM public.private_booking_approval_deliveries WHERE reservation_id=r.id AND organization_id=r.organization_id
  UNION ALL
  SELECT 'survey',id,'survey_email',status,'お客様',created_at,updated_at,last_error,
   status='failed' AND first_attempt_at IS NULL AND provider_message_id IS NULL,status IN ('uncertain','superseded','failed') AND first_attempt_at IS NOT NULL,false
  FROM public.private_group_survey_deliveries WHERE reservation_id=r.id AND organization_id=r.organization_id
  UNION ALL
  SELECT 'rejection',id,'rejection_email',status,'お客様',created_at,updated_at,last_error,
   status='failed' AND first_attempt_at IS NULL AND provider_message_id IS NULL,status IN ('uncertain','superseded','failed') AND first_attempt_at IS NOT NULL,false
  FROM public.private_booking_rejection_deliveries WHERE reservation_id=r.id AND organization_id=r.organization_id
 ) d;
 RETURN jsonb_build_object('organization_id',r.organization_id,'deliveries',result);
END $$;
REVOKE ALL ON FUNCTION public.get_private_booking_delivery_history(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_private_booking_delivery_history(uuid) TO authenticated,service_role;

CREATE OR REPLACE FUNCTION public.retry_private_unsent_delivery(p_kind text,p_delivery_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp SET row_security=off AS $$
DECLARE table_name text; d jsonb; r public.reservations%ROWTYPE; s public.staff%ROWTYPE;
 recipient text; recipient_name text; new_snapshot jsonb; old_log_id uuid; new_log_id uuid:=gen_random_uuid();
BEGIN
 table_name:=CASE p_kind WHEN 'approval' THEN 'private_booking_approval_deliveries' WHEN 'survey' THEN 'private_group_survey_deliveries'
  WHEN 'rejection' THEN 'private_booking_rejection_deliveries' END;
 IF table_name IS NULL OR auth.uid() IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED' USING ERRCODE='42501'; END IF;
 EXECUTE format('SELECT to_jsonb(d) FROM public.%I d WHERE id=$1',table_name) INTO d USING p_delivery_id;
 IF d IS NULL THEN RAISE EXCEPTION 'DELIVERY_NOT_FOUND' USING ERRCODE='22023'; END IF;
 SELECT * INTO r FROM public.reservations WHERE id=(d->>'reservation_id')::uuid AND organization_id=(d->>'organization_id')::uuid FOR UPDATE NOWAIT;
 IF NOT FOUND OR public.get_user_organization_id() IS DISTINCT FROM r.organization_id
  OR NOT coalesce(public.is_org_admin() OR EXISTS(SELECT 1 FROM public.staff WHERE user_id=auth.uid()
   AND organization_id=r.organization_id AND status='active'),false) THEN RAISE EXCEPTION 'UNAUTHORIZED' USING ERRCODE='42501'; END IF;
 EXECUTE format('SELECT to_jsonb(d) FROM public.%I d WHERE id=$1 FOR UPDATE NOWAIT',table_name) INTO d USING p_delivery_id;
 IF d->>'status'<>'failed' OR d->>'first_attempt_at' IS NOT NULL OR d->>'provider_message_id' IS NOT NULL THEN
  RAISE EXCEPTION 'DELIVERY_NOT_PROVEN_UNSENT' USING ERRCODE='55000';
 END IF;
 IF p_kind='approval' AND NOT public.is_private_approval_delivery_current(p_delivery_id) THEN
  RAISE EXCEPTION 'APPROVAL_CHANGED' USING ERRCODE='55000';
 ELSIF p_kind='survey' AND (r.status IS NULL OR r.status NOT IN ('confirmed','gm_confirmed','checked_in','completed')
  OR r.schedule_event_id IS DISTINCT FROM (d->>'schedule_event_id')::uuid
  OR NOT EXISTS(SELECT 1 FROM public.private_groups g WHERE g.id=(d->>'group_id')::uuid AND g.reservation_id=r.id AND g.organization_id=r.organization_id AND g.status='confirmed')) THEN
  RAISE EXCEPTION 'SURVEY_RESERVATION_CHANGED' USING ERRCODE='55000';
 ELSIF p_kind='rejection' AND (r.status IS DISTINCT FROM 'cancelled' OR r.cancelled_at IS DISTINCT FROM (d->>'cancelled_at')::timestamptz
  OR r.cancellation_reason IS DISTINCT FROM '貸切リクエストを却下しました'
  OR (r.private_group_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.private_groups g WHERE g.id=r.private_group_id AND g.organization_id=r.organization_id AND g.reservation_id=r.id AND g.status='date_adjusting'))) THEN
  RAISE EXCEPTION 'REJECTION_CHANGED' USING ERRCODE='55000';
 END IF;
 recipient:=nullif(btrim(r.customer_email),'');recipient_name:=coalesce(nullif(r.customer_name,''),'お客様');
 IF recipient IS NULL AND r.customer_id IS NOT NULL THEN
  SELECT nullif(btrim(c.email),''),coalesce(nullif(c.name,''),recipient_name) INTO recipient,recipient_name
   FROM public.customers c WHERE c.id=r.customer_id AND (c.organization_id=r.organization_id OR c.organization_id IS NULL);
 END IF;
 IF p_kind='approval' THEN
  new_snapshot:=d->'snapshot';
  IF d->>'kind'='confirmation_email' THEN
   new_snapshot:=new_snapshot||jsonb_build_object('customerEmail',recipient,'customerName',coalesce(recipient_name,'お客様'));
  ELSE
   SELECT * INTO STRICT s FROM public.staff WHERE id=(d->>'recipient_key')::uuid AND organization_id=r.organization_id AND status='active';
   new_snapshot:=new_snapshot||jsonb_build_object('gmEmail',nullif(btrim(s.email),''),'gmDiscordChannelId',nullif(btrim(s.discord_channel_id),''),'gmDiscordUserId',nullif(btrim(s.discord_user_id),''));
  END IF;
  UPDATE public.private_booking_approval_deliveries SET snapshot=new_snapshot WHERE id=p_delivery_id;
 ELSE
  EXECUTE format('UPDATE public.%I SET customer_email=$2,customer_name=$3 WHERE id=$1',table_name) USING p_delivery_id,recipient,coalesce(recipient_name,'お客様');
 END IF;
 old_log_id:=coalesce((d->>'email_log_id')::uuid,p_delivery_id);
 UPDATE public.email_logs SET status='failed',error_message='送信開始前の失敗。設定を更新して再試行を登録済み'
  WHERE id=old_log_id AND organization_id=r.organization_id AND status='queued' AND provider_message_id IS NULL;
 EXECUTE format('UPDATE public.%I SET status=''pending'',attempt_count=0,next_attempt_at=now(),provider_payload=NULL,provider_account_hash=NULL,
  email_log_id=$2,last_error=NULL,lease_token=NULL,lease_until=NULL,updated_at=now() WHERE id=$1',table_name) USING p_delivery_id,new_log_id;
 IF p_kind='approval' THEN UPDATE public.private_booking_approval_deliveries SET provider_target=NULL WHERE id=p_delivery_id; END IF;
 INSERT INTO public.private_delivery_resolutions(organization_id,delivery_kind,delivery_id,actor_id,action,previous_status)
 VALUES(r.organization_id,p_kind,p_delivery_id,auth.uid(),'retry_unsent','failed');
 RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.retry_private_unsent_delivery(text,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.retry_private_unsent_delivery(text,uuid) TO authenticated,service_role;
