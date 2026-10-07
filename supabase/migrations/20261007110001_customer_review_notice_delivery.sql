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
 payload jsonb, first_attempt_at timestamptz,
 PRIMARY KEY(notice_id,waitlist_id)
);
ALTER TABLE public.waitlist_notice_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.waitlist_notice_deliveries ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.waitlist_notice_events,public.waitlist_notice_deliveries FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.waitlist_notice_events TO service_role;
CREATE INDEX waitlist_notice_events_pending ON public.waitlist_notice_events(schedule_event_id,created_at) WHERE completed_at IS NULL;
CREATE INDEX waitlist_notice_deliveries_lease ON public.waitlist_notice_deliveries(waitlist_id,leased_until) WHERE sent_at IS NULL;

CREATE OR REPLACE FUNCTION public.capture_waitlist_notice_event() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE before_count integer; after_count integer; e public.schedule_events; s public.stores;
BEGIN
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
 SELECT * INTO n FROM public.waitlist_notice_events WHERE schedule_event_id=e.id AND completed_at IS NULL AND NOT requires_review
 AND (p_system OR actor_user_id=p_actor OR EXISTS(SELECT 1 FROM public.staff WHERE user_id=p_actor AND organization_id=e.organization_id AND status='active'))
 ORDER BY created_at,id LIMIT 1 FOR UPDATE;
 IF n.id IS NULL THEN RETURN NULL; END IF;
 UPDATE public.waitlist_notice_events SET last_attempt_at=now() WHERE id=n.id;
 SELECT coalesce(e.max_participants,e.capacity,8)-coalesce(sum(participant_count),0) INTO seats FROM public.reservations
 WHERE schedule_event_id=e.id AND status IN ('pending','confirmed','gm_confirmed','checked_in');
 IF seats<=0 THEN RETURN NULL; END IF;
 INSERT INTO public.waitlist_notice_deliveries(notice_id,waitlist_id)
 SELECT n.id,w.id FROM public.waitlist w WHERE w.schedule_event_id=e.id AND w.organization_id=e.organization_id AND w.status='waiting'
 AND w.participant_count<=seats AND (w.expires_at IS NULL OR w.expires_at>now()) ON CONFLICT DO NOTHING;
 UPDATE public.waitlist_notice_deliveries d SET lease_id=p_lease,leased_until=now()+interval '5 minutes',last_error=NULL
 WHERE d.notice_id=n.id AND d.sent_at IS NULL AND (d.first_attempt_at IS NULL OR d.first_attempt_at>now()-interval '23 hours') AND (d.leased_until IS NULL OR d.leased_until<now())
 AND EXISTS(SELECT 1 FROM public.waitlist w WHERE w.id=d.waitlist_id AND w.status='waiting' AND w.participant_count<=seats)
 AND NOT EXISTS(SELECT 1 FROM public.waitlist_notice_deliveries other WHERE other.waitlist_id=d.waitlist_id
 AND other.notice_id<>d.notice_id AND other.sent_at IS NULL AND (other.leased_until>now() OR other.first_attempt_at<=now()-interval '23 hours'));
 UPDATE public.waitlist_notice_events SET requires_review=true WHERE id=n.id AND EXISTS(SELECT 1 FROM public.waitlist_notice_deliveries WHERE notice_id=n.id AND sent_at IS NULL AND first_attempt_at<=now()-interval '23 hours');
 SELECT jsonb_agg(jsonb_build_object('id',w.id,'customer_name',w.customer_name,'customer_email',w.customer_email,
 'participant_count',w.participant_count,'deliveryKey','waitlist-'||n.id::text||'-'||w.id::text) ORDER BY w.created_at)
 INTO entries FROM public.waitlist_notice_deliveries d JOIN public.waitlist w ON w.id=d.waitlist_id
 WHERE d.notice_id=n.id AND d.lease_id=p_lease AND d.sent_at IS NULL;
 IF entries IS NULL AND NOT EXISTS(SELECT 1 FROM public.waitlist_notice_deliveries WHERE notice_id=n.id AND sent_at IS NULL)
 THEN UPDATE public.waitlist_notice_events SET completed_at=now() WHERE id=n.id; END IF;
 RETURN jsonb_build_object('noticeId',n.id,'organizationId',e.organization_id,'metadata',n.metadata,'entries',coalesce(entries,'[]'::jsonb),'pending',EXISTS(SELECT 1 FROM public.waitlist_notice_deliveries WHERE notice_id=n.id AND sent_at IS NULL),'manualReview',EXISTS(SELECT 1 FROM public.waitlist_notice_deliveries WHERE notice_id=n.id AND sent_at IS NULL AND first_attempt_at<=now()-interval '23 hours'));
END $$;
CREATE OR REPLACE FUNCTION public.finish_waitlist_notice(p_notice uuid,p_waitlist uuid,p_lease uuid,p_sent boolean,p_error text DEFAULT NULL)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 -- claimと同じnotice→delivery順。並行ack/claimのdeadlockを避ける。
 PERFORM 1 FROM public.waitlist_notice_events WHERE id=p_notice FOR UPDATE;
 UPDATE public.waitlist_notice_deliveries SET sent_at=CASE WHEN p_sent THEN now() ELSE NULL END,
 leased_until=NULL,lease_id=NULL,last_error=CASE WHEN p_sent THEN NULL ELSE left(p_error,500) END
 WHERE notice_id=p_notice AND waitlist_id=p_waitlist AND lease_id=p_lease AND sent_at IS NULL;
 IF NOT FOUND THEN RETURN false; END IF;
 IF p_sent THEN UPDATE public.waitlist SET status='notified',notified_at=now(),expires_at=now()+interval '24 hours'
 WHERE id=p_waitlist AND status='waiting'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.waitlist_notice_deliveries WHERE notice_id=p_notice AND sent_at IS NULL)
 THEN UPDATE public.waitlist_notice_events SET completed_at=now() WHERE id=p_notice; END IF;
 RETURN true;
END $$;
CREATE OR REPLACE FUNCTION public.prepare_waitlist_notice_payload(p_notice uuid,p_waitlist uuid,p_lease uuid,p_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE result jsonb;
BEGIN
 UPDATE public.waitlist_notice_deliveries SET payload=coalesce(payload,p_payload),first_attempt_at=coalesce(first_attempt_at,now())
 WHERE notice_id=p_notice AND waitlist_id=p_waitlist AND lease_id=p_lease AND sent_at IS NULL
 AND (first_attempt_at IS NULL OR first_attempt_at>now()-interval '23 hours') RETURNING payload INTO result;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.prepare_waitlist_notice_payload(uuid,uuid,uuid,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.prepare_waitlist_notice_payload(uuid,uuid,uuid,jsonb) TO service_role;
REVOKE ALL ON FUNCTION public.claim_waitlist_notice(uuid,uuid,boolean,uuid),public.finish_waitlist_notice(uuid,uuid,uuid,boolean,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_waitlist_notice(uuid,uuid,boolean,uuid),public.finish_waitlist_notice(uuid,uuid,uuid,boolean,text) TO service_role;
-- 旧の送信前消費RPCは全呼出元が新claim/finishへ移行後も権限を復活させない。

NOTIFY pgrst,'reload schema';
