-- The existing approval owns authorization, scheduling and lock order. Any failure
-- below rolls its changes back together with the group notices.
CREATE OR REPLACE FUNCTION public.approve_private_booking_with_notice(
 p_reservation_id uuid,p_selected_date date,p_selected_start_time time,p_selected_end_time time,
 p_selected_store_id uuid,p_selected_gm_id uuid,p_candidate_datetimes jsonb,p_scenario_title text,
 p_customer_name text,p_selected_sub_gm_id uuid DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public SET row_security=off AS $$
DECLARE event_id uuid; r record; g record; e record; settings record;
 member_id uuid; survey jsonb; survey_message text; survey_action text; deadline_text text := '';
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
     jsonb_build_object('type','system','action',survey_action,'message',survey_message)::text);
 END IF;
 RETURN jsonb_build_object('schedule_event_id',event_id,'survey_notice',survey_message);
END $$;
REVOKE ALL ON FUNCTION public.approve_private_booking_with_notice(uuid,date,time,time,uuid,uuid,jsonb,text,text,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.approve_private_booking_with_notice(uuid,date,time,time,uuid,uuid,jsonb,text,text,uuid) TO authenticated,service_role;
