-- 来歴のない旧retryを黙って取り残さない。残件があれば切替を止め、承認された移行/排出を先に行う。
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM public.waitlist_notification_queue WHERE status IN ('pending','processing')) THEN
  RAISE EXCEPTION '旧キャンセル待ち通知キューに未処理があります。来歴を照合して移行/排出するまで反映できません' USING ERRCODE='P0057';
 END IF;
END $$;
-- 保存済みの取消/人数減少だけが通知契機。ブラウザから直接作成できない。
CREATE TABLE public.waitlist_notice_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
 schedule_event_id uuid NOT NULL REFERENCES public.schedule_events(id) ON DELETE CASCADE, reservation_id uuid REFERENCES public.reservations(id) ON DELETE SET NULL,
 actor_user_id uuid, freed_seats integer NOT NULL CHECK(freed_seats>0), metadata jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(), last_attempt_at timestamptz, requires_review boolean NOT NULL DEFAULT false, completed_at timestamptz
);
CREATE TABLE public.waitlist_notice_deliveries (
 notice_id uuid NOT NULL REFERENCES public.waitlist_notice_events(id) ON DELETE CASCADE, waitlist_id uuid NOT NULL REFERENCES public.waitlist(id) ON DELETE CASCADE,
 lease_id uuid, leased_until timestamptz, sent_at timestamptz, last_error text,
 payload jsonb, claimed_waitlist_ids uuid[], first_attempt_at timestamptz,
 attempt_in_progress boolean NOT NULL DEFAULT false, has_uncertain_attempt boolean NOT NULL DEFAULT false,
 PRIMARY KEY(notice_id,waitlist_id)
);
ALTER TABLE public.waitlist_notice_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.waitlist_notice_deliveries ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.waitlist_notice_events,public.waitlist_notice_deliveries FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON public.waitlist_notice_events,public.waitlist_notice_deliveries TO service_role;
CREATE INDEX waitlist_notice_events_pending ON public.waitlist_notice_events(schedule_event_id,created_at) WHERE completed_at IS NULL;
CREATE INDEX waitlist_notice_deliveries_lease ON public.waitlist_notice_deliveries(waitlist_id,leased_until) WHERE sent_at IS NULL;

CREATE OR REPLACE FUNCTION public.capture_waitlist_notice_event() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE before_count integer; after_count integer; e public.schedule_events; s public.stores;
BEGIN
 -- 完了/無断欠席/任意の非有効状態は取消として扱わない。
 IF NOT ((OLD.status IN ('pending','confirmed','gm_confirmed','checked_in') AND NEW.status='cancelled')
 OR (OLD.status IN ('pending','confirmed','gm_confirmed','checked_in') AND NEW.status IN ('pending','confirmed','gm_confirmed','checked_in') AND NEW.participant_count<OLD.participant_count)) THEN RETURN NEW; END IF;
 before_count:=CASE WHEN OLD.status IN ('pending','confirmed','gm_confirmed','checked_in') THEN OLD.participant_count ELSE 0 END;
 after_count:=CASE WHEN NEW.status IN ('pending','confirmed','gm_confirmed','checked_in') THEN NEW.participant_count ELSE 0 END;
 IF before_count<=after_count OR NEW.schedule_event_id IS NULL OR NEW.schedule_event_id IS DISTINCT FROM OLD.schedule_event_id THEN RETURN NEW; END IF;
 SELECT * INTO e FROM public.schedule_events WHERE id=NEW.schedule_event_id AND organization_id=NEW.organization_id;
 IF e.id IS NULL OR coalesce(e.is_cancelled,false) OR ((e.date+coalesce(e.end_time,e.start_time)+CASE WHEN e.end_time<e.start_time THEN interval '1 day' ELSE interval '0 days' END) AT TIME ZONE 'Asia/Tokyo')<=now() THEN RETURN NEW; END IF;
 SELECT * INTO s FROM public.stores WHERE id=e.store_id AND organization_id=e.organization_id;
 INSERT INTO public.waitlist_notice_events(organization_id,schedule_event_id,reservation_id,actor_user_id,freed_seats,metadata)
 VALUES(e.organization_id,e.id,NEW.id,auth.uid(),before_count-after_count,jsonb_build_object(
 'scenarioTitle',e.scenario,'eventDate',e.date,'startTime',e.start_time,'endTime',e.end_time,
 'storeName',coalesce(s.name,e.venue,''),'storeAddress',coalesce(s.address,'')));
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.capture_waitlist_notice_event() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER capture_waitlist_notice_event AFTER UPDATE OF status,participant_count ON public.reservations
FOR EACH ROW EXECUTE FUNCTION public.capture_waitlist_notice_event();

