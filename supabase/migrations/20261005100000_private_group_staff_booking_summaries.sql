-- 貸切予約管理の一覧用に、グループの必要な項目だけをまとめて返す（#835）。
-- 従来は private_group_read_list がグループごとに全情報（参加者の詳細・日程回答・作品情報）を組み立てており、
-- 本番 1,059 グループで約 3.5 秒・約 8MB かかっていた。一覧が使うのは作品・招待コード・参加人数・候補日だけ。
-- 閲覧できる人の条件は private_group_read_list の staff 指定と同じ。
CREATE FUNCTION public.private_group_read_staff_booking_summaries(p_organization_id uuid, p_group_ids uuid[])
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE actor uuid:=auth.uid(); actor_role text; actor_org uuid;
BEGIN
 IF actor IS NULL THEN RAISE EXCEPTION 'ログインが必要です' USING ERRCODE='42501'; END IF;
 IF p_organization_id IS NULL OR p_group_ids IS NULL OR cardinality(p_group_ids)>1000 THEN
  RAISE EXCEPTION '一覧の取得条件が正しくありません' USING ERRCODE='22023';
 END IF;
 SELECT role::text,organization_id INTO actor_role,actor_org FROM public.users WHERE id=actor;
 IF NOT (
  COALESCE(actor_role='license_admin',false) OR
  (COALESCE(actor_role IN ('admin','staff') AND actor_org=p_organization_id,false)
   AND NOT (EXISTS(SELECT 1 FROM public.staff WHERE user_id=actor AND organization_id=actor_org)
    AND NOT EXISTS(SELECT 1 FROM public.staff WHERE user_id=actor AND organization_id=actor_org AND (status IS NULL OR status NOT IN ('inactive','resigned')))))
 ) THEN RAISE EXCEPTION 'この組織の一覧を閲覧できません' USING ERRCODE='42501'; END IF;
 RETURN COALESCE((SELECT jsonb_agg(jsonb_build_object(
  'id',g.id,'scenario_master_id',g.scenario_master_id,'invite_code',g.invite_code,
  'joined_member_count',(SELECT count(*) FROM public.private_group_members m WHERE m.group_id=g.id AND m.status='joined'),
  'candidate_dates',COALESCE((SELECT jsonb_agg(jsonb_build_object(
    'group_id',d.group_id,'date',d.date,'time_slot',d.time_slot,'start_time',d.start_time,'end_time',d.end_time,'status',d.status
   ) ORDER BY d.order_num,d.id) FROM public.private_group_candidate_dates d WHERE d.group_id=g.id),'[]'::jsonb)
 ) ORDER BY g.id) FROM public.private_groups g WHERE g.organization_id=p_organization_id AND g.id=ANY(p_group_ids)),'[]'::jsonb);
END $$;
REVOKE ALL ON FUNCTION public.private_group_read_staff_booking_summaries(uuid,uuid[]) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.private_group_read_staff_booking_summaries(uuid,uuid[]) TO authenticated,service_role;
