-- 20261013130000 の戻し: private_group_member_action を 20261013120000（無効な候補日はエラー、失敗時 2 秒待ち）の本文へ戻す

CREATE OR REPLACE FUNCTION public.private_group_member_action(p_group_id uuid, p_member_id uuid, p_action text, p_payload jsonb DEFAULT '{}'::jsonb, p_guest_token text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_row jsonb; v_result uuid; v_message text; v_leaving private_group_members%ROWTYPE; v_name text; v_before integer;
BEGIN
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
    -- 2026-10-13 緊急の手当て: 存在しない候補日を含む保存を即座に再送し続ける端末があり DB が混むため、エラーの前に 2 秒待つ
    PERFORM pg_sleep(2);
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
  SELECT * INTO v_leaving FROM private_group_members WHERE id=p_member_id AND group_id=p_group_id;
  SELECT count(*) INTO v_before FROM private_group_members WHERE group_id=p_group_id AND status='joined';
  v_name:=CASE WHEN v_leaving.user_id IS NULL THEN nullif(btrim(v_leaving.guest_name),'') ELSE coalesce(
    (SELECT coalesce(nullif(c.nickname,''),nullif(c.name,'')) FROM customers c WHERE c.user_id=v_leaving.user_id ORDER BY c.id LIMIT 1),
    nullif(btrim(v_leaving.guest_name),'')) END;
  DELETE FROM private_group_members WHERE id=p_member_id AND group_id=p_group_id;
  -- 申込後・確定後は店舗へ人数変更として知らせる（段階 2 の「外す」と同じ経路）
  IF v_leaving.status='joined' THEN
   PERFORM public.private_group_queue_member_left_notice(p_group_id,v_before,v_before-1,v_name,p_member_id);
  END IF;
  RETURN 'true'::jsonb;
 ELSE RAISE EXCEPTION '未対応の操作です' USING ERRCODE='22023';
 END CASE;
EXCEPTION WHEN OTHERS THEN
  -- 2026-10-13 緊急の手当て: 失敗する要求を即座に再送し続ける端末があり DB が混むため、どの失敗でも 2 秒待ってから返す
  PERFORM pg_sleep(2);
  RAISE;
END;
END $function$

;
