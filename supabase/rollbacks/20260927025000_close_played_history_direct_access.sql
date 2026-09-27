-- Restore exactly the authenticated table privileges observed before closure.
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.manual_play_history TO authenticated;
GRANT SELECT, INSERT, DELETE ON TABLE public.customer_played_overrides TO authenticated;
