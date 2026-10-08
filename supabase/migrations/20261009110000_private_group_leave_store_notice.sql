-- マイページ改修 段階 3 の積み残し（docs/product-spec/マイページ改修_2026-10.md）
-- 申込後・確定後にメンバー自身が「グループから抜ける」と、店舗へ人数変更として知らせる。
-- 段階 2 の「外す」（private_group_remove_member_with_notice）と同じ経路（discord_notification_queue の private_cancellation）・同じ文面の型。
-- 1. private_group_queue_member_left_notice: 店舗への知らせを 1 行積む内部関数（画面からは呼べない）
-- 2. private_group_leave_with_notice: ログイン中のメンバーが抜ける（既存の private_group_leave で抜け、店舗へ知らせる）
-- 3. private_group_member_action の 'leave'（ゲスト・招待ページの「グループから抜ける」）でも同じ知らせを積む
BEGIN;

CREATE OR REPLACE FUNCTION public.private_group_queue_member_left_notice(p_group_id uuid, p_before integer, p_after integer, p_member_name text, p_member_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE g public.private_groups%ROWTYPE; r public.reservations%ROWTYPE; v_channel text; v_body text;
BEGIN
 SELECT * INTO g FROM public.private_groups WHERE id=p_group_id;
 -- 申込済み・確定後だけ。申込が取り消されていれば知らせない（段階 2 の「外す」と同じ条件）
 IF NOT FOUND OR g.status NOT IN ('booking_requested','confirmed') THEN RETURN false; END IF;
 SELECT * INTO r FROM public.reservations
  WHERE (id=g.reservation_id OR private_group_id=g.id) AND organization_id=g.organization_id AND status<>'cancelled'
  ORDER BY (id=g.reservation_id) DESC, created_at DESC LIMIT 1;
 IF NOT FOUND THEN RETURN false; END IF;
 SELECT nullif(btrim(notification_settings->>'private_cancellation_channel_id'),'')
  INTO v_channel FROM public.organization_settings WHERE organization_id=g.organization_id;
 IF v_channel IS NULL OR v_channel !~ '^[0-9]{17,20}$' THEN RETURN false; END IF;
 v_body:=format('貸切グループのメンバーが抜けました（人数変更）。%s作品：%s%s予約番号：%s%s状態：%s%s参加人数：%s名 → %s名（申込時 %s名）%s抜けた方：%s',
  chr(10), coalesce(nullif(regexp_replace(coalesce(r.title,''),'^【貸切希望】|^【貸切】',''),''),'不明'),
  chr(10), coalesce(r.reservation_number,'不明'),
  chr(10), CASE WHEN g.status='confirmed' THEN '確定済み' ELSE '申込中（店舗の確認待ち）' END,
  chr(10), p_before, greatest(p_after,0), coalesce(r.participant_count::text,'不明'),
  chr(10), coalesce(nullif(btrim(p_member_name),''),'メンバー'));
 INSERT INTO public.discord_notification_queue
  (organization_id,notification_type,reference_id,dedupe_key,webhook_url,message_payload,max_retries)
 VALUES (g.organization_id,'private_cancellation',NULL,
  r.id::text||':member_left:'||p_member_id::text,
  'https://discord.com/api/v10/channels/'||v_channel||'/messages',
  jsonb_build_object('content',v_body,'channel_id',v_channel,'reservation_id',r.id,'epoch',r.id,
   'allowed_mentions',jsonb_build_object('parse','[]'::jsonb)),3)
 ON CONFLICT (organization_id,notification_type,dedupe_key) DO NOTHING;
 RETURN true;
END $function$;
REVOKE ALL ON FUNCTION public.private_group_queue_member_left_notice(uuid,integer,integer,text,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.private_group_queue_member_left_notice(uuid,integer,integer,text,uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.private_group_leave_with_notice(p_group_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE me public.private_group_members%ROWTYPE; v_name text; v_before integer; v_after integer; v_store boolean:=false;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'ログインが必要です' USING ERRCODE='42501'; END IF;
 PERFORM 1 FROM public.private_groups WHERE id=p_group_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'グループから退出できません' USING ERRCODE='42501'; END IF;
 SELECT * INTO me FROM public.private_group_members
  WHERE group_id=p_group_id AND user_id=auth.uid() AND status='joined' ORDER BY id LIMIT 1;
 SELECT count(*) INTO v_before FROM public.private_group_members WHERE group_id=p_group_id AND status='joined';
 v_name:=coalesce((SELECT coalesce(nullif(c.nickname,''),nullif(c.name,'')) FROM public.customers c WHERE c.user_id=auth.uid() ORDER BY c.id LIMIT 1),
  nullif(btrim(me.guest_name),''));
 -- 権限確認（主催者は抜けられない）・クーポン解放・削除は既存の関数に任せる
 PERFORM public.private_group_leave(p_group_id);
 SELECT count(*) INTO v_after FROM public.private_group_members WHERE group_id=p_group_id AND status='joined';
 IF me.id IS NOT NULL AND v_after<v_before THEN
  v_store:=public.private_group_queue_member_left_notice(p_group_id,v_before,v_after,v_name,me.id);
 END IF;
 RETURN jsonb_build_object('store_notified',v_store);
END $function$;
REVOKE ALL ON FUNCTION public.private_group_leave_with_notice(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.private_group_leave_with_notice(uuid) TO authenticated,service_role;

CREATE OR REPLACE FUNCTION public.private_group_member_action(p_group_id uuid, p_member_id uuid, p_action text, p_payload jsonb DEFAULT '{}'::jsonb, p_guest_token text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_row jsonb; v_result uuid; v_message text; v_leaving private_group_members%ROWTYPE; v_name text; v_before integer;
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
END $function$;

COMMIT;
