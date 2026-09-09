-- 内部通知は顧客情報を含めず、開催・中止と同じ送信先へ積む。
CREATE FUNCTION public.queue_recruitment_operation_alert(p_org uuid,p_event uuid,p_type text,p_key text,p_message text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE channel text;
BEGIN
 SELECT discord_business_channel_id INTO channel FROM organization_settings WHERE organization_id=p_org;
 IF channel IS NULL OR channel !~ '^[0-9]+$' THEN RAISE EXCEPTION '開催・中止通知のDiscord送信先が未設定です'; END IF;
 INSERT INTO discord_notification_queue(organization_id,webhook_url,message_payload,notification_type,reference_id,dedupe_key,max_retries,next_retry_at)
 VALUES(p_org,'https://discord.com/api/v10/channels/'||channel||'/messages',jsonb_build_object('content',p_message||E'\n公演参照: '||p_event::text,'allowed_mentions',jsonb_build_object('parse','[]'::jsonb)),p_type,md5(p_key)::uuid,p_key,10,now()) ON CONFLICT DO NOTHING;
END $$;
REVOKE ALL ON FUNCTION public.queue_recruitment_operation_alert(uuid,uuid,text,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.queue_recruitment_operation_alert(uuid,uuid,text,text,text) TO service_role;

CREATE FUNCTION public.recruitment_event_snapshot(p_org uuid,p_event uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT jsonb_build_object('scenario',e.scenario,'date',e.date,'start_time',e.start_time,'store_name',st.name,
 'deadline',d.deadline,'site_url',p.customer_site_url,'missing_participants',GREATEST(0,
 LEAST(COALESCE(os.override_player_count_min,m.player_count_min,legacy.player_count_min,ceil(COALESCE(os.override_player_count_max,m.player_count_max,e.max_participants,legacy.player_count_max,8)::numeric/2)::int),COALESCE(os.override_player_count_max,m.player_count_max,e.max_participants,legacy.player_count_max,8))
 - COALESCE((SELECT sum(r.participant_count) FROM reservations r WHERE r.schedule_event_id=e.id AND r.organization_id=e.organization_id AND r.status IN ('pending','confirmed','gm_confirmed','checked_in')),0)
 - (SELECT count(*) FROM jsonb_each_text(COALESCE(e.gm_roles,'{}')) staff WHERE staff.value='staff' AND NOT EXISTS(SELECT 1 FROM reservations r WHERE r.schedule_event_id=e.id AND r.organization_id=e.organization_id AND r.status IN ('pending','confirmed','gm_confirmed','checked_in') AND r.reservation_source='staff_entry' AND staff.key=ANY(r.participant_names)))))
 FROM schedule_events e JOIN performance_recruitment_deadlines d ON d.schedule_event_id=e.id AND d.organization_id=e.organization_id
 JOIN performance_recruitment_policies p ON p.organization_id=e.organization_id
 LEFT JOIN LATERAL(SELECT s.* FROM organization_scenarios s WHERE s.organization_id=e.organization_id AND ((e.organization_scenario_id IS NOT NULL AND s.id=e.organization_scenario_id) OR(e.organization_scenario_id IS NULL AND s.scenario_master_id=COALESCE(e.scenario_master_id,e.scenario_id))) LIMIT 1) os ON true
 LEFT JOIN scenario_masters m ON m.id=COALESCE(os.scenario_master_id,e.scenario_master_id)
 LEFT JOIN scenarios legacy ON legacy.id=e.scenario_id LEFT JOIN stores st ON st.id=e.store_id
 WHERE e.id=p_event AND e.organization_id=p_org;
$$;
REVOKE ALL ON FUNCTION public.recruitment_event_snapshot(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.recruitment_event_snapshot(uuid,uuid) TO service_role;

CREATE FUNCTION public.notify_recruitment_shortage() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE d performance_recruitment_deadlines%ROWTYPE; s jsonb;
BEGIN
 -- 公演→予約の既存ロック順を崩さない。辞退RPCは既に公演をロックしている。
 SELECT * INTO d FROM performance_recruitment_deadlines WHERE schedule_event_id=NEW.schedule_event_id AND organization_id=NEW.organization_id AND status='active' AND deadline>now();
 IF NOT FOUND OR d.shortage_alerted_cycle=d.cycle OR EXISTS(SELECT 1 FROM schedule_events WHERE id=NEW.schedule_event_id AND is_cancelled) THEN RETURN NEW; END IF;
 s:=recruitment_event_snapshot(NEW.organization_id,NEW.schedule_event_id);
 IF (s->>'missing_participants')::int>d.max_missing_participants THEN
  PERFORM queue_recruitment_operation_alert(NEW.organization_id,NEW.schedule_event_id,'recruitment_shortage',NEW.schedule_event_id::text||':'||d.cycle,
   '【追加募集：運営確認】不足人数が設定を超えました。あと'||(s->>'missing_participants')||'人です。案内済みの期限まで募集を継続します。'||E'\n'||(s->>'date')||' '||(s->>'start_time')||' '||(s->>'scenario'));
  UPDATE performance_recruitment_deadlines SET shortage_alerted_cycle=d.cycle WHERE schedule_event_id=d.schedule_event_id AND organization_id=d.organization_id;
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.notify_recruitment_shortage() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER notify_recruitment_shortage AFTER UPDATE OF participant_count,status ON public.reservations FOR EACH ROW EXECUTE FUNCTION public.notify_recruitment_shortage();
