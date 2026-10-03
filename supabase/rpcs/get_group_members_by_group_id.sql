-- 正本（本番の定義を 2026-10-03 に写した。#573）
CREATE OR REPLACE FUNCTION public.get_group_members_by_group_id(p_group_id uuid)
 RETURNS TABLE(id uuid, group_id uuid, user_id uuid, guest_name text, guest_email text, is_organizer boolean, status text, joined_at timestamp with time zone, created_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE access_level text;
BEGIN
 access_level:=public.authorize_private_group_read(p_group_id);
 RETURN QUERY SELECT m.id,m.group_id,m.user_id,m.guest_name,
  CASE WHEN access_level IN ('staff','organizer') OR m.user_id=auth.uid() THEN m.guest_email ELSE NULL::text END,
  m.is_organizer,m.status,m.joined_at,m.created_at
 FROM public.private_group_members m WHERE m.group_id=p_group_id;
END $function$;
