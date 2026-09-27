-- Shared authorization for the phased private-group read migration.
-- Direct table grants are retained until all readers/writers have migrated.
CREATE FUNCTION public.authorize_private_group_read(
 p_group_id uuid, p_member_id uuid DEFAULT NULL, p_guest_token text DEFAULT NULL
) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
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
END $$;
REVOKE ALL ON FUNCTION public.authorize_private_group_read(uuid,uuid,text) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.get_group_members_by_group_id(p_group_id uuid)
RETURNS TABLE(id uuid,group_id uuid,user_id uuid,guest_name text,guest_email text,is_organizer boolean,status text,joined_at timestamptz,created_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE access_level text;
BEGIN
 access_level:=public.authorize_private_group_read(p_group_id);
 RETURN QUERY SELECT m.id,m.group_id,m.user_id,m.guest_name,
  CASE WHEN access_level IN ('staff','organizer') OR m.user_id=auth.uid() THEN m.guest_email ELSE NULL::text END,
  m.is_organizer,m.status,m.joined_at,m.created_at
 FROM public.private_group_members m WHERE m.group_id=p_group_id;
END $$;
REVOKE ALL ON FUNCTION public.get_group_members_by_group_id(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_group_members_by_group_id(uuid) TO authenticated,service_role;
