-- 適用直前の本番4件を復元する。stagingには該当IDがないことを確認済み。
-- この復元は当該公演が中止のまま、deadlineがcancelledの場合のみ行う。
BEGIN;
DROP TRIGGER IF EXISTS close_recruitment_on_event_cancellation ON public.schedule_events;
DROP FUNCTION IF EXISTS public.close_recruitment_on_event_cancellation();
UPDATE public.performance_recruitment_deadlines d
SET status=b.status, updated_at=b.updated_at
FROM jsonb_to_recordset('[{"status": "active", "updated_at": "2026-09-15T14:30:02.165879+09:00", "organization_id": "a0000000-0000-0000-0000-000000000001", "schedule_event_id": "34d45d47-b8fe-4697-8660-5a0fc03c6fce"}, {"status": "active", "updated_at": "2026-09-21T10:00:02.523702+09:00", "organization_id": "a0000000-0000-0000-0000-000000000001", "schedule_event_id": "80173924-dc11-4c5c-b9de-1c2f1306a7cf"}, {"status": "active", "updated_at": "2026-09-23T15:00:02.592282+09:00", "organization_id": "a0000000-0000-0000-0000-000000000001", "schedule_event_id": "edad71e3-f79a-4c09-b13b-b51e8fac0cf0"}, {"status": "active", "updated_at": "2026-09-26T06:00:09.098343+09:00", "organization_id": "a0000000-0000-0000-0000-000000000001", "schedule_event_id": "e0249682-62d1-46ef-949c-b66fa3b91f19"}]'::jsonb)
  AS b(schedule_event_id uuid,organization_id uuid,status text,updated_at timestamptz), public.schedule_events e
WHERE d.schedule_event_id=b.schedule_event_id AND d.organization_id=b.organization_id
  AND e.id=d.schedule_event_id AND e.organization_id=d.organization_id
  AND e.is_cancelled IS TRUE AND d.status='cancelled';
-- 適用直前の中止公演の未送信extensionは0件。新たな送信は発生させない。
COMMIT;
