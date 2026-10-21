-- 正本: migration 20261005120000（事前配役アンケートの画面の状態の記録）
CREATE OR REPLACE FUNCTION public.record_private_group_survey_event(p_group_id uuid, p_member_id uuid, p_guest_token text, p_event text, p_detail jsonb DEFAULT '{}'::jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 PERFORM public.require_private_group_member(p_group_id, p_member_id, p_guest_token);
 IF p_event IS NULL OR p_event NOT IN ('open','loaded','load_error','layout','submit','submitted','submit_error','js_error') THEN
  RAISE EXCEPTION '記録の種類が正しくありません' USING ERRCODE='22023';
 END IF;
 IF p_detail IS NULL OR jsonb_typeof(p_detail)<>'object' OR octet_length(p_detail::text)>4000 THEN
  RAISE EXCEPTION '記録の内容が正しくありません' USING ERRCODE='22023';
 END IF;
 -- 1 人 1 日 300 件まで。超えた分は黙って捨てる（画面の動きは止めない）。
 IF (SELECT count(*) FROM public.private_group_survey_client_events WHERE member_id=p_member_id AND created_at>clock_timestamp()-interval '1 day')>=300 THEN
  RETURN;
 END IF;
 INSERT INTO public.private_group_survey_client_events(group_id, member_id, event, detail) VALUES (p_group_id, p_member_id, p_event, p_detail);
 DELETE FROM public.private_group_survey_client_events WHERE created_at<clock_timestamp()-interval '60 days';
END $$;
REVOKE ALL ON FUNCTION public.record_private_group_survey_event(uuid,uuid,text,text,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_private_group_survey_event(uuid,uuid,text,text,jsonb) TO anon, authenticated, service_role;
