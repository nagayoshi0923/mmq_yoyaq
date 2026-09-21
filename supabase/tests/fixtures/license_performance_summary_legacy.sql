-- Captured from production on 2026-09-21 before replacement.
CREATE VIEW public.license_performance_summary AS  SELECT sm.id AS scenario_master_id,
    sm.title AS scenario_title,
    sm.author,
    COALESCE(os.license_amount, 0) AS license_amount,
    count(DISTINCT
        CASE
            WHEN se.category = ANY (ARRAY['open'::text, 'private'::text, 'gmtest'::text]) THEN se.id
            ELSE NULL::uuid
        END) AS internal_performance_count,
    COALESCE(sum(
        CASE
            WHEN epr.status = 'approved'::text THEN epr.performance_count
            ELSE 0
        END), 0::bigint)::integer AS external_performance_count,
    count(DISTINCT
        CASE
            WHEN se.category = ANY (ARRAY['open'::text, 'private'::text, 'gmtest'::text]) THEN se.id
            ELSE NULL::uuid
        END) + COALESCE(sum(
        CASE
            WHEN epr.status = 'approved'::text THEN epr.performance_count
            ELSE 0
        END), 0::bigint)::integer AS total_performance_count,
    (count(DISTINCT
        CASE
            WHEN se.category = ANY (ARRAY['open'::text, 'private'::text, 'gmtest'::text]) THEN se.id
            ELSE NULL::uuid
        END) + COALESCE(sum(
        CASE
            WHEN epr.status = 'approved'::text THEN epr.performance_count
            ELSE 0
        END), 0::bigint)::integer) * COALESCE(os.license_amount, 0) AS total_license_fee
   FROM scenario_masters sm
     LEFT JOIN organization_scenarios os ON os.scenario_master_id = sm.id
     LEFT JOIN schedule_events se ON se.scenario_master_id = sm.id AND se.is_cancelled = false
     LEFT JOIN external_performance_reports epr ON epr.scenario_master_id = sm.id
  GROUP BY sm.id, sm.title, sm.author, os.license_amount;
