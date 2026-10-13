-- 2026-10-13 恒久対応 2: 貸切グループの日程回答で、古い内容を無視して「保存できました」と返す
--
-- 事象: 古い版の画面を開いたままの端末が、取り下げ済み／存在しない候補日を含む日程回答を
--       private_group_member_action(p_action='date_responses') へ即座に再送し続け、DB が混んだ
--       （20261013120000 で失敗時に 2 秒待つ止血を入れ済み）。
-- 変更: 'date_responses' の配列の各要素のうち、候補日がそのグループに無い・取り下げ済み（withdrawn_at IS NOT NULL）・
--       不採用（status='rejected'）・回答値が不正・形が不正なものはエラーにせず飛ばし、有効なものだけ保存する。
--       全部飛ばした場合も 'true' を返す。配列でない／100 件超は従来どおりエラー。
--       それ以外（2 秒待ちの止血を含む）は 20261013120000 の本文のまま。
--       トリガー guard_withdrawn_private_group_response は変えない（到達した場合は従来どおり拒否＝安全側）。
-- 恒久対応 4（失敗の回数制限）は DB ではなく API 層と画面側で行う（DB 内では失敗した取引ごと数が巻き戻り、
--       dblink の自己接続も Supabase ではパスワード無しで動かないため。docs/IMPROVEMENT_HANDOFF.md 参照）。
-- 戻し方: supabase/rollbacks/ の同名ファイル（20261013120000 の本文）。

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
  -- 2026-10-13 恒久対応: 古い版の画面が、取り下げ済み・存在しない候補日を含む内容を即座に再送し続けた。
  -- 無効な要素（別グループ・存在しない・取り下げ済み・不採用の候補日、不正な回答値）はエラーにせず飛ばし、
  -- 有効なものだけ保存して成功を返す（全部飛ばした場合も成功）。配列でない／100 件超は従来どおりエラー。
  FOR v_row IN SELECT value FROM jsonb_array_elements(p_payload) LOOP
   CONTINUE WHEN jsonb_typeof(v_row) IS DISTINCT FROM 'object';
   CONTINUE WHEN coalesce(v_row->>'response','') NOT IN ('ok','ng','maybe');
   CONTINUE WHEN coalesce(v_row->>'candidateDateId','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
   CONTINUE WHEN NOT EXISTS(SELECT 1 FROM private_group_candidate_dates WHERE id=(v_row->>'candidateDateId')::uuid AND group_id=p_group_id
     AND withdrawn_at IS NULL AND coalesce(status,'active')<>'rejected');
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
