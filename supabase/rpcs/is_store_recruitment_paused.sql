-- 正本（本番の定義を 2026-10-03 に写した。#696）
CREATE OR REPLACE FUNCTION public.is_store_recruitment_paused(p_store_id uuid, p_pause_type text, p_date date)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.store_recruitment_pauses p
    WHERE p.store_id = p_store_id
      AND p.pause_type = p_pause_type
      AND (p.starts_on IS NULL OR p.starts_on <= p_date)
      AND (p.ends_on IS NULL OR p.ends_on >= p_date)
  );
$function$;
