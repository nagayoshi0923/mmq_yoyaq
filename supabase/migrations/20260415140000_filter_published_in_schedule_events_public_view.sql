-- schedule_events_public ビューから非公開公演を除外
-- published = false の公演は公開ページに表示しない

CREATE OR REPLACE VIEW public.schedule_events_public AS
SELECT
  id, date, venue, scenario, start_time, end_time,
  category, is_cancelled, scenario_id, store_id,
  start_at, end_at, published, capacity, status,
  max_participants, reservation_deadline_hours,
  is_reservation_enabled, current_participants, time_slot,
  organization_id, participant_count,
  is_private_request, organization_scenario_id,
  is_recruitment_extended, is_private_booking,
  is_extended, extended_at,
  cancelled_at, scenario_master_id,
  created_at, updated_at
FROM schedule_events
WHERE published = true
  AND (is_cancelled = false OR is_cancelled IS NULL);

GRANT SELECT ON public.schedule_events_public TO anon;
GRANT SELECT ON public.schedule_events_public TO authenticated;
