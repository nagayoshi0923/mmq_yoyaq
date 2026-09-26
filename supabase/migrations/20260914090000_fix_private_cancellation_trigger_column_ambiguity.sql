-- QW-20260914-002 / Issue #467
-- 本番の reservations.event_id と PL/pgSQL 変数の衝突を解消する。
-- 取消と通知キューの原子性・テナント境界・重複防止は維持する。
CREATE OR REPLACE FUNCTION public.private_cancellation_reservation_trigger()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE e public.schedule_events; v_event_id uuid; v_org_id uuid;
BEGIN
  IF TG_OP='INSERT' THEN
    IF NEW.reservation_source IN ('staff_entry','staff_participation') OR NEW.payment_method='staff' THEN RETURN NULL; END IF;
    v_event_id := NEW.schedule_event_id; v_org_id := NEW.organization_id;
  ELSE
    IF OLD.reservation_source IN ('staff_entry','staff_participation') OR OLD.payment_method='staff' THEN RETURN NULL; END IF;
    v_event_id := OLD.schedule_event_id; v_org_id := OLD.organization_id;
  END IF;
  IF v_event_id IS NULL THEN RETURN NULL; END IF;
  IF TG_OP='UPDATE' AND NEW.status IS NOT DISTINCT FROM OLD.status THEN RETURN NULL; END IF;
  -- 公演単位に直列化し、複数予約の同時取消でも最終予約の取消を確実に検出する。
  SELECT * INTO e FROM public.schedule_events WHERE id=v_event_id AND organization_id=v_org_id FOR UPDATE;
  IF NOT FOUND OR NOT (coalesce(e.is_private_booking,false) OR e.category='private') THEN RETURN NULL; END IF;
  IF (TG_OP='INSERT' OR (TG_OP='UPDATE' AND OLD.status='cancelled')) AND NEW.status IN ('pending','confirmed','gm_confirmed','checked_in') THEN
    IF EXISTS (SELECT 1 FROM public.discord_notification_queue WHERE organization_id=v_org_id
      AND notification_type='private_cancellation' AND dedupe_key LIKE v_event_id::text||':'||coalesce(e.gm_cancel_epoch,e.id)::text||':%') THEN
      UPDATE public.discord_notification_queue SET status='completed',last_error='superseded_by_restoration',updated_at=now()
        WHERE organization_id=v_org_id AND notification_type='private_cancellation'
        AND dedupe_key LIKE v_event_id::text||':'||coalesce(e.gm_cancel_epoch,e.id)::text||':%'
        AND status IN ('pending','sending','failed');
      UPDATE public.schedule_events SET gm_cancel_epoch=gen_random_uuid() WHERE id=v_event_id AND organization_id=v_org_id;
    END IF;
    RETURN NULL;
  END IF;
  IF TG_OP='INSERT' THEN RETURN NULL; END IF;
  IF OLD.status='cancelled' OR (TG_OP='UPDATE' AND NEW.status<>'cancelled') THEN RETURN NULL; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.reservations WHERE schedule_event_id=v_event_id AND organization_id=v_org_id
      AND status IN ('pending','confirmed','gm_confirmed','checked_in')
      AND coalesce(reservation_source,'') NOT IN ('staff_entry','staff_participation')
      AND coalesce(payment_method,'')<>'staff') THEN
    PERFORM public.enqueue_private_cancellation(e);
  END IF;
  RETURN NULL;
END $$;
