-- QW-20260917-001 B22: 中止済み公演に募集中の状態を残さない。
BEGIN;
CREATE OR REPLACE FUNCTION public.close_recruitment_on_event_cancellation()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NEW.is_cancelled IS TRUE THEN
    UPDATE public.performance_recruitment_deadlines
      SET status='cancelled', updated_at=now()
      WHERE schedule_event_id=NEW.id AND organization_id=NEW.organization_id AND status='active';
    UPDATE public.performance_recruitment_notices
      SET status='expired', lease_until=NULL
      WHERE schedule_event_id=NEW.id AND organization_id=NEW.organization_id
        AND kind='extension' AND status IN ('pending','failed','sending') AND sent_at IS NULL;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.close_recruitment_on_event_cancellation() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER close_recruitment_on_event_cancellation
AFTER UPDATE OF is_cancelled ON public.schedule_events
FOR EACH ROW WHEN (NEW.is_cancelled IS TRUE)
EXECUTE FUNCTION public.close_recruitment_on_event_cancellation();

-- 公演・予約・送信済み通知は変更せず、中止という確定事実に募集状態を合わせる。
UPDATE public.performance_recruitment_deadlines d SET status='cancelled', updated_at=now()
FROM public.schedule_events e
WHERE e.id=d.schedule_event_id AND e.organization_id=d.organization_id
  AND e.is_cancelled IS TRUE AND d.status='active';
UPDATE public.performance_recruitment_notices n SET status='expired', lease_until=NULL
FROM public.schedule_events e
WHERE e.id=n.schedule_event_id AND e.organization_id=n.organization_id
  AND e.is_cancelled IS TRUE AND n.kind='extension'
  AND n.status IN ('pending','failed','sending') AND n.sent_at IS NULL;
COMMIT;
