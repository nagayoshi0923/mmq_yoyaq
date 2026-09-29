CREATE OR REPLACE FUNCTION public.search_org_customers(
 p_org_id uuid, p_search text DEFAULT NULL, p_limit integer DEFAULT 50, p_offset integer DEFAULT 0,
 p_sort_by text DEFAULT 'created_at', p_sort_dir text DEFAULT 'desc',
 p_min_reservations integer DEFAULT NULL, p_min_visits integer DEFAULT NULL,
 p_min_amount bigint DEFAULT NULL, p_has_coupons boolean DEFAULT NULL,
 p_visit_from date DEFAULT NULL, p_visit_to date DEFAULT NULL
) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO public AS $function$
WITH all_stats AS MATERIALIZED (
 SELECT * FROM public.get_org_customers_with_stats_v2(p_org_id,p_search,NULL,0)
), filtered AS MATERIALIZED (
 SELECT * FROM all_stats s
 WHERE (p_min_reservations IS NULL OR s.reservation_count >= p_min_reservations)
 AND (p_min_visits IS NULL OR s.visit_count >= p_min_visits)
 AND (p_min_amount IS NULL OR s.reservation_amount >= p_min_amount)
 AND (p_has_coupons IS NULL OR (s.remaining_coupons > 0) = p_has_coupons)
 AND (p_visit_from IS NULL OR s.last_visit >= (p_visit_from::timestamp AT TIME ZONE 'Asia/Tokyo'))
 AND (p_visit_to IS NULL OR s.last_visit < ((p_visit_to + 1)::timestamp AT TIME ZONE 'Asia/Tokyo'))
), ordered AS (
 SELECT f.*, row_number() OVER (ORDER BY
 CASE WHEN p_sort_by = 'created_at' AND p_sort_dir = 'asc' THEN f.created_at END ASC NULLS LAST,
 CASE WHEN p_sort_by = 'created_at' AND p_sort_dir = 'desc' THEN f.created_at END DESC NULLS LAST,
 CASE WHEN p_sort_by = 'name' AND p_sort_dir = 'asc' THEN f.name END ASC NULLS LAST,
 CASE WHEN p_sort_by = 'name' AND p_sort_dir = 'desc' THEN f.name END DESC NULLS LAST,
 CASE WHEN p_sort_by = 'email' AND p_sort_dir = 'asc' THEN f.email END ASC NULLS LAST,
 CASE WHEN p_sort_by = 'email' AND p_sort_dir = 'desc' THEN f.email END DESC NULLS LAST,
 CASE WHEN p_sort_by = 'phone' AND p_sort_dir = 'asc' THEN f.phone END ASC NULLS LAST,
 CASE WHEN p_sort_by = 'phone' AND p_sort_dir = 'desc' THEN f.phone END DESC NULLS LAST,
 CASE WHEN p_sort_by = 'reservation_count' AND p_sort_dir = 'asc' THEN f.reservation_count END ASC NULLS LAST,
 CASE WHEN p_sort_by = 'reservation_count' AND p_sort_dir = 'desc' THEN f.reservation_count END DESC NULLS LAST,
 CASE WHEN p_sort_by = 'remaining_coupons' AND p_sort_dir = 'asc' THEN f.remaining_coupons END ASC NULLS LAST,
 CASE WHEN p_sort_by = 'remaining_coupons' AND p_sort_dir = 'desc' THEN f.remaining_coupons END DESC NULLS LAST,
 CASE WHEN p_sort_by = 'visit_count' AND p_sort_dir = 'asc' THEN f.visit_count END ASC NULLS LAST,
 CASE WHEN p_sort_by = 'visit_count' AND p_sort_dir = 'desc' THEN f.visit_count END DESC NULLS LAST,
 CASE WHEN p_sort_by = 'reservation_amount' AND p_sort_dir = 'asc' THEN f.reservation_amount END ASC NULLS LAST,
 CASE WHEN p_sort_by = 'reservation_amount' AND p_sort_dir = 'desc' THEN f.reservation_amount END DESC NULLS LAST,
 CASE WHEN p_sort_by = 'last_visit' AND p_sort_dir = 'asc' THEN f.last_visit END ASC NULLS LAST,
 CASE WHEN p_sort_by = 'last_visit' AND p_sort_dir = 'desc' THEN f.last_visit END DESC NULLS LAST, f.created_at DESC, f.id ASC) AS position
 FROM filtered f
), page AS (
 SELECT * FROM ordered ORDER BY position
 LIMIT LEAST(GREATEST(COALESCE(p_limit,50),1),100) OFFSET GREATEST(COALESCE(p_offset,0),0)
)
SELECT jsonb_build_object('customers',COALESCE((SELECT jsonb_agg(to_jsonb(p)-'position'-'total_count' ORDER BY p.position) FROM page p),'[]'::jsonb),
 'totalCount',(SELECT count(*) FROM filtered))
$function$;
REVOKE ALL ON FUNCTION public.search_org_customers(uuid,text,integer,integer,text,text,integer,integer,bigint,boolean,date,date) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.search_org_customers(uuid,text,integer,integer,text,text,integer,integer,bigint,boolean,date,date) TO service_role;
