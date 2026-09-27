CREATE OR REPLACE FUNCTION public.get_group_members_by_group_id(p_group_id uuid)
 RETURNS TABLE(id uuid, group_id uuid, user_id uuid, guest_name text, guest_email text, is_organizer boolean, status text, joined_at timestamp with time zone, created_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- 認証チェック: ログイン済みユーザーのみ
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  RETURN QUERY
  SELECT
    m.id, m.group_id, m.user_id, m.guest_name, m.guest_email,
    m.is_organizer, m.status, m.joined_at, m.created_at
  FROM private_group_members m
  WHERE m.group_id = p_group_id;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.get_group_members_by_group_id(uuid) TO PUBLIC,anon,authenticated,service_role;
DROP FUNCTION public.authorize_private_group_read(uuid,uuid,text);
