-- Apply only after the authorized RPC and every migrated browser caller are live.
-- Keep the existing RLS policies and all history rows unchanged.
REVOKE ALL ON TABLE public.manual_play_history, public.customer_played_overrides FROM PUBLIC, anon, authenticated;
