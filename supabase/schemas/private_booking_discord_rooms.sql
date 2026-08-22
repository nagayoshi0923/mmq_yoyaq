-- 正規ソース: supabase/schemas/private_booking_discord_rooms.sql
-- 戦塵貸切の Discord 参加用・観戦用チャンネル
CREATE TABLE public.private_booking_discord_rooms (
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

CREATE INDEX idx_private_booking_discord_rooms_org
  ON public.private_booking_discord_rooms (organization_id);
CREATE INDEX idx_private_booking_discord_rooms_event
  ON public.private_booking_discord_rooms (schedule_event_id);

COMMENT ON TABLE public.private_booking_discord_rooms IS
  '戦塵のレガストリア貸切の Discord チャンネル（参加用・観戦用）';
