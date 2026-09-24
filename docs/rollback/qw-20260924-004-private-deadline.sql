CREATE OR REPLACE FUNCTION public.get_private_booking_deadline_days(p_organization_id uuid DEFAULT NULL::uuid, p_organization_slug text DEFAULT NULL::text)
 RETURNS integer
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT COALESCE(
    (
      SELECT MAX(COALESCE(rs.private_booking_deadline_days, 14))
      FROM public.stores s
      LEFT JOIN public.reservation_settings rs
        ON rs.store_id = s.id
      WHERE s.status = 'active'
        AND s.ownership_type IS DISTINCT FROM 'office'
        AND CASE
          WHEN p_organization_id IS NOT NULL THEN s.organization_id = p_organization_id
          WHEN p_organization_slug IS NOT NULL THEN s.organization_id = (
            SELECT o.id FROM public.organizations o WHERE o.slug = p_organization_slug
          )
          ELSE TRUE
        END
    ),
    14
  );
$function$;

CREATE OR REPLACE FUNCTION public.get_performance_booking_window(p_event_id uuid)
 RETURNS TABLE(judgment_deadline timestamp with time zone, judgment_status text, booking_deadline timestamp with time zone, effective_booking_deadline timestamp with time zone, override_minutes integer, default_minutes integer, updated_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
 WITH settings AS (
  SELECT e.id,e.updated_at,e.booking_cutoff_minutes,
    (e.date+e.start_time) AT TIME ZONE 'Asia/Tokyo' AS starts_at,
    COALESCE(os.booking_cutoff_minutes,GREATEST(COALESCE(e.reservation_deadline_hours,0),COALESCE(rs.same_day_booking_cutoff,0),0)*60) AS default_minutes,
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
  LEFT JOIN reservation_settings rs ON rs.store_id=e.store_id AND rs.organization_id=e.organization_id
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


-- 新列は保持。旧フロントへ戻した後に実行し、新しい個別指定を参照しない状態に戻す。
