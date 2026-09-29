CREATE OR REPLACE FUNCTION public.get_private_group_survey_deliveries(p_group_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE g public.private_groups%ROWTYPE; history jsonb;
BEGIN
 SELECT * INTO g FROM public.private_groups WHERE id=p_group_id;
 IF auth.uid() IS NULL OR NOT FOUND OR NOT coalesce((public.is_org_admin() AND public.get_user_organization_id()=g.organization_id)
  OR EXISTS(SELECT 1 FROM public.staff s WHERE s.user_id=auth.uid() AND s.organization_id=g.organization_id AND s.status='active'),false) THEN
  RAISE EXCEPTION '通知履歴を表示する権限がありません' USING ERRCODE='42501';
 END IF;
 SELECT coalesce(jsonb_agg(to_jsonb(d) ORDER BY d.created_at DESC,d.id),'[]'::jsonb) INTO history FROM (
  SELECT id,status,source,created_at,last_error FROM public.private_group_survey_deliveries
  WHERE group_id=g.id AND organization_id=g.organization_id AND reservation_id=g.reservation_id
  ORDER BY created_at DESC,id LIMIT 10
 ) d;
 RETURN jsonb_build_object('reservation_id',g.reservation_id,'deliveries',history,
 'has_unresolved',EXISTS(SELECT 1 FROM public.private_group_survey_deliveries d JOIN public.reservations r ON r.id=g.reservation_id
  WHERE d.group_id=g.id AND d.organization_id=g.organization_id AND d.reservation_id=g.reservation_id
   AND d.schedule_event_id=r.schedule_event_id AND d.status IN ('pending','sending','uncertain')));
END $$;
REVOKE ALL ON FUNCTION public.get_private_group_survey_deliveries(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_private_group_survey_deliveries(uuid) TO authenticated,service_role;
