-- 20261009110000 の取り消し: 抜けたときの店舗への知らせを外し、private_group_member_action を直前へ戻す
BEGIN;
DROP FUNCTION IF EXISTS public.private_group_leave_with_notice(uuid);

CREATE OR REPLACE FUNCTION public.private_group_member_action(p_group_id uuid, p_member_id uuid, p_action text, p_payload jsonb DEFAULT '{}'::jsonb, p_guest_token text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_row jsonb; v_result uuid; v_message text;
BEGIN
 -- Lock the group before the member, consistently with join and future membership guards.
 PERFORM 1 FROM private_groups WHERE id=p_group_id FOR UPDATE;
 PERFORM public.require_private_group_member(p_group_id,p_member_id,p_guest_token);
 IF p_payload IS NULL OR octet_length(p_payload::text)>65536 THEN RAISE EXCEPTION '入力が長すぎます' USING ERRCODE='22023'; END IF;
 CASE p_action
 WHEN 'validate' THEN RETURN jsonb_build_object('valid',true);
 WHEN 'date_responses' THEN
  IF jsonb_typeof(p_payload)<>'array' OR jsonb_array_length(p_payload)>100 THEN RAISE EXCEPTION '日程回答が不正です' USING ERRCODE='22023'; END IF;
  FOR v_row IN SELECT value FROM jsonb_array_elements(p_payload) LOOP
   IF coalesce(v_row->>'response','') NOT IN ('ok','ng','maybe') OR NOT EXISTS(SELECT 1 FROM private_group_candidate_dates WHERE id=(v_row->>'candidateDateId')::uuid AND group_id=p_group_id) THEN
    RAISE EXCEPTION '回答対象の日程が見つかりません' USING ERRCODE='22023';
   END IF;
   INSERT INTO private_group_date_responses(group_id,member_id,candidate_date_id,response)
   VALUES(p_group_id,p_member_id,(v_row->>'candidateDateId')::uuid,v_row->>'response')
   ON CONFLICT(member_id,candidate_date_id) DO UPDATE SET response=EXCLUDED.response,updated_at=clock_timestamp();
  END LOOP;
  RETURN 'true'::jsonb;
 WHEN 'message' THEN
  v_message:=trim(p_payload->>'message');
  IF v_message IS NULL OR length(v_message)=0 OR length(v_message)>5000 THEN RAISE EXCEPTION 'メッセージは1〜5000文字で入力してください' USING ERRCODE='22023'; END IF;
  -- Guest/member messages are plain text, never impersonated system announcements.
  IF v_message ~ '^\s*\{' THEN
   BEGIN
    IF (v_message::jsonb)->>'type'='system' THEN RAISE EXCEPTION 'システム通知として送信できません' USING ERRCODE='42501'; END IF;
   EXCEPTION WHEN invalid_text_representation THEN NULL;
   END;
  END IF;
  INSERT INTO private_group_messages(group_id,member_id,message) VALUES(p_group_id,p_member_id,v_message) RETURNING id INTO v_result;
  RETURN to_jsonb(v_result);
 WHEN 'survey_read' THEN RETURN public.get_survey_data_for_member(p_group_id,p_member_id);
 WHEN 'survey_write' THEN
  IF jsonb_typeof(p_payload)<>'object' THEN RAISE EXCEPTION 'アンケート回答が不正です' USING ERRCODE='22023'; END IF;
  RETURN to_jsonb(public.upsert_survey_response_for_member(p_group_id,p_member_id,p_payload));
 WHEN 'character_preference' THEN
  IF length(coalesce(p_payload->>'characterId',''))>200 THEN RAISE EXCEPTION '配役希望が不正です' USING ERRCODE='22023'; END IF;
  PERFORM public.set_character_preference(p_group_id,p_member_id::text,p_payload->>'characterId');
  RETURN 'true'::jsonb;
 WHEN 'leave' THEN
  IF EXISTS(SELECT 1 FROM private_group_members WHERE id=p_member_id AND is_organizer) THEN RAISE EXCEPTION '主催者は退出できません' USING ERRCODE='42501'; END IF;
  DELETE FROM private_group_members WHERE id=p_member_id AND group_id=p_group_id;
  RETURN 'true'::jsonb;
 ELSE RAISE EXCEPTION '未対応の操作です' USING ERRCODE='22023';
 END CASE;
END $function$

;
DROP FUNCTION IF EXISTS public.private_group_queue_member_left_notice(uuid,integer,integer,text,uuid);
COMMIT;
