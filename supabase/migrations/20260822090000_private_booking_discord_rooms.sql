-- 戦塵貸切 Discord チャンネル記録
-- ロールバック:
--   DROP TABLE IF EXISTS public.private_booking_discord_rooms;

CREATE TABLE IF NOT EXISTS public.private_booking_discord_rooms (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id),
  reservation_id UUID NOT NULL REFERENCES public.reservations(id),
  schedule_event_id UUID REFERENCES public.schedule_events(id),
  scenario_master_id UUID REFERENCES public.scenario_masters(id),
  player_channel_id TEXT NOT NULL,
  spectator_channel_id TEXT NOT NULL,
  player_invite_url TEXT,
  spectator_invite_url TEXT,
  date_role_id TEXT,
  player_channel_name TEXT,
  spectator_channel_name TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  moved_at TIMESTAMPTZ,
  UNIQUE (reservation_id)
);

CREATE INDEX IF NOT EXISTS idx_private_booking_discord_rooms_org
  ON public.private_booking_discord_rooms (organization_id);
CREATE INDEX IF NOT EXISTS idx_private_booking_discord_rooms_event
  ON public.private_booking_discord_rooms (schedule_event_id);

COMMENT ON TABLE public.private_booking_discord_rooms IS
  '戦塵のレガストリア貸切の Discord チャンネル（参加用・観戦用）';

ALTER TABLE public.private_booking_discord_rooms ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.private_booking_discord_rooms FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE ON TABLE public.private_booking_discord_rooms TO authenticated;
GRANT ALL ON TABLE public.private_booking_discord_rooms TO service_role;

DROP POLICY IF EXISTS "private_booking_discord_rooms_select" ON public.private_booking_discord_rooms;
CREATE POLICY "private_booking_discord_rooms_select"
  ON public.private_booking_discord_rooms
  FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id FROM public.staff WHERE user_id = auth.uid()
    )
  );
