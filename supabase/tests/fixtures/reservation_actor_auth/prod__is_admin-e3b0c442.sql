CREATE OR REPLACE FUNCTION public.is_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT COALESCE(
    (SELECT role IN ('admin', 'license_admin') FROM public.users WHERE id = auth.uid() LIMIT 1),
    false
  );
$function$
