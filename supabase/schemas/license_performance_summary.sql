-- QW-20260917-001: aggregate each fact source before joining.
CREATE OR REPLACE VIEW public.license_performance_summary AS
WITH internal_counts AS (
  SELECT scenario_master_id, count(*) AS performance_count
  FROM public.schedule_events
  WHERE is_cancelled=false AND category IN ('open','private','gmtest')
  GROUP BY scenario_master_id
), external_counts AS (
  SELECT scenario_master_id, sum(performance_count)::integer AS performance_count
  FROM public.external_performance_reports
  WHERE status='approved'
  GROUP BY scenario_master_id
), license_rates AS (
  -- Preserve the existing distinct rate rows; repeated organization settings
  -- must never multiply external reports. This is not an invoice snapshot.
  SELECT DISTINCT scenario_master_id, coalesce(license_amount,0) AS license_amount
  FROM public.organization_scenarios
)
SELECT sm.id AS scenario_master_id, sm.title AS scenario_title, sm.author,
  coalesce(lr.license_amount,0) AS license_amount,
  coalesce(ic.performance_count,0::bigint) AS internal_performance_count,
  coalesce(ec.performance_count,0) AS external_performance_count,
  coalesce(ic.performance_count,0::bigint)+coalesce(ec.performance_count,0) AS total_performance_count,
  (coalesce(ic.performance_count,0::bigint)+coalesce(ec.performance_count,0))*coalesce(lr.license_amount,0) AS total_license_fee
FROM public.scenario_masters sm
LEFT JOIN license_rates lr ON lr.scenario_master_id=sm.id
LEFT JOIN internal_counts ic ON ic.scenario_master_id=sm.id
LEFT JOIN external_counts ec ON ec.scenario_master_id=sm.id;
-- CREATE OR REPLACE preserves the existing service-only ACL and column types.

