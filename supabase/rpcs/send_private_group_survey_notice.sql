-- 手動再案内。本文/宛先はクライアントから受け取らず、現在の同組織予約から固定。
CREATE OR REPLACE FUNCTION public.send_private_group_survey_notice(
 p_group_id uuid,p_request_id uuid,p_expected_reservation_id uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE
 g public.private_groups%ROWTYPE; r public.reservations%ROWTYPE; e record;
 receipt public.private_group_survey_deliveries%ROWTYPE;
 survey jsonb; body text; action text; deadline_text text:=''; author_member uuid; notice_id uuid;
 recipient text; recipient_name text; target_org_id uuid;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'ログインしてください' USING ERRCODE='42501'; END IF;
 IF p_request_id IS NULL OR p_expected_reservation_id IS NULL THEN RAISE EXCEPTION '通知対象を確認してください' USING ERRCODE='22023'; END IF;
 SELECT * INTO g FROM public.private_groups WHERE id=p_group_id;
 IF NOT FOUND THEN RAISE EXCEPTION '通知する権限がありません' USING ERRCODE='42501'; END IF;
 target_org_id:=g.organization_id;
 IF NOT coalesce((public.is_org_admin() AND public.get_user_organization_id()=g.organization_id)
  OR EXISTS(SELECT 1 FROM public.staff s WHERE s.user_id=auth.uid() AND s.organization_id=g.organization_id AND s.status='active'),false) THEN
  RAISE EXCEPTION '通知する権限がありません' USING ERRCODE='42501';
 END IF;
 -- 承認と同じ予約→グループの順でロックする。参照変更は後から再照合。
 SELECT * INTO r FROM public.reservations WHERE id=p_expected_reservation_id AND reservations.organization_id=g.organization_id FOR UPDATE NOWAIT;
 SELECT * INTO g FROM public.private_groups WHERE id=p_group_id AND private_groups.organization_id=target_org_id FOR UPDATE NOWAIT;
 IF NOT FOUND THEN RAISE EXCEPTION '通知対象が変更されています' USING ERRCODE='40001'; END IF;
 SELECT * INTO receipt FROM public.private_group_survey_deliveries WHERE id=p_request_id;
 IF FOUND THEN
  IF receipt.organization_id IS DISTINCT FROM g.organization_id OR receipt.group_id IS DISTINCT FROM g.id
   OR receipt.actor_id IS DISTINCT FROM auth.uid() OR receipt.reservation_id IS DISTINCT FROM p_expected_reservation_id OR receipt.source<>'manual' THEN
   RAISE EXCEPTION '同じ送信番号で別の通知は保存できません' USING ERRCODE='22023';
  END IF;
  RETURN jsonb_build_object('success',true,'delivery_id',receipt.id,'status',receipt.status,'replayed',true);
 END IF;
 IF g.reservation_id IS DISTINCT FROM p_expected_reservation_id OR r.id IS NULL OR r.private_group_id IS DISTINCT FROM g.id
  OR g.status IS DISTINCT FROM 'confirmed' OR r.status NOT IN ('confirmed','gm_confirmed','checked_in','completed') OR r.status IS NULL THEN
  RAISE EXCEPTION '確定済みの現在の予約だけに通知できます。画面を更新してください' USING ERRCODE='22023';
 END IF;
 SELECT * INTO e FROM public.schedule_events WHERE id=r.schedule_event_id AND schedule_events.organization_id=g.organization_id FOR SHARE NOWAIT;
 IF NOT FOUND OR e.is_cancelled IS DISTINCT FROM false THEN RAISE EXCEPTION '公演が変更または中止されています' USING ERRCODE='22023'; END IF;
 IF EXISTS(SELECT 1 FROM public.private_group_survey_deliveries d WHERE d.group_id=g.id AND d.organization_id=g.organization_id
  AND d.reservation_id=r.id AND d.schedule_event_id=e.id AND d.status IN ('pending','sending','uncertain')) THEN
  RAISE EXCEPTION '送信待ち、または送信結果の確認が必要な案内があります。通知履歴を確認してください' USING ERRCODE='55000';
 END IF;
 survey:=public.freeze_private_group_survey_deadline(g.organization_id,g.id);
 IF survey->>'error' IS NOT NULL OR NOT coalesce((survey->>'survey_enabled')::boolean,false) THEN
  RAISE EXCEPTION 'この公演ではアンケートを案内できません' USING ERRCODE='22023';
 END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(coalesce(survey->'characters','[]')) c WHERE NOT coalesce((c->>'is_npc')::boolean,false))
  AND nullif(survey->>'survey_url','') IS NULL THEN
  action:='pre_reading_notice';
  SELECT nullif(pre_reading_notice_message,'') INTO body FROM public.global_settings WHERE global_settings.organization_id=g.organization_id;
  body:=coalesce(body,E'【ご確認ください】\n\nこのシナリオには事前配役アンケートがございます。\n\n公演日までに参加者全員がこのグループに参加している必要があります。まだ参加されていない方がいらっしゃいましたら、招待リンクを共有してグループへの参加をお願いいたします。\n\nご不明点がございましたら、店舗までお問い合わせください。');
 ELSE
  action:='survey_notice';
  IF survey->>'survey_deadline_at' IS NOT NULL THEN deadline_text:=E'\n\n回答期限: '||to_char((survey->>'survey_deadline_at')::timestamptz AT TIME ZONE 'Asia/Tokyo','FMMM/FMDD')||'まで'; END IF;
  body:=E'【事前配役アンケートのご協力のお願い】\n\nこちらの公演では事前配役アンケートへのご回答をお願いしております。\n\n'||
   CASE WHEN nullif(survey->>'survey_url','') IS NOT NULL THEN E'次のURLからアンケートにお答えください。\n'||(survey->>'survey_url')
   ELSE '上記の「日程を確認・回答する」ボタンからアンケートにお答えください。' END||deadline_text||E'\n\nご不明点がございましたら、お気軽にお問い合わせください。';
 END IF;
 recipient:=nullif(btrim(r.customer_email),''); recipient_name:=coalesce(nullif(r.customer_name,''),'お客様');
 IF recipient IS NULL AND r.customer_id IS NOT NULL THEN
  SELECT nullif(btrim(c.email),''),coalesce(nullif(c.name,''),recipient_name) INTO recipient,recipient_name FROM public.customers c
   WHERE c.id=r.customer_id AND (c.organization_id=g.organization_id OR c.organization_id IS NULL);
 END IF;
 SELECT m.id INTO author_member FROM public.private_group_members m WHERE m.group_id=g.id AND m.user_id=auth.uid() AND m.status='joined' ORDER BY m.id LIMIT 1;
 INSERT INTO public.private_group_messages(group_id,member_id,message) VALUES(g.id,author_member,jsonb_build_object('type','system','action',action,'message',body)::text) RETURNING id INTO notice_id;
 INSERT INTO public.private_group_survey_deliveries(id,organization_id,group_id,reservation_id,schedule_event_id,actor_id,source,message_id,customer_email,customer_name,subject,message_body)
 VALUES(p_request_id,g.organization_id,g.id,r.id,e.id,auth.uid(),'manual',notice_id,recipient,coalesce(recipient_name,'お客様'),'【事前配役アンケートのご案内】',body);
 RETURN jsonb_build_object('success',true,'delivery_id',p_request_id,'status','pending','replayed',false);
END $$;
REVOKE ALL ON FUNCTION public.send_private_group_survey_notice(uuid,uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.send_private_group_survey_notice(uuid,uuid,uuid) TO authenticated,service_role;
