-- 旧クライアント互換。作品未選択の入口用。個別判定には effective RPC を使う。
CREATE OR REPLACE FUNCTION public.get_private_booking_deadline_days(
  p_organization_id UUID DEFAULT NULL,
  p_organization_slug TEXT DEFAULT NULL
)
RETURNS INTEGER LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.get_effective_private_booking_deadline_days(p_organization_id, p_organization_slug, NULL);
$$;
GRANT EXECUTE ON FUNCTION public.get_private_booking_deadline_days(UUID,TEXT) TO anon,authenticated;
