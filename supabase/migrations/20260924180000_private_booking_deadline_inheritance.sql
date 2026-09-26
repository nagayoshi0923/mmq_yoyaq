-- QW-20260924-004: 既存の実効値を保って組織共通とシナリオ上書きを追加。
ALTER TABLE public.global_settings ADD COLUMN private_booking_deadline_days INTEGER CHECK (private_booking_deadline_days BETWEEN 0 AND 90);
ALTER TABLE public.organization_scenarios ADD COLUMN private_booking_deadline_days INTEGER CHECK (private_booking_deadline_days BETWEEN 0 AND 90);
-- 既存 RPC と同じ予約可能店舗の MAX。個別シナリオは NULL のまま継承。
INSERT INTO public.global_settings (organization_id, private_booking_deadline_days)
SELECT o.id, COALESCE(MAX(COALESCE(rs.private_booking_deadline_days,14)) FILTER (WHERE s.id IS NOT NULL),14)
FROM public.organizations o
LEFT JOIN public.stores s ON s.organization_id=o.id AND s.status='active' AND s.ownership_type IS DISTINCT FROM 'office'
LEFT JOIN public.reservation_settings rs ON rs.store_id=s.id
GROUP BY o.id
ON CONFLICT (organization_id) DO UPDATE SET private_booking_deadline_days=EXCLUDED.private_booking_deadline_days;
ALTER TABLE public.global_settings ALTER COLUMN private_booking_deadline_days SET DEFAULT 14;
-- 貸切締切: 組織共通 → シナリオ個別指定。NULL は継承、0 は当日まで。
CREATE OR REPLACE FUNCTION public.get_effective_private_booking_deadline_days(
  p_organization_id UUID DEFAULT NULL,
  p_organization_slug TEXT DEFAULT NULL,
  p_scenario_id UUID DEFAULT NULL
)
RETURNS INTEGER LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  org UUID;
  common_days INTEGER;
  custom_days INTEGER;
BEGIN
  SELECT id INTO org FROM public.organizations
  WHERE (p_organization_id IS NULL OR id = p_organization_id)
    AND (p_organization_slug IS NULL OR slug = p_organization_slug)
    AND (p_organization_id IS NOT NULL OR p_organization_slug IS NOT NULL);
  IF org IS NULL THEN RETURN 14; END IF;
  SELECT private_booking_deadline_days INTO common_days FROM public.global_settings WHERE organization_id = org;
  common_days := COALESCE(common_days, 14);
  IF p_scenario_id IS NOT NULL THEN
    SELECT os.private_booking_deadline_days INTO custom_days
    FROM public.organization_scenarios os
    WHERE os.organization_id = org
      AND (os.scenario_master_id = p_scenario_id OR os.id = p_scenario_id
        OR os.scenario_master_id = (SELECT s.scenario_master_id FROM public.scenarios s WHERE s.id = p_scenario_id AND s.organization_id = org));
    IF NOT FOUND THEN RAISE EXCEPTION 'SCENARIO_NOT_FOUND'; END IF;
    RETURN COALESCE(custom_days, common_days);
  END IF;
  -- 作品未選択の入口は、個別設定で受付可能な作品を隠さない。
  -- 作品選択後に必ずその作品の締切で再判定する。
  SELECT MIN(COALESCE(private_booking_deadline_days, common_days)) INTO custom_days
  FROM public.organization_scenarios WHERE organization_id = org AND org_status = 'available';
  RETURN COALESCE(custom_days, common_days);
END;
$$;
REVOKE ALL ON FUNCTION public.get_effective_private_booking_deadline_days(UUID,TEXT,UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_effective_private_booking_deadline_days(UUID,TEXT,UUID) TO anon,authenticated,service_role;
-- 旧クライアント互換。作品未選択の入口用。個別判定には effective RPC を使う。
CREATE OR REPLACE FUNCTION public.get_private_booking_deadline_days(
  p_organization_id UUID DEFAULT NULL,
  p_organization_slug TEXT DEFAULT NULL
)
RETURNS INTEGER LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.get_effective_private_booking_deadline_days(p_organization_id, p_organization_slug, NULL);
$$;
GRANT EXECUTE ON FUNCTION public.get_private_booking_deadline_days(UUID,TEXT) TO anon,authenticated;

-- 通常予約は公演・シナリオの締切へ統一（現行 live 定義から変更）。
CREATE OR REPLACE FUNCTION public.get_performance_booking_window(p_event_id uuid)
 RETURNS TABLE(judgment_deadline timestamp with time zone, judgment_status text, booking_deadline timestamp with time zone, effective_booking_deadline timestamp with time zone, override_minutes integer, default_minutes integer, updated_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
 WITH settings AS (
  SELECT e.id,e.updated_at,e.booking_cutoff_minutes,
    (e.date+e.start_time) AT TIME ZONE 'Asia/Tokyo' AS starts_at,
    COALESCE(os.booking_cutoff_minutes,GREATEST(COALESCE(e.reservation_deadline_hours,0),0)*60) AS default_minutes,
    d.deadline,d.status,
    EXISTS(SELECT 1 FROM performance_cancellation_logs l WHERE l.schedule_event_id=e.id AND l.organization_id=e.organization_id AND l.result='confirmed') AS was_confirmed
  FROM schedule_events e
  LEFT JOIN LATERAL (
    SELECT sc.booking_cutoff_minutes FROM organization_scenarios sc
    WHERE sc.organization_id=e.organization_id AND
      ((e.organization_scenario_id IS NOT NULL AND sc.id=e.organization_scenario_id)
       OR (e.organization_scenario_id IS NULL AND sc.scenario_master_id=COALESCE(e.scenario_master_id,e.scenario_id)))
    LIMIT 1
  ) os ON true
  LEFT JOIN performance_recruitment_deadlines d ON d.schedule_event_id=e.id AND d.organization_id=e.organization_id
  WHERE e.id=p_event_id AND e.category='open' AND NOT e.is_cancelled
 ), resolved AS (
  SELECT *,starts_at-make_interval(mins=>COALESCE(booking_cutoff_minutes,default_minutes)) AS cutoff FROM settings
 )
 SELECT COALESCE(deadline,starts_at-interval '4 hours'),
   COALESCE(status,CASE WHEN was_confirmed THEN 'confirmed' ELSE 'pending' END),cutoff,
   CASE WHEN status='active' THEN deadline ELSE cutoff END,booking_cutoff_minutes,default_minutes,updated_at
 FROM resolved;
$function$;
