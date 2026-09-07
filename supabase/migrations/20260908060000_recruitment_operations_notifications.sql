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

ALTER TABLE public.performance_recruitment_policies ADD COLUMN x_enabled boolean NOT NULL DEFAULT false, ADD COLUMN x_username text;
CREATE TABLE public.recruitment_x_posts (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES organizations(id), schedule_event_id uuid NOT NULL REFERENCES schedule_events(id),
 cycle integer NOT NULL, kind text NOT NULL CHECK(kind IN ('extension','confirmed','cancelled')), snapshot jsonb NOT NULL,
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','sending','sent','failed','uncertain','expired')),
 tweet_id text, post_text text, attempts integer NOT NULL DEFAULT 0, first_failed_at timestamptz, next_attempt_at timestamptz NOT NULL DEFAULT now(),
 lease_until timestamptz, last_error text, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(schedule_event_id,cycle,kind)
);
ALTER TABLE public.recruitment_x_posts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.recruitment_x_posts FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE ON public.recruitment_x_posts TO service_role;

CREATE FUNCTION public.enqueue_recruitment_x_post() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF TG_OP='UPDATE' AND NEW.status=OLD.status AND NEW.cycle=OLD.cycle THEN RETURN NEW; END IF;
 IF NOT EXISTS(SELECT 1 FROM performance_recruitment_policies WHERE organization_id=NEW.organization_id AND one_seat_enabled AND x_enabled AND x_username='queens_waltz') THEN RETURN NEW; END IF;
 INSERT INTO recruitment_x_posts(organization_id,schedule_event_id,cycle,kind,snapshot)
 VALUES(NEW.organization_id,NEW.schedule_event_id,NEW.cycle,CASE NEW.status WHEN 'active' THEN 'extension' ELSE NEW.status END,recruitment_event_snapshot(NEW.organization_id,NEW.schedule_event_id)) ON CONFLICT DO NOTHING;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.enqueue_recruitment_x_post() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER enqueue_recruitment_x_post AFTER INSERT OR UPDATE OF status,cycle ON public.performance_recruitment_deadlines FOR EACH ROW EXECUTE FUNCTION public.enqueue_recruitment_x_post();

CREATE FUNCTION public.claim_recruitment_x_posts(p_org uuid) RETURNS SETOF public.recruitment_x_posts
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 -- 通信結果不明の投稿は再投稿せず、運営へ照合を依頼する。
 UPDATE recruitment_x_posts SET status='uncertain',last_error='送信処理の結果が不明です。X上の投稿を確認してください。',updated_at=now() WHERE organization_id=p_org AND status='sending' AND lease_until<now();
 RETURN QUERY WITH candidates AS(SELECT j.id FROM recruitment_x_posts j JOIN performance_recruitment_policies p ON p.organization_id=j.organization_id
 WHERE j.organization_id=p_org AND p.x_enabled AND p.one_seat_enabled AND p.x_username='queens_waltz' AND j.status IN ('pending','failed') AND j.attempts<10 AND j.next_attempt_at<=now()
 ORDER BY j.created_at,j.kind='extension' DESC LIMIT 5 FOR UPDATE OF j SKIP LOCKED)
 UPDATE recruitment_x_posts j SET status='sending',attempts=attempts+1,lease_until=now()+interval '2 minutes',updated_at=now() FROM candidates c WHERE j.id=c.id RETURNING j.*;