-- 同一公演/組織の宛先を本人user_id、顧客IDまたは空でない正規化メールで照合。待機行IDの増殖で別key保留を回避させない。
CREATE OR REPLACE FUNCTION public.waitlist_notice_same_recipient(p_left uuid,p_right uuid)
RETURNS boolean LANGUAGE sql SECURITY INVOKER SET search_path=public,pg_temp AS $$
 SELECT EXISTS(SELECT 1 FROM public.waitlist a JOIN public.waitlist b
 ON a.schedule_event_id=b.schedule_event_id AND a.organization_id=b.organization_id
 WHERE a.id=p_left AND b.id=p_right AND ((a.customer_id IS NOT NULL AND a.customer_id=b.customer_id)
 OR EXISTS(SELECT 1 FROM public.customers ca JOIN public.customers cb ON ca.user_id=cb.user_id
 WHERE ca.id=a.customer_id AND cb.id=b.customer_id AND ca.user_id IS NOT NULL)
 OR (NULLIF(lower(btrim(a.customer_email)),'') IS NOT NULL AND lower(btrim(a.customer_email))=lower(btrim(b.customer_email)))));
$$;
REVOKE ALL ON FUNCTION public.waitlist_notice_same_recipient(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.waitlist_notice_same_recipient(uuid,uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.claim_waitlist_notice(p_event uuid,p_actor uuid,p_system boolean,p_lease uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE e public.schedule_events; n public.waitlist_notice_events; seats integer; entries jsonb;
BEGIN
 SELECT * INTO e FROM public.schedule_events WHERE id=p_event FOR UPDATE;
 IF e.id IS NULL THEN RETURN NULL; END IF;
 IF NOT p_system AND NOT EXISTS(SELECT 1 FROM public.waitlist_notice_events w WHERE w.schedule_event_id=e.id
  AND w.actor_user_id=p_actor)
 AND NOT EXISTS(SELECT 1 FROM public.staff WHERE user_id=p_actor AND organization_id=e.organization_id AND status='active') THEN
  RAISE EXCEPTION '保存済みの空席発生操作が必要です' USING ERRCODE='42501';
 END IF;
 IF coalesce(e.is_cancelled,false) OR ((e.date+coalesce(e.end_time,e.start_time)+CASE WHEN e.end_time<e.start_time THEN interval '1 day' ELSE interval '0 days' END) AT TIME ZONE 'Asia/Tokyo')<=now() THEN
  UPDATE public.waitlist_notice_events SET completed_at=now() WHERE schedule_event_id=e.id AND completed_at IS NULL;
  RETURN NULL;
 END IF;
 SELECT * INTO n FROM public.waitlist_notice_events WHERE schedule_event_id=e.id AND completed_at IS NULL AND (NOT requires_review OR EXISTS(SELECT 1 FROM public.waitlist_notice_deliveries d JOIN public.waitlist w ON w.id=d.waitlist_id
 WHERE d.notice_id=waitlist_notice_events.id AND d.sent_at IS NULL AND w.status='waiting' AND (w.expires_at IS NULL OR w.expires_at>now())
 AND (d.first_attempt_at IS NULL OR d.first_attempt_at>now()-interval '23 hours')
 AND NOT EXISTS(SELECT 1 FROM public.waitlist_notice_deliveries other WHERE public.waitlist_notice_same_recipient(other.waitlist_id,d.waitlist_id) AND NOT (other.notice_id=d.notice_id AND other.waitlist_id=d.waitlist_id) AND other.sent_at IS NULL AND (other.has_uncertain_attempt OR (other.attempt_in_progress AND other.leased_until<now()) OR other.first_attempt_at<=now()-interval '23 hours'))))
 AND (p_system OR actor_user_id=p_actor OR EXISTS(SELECT 1 FROM public.staff WHERE user_id=p_actor AND organization_id=e.organization_id AND status='active'))
 ORDER BY created_at,id LIMIT 1 FOR UPDATE;
 IF n.id IS NULL THEN RETURN NULL; END IF;
 UPDATE public.waitlist_notice_events SET last_attempt_at=now() WHERE id=n.id;
 SELECT coalesce(e.max_participants,e.capacity,8)-coalesce(sum(participant_count),0) INTO seats FROM public.reservations
 WHERE schedule_event_id=e.id AND status IN ('pending','confirmed','gm_confirmed','checked_in');
 IF seats<=0 THEN RETURN NULL; END IF;
 INSERT INTO public.waitlist_notice_deliveries(notice_id,waitlist_id)
 SELECT n.id,w.id FROM public.waitlist w WHERE w.schedule_event_id=e.id AND w.organization_id=e.organization_id AND w.status='waiting'
 AND (SELECT latest.participant_count FROM public.waitlist latest WHERE public.waitlist_notice_same_recipient(latest.id,w.id) AND latest.status='waiting' AND (latest.expires_at IS NULL OR latest.expires_at>now()) ORDER BY coalesce(latest.created_at,'-infinity'::timestamptz) DESC,latest.id DESC LIMIT 1)<=seats AND (w.expires_at IS NULL OR w.expires_at>now()) ON CONFLICT DO NOTHING;
 -- プロセス停止/ack消失で期限切れになった前試行は結果不明として保持する。
 UPDATE public.waitlist_notice_deliveries SET has_uncertain_attempt=true
 WHERE notice_id=n.id AND sent_at IS NULL AND attempt_in_progress AND leased_until<now();
 UPDATE public.waitlist_notice_deliveries d SET lease_id=p_lease,leased_until=now()+interval '5 minutes',last_error=NULL,
 claimed_waitlist_ids=CASE WHEN d.payload IS NULL THEN ARRAY(SELECT recipient.id FROM public.waitlist recipient
 WHERE public.waitlist_notice_same_recipient(recipient.id,d.waitlist_id) AND recipient.status='waiting' AND (recipient.expires_at IS NULL OR recipient.expires_at>now())) ELSE coalesce(d.claimed_waitlist_ids,'{}'::uuid[]) END
 WHERE d.notice_id=n.id AND d.sent_at IS NULL AND (d.first_attempt_at IS NULL OR d.first_attempt_at>now()-interval '23 hours') AND (d.leased_until IS NULL OR d.leased_until<now())
 AND EXISTS(SELECT 1 FROM public.waitlist w WHERE w.id=d.waitlist_id AND w.status='waiting' AND (w.expires_at IS NULL OR w.expires_at>now()) AND (SELECT latest.participant_count FROM public.waitlist latest WHERE public.waitlist_notice_same_recipient(latest.id,w.id) AND latest.status='waiting' AND (latest.expires_at IS NULL OR latest.expires_at>now()) ORDER BY coalesce(latest.created_at,'-infinity'::timestamptz) DESC,latest.id DESC LIMIT 1)<=seats
 AND NOT EXISTS(SELECT 1 FROM public.waitlist earlier WHERE earlier.status='waiting' AND (earlier.expires_at IS NULL OR earlier.expires_at>now())
 AND (SELECT latest.participant_count FROM public.waitlist latest WHERE public.waitlist_notice_same_recipient(latest.id,earlier.id) AND latest.status='waiting' AND (latest.expires_at IS NULL OR latest.expires_at>now()) ORDER BY coalesce(latest.created_at,'-infinity'::timestamptz) DESC,latest.id DESC LIMIT 1)<=seats AND public.waitlist_notice_same_recipient(earlier.id,w.id)
 AND (coalesce(earlier.created_at,'-infinity'::timestamptz),earlier.id)<(coalesce(w.created_at,'-infinity'::timestamptz),w.id)))
 AND NOT EXISTS(SELECT 1 FROM public.waitlist_notice_deliveries other WHERE public.waitlist_notice_same_recipient(other.waitlist_id,d.waitlist_id)
 AND NOT (other.notice_id=d.notice_id AND other.waitlist_id=d.waitlist_id) AND other.sent_at IS NULL AND (other.leased_until>now() OR (other.has_uncertain_attempt OR (other.attempt_in_progress AND other.leased_until<now()) OR other.first_attempt_at<=now()-interval '23 hours')));
 UPDATE public.waitlist_notice_events SET requires_review=true WHERE id=n.id AND EXISTS(SELECT 1 FROM public.waitlist_notice_deliveries WHERE notice_id=n.id AND sent_at IS NULL AND EXISTS(SELECT 1 FROM public.waitlist w WHERE w.id=waitlist_id AND w.status='waiting' AND (w.expires_at IS NULL OR w.expires_at>now())) AND (first_attempt_at<=now()-interval '23 hours' OR EXISTS(SELECT 1 FROM public.waitlist_notice_deliveries other WHERE public.waitlist_notice_same_recipient(other.waitlist_id,waitlist_notice_deliveries.waitlist_id) AND NOT (other.notice_id=waitlist_notice_deliveries.notice_id AND other.waitlist_id=waitlist_notice_deliveries.waitlist_id) AND other.sent_at IS NULL AND (other.has_uncertain_attempt OR (other.attempt_in_progress AND other.leased_until<now()) OR other.first_attempt_at<=now()-interval '23 hours'))));
 SELECT jsonb_agg(jsonb_build_object('id',w.id,'customer_name',contact.customer_name,'customer_email',btrim(contact.customer_email),
 'participant_count',contact.participant_count,'deliveryKey','waitlist-'||n.id::text||'-'||w.id::text) ORDER BY w.created_at)
 INTO entries FROM public.waitlist_notice_deliveries d JOIN public.waitlist w ON w.id=d.waitlist_id
 CROSS JOIN LATERAL (SELECT latest.customer_name,latest.customer_email,latest.participant_count FROM public.waitlist latest
 WHERE latest.id=ANY(d.claimed_waitlist_ids) AND public.waitlist_notice_same_recipient(latest.id,w.id) AND latest.status='waiting' AND (latest.expires_at IS NULL OR latest.expires_at>now())
 ORDER BY coalesce(latest.created_at,'-infinity'::timestamptz) DESC,latest.id DESC LIMIT 1) contact
 WHERE d.notice_id=n.id AND d.lease_id=p_lease AND d.sent_at IS NULL;
 IF entries IS NULL AND NOT EXISTS(SELECT 1 FROM public.waitlist_notice_deliveries WHERE notice_id=n.id AND sent_at IS NULL AND EXISTS(SELECT 1 FROM public.waitlist w WHERE w.id=waitlist_id AND w.status='waiting' AND (w.expires_at IS NULL OR w.expires_at>now())))
 THEN UPDATE public.waitlist_notice_events SET completed_at=now() WHERE id=n.id; END IF;
 RETURN jsonb_build_object('noticeId',n.id,'organizationId',e.organization_id,'metadata',n.metadata||jsonb_build_object('freedSeats',n.freed_seats),'entries',coalesce(entries,'[]'::jsonb),'pending',EXISTS(SELECT 1 FROM public.waitlist_notice_deliveries WHERE notice_id=n.id AND sent_at IS NULL AND EXISTS(SELECT 1 FROM public.waitlist w WHERE w.id=waitlist_id AND w.status='waiting' AND (w.expires_at IS NULL OR w.expires_at>now()))),'manualReview',EXISTS(SELECT 1 FROM public.waitlist_notice_deliveries WHERE notice_id=n.id AND sent_at IS NULL AND EXISTS(SELECT 1 FROM public.waitlist w WHERE w.id=waitlist_id AND w.status='waiting' AND (w.expires_at IS NULL OR w.expires_at>now())) AND (first_attempt_at<=now()-interval '23 hours' OR EXISTS(SELECT 1 FROM public.waitlist_notice_deliveries other WHERE public.waitlist_notice_same_recipient(other.waitlist_id,waitlist_notice_deliveries.waitlist_id) AND NOT (other.notice_id=waitlist_notice_deliveries.notice_id AND other.waitlist_id=waitlist_notice_deliveries.waitlist_id) AND other.sent_at IS NULL AND (other.has_uncertain_attempt OR (other.attempt_in_progress AND other.leased_until<now()) OR other.first_attempt_at<=now()-interval '23 hours')))));
END $$;
CREATE OR REPLACE FUNCTION public.finish_waitlist_notice(p_notice uuid,p_waitlist uuid,p_lease uuid,p_sent boolean,p_error text DEFAULT NULL)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE recipient_ids uuid[];
BEGIN
 -- claimと同じnotice→delivery順。並行ack/claimのdeadlockを避ける。
 PERFORM 1 FROM public.waitlist_notice_events WHERE id=p_notice FOR UPDATE;
 UPDATE public.waitlist_notice_deliveries SET sent_at=CASE WHEN p_sent THEN now() ELSE NULL END,
 leased_until=NULL,lease_id=NULL,
 -- 明示的拒否は未送信と確定している。不明応答だけ23h期限を保持する。
 first_attempt_at=CASE WHEN NOT p_sent AND p_error='provider rejected' AND NOT has_uncertain_attempt THEN NULL ELSE first_attempt_at END,
 has_uncertain_attempt=has_uncertain_attempt OR (NOT p_sent AND attempt_in_progress AND p_error IS DISTINCT FROM 'provider rejected'),
 attempt_in_progress=false,
 last_error=CASE WHEN p_sent THEN NULL ELSE left(p_error,500) END
 WHERE notice_id=p_notice AND waitlist_id=p_waitlist AND lease_id=p_lease AND sent_at IS NULL RETURNING claimed_waitlist_ids INTO recipient_ids;
 IF NOT FOUND THEN RETURN false; END IF;
 IF p_sent THEN UPDATE public.waitlist SET status='notified',notified_at=now(),expires_at=now()+interval '24 hours'
 WHERE id=ANY(recipient_ids) AND public.waitlist_notice_same_recipient(id,p_waitlist) AND status='waiting'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.waitlist_notice_deliveries WHERE notice_id=p_notice AND sent_at IS NULL AND EXISTS(SELECT 1 FROM public.waitlist w WHERE w.id=waitlist_id AND w.status='waiting' AND (w.expires_at IS NULL OR w.expires_at>now())))
 THEN UPDATE public.waitlist_notice_events SET completed_at=now() WHERE id=p_notice; END IF;
 RETURN true;
END $$;
CREATE OR REPLACE FUNCTION public.prepare_waitlist_notice_payload(p_notice uuid,p_waitlist uuid,p_lease uuid,p_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE result jsonb;
BEGIN
 UPDATE public.waitlist_notice_deliveries SET payload=coalesce(payload,p_payload),first_attempt_at=coalesce(first_attempt_at,now()),attempt_in_progress=true
 WHERE notice_id=p_notice AND waitlist_id=p_waitlist AND lease_id=p_lease AND sent_at IS NULL
 AND (first_attempt_at IS NULL OR first_attempt_at>now()-interval '23 hours') RETURNING payload INTO result;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.prepare_waitlist_notice_payload(uuid,uuid,uuid,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.prepare_waitlist_notice_payload(uuid,uuid,uuid,jsonb) TO service_role;
REVOKE ALL ON FUNCTION public.claim_waitlist_notice(uuid,uuid,boolean,uuid),public.finish_waitlist_notice(uuid,uuid,uuid,boolean,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_waitlist_notice(uuid,uuid,boolean,uuid),public.finish_waitlist_notice(uuid,uuid,uuid,boolean,text) TO service_role;
-- 旧の送信前消費RPCは全呼出元が新claim/finishへ移行後も権限を復活させない。


-- 同一公演の未処理intentが多数あっても他組織/公演を飢餓にしない。
CREATE OR REPLACE FUNCTION public.list_pending_waitlist_notice_events(p_limit integer DEFAULT 10)
RETURNS TABLE(schedule_event_id uuid,organization_id uuid) LANGUAGE sql SECURITY INVOKER SET search_path=public,pg_temp AS $$
 SELECT w.schedule_event_id,w.organization_id FROM public.waitlist_notice_events w
 WHERE w.completed_at IS NULL AND (NOT w.requires_review OR EXISTS(SELECT 1 FROM public.waitlist_notice_deliveries d JOIN public.waitlist recipient ON recipient.id=d.waitlist_id
 WHERE d.notice_id=w.id AND d.sent_at IS NULL AND recipient.status='waiting' AND (recipient.expires_at IS NULL OR recipient.expires_at>now())
 AND (d.first_attempt_at IS NULL OR d.first_attempt_at>now()-interval '23 hours')
 AND NOT EXISTS(SELECT 1 FROM public.waitlist_notice_deliveries other WHERE public.waitlist_notice_same_recipient(other.waitlist_id,d.waitlist_id) AND NOT (other.notice_id=d.notice_id AND other.waitlist_id=d.waitlist_id) AND other.sent_at IS NULL AND (other.has_uncertain_attempt OR (other.attempt_in_progress AND other.leased_until<now()) OR other.first_attempt_at<=now()-interval '23 hours'))))
 GROUP BY w.schedule_event_id,w.organization_id
 ORDER BY max(w.last_attempt_at) NULLS FIRST,min(w.created_at),w.schedule_event_id
 LIMIT least(greatest(coalesce(p_limit,10),1),50);
$$;
REVOKE ALL ON FUNCTION public.list_pending_waitlist_notice_events(integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.list_pending_waitlist_notice_events(integer) TO service_role;

NOTIFY pgrst,'reload schema';
