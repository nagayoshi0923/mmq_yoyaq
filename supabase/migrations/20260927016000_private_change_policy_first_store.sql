BEGIN;
-- 新規申込時に固定し、店舗未確定の新規貸切だけ初回店舗確定時に補完する。
CREATE OR REPLACE FUNCTION public.set_reservation_change_policy_snapshot()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE scenario_id uuid; is_private boolean; setting_key text; performance_start timestamptz; refresh_on_first_store boolean:=false;
BEGIN
 IF TG_OP='UPDATE' THEN
  -- キャンセル規定の固定マーカーを共有し、店舗の解除→再設定でも再固定しない。
  -- 導入前の履歴（version NULL）と既に店舗確定済みの予約は元の時間数を保持する。
  refresh_on_first_store:=OLD.cancellation_policy_snapshot_version=1
    AND OLD.cancellation_policy_store_id IS NULL AND OLD.store_id IS NULL
    AND NEW.store_id IS NOT NULL AND NEW.organization_id=OLD.organization_id
    AND (OLD.private_group_id IS NOT NULL OR OLD.reservation_source='web_private'
      OR COALESCE(OLD.reservation_type IN ('private','private_booking'),false));
 END IF;
 IF TG_OP='INSERT' OR refresh_on_first_store THEN
  IF refresh_on_first_store THEN
   IF NOT EXISTS(SELECT 1 FROM stores WHERE id=NEW.store_id AND organization_id=NEW.organization_id)
     OR (NEW.schedule_event_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM schedule_events
       WHERE id=NEW.schedule_event_id AND organization_id=NEW.organization_id AND store_id=NEW.store_id)) THEN
    RAISE EXCEPTION 'RESERVATION_POLICY_CONTEXT_MISMATCH' USING ERRCODE='23514';
   END IF;
  END IF;
  SELECT EXISTS(SELECT 1 FROM schedule_events e WHERE e.id=NEW.schedule_event_id
    AND e.organization_id=NEW.organization_id AND (e.category='private' OR e.is_private_booking)) INTO is_private;
  is_private:=is_private OR NEW.private_group_id IS NOT NULL OR NEW.reservation_source='web_private'
    OR COALESCE(NEW.reservation_type IN ('private','private_booking'),false);
  SELECT s.id INTO scenario_id FROM organization_scenarios s WHERE s.organization_id=NEW.organization_id
    AND s.scenario_master_id=NEW.scenario_master_id LIMIT 1;
  setting_key:=CASE WHEN is_private THEN 'private_reservation_change_deadline_hours' ELSE 'reservation_change_deadline_hours' END;
  NEW.reservation_change_deadline_hours_snapshot:=(public.resolve_operating_setting(NEW.organization_id,setting_key,'null'::jsonb,NEW.store_id,scenario_id,NEW.schedule_event_id)->>'value')::integer;
 ELSE
  NEW.reservation_change_deadline_hours_snapshot:=OLD.reservation_change_deadline_hours_snapshot;
 END IF;
 IF TG_OP='UPDATE' THEN
  IF NEW.participant_count IS DISTINCT FROM OLD.participant_count
    AND OLD.reservation_change_deadline_hours_snapshot IS NOT NULL
    AND auth.uid() IS NOT NULL
    AND NOT EXISTS(SELECT 1 FROM staff WHERE user_id=auth.uid() AND organization_id=OLD.organization_id AND status='active')
    AND NOT EXISTS(SELECT 1 FROM public.users WHERE id=auth.uid() AND organization_id=OLD.organization_id AND role='admin') THEN
   SELECT (e.date + e.start_time) AT TIME ZONE 'Asia/Tokyo' INTO performance_start
    FROM schedule_events e WHERE e.id=OLD.schedule_event_id AND e.organization_id=OLD.organization_id;
   performance_start:=COALESCE(performance_start,OLD.requested_datetime);
   IF performance_start IS NULL OR now() >= performance_start - make_interval(hours=>OLD.reservation_change_deadline_hours_snapshot) THEN
    RAISE EXCEPTION 'RESERVATION_CHANGE_DEADLINE_PASSED' USING ERRCODE='P0050';
   END IF;
  END IF;
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.set_reservation_change_policy_snapshot() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.set_reservation_change_policy_snapshot() TO service_role;

COMMIT;
