-- DB first; deploy the delivery worker and cron before switching browser callers.
-- 案内の保存・再送番号・配送結果を保持。クライアントから直接操作させない。
CREATE TABLE IF NOT EXISTS public.private_group_survey_deliveries (
 id uuid PRIMARY KEY,
 organization_id uuid NOT NULL,
 group_id uuid NOT NULL,
 reservation_id uuid NOT NULL,
 schedule_event_id uuid NOT NULL,
 actor_id uuid NOT NULL,
 source text NOT NULL CHECK(source IN ('manual','approval')),
 message_id uuid NOT NULL,
 customer_email text,
 customer_name text NOT NULL,
 subject text NOT NULL,
 message_body text NOT NULL CHECK(length(btrim(message_body))>0 AND length(message_body)<=20000),
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','sending','sent','failed','uncertain','superseded')),
 attempt_count integer NOT NULL DEFAULT 0 CHECK(attempt_count>=0),
 next_attempt_at timestamptz NOT NULL DEFAULT now(),
 first_attempt_at timestamptz,
 lease_until timestamptz,
 lease_token uuid,
 provider_payload jsonb CHECK(provider_payload IS NULL OR jsonb_typeof(provider_payload)='object'),
 provider_account_hash text,
 provider_message_id text,
 email_log_id uuid,
 last_error text,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS private_group_survey_deliveries_pending_idx ON public.private_group_survey_deliveries(next_attempt_at) WHERE status IN ('pending','sending');
CREATE INDEX IF NOT EXISTS private_group_survey_deliveries_group_idx ON public.private_group_survey_deliveries(group_id,created_at DESC);
ALTER TABLE public.private_group_survey_deliveries ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.private_group_survey_deliveries FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT,UPDATE ON public.private_group_survey_deliveries TO service_role;
COMMENT ON TABLE public.private_group_survey_deliveries IS '事前配役アンケートの案内と配送記録。削除連動せず履歴を保持。要求番号の再試行と明示的再案内を区別する。';

-- 通信再試行は同じ承認結果を返し、明示的な再承認だけを新規要求で行う。
CREATE TABLE IF NOT EXISTS public.private_booking_approval_requests (
 id uuid PRIMARY KEY,
 organization_id uuid NOT NULL,
 reservation_id uuid NOT NULL,
 actor_id uuid NOT NULL,
 request_payload jsonb NOT NULL CHECK(jsonb_typeof(request_payload)='object'),
 result jsonb NOT NULL CHECK(jsonb_typeof(result)='object'),
 created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.private_booking_approval_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.private_booking_approval_requests FROM PUBLIC,anon,authenticated,service_role;
COMMENT ON TABLE public.private_booking_approval_requests IS '貸切承認の再試行結果。同じ要求IDによる公演再作成・通知重複を防ぐ。';

-- 内部専用。スタッフAPIは認証済み組織、参加者RPCは所属確認済みグループの組織を渡す。
CREATE OR REPLACE FUNCTION public.get_private_group_survey_settings(p_organization_id uuid,p_group_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE g record; sc record; r record; result jsonb; k text; deadline timestamptz; resolved_scenario uuid;
BEGIN
 SELECT * INTO g FROM private_groups WHERE id=p_group_id AND organization_id=p_organization_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'group not found' USING ERRCODE='42501'; END IF;
 SELECT id,characters INTO sc FROM organization_scenarios
 WHERE organization_id=p_organization_id AND (scenario_master_id=g.scenario_master_id OR id=g.scenario_master_id)
 ORDER BY (scenario_master_id=g.scenario_master_id) DESC LIMIT 1;
 IF NOT FOUND THEN RETURN jsonb_build_object('error','scenario_not_found','survey_enabled',false); END IF;
 SELECT CASE WHEN booking.schedule_event_id IS NOT NULL THEN e.store_id ELSE booking.store_id END AS store_id,booking.schedule_event_id,e.date AS performance_date,e.organization_scenario_id,COALESCE(e.scenario_master_id,e.scenario_id) AS event_master_id INTO r FROM reservations booking
 LEFT JOIN schedule_events e ON e.id=booking.schedule_event_id AND e.organization_id=booking.organization_id
 WHERE ((g.reservation_id IS NOT NULL AND booking.id=g.reservation_id AND booking.private_group_id=p_group_id)
     OR (g.reservation_id IS NULL AND booking.private_group_id=p_group_id)) AND booking.organization_id=p_organization_id
   AND booking.status IN ('confirmed','gm_confirmed','checked_in','completed')
 ORDER BY booking.created_at DESC,booking.id LIMIT 1;
 resolved_scenario:=sc.id;
 IF r.schedule_event_id IS NOT NULL THEN
   resolved_scenario:=r.organization_scenario_id;
   IF resolved_scenario IS NULL AND r.event_master_id IS NOT NULL THEN
     SELECT id INTO resolved_scenario FROM organization_scenarios WHERE organization_id=p_organization_id AND scenario_master_id=r.event_master_id;
   END IF;
   IF resolved_scenario IS NOT NULL THEN
     SELECT id,characters INTO sc FROM organization_scenarios WHERE id=resolved_scenario AND organization_id=p_organization_id;
   END IF;
 END IF;
 result:=jsonb_build_object('org_scenario_id',sc.id,'characters',COALESCE(sc.characters,'[]'::jsonb));
 FOREACH k IN ARRAY ARRAY['survey_enabled','survey_deadline_days','survey_url'] LOOP
   result:=result||jsonb_build_object(k,public.resolve_operating_setting(p_organization_id,k,'null'::jsonb,r.store_id,resolved_scenario,r.schedule_event_id)->'value');
 END LOOP;
 SELECT deadline_at INTO deadline FROM private_group_survey_deadlines WHERE group_id=p_group_id AND organization_id=p_organization_id;
 IF deadline IS NULL AND r.performance_date IS NOT NULL THEN
   SELECT public.parse_announced_survey_deadline(m.message,r.performance_date) INTO deadline
   FROM private_group_messages m WHERE m.group_id=p_group_id
     AND (m.message ~ '"action"[[:space:]]*:[[:space:]]*"(survey_notice|pre_reading_notice)"')
     AND public.parse_announced_survey_deadline(m.message,r.performance_date) IS NOT NULL
   ORDER BY m.created_at,m.id LIMIT 1;
 END IF;
 IF deadline IS NULL AND r.performance_date IS NOT NULL THEN
   deadline:=((r.performance_date-(result->>'survey_deadline_days')::integer)+time '23:59:59.999') AT TIME ZONE 'Asia/Tokyo';
 END IF;
 RETURN result||jsonb_build_object('survey_deadline_at',deadline);
END $$;
REVOKE ALL ON FUNCTION public.get_private_group_survey_settings(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.get_private_group_survey_settings(uuid,uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.get_private_groups_survey_settings(p_organization_id uuid,p_group_ids uuid[])
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF cardinality(p_group_ids)>100 OR EXISTS(SELECT 1 FROM unnest(p_group_ids) AS requested(group_id)
   WHERE NOT EXISTS(SELECT 1 FROM private_groups g WHERE g.id=requested.group_id AND g.organization_id=p_organization_id)) THEN
   RAISE EXCEPTION 'group not found' USING ERRCODE='42501';
 END IF;
 RETURN COALESCE((SELECT jsonb_object_agg(id,public.get_private_group_survey_settings(p_organization_id,id)) FROM unnest(p_group_ids) id),'{}'::jsonb);
END $$;
REVOKE ALL ON FUNCTION public.get_private_groups_survey_settings(uuid,uuid[]) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.get_private_groups_survey_settings(uuid,uuid[]) TO service_role;

-- The existing approval owns authorization, scheduling and lock order. Any failure
-- below rolls its changes back together with the group notices.
CREATE OR REPLACE FUNCTION public.approve_private_booking_with_notice(
 p_reservation_id uuid,p_selected_date date,p_selected_start_time time,p_selected_end_time time,
 p_selected_store_id uuid,p_selected_gm_id uuid,p_candidate_datetimes jsonb,p_scenario_title text,
 p_customer_name text,p_selected_sub_gm_id uuid DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public SET row_security=off AS $$
DECLARE event_id uuid; r record; g record; e record; settings record;
 member_id uuid; survey_message_id uuid; survey jsonb; survey_message text; survey_action text; deadline_text text := '';
BEGIN
 event_id:=public.approve_private_booking(p_reservation_id,p_selected_date,p_selected_start_time,
 p_selected_end_time,p_selected_store_id,p_selected_gm_id,p_candidate_datetimes,
 p_scenario_title,p_customer_name,p_selected_sub_gm_id);
 SELECT * INTO STRICT r FROM reservations WHERE id=p_reservation_id;
 IF r.private_group_id IS NULL THEN
   RETURN jsonb_build_object('schedule_event_id',event_id,'survey_notice',NULL);
 END IF;
 SELECT * INTO g FROM private_groups WHERE id=r.private_group_id AND organization_id=r.organization_id FOR UPDATE;
 IF NOT FOUND THEN
   RAISE EXCEPTION 'PRIVATE_GROUP_ORGANIZATION_MISMATCH' USING ERRCODE='P0050';
 END IF;
 IF g.reservation_id IS DISTINCT FROM r.id THEN
   RAISE EXCEPTION 'PRIVATE_GROUP_RESERVATION_MISMATCH' USING ERRCODE='P0051';
 END IF;
 SELECT se.*,s.name AS store_name INTO STRICT e FROM schedule_events se
 JOIN stores s ON s.id=se.store_id AND s.organization_id=se.organization_id
 WHERE se.id=event_id AND se.organization_id=r.organization_id;
 SELECT system_msg_schedule_confirmed_title,system_msg_schedule_confirmed_body,pre_reading_notice_message
 INTO settings FROM global_settings WHERE organization_id=r.organization_id;
 SELECT m.id INTO member_id FROM private_group_members m
 WHERE m.group_id=g.id AND m.is_organizer AND m.user_id=g.organizer_id ORDER BY m.id LIMIT 1;
 INSERT INTO private_group_messages(group_id,member_id,message) VALUES(g.id,member_id,
 jsonb_build_object('type','system','action','schedule_confirmed','confirmedDate',e.date,
 'confirmedTimeSlot',COALESCE(NULLIF(e.time_slot,''),to_char(e.start_time,'HH24:MI')||'〜'||to_char(e.end_time,'HH24:MI')),
 'storeName',e.store_name,'title',COALESCE(NULLIF(settings.system_msg_schedule_confirmed_title,''),'日程が確定いたしました'),
 'body',COALESCE(NULLIF(settings.system_msg_schedule_confirmed_body,''),'ご予約ありがとうございます。当日のご来店をお待ちしております。'))::text);
 survey:=public.freeze_private_group_survey_deadline(r.organization_id,g.id);
 IF survey->>'error' IS NOT NULL THEN
   RAISE EXCEPTION 'PRIVATE_GROUP_SURVEY_CONFIGURATION_INVALID' USING ERRCODE='P0052';
 END IF;
 IF COALESCE((survey->>'survey_enabled')::boolean,false) THEN
   IF EXISTS(SELECT 1 FROM jsonb_array_elements(COALESCE(survey->'characters','[]'::jsonb)) c
             WHERE NOT COALESCE((c->>'is_npc')::boolean,false)) AND NULLIF(survey->>'survey_url','') IS NULL THEN
     survey_action:='pre_reading_notice';
     survey_message:=COALESCE(NULLIF(settings.pre_reading_notice_message,''),E'【ご確認ください】\n\nこのシナリオには事前配役アンケートがございます。\n\n公演日までに参加者全員がこのグループに参加している必要があります。まだ参加されていない方がいらっしゃいましたら、招待リンクを共有してグループへの参加をお願いいたします。\n\nご不明点がございましたら、店舗までお問い合わせください。');
   ELSE
     survey_action:='survey_notice';
     IF survey->>'survey_deadline_at' IS NOT NULL THEN
       deadline_text:=E'\n\n回答期限: '||to_char((survey->>'survey_deadline_at')::timestamptz AT TIME ZONE 'Asia/Tokyo','FMMM/FMDD')||'まで';
     END IF;
     survey_message:=E'【事前配役アンケートのご協力のお願い】\n\nこちらの公演では事前配役アンケートへのご回答をお願いしております。\n\n'||
       CASE WHEN NULLIF(survey->>'survey_url','') IS NOT NULL THEN E'次のURLからアンケートにお答えください。\n'||(survey->>'survey_url')
       ELSE '上記の「日程を確認・回答する」ボタンからアンケートにお答えください。' END||deadline_text||E'\n\nご不明点がございましたら、お気軽にお問い合わせください。';
   END IF;
   INSERT INTO private_group_messages(group_id,member_id,message) VALUES(g.id,member_id,
     jsonb_build_object('type','system','action',survey_action,'message',survey_message)::text) RETURNING id INTO survey_message_id;
 END IF;
 RETURN jsonb_build_object('schedule_event_id',event_id,'survey_notice',survey_message,'survey_message_id',survey_message_id);
END $$;
REVOKE ALL ON FUNCTION public.approve_private_booking_with_notice(uuid,date,time,time,uuid,uuid,jsonb,text,text,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.approve_private_booking_with_notice(uuid,date,time,time,uuid,uuid,jsonb,text,text,uuid) TO authenticated,service_role;

-- service専用。配送の受付結果とメール履歴を同じトランザクションで確定する。
CREATE OR REPLACE FUNCTION public.complete_private_survey_delivery(
 p_delivery_id uuid,p_lease_token uuid,p_provider_id text,p_sent_at timestamptz
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public SET row_security=off AS $$
DECLARE v_delivery public.private_group_survey_deliveries%ROWTYPE;v_log public.email_logs%ROWTYPE;
BEGIN
 IF p_provider_id IS NULL OR length(btrim(p_provider_id))=0 OR p_sent_at IS NULL THEN
  RAISE EXCEPTION 'INVALID_DELIVERY_RECEIPT' USING ERRCODE='22023';
 END IF;
 SELECT * INTO v_delivery FROM public.private_group_survey_deliveries WHERE id=p_delivery_id FOR UPDATE NOWAIT;
 IF NOT FOUND OR v_delivery.status IS DISTINCT FROM 'sending' OR v_delivery.lease_token IS DISTINCT FROM p_lease_token OR p_lease_token IS NULL THEN
  RAISE EXCEPTION 'DELIVERY_LEASE_LOST' USING ERRCODE='40001';
 END IF;
 SELECT * INTO v_log FROM public.email_logs WHERE id=coalesce(v_delivery.email_log_id,v_delivery.id) FOR UPDATE NOWAIT;
 IF NOT FOUND OR v_log.organization_id IS DISTINCT FROM v_delivery.organization_id
   OR v_log.reservation_id IS DISTINCT FROM v_delivery.reservation_id
   OR v_log.to_email IS DISTINCT FROM v_delivery.customer_email
   OR v_log.body_text IS DISTINCT FROM v_delivery.message_body
   OR v_log.email_type IS DISTINCT FROM 'other'
   OR (v_log.provider_message_id IS NOT NULL AND v_log.provider_message_id IS DISTINCT FROM p_provider_id)
 THEN RAISE EXCEPTION 'DELIVERY_LOG_CONFLICT' USING ERRCODE='22023'; END IF;
 UPDATE public.email_logs SET provider_message_id=p_provider_id,sent_at=coalesce(sent_at,p_sent_at),
   status=CASE WHEN status IN ('queued','failed') THEN 'sent' ELSE status END,error_message=NULL
 WHERE id=v_log.id;
 UPDATE public.private_group_survey_deliveries SET status='sent',provider_message_id=p_provider_id,last_error=NULL,
   lease_token=NULL,lease_until=NULL,updated_at=now() WHERE id=v_delivery.id;
 RETURN true;
END; $$;
REVOKE ALL ON FUNCTION public.complete_private_survey_delivery(uuid,uuid,text,timestamptz) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.complete_private_survey_delivery(uuid,uuid,text,timestamptz) TO service_role;

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

CREATE OR REPLACE FUNCTION public.approve_private_booking_with_delivery(
 p_request_id uuid,p_reservation_id uuid,p_selected_date date,p_selected_start_time time,p_selected_end_time time,
 p_selected_store_id uuid,p_selected_gm_id uuid,p_candidate_datetimes jsonb,p_scenario_title text,
 p_customer_name text,p_selected_sub_gm_id uuid DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp SET row_security=off AS $$
DECLARE
 r public.reservations%ROWTYPE; receipt public.private_booking_approval_requests%ROWTYPE;
 payload jsonb; result jsonb; recipient text; recipient_name text; message_id uuid;
BEGIN
 IF auth.uid() IS NULL OR p_request_id IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED' USING ERRCODE='42501'; END IF;
 SELECT * INTO r FROM public.reservations WHERE id=p_reservation_id FOR UPDATE NOWAIT;
 IF NOT FOUND OR public.get_user_organization_id() IS DISTINCT FROM r.organization_id
  OR NOT coalesce(public.is_org_admin() OR EXISTS(SELECT 1 FROM public.staff s WHERE s.user_id=auth.uid() AND s.organization_id=r.organization_id AND s.status='active'),false) THEN
  RAISE EXCEPTION 'UNAUTHORIZED' USING ERRCODE='42501';
 END IF;
 payload:=jsonb_build_object('reservation',p_reservation_id,'date',p_selected_date,'start',p_selected_start_time,'end',p_selected_end_time,
  'store',p_selected_store_id,'gm',p_selected_gm_id,'sub_gm',p_selected_sub_gm_id,'candidates',p_candidate_datetimes,'title',p_scenario_title,'customer_name',p_customer_name);
 SELECT * INTO receipt FROM public.private_booking_approval_requests WHERE id=p_request_id;
 IF FOUND THEN
  IF receipt.organization_id IS DISTINCT FROM r.organization_id OR receipt.reservation_id IS DISTINCT FROM r.id
   OR receipt.actor_id IS DISTINCT FROM auth.uid() OR receipt.request_payload IS DISTINCT FROM payload THEN
   RAISE EXCEPTION 'APPROVAL_REQUEST_CONFLICT' USING ERRCODE='22023';
  END IF;
  RETURN receipt.result||jsonb_build_object('replayed',true);
 END IF;
 result:=public.approve_private_booking_with_notice(p_reservation_id,p_selected_date,p_selected_start_time,
  p_selected_end_time,p_selected_store_id,p_selected_gm_id,p_candidate_datetimes,p_scenario_title,p_customer_name,p_selected_sub_gm_id);
 SELECT * INTO STRICT r FROM public.reservations WHERE id=p_reservation_id;
 message_id:=(result->>'survey_message_id')::uuid;
 IF result->>'survey_notice' IS NOT NULL THEN
  IF message_id IS NULL OR r.private_group_id IS NULL THEN RAISE EXCEPTION 'SURVEY_NOTICE_MISSING' USING ERRCODE='22023'; END IF;
  recipient:=nullif(btrim(r.customer_email),'');recipient_name:=coalesce(nullif(r.customer_name,''),'お客様');
  IF recipient IS NULL AND r.customer_id IS NOT NULL THEN
   SELECT nullif(btrim(c.email),''),coalesce(nullif(c.name,''),recipient_name) INTO recipient,recipient_name FROM public.customers c
    WHERE c.id=r.customer_id AND (c.organization_id=r.organization_id OR c.organization_id IS NULL);
  END IF;
  INSERT INTO public.private_group_survey_deliveries(id,organization_id,group_id,reservation_id,schedule_event_id,actor_id,source,message_id,customer_email,customer_name,subject,message_body)
  VALUES(p_request_id,r.organization_id,r.private_group_id,r.id,(result->>'schedule_event_id')::uuid,auth.uid(),'approval',message_id,recipient,coalesce(recipient_name,'お客様'),'【事前配役アンケートのご案内】',result->>'survey_notice');
  result:=result||jsonb_build_object('survey_delivery_id',p_request_id,'survey_delivery_status','pending');
 END IF;
 -- 旧ブラウザはsurvey_noticeを直接送信するため、新入口では本文を返さない。
 result:=(result-'survey_notice'-'survey_message_id')||jsonb_build_object('replayed',false);
 INSERT INTO public.private_booking_approval_requests(id,organization_id,reservation_id,actor_id,request_payload,result)
 VALUES(p_request_id,r.organization_id,r.id,auth.uid(),payload,result);
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.approve_private_booking_with_delivery(uuid,uuid,date,time,time,uuid,uuid,jsonb,text,text,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.approve_private_booking_with_delivery(uuid,uuid,date,time,time,uuid,uuid,jsonb,text,text,uuid) TO authenticated,service_role;
