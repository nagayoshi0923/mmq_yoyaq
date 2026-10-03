-- 正本（本番の定義を 2026-10-03 に写した。#573。get_group_members_by_group_id が使う所属認可）
CREATE OR REPLACE FUNCTION public.authorize_private_group_read(p_group_id uuid, p_member_id uuid DEFAULT NULL::uuid, p_guest_token text DEFAULT NULL::text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE actor uuid:=auth.uid(); actor_role text; actor_org uuid; group_org uuid; organizer uuid;
BEGIN
 SELECT organization_id,organizer_id INTO group_org,organizer FROM public.private_groups WHERE id=p_group_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'グループを閲覧できません' USING ERRCODE='42501'; END IF;
 IF actor IS NOT NULL THEN
  SELECT role::text,organization_id INTO actor_role,actor_org FROM public.users WHERE id=actor;
  IF actor_role='license_admin' THEN RETURN 'staff'; END IF;
  IF COALESCE(actor_role IN ('admin','staff') AND actor_org=group_org,false)
   AND NOT (EXISTS(SELECT 1 FROM public.staff WHERE user_id=actor AND organization_id=actor_org)
    AND NOT EXISTS(SELECT 1 FROM public.staff WHERE user_id=actor AND organization_id=actor_org AND (status IS NULL OR status NOT IN ('inactive','resigned')))) THEN
   RETURN 'staff';
  END IF;
  IF organizer=actor THEN RETURN 'organizer'; END IF;
  IF EXISTS(SELECT 1 FROM public.private_group_members WHERE group_id=p_group_id AND user_id=actor AND status='joined') THEN RETURN 'member'; END IF;
 END IF;
 IF p_member_id IS NOT NULL THEN
  PERFORM public.require_private_group_member(p_group_id,p_member_id,p_guest_token);
  RETURN 'member';
 END IF;
 RAISE EXCEPTION 'グループを閲覧できません' USING ERRCODE='42501';
END $function$;
