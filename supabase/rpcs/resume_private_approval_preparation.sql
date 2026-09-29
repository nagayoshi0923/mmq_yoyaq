-- Discord準備の結果不明から復帰する。作成済み記録がある場合だけメール準備を再開する。
-- チャンネルを作り直すことも、送信開始済みの通知を再送することもない。
CREATE OR REPLACE FUNCTION public.resume_private_approval_preparation(p_delivery_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp SET row_security=off AS $$
DECLARE d public.private_booking_approval_deliveries%ROWTYPE; r public.reservations%ROWTYPE;
BEGIN
 SELECT * INTO d FROM public.private_booking_approval_deliveries WHERE id=p_delivery_id;
 IF NOT FOUND OR auth.uid() IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED' USING ERRCODE='42501'; END IF;
 SELECT * INTO r FROM public.reservations WHERE id=d.reservation_id AND organization_id=d.organization_id FOR UPDATE NOWAIT;
 IF NOT FOUND OR public.get_user_organization_id() IS DISTINCT FROM r.organization_id
  OR NOT coalesce(public.is_org_admin() OR EXISTS(SELECT 1 FROM public.staff WHERE user_id=auth.uid()
   AND organization_id=r.organization_id AND status='active'),false) THEN RAISE EXCEPTION 'UNAUTHORIZED' USING ERRCODE='42501'; END IF;
 SELECT * INTO STRICT d FROM public.private_booking_approval_deliveries WHERE id=p_delivery_id FOR UPDATE NOWAIT;
 IF d.status<>'uncertain' OR d.kind<>'confirmation_email' OR d.first_attempt_at IS NOT NULL
  OR d.provider_message_id IS NOT NULL OR d.provider_payload IS NOT NULL OR d.preparation_attempted_at IS NULL
  OR NOT public.is_private_approval_delivery_current(d.id) THEN
  RAISE EXCEPTION 'PREPARATION_NOT_RESUMABLE' USING ERRCODE='55000';
 END IF;
 IF NOT EXISTS(SELECT 1 FROM public.private_booking_discord_rooms room
  WHERE room.organization_id=d.organization_id AND room.reservation_id=d.reservation_id AND room.schedule_event_id=d.schedule_event_id
   AND nullif(btrim(room.player_invite_url),'') IS NOT NULL AND nullif(btrim(room.spectator_invite_url),'') IS NOT NULL) THEN
  RAISE EXCEPTION 'PREPARATION_RECORD_NOT_CONFIRMED' USING ERRCODE='55000';
 END IF;
 UPDATE public.private_booking_approval_deliveries SET status='pending',attempt_count=0,next_attempt_at=now(),
  last_error=NULL,lease_token=NULL,lease_until=NULL,updated_at=now() WHERE id=d.id;
 INSERT INTO public.private_delivery_resolutions(organization_id,delivery_kind,delivery_id,actor_id,action,previous_status)
 VALUES(d.organization_id,'approval',d.id,auth.uid(),'preparation_verified','uncertain');
 RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.resume_private_approval_preparation(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.resume_private_approval_preparation(uuid) TO authenticated,service_role;
