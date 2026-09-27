-- Explicit, operator-confirmed relationship; no name-based historical backfill.
CREATE TABLE public.event_staff_participations (
  event_id uuid NOT NULL REFERENCES public.schedule_events(id) ON DELETE CASCADE,
  staff_id uuid NOT NULL REFERENCES public.staff(id) ON DELETE RESTRICT,
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  reservation_id uuid REFERENCES public.reservations(id) ON DELETE SET NULL,
  mode text NOT NULL CHECK(mode IN ('included','additional')),
  PRIMARY KEY(event_id,staff_id)
);
CREATE UNIQUE INDEX event_staff_additional_reservation_unique ON public.event_staff_participations(reservation_id) WHERE mode='additional';
ALTER TABLE public.event_staff_participations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.event_staff_participations FROM PUBLIC,anon,authenticated,service_role;
COMMENT ON TABLE public.event_staff_participations IS 'スタッフ参加が既存予約人数内か追加席かの明示記録。人物・過去予約の推測補完をしない。';
