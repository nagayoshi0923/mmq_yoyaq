-- 整備 6（2026-10-04 社長判断）: 貸切の最後の予約が取り消されたら、貸切公演も中止にする。
-- これまでは予約・グループだけ取り消され、公演は残っていた（時間帯が埋まったまま、担当のまま）。
-- あわせて、予約が取り消し済みなのに残っている貸切公演 11 件を中止にする。
--   今後の 8 件: 担当 GM に知らせる（うち 2 件は 9/28 に知らせ済みで、同じ重複キーのため二重には送らない）
--   当日を過ぎた 3 件: 知らせない
-- 退避表: archive.schedule_events_orphan_private_backup_20261004
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
    -- 整備 6: 最後の予約が取り消されたら、貸切公演も中止にする（時間帯を空け、担当のまま残さない）。
    -- GM への知らせは直前の呼び出しで作成済み。公演側の見張りも同じ重複キーを使うので二重には送らない。
    IF TG_OP='UPDATE' AND e.is_cancelled IS NOT TRUE THEN
      UPDATE public.schedule_events
        SET is_cancelled=true, cancelled_at=now(),
            cancellation_reason=coalesce(nullif(btrim(NEW.cancellation_reason),''),'予約の取り消し'), updated_at=now()
        WHERE id=v_event_id AND organization_id=v_org_id AND is_cancelled IS NOT TRUE;
    END IF;
  END IF;
  RETURN NULL;
END $$;

CREATE TABLE IF NOT EXISTS archive.schedule_events_orphan_private_backup_20261004 AS
SELECT e.id, e.organization_id, e.date, e.is_cancelled, e.cancelled_at, e.cancellation_reason, e.updated_at
FROM public.schedule_events e JOIN public.reservations r ON r.id=e.reservation_id AND r.organization_id=e.organization_id
WHERE r.reservation_source='web_private' AND r.status='cancelled' AND e.is_cancelled IS NOT TRUE
  AND (e.category='private' OR coalesce(e.is_private_booking,false))
  AND NOT EXISTS (SELECT 1 FROM public.reservations x WHERE x.schedule_event_id=e.id AND x.organization_id=e.organization_id
    AND x.status IN ('pending','confirmed','gm_confirmed','checked_in')
    AND coalesce(x.reservation_source,'') NOT IN ('staff_entry','staff_participation') AND coalesce(x.payment_method,'')<>'staff');
ALTER TABLE archive.schedule_events_orphan_private_backup_20261004 ENABLE ROW LEVEL SECURITY;

UPDATE public.schedule_events e
SET is_cancelled=true, cancelled_at=now(),
    cancellation_reason=coalesce(nullif(btrim(e.cancellation_reason),''),(SELECT nullif(btrim(r.cancellation_reason),'') FROM public.reservations r WHERE r.id=e.reservation_id),'予約の取り消し'),
    updated_at=now()
FROM archive.schedule_events_orphan_private_backup_20261004 b
WHERE e.id=b.id AND e.organization_id=b.organization_id AND e.is_cancelled IS NOT TRUE;

-- 当日を過ぎた公演の知らせは送らない（同じ処理の中で作られた送信待ちを、送らずに完了にする）
UPDATE public.discord_notification_queue q
SET status='completed', last_error='past_event_no_notice', updated_at=now()
FROM archive.schedule_events_orphan_private_backup_20261004 b
WHERE b.date < (now() AT TIME ZONE 'Asia/Tokyo')::date
  AND q.organization_id=b.organization_id AND q.notification_type='private_cancellation'
  AND q.dedupe_key LIKE b.id::text||':%' AND q.status='pending';
