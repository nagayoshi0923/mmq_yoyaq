CREATE FUNCTION public.enqueue_private_cancellation(p_event public.schedule_events)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE s record; v_epoch uuid; v_body text;
BEGIN
  IF p_event.organization_id IS NULL OR NOT (coalesce(p_event.is_private_booking,false) OR p_event.category='private') THEN RETURN; END IF;
  v_epoch := coalesce(p_event.gm_cancel_epoch,p_event.id);
  v_body := format('貸切公演がキャンセルされました。担当予定の解除をご確認ください。%s%s %s〜%s%s作品：%s%s会場：%s',
    chr(10),p_event.date,to_char(p_event.start_time,'HH24:MI'),to_char(p_event.end_time,'HH24:MI'),
    chr(10),p_event.scenario,chr(10),p_event.venue);
  FOR s IN SELECT id,name,discord_channel_id FROM public.staff
    WHERE organization_id=p_event.organization_id AND name=ANY(p_event.gms)
  LOOP
    INSERT INTO public.discord_notification_queue
      (organization_id,notification_type,reference_id,dedupe_key,webhook_url,message_payload,max_retries)
    VALUES (p_event.organization_id,'private_cancellation',NULL,
      p_event.id::text||':'||v_epoch::text||':'||s.id::text,
      CASE WHEN nullif(trim(s.discord_channel_id),'') IS NOT NULL THEN 'https://discord.com/api/v10/channels/'||trim(s.discord_channel_id)||'/messages' ELSE '' END,
      jsonb_build_object('content',v_body,'staff_id',s.id,'event_id',p_event.id,'epoch',v_epoch,'allowed_mentions',jsonb_build_object('parse','[]'::jsonb)),3)
    ON CONFLICT (organization_id,notification_type,dedupe_key) DO NOTHING;
  END LOOP;
END $$;
REVOKE ALL ON FUNCTION public.enqueue_private_cancellation(public.schedule_events) FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.private_cancellation_event_trigger()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF TG_OP='DELETE' THEN
    IF OLD.is_cancelled IS NOT TRUE THEN PERFORM public.enqueue_private_cancellation(OLD); END IF;
    RETURN OLD;
  END IF;
  IF OLD.is_cancelled IS TRUE AND NEW.is_cancelled IS NOT TRUE THEN
    UPDATE public.discord_notification_queue SET status='completed',last_error='superseded_by_restoration',updated_at=now()
      WHERE organization_id=OLD.organization_id AND notification_type='private_cancellation'
      AND dedupe_key LIKE OLD.id::text||':'||coalesce(OLD.gm_cancel_epoch,OLD.id)::text||':%'
      AND status IN ('pending','sending','failed');
    NEW.gm_cancel_epoch := gen_random_uuid();
  ELSIF OLD.is_cancelled IS NOT TRUE AND NEW.is_cancelled IS TRUE THEN
    -- 取消と同時にGM欄を空にする操作でも、解除される旧担当者へ送る。
    PERFORM public.enqueue_private_cancellation(OLD);
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.private_cancellation_event_trigger() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER private_cancellation_event BEFORE UPDATE OF is_cancelled OR DELETE ON public.schedule_events
  FOR EACH ROW EXECUTE FUNCTION public.private_cancellation_event_trigger();

CREATE FUNCTION public.private_cancellation_reservation_trigger()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE e public.schedule_events; event_id uuid; org_id uuid;
BEGIN
  IF TG_OP='INSERT' THEN
    IF NEW.reservation_source IN ('staff_entry','staff_participation') OR NEW.payment_method='staff' THEN RETURN NULL; END IF;
    event_id := NEW.schedule_event_id; org_id := NEW.organization_id;
  ELSE
    IF OLD.reservation_source IN ('staff_entry','staff_participation') OR OLD.payment_method='staff' THEN RETURN NULL; END IF;
    event_id := OLD.schedule_event_id; org_id := OLD.organization_id;
  END IF;
  IF event_id IS NULL THEN RETURN NULL; END IF;
  IF TG_OP='UPDATE' AND NEW.status IS NOT DISTINCT FROM OLD.status THEN RETURN NULL; END IF;
  -- 公演単位に直列化し、複数予約の同時取消でも最終予約の取消を確実に検出する。
  SELECT * INTO e FROM public.schedule_events WHERE id=event_id AND organization_id=org_id FOR UPDATE;
  IF NOT FOUND OR NOT (coalesce(e.is_private_booking,false) OR e.category='private') THEN RETURN NULL; END IF;
  IF (TG_OP='INSERT' OR (TG_OP='UPDATE' AND OLD.status='cancelled')) AND NEW.status IN ('pending','confirmed','gm_confirmed','checked_in') THEN
    IF EXISTS (SELECT 1 FROM public.discord_notification_queue WHERE organization_id=org_id
      AND notification_type='private_cancellation' AND dedupe_key LIKE event_id::text||':'||coalesce(e.gm_cancel_epoch,e.id)::text||':%') THEN
      UPDATE public.discord_notification_queue SET status='completed',last_error='superseded_by_restoration',updated_at=now()
        WHERE organization_id=org_id AND notification_type='private_cancellation'
        AND dedupe_key LIKE event_id::text||':'||coalesce(e.gm_cancel_epoch,e.id)::text||':%'
        AND status IN ('pending','sending','failed');
      UPDATE public.schedule_events SET gm_cancel_epoch=gen_random_uuid() WHERE id=event_id AND organization_id=org_id;
    END IF;
    RETURN NULL;
  END IF;
  IF TG_OP='INSERT' THEN RETURN NULL; END IF;
  IF OLD.status='cancelled' OR (TG_OP='UPDATE' AND NEW.status<>'cancelled') THEN RETURN NULL; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.reservations WHERE schedule_event_id=event_id AND organization_id=org_id
      AND status IN ('pending','confirmed','gm_confirmed','checked_in')
      AND coalesce(reservation_source,'') NOT IN ('staff_entry','staff_participation')
      AND coalesce(payment_method,'')<>'staff') THEN
    PERFORM public.enqueue_private_cancellation(e);
  END IF;
  RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION public.private_cancellation_reservation_trigger() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER private_cancellation_reservation AFTER INSERT OR UPDATE OF status OR DELETE ON public.reservations
  FOR EACH ROW EXECUTE FUNCTION public.private_cancellation_reservation_trigger();