END $$;
REVOKE ALL ON FUNCTION public.claim_recruitment_x_posts(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_recruitment_x_posts(uuid) TO service_role;

CREATE FUNCTION public.alert_recruitment_x_result() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE message text; kind text;
BEGIN
 IF NEW.status IN ('failed','uncertain') THEN
  NEW.first_failed_at:=COALESCE(OLD.first_failed_at,now());
  IF OLD.first_failed_at IS NULL THEN kind:='recruitment_x_failed';message:='【追加募集X告知：送信失敗】'; END IF;
  IF NEW.status='uncertain' OR NEW.attempts>=10 THEN kind:='recruitment_x_attention';message:='【追加募集X告知：運営対応依頼】投稿の有無をXで確認してください。重複防止のため自動再投稿を停止しています。'; END IF;
 ELSIF NEW.status='sent' AND OLD.first_failed_at IS NOT NULL THEN kind:='recruitment_x_recovered';message:='【追加募集X告知：投稿できました】';
 END IF;
 IF kind IS NOT NULL THEN PERFORM queue_recruitment_operation_alert(NEW.organization_id,NEW.schedule_event_id,kind,NEW.id::text,message||E'\n'||COALESCE(NEW.snapshot->>'scenario','')||E'\n通知参照: '||NEW.id::text); END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.alert_recruitment_x_result() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER alert_recruitment_x_result BEFORE UPDATE OF status ON public.recruitment_x_posts FOR EACH ROW EXECUTE FUNCTION public.alert_recruitment_x_result();

-- 有効化した組織だけを毎分判定する。接続先・認証情報は既存の環境別設定を使う。
CREATE OR REPLACE FUNCTION public.dispatch_performance_recruitment_checks() RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE p record; base_url text; cron_key text;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM performance_recruitment_policies WHERE one_seat_enabled) THEN RETURN; END IF;
 SELECT value INTO base_url FROM app_config WHERE key='supabase_url';
 SELECT value INTO cron_key FROM app_config WHERE key='trigger_secret';
 IF base_url IS NULL OR cron_key IS NULL THEN RAISE EXCEPTION '募集判定の接続設定がありません'; END IF;
 FOR p IN SELECT organization_id FROM performance_recruitment_policies pol WHERE one_seat_enabled
   AND (EXISTS(SELECT 1 FROM schedule_events e WHERE e.organization_id=pol.organization_id
     AND NOT e.is_cancelled AND e.category='open'
     AND (e.date+e.start_time) AT TIME ZONE 'Asia/Tokyo' <= now()+interval '4 hours'
     AND ((e.date+e.start_time) AT TIME ZONE 'Asia/Tokyo'>now()
       OR EXISTS(SELECT 1 FROM performance_recruitment_deadlines d WHERE d.schedule_event_id=e.id AND d.status='active')))
     OR EXISTS(SELECT 1 FROM performance_recruitment_notices n WHERE n.organization_id=pol.organization_id
       AND n.kind<>'extension' AND n.status IN ('pending','failed','sending') AND n.attempts<10 AND n.created_at>now()-interval '1 day')
     OR EXISTS(SELECT 1 FROM recruitment_x_posts x WHERE x.organization_id=pol.organization_id AND x.status IN ('pending','failed','sending') AND x.attempts<10 AND x.created_at>now()-interval '1 day'))
 LOOP
   PERFORM net.http_post(url:=rtrim(base_url,'/')||'/functions/v1/check-performance-cancellation',
     headers:=jsonb_build_object('Content-Type','application/json','x-recruitment-cron-secret',cron_key),
     body:=jsonb_build_object('check_type','recruitment_deadline','organization_id',p.organization_id), timeout_milliseconds:=30000);
 END LOOP;
END;
$$;
REVOKE ALL ON FUNCTION public.dispatch_performance_recruitment_checks() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.dispatch_performance_recruitment_checks() TO service_role;

CREATE OR REPLACE FUNCTION public.recover_recruitment_mail_alerts() RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 UPDATE discord_notification_queue SET status='pending',updated_at=now()
  WHERE notification_type IN ('recruitment_mail_failed','recruitment_mail_recovered','recruitment_mail_exhausted','recruitment_shortage','recruitment_x_failed','recruitment_x_attention','recruitment_x_recovered')
   AND status='sending' AND updated_at<now()-interval '5 minutes';
 UPDATE performance_recruitment_notices SET status='failed',lease_until=NULL
  WHERE status='sending' AND attempts>=10 AND lease_until<now();
 UPDATE performance_recruitment_notices n SET status='expired',lease_until=NULL
  FROM performance_recruitment_deadlines d
  WHERE n.schedule_event_id=d.schedule_event_id AND n.organization_id=d.organization_id
   AND n.first_failed_at IS NOT NULL AND n.status IN ('pending','failed') AND n.attempts<10
   AND ((n.kind='extension' AND (d.status<>'active' OR d.deadline<=now())) OR n.created_at<=now()-interval '1 day');
END;
$$;
REVOKE ALL ON FUNCTION public.recover_recruitment_mail_alerts() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.recover_recruitment_mail_alerts() TO service_role;
