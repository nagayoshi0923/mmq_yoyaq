-- 準備段階。既存の承認入口は閉じず、新しい配送表/RPCだけを追加する。
-- 承認と同じトランザクションで配送予定を保存する。通知の種類ごとに再試行を分離する。
CREATE TABLE IF NOT EXISTS public.private_booking_approval_deliveries (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 request_id uuid REFERENCES public.private_booking_approval_requests(id),
 compatibility_key text UNIQUE,
 CHECK (request_id IS NOT NULL OR compatibility_key IS NOT NULL),
 organization_id uuid NOT NULL,
 reservation_id uuid NOT NULL,
 schedule_event_id uuid NOT NULL,
 kind text NOT NULL CHECK(kind IN ('confirmation_email','gm_email','gm_discord')),
 recipient_key text NOT NULL,
 snapshot jsonb NOT NULL CHECK(jsonb_typeof(snapshot)='object'),
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','sending','sent','failed','uncertain','superseded','skipped')),
 attempt_count integer NOT NULL DEFAULT 0 CHECK(attempt_count>=0),
 next_attempt_at timestamptz NOT NULL DEFAULT now(),
 first_attempt_at timestamptz,
 preparation_attempted_at timestamptz,
 lease_token uuid,
 lease_until timestamptz,
 provider_payload jsonb CHECK(provider_payload IS NULL OR jsonb_typeof(provider_payload)='object'),
 provider_account_hash text,
 provider_target text,
 provider_message_id text,
 email_log_id uuid,
 last_error text,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(request_id,kind,recipient_key)
);
CREATE INDEX IF NOT EXISTS private_booking_approval_deliveries_due_idx
 ON public.private_booking_approval_deliveries(next_attempt_at) WHERE status IN ('pending','sending');
CREATE INDEX IF NOT EXISTS private_booking_approval_deliveries_reservation_idx
 ON public.private_booking_approval_deliveries(organization_id,reservation_id,created_at);
ALTER TABLE public.private_booking_approval_deliveries ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.private_booking_approval_deliveries FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT,UPDATE ON public.private_booking_approval_deliveries TO service_role;
COMMENT ON TABLE public.private_booking_approval_deliveries IS '貸切承認時の顧客メール・GMメール・GM Discordの配送記録。保存した宛先/本文と要求IDを再試行でも維持。ブラウザ直接操作不可。';

-- 通知の結果照合・未送信の再試行を監査する。メール本文やトークンは複製しない。
CREATE TABLE IF NOT EXISTS public.private_delivery_resolutions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id uuid NOT NULL,
 delivery_kind text NOT NULL CHECK(delivery_kind IN ('approval','survey','rejection')),
 delivery_id uuid NOT NULL,
 actor_id uuid NOT NULL,
 action text NOT NULL CHECK(action IN ('provider_verified','retry_unsent','preparation_verified')),
 previous_status text NOT NULL,
 provider_message_id text,
 created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.private_delivery_resolutions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.private_delivery_resolutions FROM PUBLIC,anon,authenticated,service_role;
COMMENT ON TABLE public.private_delivery_resolutions IS '貸切通知の外部受付記録照合と、送信前に失敗した通知の再試行履歴。専用RPCだけが追加する。';

-- 承認RPCの所有者からだけ呼び出す。ブラウザやワーカーは配送を追加できない。
CREATE OR REPLACE FUNCTION public.enqueue_private_approval_deliveries(p_request_id uuid)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp SET row_security=off AS $$
DECLARE
 receipt public.private_booking_approval_requests%ROWTYPE;
 r public.reservations%ROWTYPE; e public.schedule_events%ROWTYPE; s public.staff%ROWTYPE;
 booking jsonb; gm_ids uuid[]; gm_id uuid; recipient text; recipient_name text; job_count integer;
 store_name text; store_address text;
 actor_staff_id uuid; actor_name text; event_snapshot jsonb;
BEGIN
 SELECT * INTO STRICT receipt FROM public.private_booking_approval_requests WHERE id=p_request_id;
 SELECT * INTO STRICT r FROM public.reservations WHERE id=receipt.reservation_id AND organization_id=receipt.organization_id;
 SELECT * INTO STRICT e FROM public.schedule_events
  WHERE id=(receipt.result->>'schedule_event_id')::uuid AND organization_id=receipt.organization_id;
 IF r.schedule_event_id IS DISTINCT FROM e.id OR e.is_cancelled IS DISTINCT FROM false
  OR r.status NOT IN ('confirmed','gm_confirmed') THEN
  RAISE EXCEPTION 'APPROVAL_NOTIFICATION_NOT_CURRENT' USING ERRCODE='22023';
 END IF;
 SELECT name,address INTO STRICT store_name,store_address FROM public.stores
  WHERE id=e.store_id AND organization_id=receipt.organization_id;
 recipient:=nullif(btrim(r.customer_email),''); recipient_name:=coalesce(nullif(r.customer_name,''),'お客様');
 IF recipient IS NULL AND r.customer_id IS NOT NULL THEN
  SELECT nullif(btrim(c.email),''),coalesce(nullif(c.name,''),recipient_name) INTO recipient,recipient_name
   FROM public.customers c WHERE c.id=r.customer_id AND (c.organization_id=r.organization_id OR c.organization_id IS NULL);
 END IF;
 booking:=jsonb_build_object(
  'reservationId',r.id,'organizationId',r.organization_id,'scheduleEventId',e.id,'storeId',e.store_id,
  'scenarioMasterId',coalesce(e.scenario_master_id,r.scenario_master_id),'scenarioTitle',coalesce(nullif(e.scenario,''),r.scenario_title,''),
  'eventDate',e.date,'startTime',e.start_time,'endTime',e.end_time,'storeName',store_name,'storeAddress',store_address,
  'customerEmail',recipient,'customerName',coalesce(recipient_name,'お客様'),'participantCount',r.participant_count,
  'totalPrice',coalesce(r.final_price,r.total_price,0),'reservationNumber',r.reservation_number,'notes',r.customer_notes,
  'groupId',r.private_group_id,'eventGms',to_jsonb(e.gms));
 INSERT INTO public.private_booking_approval_deliveries(request_id,organization_id,reservation_id,schedule_event_id,kind,recipient_key,snapshot)
 VALUES(receipt.id,r.organization_id,r.id,e.id,'confirmation_email','customer',booking);
 gm_ids:=array_remove(ARRAY[(receipt.request_payload->>'gm')::uuid,(receipt.request_payload->>'sub_gm')::uuid],NULL);
 FOR gm_id IN SELECT DISTINCT unnest(gm_ids) LOOP
  SELECT * INTO STRICT s FROM public.staff WHERE id=gm_id AND organization_id=r.organization_id AND status='active';
  IF NOT coalesce(s.name=ANY(e.gms),false) THEN RAISE EXCEPTION 'APPROVAL_GM_NOT_ASSIGNED' USING ERRCODE='22023'; END IF;
  INSERT INTO public.private_booking_approval_deliveries(request_id,organization_id,reservation_id,schedule_event_id,kind,recipient_key,snapshot)
  SELECT receipt.id,r.organization_id,r.id,e.id,kind,s.id::text,
   booking||jsonb_build_object('gmId',s.id,'gmName',s.name,'gmEmail',nullif(btrim(s.email),''),
    'gmDiscordChannelId',nullif(btrim(s.discord_channel_id),''),'gmDiscordUserId',nullif(btrim(s.discord_user_id),''))
  FROM unnest(ARRAY['gm_email','gm_discord']) AS kind;
 END LOOP;
 SELECT id,name INTO actor_staff_id,actor_name FROM public.staff
  WHERE user_id=receipt.actor_id AND organization_id=r.organization_id AND status='active';
 SELECT jsonb_object_agg(key,value) INTO event_snapshot FROM jsonb_each(to_jsonb(e))
  WHERE key IN ('id','organization_id','date','venue','store_id','scenario','scenario_master_id','gms','gm_roles',
   'start_time','end_time','category','capacity','max_participants','current_participants','notes','is_cancelled',
   'is_tentative','is_reservation_enabled','is_private_request','reservation_name','time_slot','venue_rental_fee');
 INSERT INTO public.schedule_event_history(schedule_event_id,organization_id,event_date,store_id,time_slot,
  changed_by_user_id,changed_by_staff_id,changed_by_name,action_type,new_values,notes)
 VALUES(e.id,r.organization_id,e.date,e.store_id,e.time_slot,receipt.actor_id,actor_staff_id,
  coalesce(actor_name,'管理者')||'（貸切管理）','create',event_snapshot,'貸切予約承認により作成');
 SELECT count(*) INTO job_count FROM public.private_booking_approval_deliveries WHERE request_id=receipt.id;
 RETURN job_count;
END $$;
REVOKE ALL ON FUNCTION public.enqueue_private_approval_deliveries(uuid) FROM PUBLIC,anon,authenticated,service_role;

-- 配送直前にも確認する。取消・再承認・担当/日時変更後の旧内容を配送しない。
CREATE OR REPLACE FUNCTION public.is_private_approval_delivery_current(p_delivery_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp SET row_security=off AS $$
 SELECT EXISTS(
  SELECT 1 FROM public.private_booking_approval_deliveries d
  JOIN public.reservations r ON r.id=d.reservation_id AND r.organization_id=d.organization_id
  JOIN public.schedule_events e ON e.id=d.schedule_event_id AND e.organization_id=d.organization_id
  WHERE d.id=p_delivery_id AND r.schedule_event_id=e.id
   AND r.status IN ('confirmed','gm_confirmed','checked_in','completed') AND e.is_cancelled=false
   AND e.date::text=d.snapshot->>'eventDate' AND e.start_time::text=d.snapshot->>'startTime'
   AND e.end_time::text=d.snapshot->>'endTime' AND e.store_id::text=d.snapshot->>'storeId'
   AND to_jsonb(e.gms) IS NOT DISTINCT FROM d.snapshot->'eventGms'
   AND (r.private_group_id IS NULL OR EXISTS(SELECT 1 FROM public.private_groups g
    WHERE g.id=r.private_group_id AND g.organization_id=d.organization_id AND g.reservation_id=r.id AND g.status='confirmed'))
   AND (d.kind='confirmation_email' OR EXISTS(SELECT 1 FROM public.staff s WHERE s.id::text=d.recipient_key
    AND s.organization_id=d.organization_id AND s.status='active' AND s.name=ANY(e.gms)))
 )
$$;
REVOKE ALL ON FUNCTION public.is_private_approval_delivery_current(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.is_private_approval_delivery_current(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.get_private_booking_approval_deliveries(p_reservation_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp SET row_security=off AS $$
DECLARE r public.reservations%ROWTYPE; deliveries jsonb;
BEGIN
 SELECT * INTO r FROM public.reservations WHERE id=p_reservation_id;
 IF auth.uid() IS NULL OR NOT FOUND OR public.get_user_organization_id() IS DISTINCT FROM r.organization_id
  OR NOT coalesce(public.is_org_admin() OR EXISTS(SELECT 1 FROM public.staff s
   WHERE s.user_id=auth.uid() AND s.organization_id=r.organization_id AND s.status='active'),false) THEN
  RAISE EXCEPTION 'UNAUTHORIZED' USING ERRCODE='42501';
 END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',d.id,'kind',d.kind,'status',d.status,
  'recipient_name',CASE WHEN d.kind='confirmation_email' THEN 'お客様' ELSE d.snapshot->>'gmName' END,
  'last_error',d.last_error,'created_at',d.created_at,'updated_at',d.updated_at)
  ORDER BY d.created_at,d.kind,d.id),'[]'::jsonb) INTO deliveries
 FROM public.private_booking_approval_deliveries d WHERE d.reservation_id=r.id AND d.organization_id=r.organization_id
  AND d.schedule_event_id=r.schedule_event_id;
 RETURN jsonb_build_object('reservation_id',r.id,'deliveries',deliveries);
END $$;
REVOKE ALL ON FUNCTION public.get_private_booking_approval_deliveries(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_private_booking_approval_deliveries(uuid) TO authenticated,service_role;

-- 一覧画面で予約ごとのHTTP要求を増やさない。各予約の認可は上の単件RPCに統一する。
CREATE OR REPLACE FUNCTION public.get_private_booking_approval_delivery_status(p_reservation_ids uuid[])
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp SET row_security=off AS $$
DECLARE result jsonb;
BEGIN
 IF p_reservation_ids IS NULL OR cardinality(p_reservation_ids)>100 THEN
  RAISE EXCEPTION 'INVALID_RESERVATION_IDS' USING ERRCODE='22023';
 END IF;
 SELECT coalesce(jsonb_agg(public.get_private_booking_approval_deliveries(id)),'[]'::jsonb) INTO result
 FROM (SELECT DISTINCT unnest(p_reservation_ids) AS id) ids;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.get_private_booking_approval_delivery_status(uuid[]) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_private_booking_approval_delivery_status(uuid[]) TO authenticated,service_role;

-- 認可・保存値の読み込みを行ったEdgeだけが使用する互換入口。外部送信はworkerに集約する。
CREATE OR REPLACE FUNCTION public.enqueue_legacy_private_approval_delivery(
 p_organization_id uuid,p_reservation_id uuid,p_kind text,p_snapshot jsonb,p_correction_id uuid DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp SET row_security=off AS $$
DECLARE r public.reservations%ROWTYPE; recipient text; delivery_key text; existing public.private_booking_approval_deliveries%ROWTYPE; new_id uuid;
BEGIN
 IF p_kind NOT IN ('confirmation_email','gm_email','gm_discord') OR p_kind IS NULL THEN
  RAISE EXCEPTION 'INVALID_DELIVERY_KIND' USING ERRCODE='22023';
 END IF;
 SELECT * INTO STRICT r FROM public.reservations WHERE id=p_reservation_id AND organization_id=p_organization_id FOR UPDATE;
 IF r.schedule_event_id IS NULL OR r.status NOT IN ('confirmed','gm_confirmed')
  OR p_snapshot->>'reservationId' IS DISTINCT FROM r.id::text
  OR p_snapshot->>'organizationId' IS DISTINCT FROM r.organization_id::text
  OR p_snapshot->>'scheduleEventId' IS DISTINCT FROM r.schedule_event_id::text THEN
  RAISE EXCEPTION 'APPROVAL_CHANGED' USING ERRCODE='55000';
 END IF;
 recipient:=CASE WHEN p_kind='confirmation_email' THEN 'customer' ELSE p_snapshot->>'gmId' END;
 IF recipient IS NULL THEN RAISE EXCEPTION 'INVALID_RECIPIENT' USING ERRCODE='22023'; END IF;
 IF p_correction_id IS NULL THEN
  SELECT * INTO existing FROM public.private_booking_approval_deliveries
   WHERE organization_id=r.organization_id AND reservation_id=r.id AND schedule_event_id=r.schedule_event_id
    AND kind=p_kind AND recipient_key=recipient AND compatibility_key IS NULL ORDER BY created_at DESC LIMIT 1;
  IF FOUND THEN RETURN existing.id; END IF;
 ELSIF p_kind<>'confirmation_email' THEN RAISE EXCEPTION 'INVALID_CORRECTION_KIND' USING ERRCODE='22023';
 END IF;
 delivery_key:=CASE WHEN p_correction_id IS NULL THEN 'legacy/'||r.schedule_event_id::text ELSE 'correction/'||p_correction_id::text END
  ||'/'||r.id::text||'/'||p_kind||'/'||recipient;
 SELECT * INTO existing FROM public.private_booking_approval_deliveries WHERE compatibility_key=delivery_key;
 IF FOUND THEN
  IF p_correction_id IS NOT NULL AND (existing.snapshot->>'emailSubject' IS DISTINCT FROM p_snapshot->>'emailSubject'
   OR existing.snapshot->>'templateOverride' IS DISTINCT FROM p_snapshot->>'templateOverride') THEN
   RAISE EXCEPTION 'CORRECTION_REQUEST_CONFLICT' USING ERRCODE='22023';
  END IF;
  RETURN existing.id;
 END IF;
 INSERT INTO public.private_booking_approval_deliveries(compatibility_key,organization_id,reservation_id,schedule_event_id,kind,recipient_key,snapshot)
 VALUES(delivery_key,r.organization_id,r.id,r.schedule_event_id,p_kind,recipient,p_snapshot) RETURNING id INTO new_id;
 IF NOT public.is_private_approval_delivery_current(new_id) THEN
  RAISE EXCEPTION 'APPROVAL_CHANGED' USING ERRCODE='55000';
 END IF;
 RETURN new_id;
END $$;
REVOKE ALL ON FUNCTION public.enqueue_legacy_private_approval_delivery(uuid,uuid,text,jsonb,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.enqueue_legacy_private_approval_delivery(uuid,uuid,text,jsonb,uuid) TO service_role;

-- サーバー専用。外部の受付IDとメール履歴を同じトランザクションで確定する。
CREATE OR REPLACE FUNCTION public.complete_private_approval_delivery(
 p_delivery_id uuid,p_lease_token uuid,p_provider_id text,p_sent_at timestamptz
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp SET row_security=off AS $$
DECLARE d public.private_booking_approval_deliveries%ROWTYPE; l public.email_logs%ROWTYPE;
BEGIN
 IF p_provider_id IS NULL OR length(btrim(p_provider_id))=0 OR p_sent_at IS NULL THEN
  RAISE EXCEPTION 'INVALID_DELIVERY_RECEIPT' USING ERRCODE='22023';
 END IF;
 SELECT * INTO d FROM public.private_booking_approval_deliveries WHERE id=p_delivery_id FOR UPDATE NOWAIT;
 IF NOT FOUND OR d.status IS DISTINCT FROM 'sending' OR d.lease_token IS DISTINCT FROM p_lease_token OR p_lease_token IS NULL THEN
  RAISE EXCEPTION 'DELIVERY_LEASE_LOST' USING ERRCODE='40001';
 END IF;
 IF d.provider_payload IS NULL OR d.first_attempt_at IS NULL THEN
  RAISE EXCEPTION 'DELIVERY_NOT_STARTED' USING ERRCODE='22023';
 END IF;
 IF d.provider_message_id IS NOT NULL AND d.provider_message_id IS DISTINCT FROM p_provider_id THEN
  RAISE EXCEPTION 'DELIVERY_RECEIPT_CONFLICT' USING ERRCODE='22023';
 END IF;
 IF d.kind<>'gm_discord' THEN
  SELECT * INTO l FROM public.email_logs WHERE id=coalesce(d.email_log_id,d.id) FOR UPDATE NOWAIT;
  IF NOT FOUND OR l.organization_id IS DISTINCT FROM d.organization_id OR l.reservation_id IS DISTINCT FROM d.reservation_id
   OR l.to_email IS DISTINCT FROM (d.provider_payload->'to'->>0)
   OR l.subject IS DISTINCT FROM (d.provider_payload->>'subject')
   OR l.body_text IS DISTINCT FROM (d.provider_payload->>'text')
   OR l.body_html IS DISTINCT FROM (d.provider_payload->>'html')
   OR l.email_type IS DISTINCT FROM (CASE WHEN d.kind='confirmation_email' THEN 'reservation_confirmed' ELSE 'gm_notification' END)
   OR (l.provider_message_id IS NOT NULL AND l.provider_message_id IS DISTINCT FROM p_provider_id) THEN
   RAISE EXCEPTION 'DELIVERY_LOG_CONFLICT' USING ERRCODE='22023';
  END IF;
  UPDATE public.email_logs SET provider_message_id=p_provider_id,sent_at=coalesce(sent_at,p_sent_at),
   status=CASE WHEN status IN ('queued','failed') THEN 'sent' ELSE status END,error_message=NULL WHERE id=l.id;
 END IF;
 UPDATE public.private_booking_approval_deliveries SET status='sent',provider_message_id=p_provider_id,
  last_error=NULL,lease_token=NULL,lease_until=NULL,updated_at=now() WHERE id=d.id;
 RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.complete_private_approval_delivery(uuid,uuid,text,timestamptz) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.complete_private_approval_delivery(uuid,uuid,text,timestamptz) TO service_role;

-- 外部API照合を行うEdge専用。ブラウザから「送信済み」を指定して更新できない。
CREATE OR REPLACE FUNCTION public.reconcile_private_delivery_receipt(
 p_kind text,p_delivery_id uuid,p_organization_id uuid,p_actor_id uuid,p_expected_updated_at timestamptz,
 p_provider_id text,p_sent_at timestamptz
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp SET row_security=off AS $$
DECLARE table_name text; d jsonb; token uuid:=gen_random_uuid();
BEGIN
 table_name:=CASE p_kind WHEN 'approval' THEN 'private_booking_approval_deliveries'
  WHEN 'survey' THEN 'private_group_survey_deliveries' WHEN 'rejection' THEN 'private_booking_rejection_deliveries' END;
 IF table_name IS NULL OR p_actor_id IS NULL OR p_provider_id IS NULL OR length(btrim(p_provider_id))=0 OR p_sent_at IS NULL THEN
  RAISE EXCEPTION 'INVALID_DELIVERY_RECEIPT' USING ERRCODE='22023';
 END IF;
 EXECUTE format('SELECT to_jsonb(d) FROM public.%I d WHERE id=$1 AND organization_id=$2 FOR UPDATE NOWAIT',table_name)
  INTO d USING p_delivery_id,p_organization_id;
 IF d IS NULL THEN RAISE EXCEPTION 'DELIVERY_NOT_FOUND' USING ERRCODE='22023'; END IF;
 IF d->>'status'='sent' AND d->>'provider_message_id'=p_provider_id THEN RETURN true; END IF;
 IF d->>'status' NOT IN ('uncertain','failed','superseded') OR (d->>'updated_at')::timestamptz IS DISTINCT FROM p_expected_updated_at
  OR d->>'first_attempt_at' IS NULL OR d->'provider_payload' IS NULL OR d->'provider_payload'='null'::jsonb THEN
  RAISE EXCEPTION 'DELIVERY_STATE_CHANGED' USING ERRCODE='40001';
 END IF;
 IF NOT pg_try_advisory_xact_lock(hashtextextended('private-delivery-receipt:'||p_provider_id,0)) THEN
  RAISE EXCEPTION 'DELIVERY_RECEIPT_BUSY' USING ERRCODE='55P03';
 END IF;
 -- 他の配送への受付IDの使い回しは許可しない。
 IF EXISTS(SELECT 1 FROM public.private_booking_approval_deliveries WHERE provider_message_id=p_provider_id AND (p_kind<>'approval' OR id<>p_delivery_id))
  OR EXISTS(SELECT 1 FROM public.private_group_survey_deliveries WHERE provider_message_id=p_provider_id AND (p_kind<>'survey' OR id<>p_delivery_id))
  OR EXISTS(SELECT 1 FROM public.private_booking_rejection_deliveries WHERE provider_message_id=p_provider_id AND (p_kind<>'rejection' OR id<>p_delivery_id)) THEN
  RAISE EXCEPTION 'DELIVERY_RECEIPT_REUSED' USING ERRCODE='22023';
 END IF;
 EXECUTE format('UPDATE public.%I SET status=''sending'',lease_token=$2,lease_until=now()+interval ''2 minutes'' WHERE id=$1',table_name)
  USING p_delivery_id,token;
 IF p_kind='approval' THEN PERFORM public.complete_private_approval_delivery(p_delivery_id,token,p_provider_id,p_sent_at);
 ELSIF p_kind='survey' THEN PERFORM public.complete_private_survey_delivery(p_delivery_id,token,p_provider_id,p_sent_at);
 ELSE PERFORM public.complete_private_rejection_delivery(p_delivery_id,token,p_provider_id,p_sent_at); END IF;
 INSERT INTO public.private_delivery_resolutions(organization_id,delivery_kind,delivery_id,actor_id,action,previous_status,provider_message_id)
 VALUES(p_organization_id,p_kind,p_delivery_id,p_actor_id,'provider_verified',d->>'status',p_provider_id);
 RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.reconcile_private_delivery_receipt(text,uuid,uuid,uuid,timestamptz,text,timestamptz) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.reconcile_private_delivery_receipt(text,uuid,uuid,uuid,timestamptz,text,timestamptz) TO service_role;

CREATE OR REPLACE FUNCTION public.get_private_booking_delivery_history(p_reservation_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp SET row_security=off AS $$
DECLARE r public.reservations%ROWTYPE; result jsonb;
BEGIN
 SELECT * INTO r FROM public.reservations WHERE id=p_reservation_id;
 IF auth.uid() IS NULL OR NOT FOUND OR public.get_user_organization_id() IS DISTINCT FROM r.organization_id
  OR NOT coalesce(public.is_org_admin() OR EXISTS(SELECT 1 FROM public.staff WHERE user_id=auth.uid()
   AND organization_id=r.organization_id AND status='active'),false) THEN
  RAISE EXCEPTION 'UNAUTHORIZED' USING ERRCODE='42501';
 END IF;
 SELECT coalesce(jsonb_agg(to_jsonb(d) ORDER BY d.created_at DESC,d.id),'[]'::jsonb) INTO result FROM (
  SELECT 'approval' AS delivery_kind,id,kind AS channel,status,snapshot->>'gmName' AS recipient_name,created_at,updated_at,last_error,
   status='failed' AND first_attempt_at IS NULL AND provider_message_id IS NULL AS can_retry,
   status IN ('uncertain','superseded','failed') AND first_attempt_at IS NOT NULL AS can_reconcile,
   status='uncertain' AND first_attempt_at IS NULL AND preparation_attempted_at IS NOT NULL AND provider_payload IS NULL AS can_resume_preparation
  FROM public.private_booking_approval_deliveries WHERE reservation_id=r.id AND organization_id=r.organization_id
  UNION ALL
  SELECT 'survey',id,'survey_email',status,'お客様',created_at,updated_at,last_error,
   status='failed' AND first_attempt_at IS NULL AND provider_message_id IS NULL,status IN ('uncertain','superseded','failed') AND first_attempt_at IS NOT NULL,false
  FROM public.private_group_survey_deliveries WHERE reservation_id=r.id AND organization_id=r.organization_id
  UNION ALL
  SELECT 'rejection',id,'rejection_email',status,'お客様',created_at,updated_at,last_error,
   status='failed' AND first_attempt_at IS NULL AND provider_message_id IS NULL,status IN ('uncertain','superseded','failed') AND first_attempt_at IS NOT NULL,false
  FROM public.private_booking_rejection_deliveries WHERE reservation_id=r.id AND organization_id=r.organization_id
 ) d;
 RETURN jsonb_build_object('organization_id',r.organization_id,'deliveries',result);
END $$;
REVOKE ALL ON FUNCTION public.get_private_booking_delivery_history(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_private_booking_delivery_history(uuid) TO authenticated,service_role;

CREATE OR REPLACE FUNCTION public.retry_private_unsent_delivery(p_kind text,p_delivery_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp SET row_security=off AS $$
DECLARE table_name text; d jsonb; r public.reservations%ROWTYPE; s public.staff%ROWTYPE;
 recipient text; recipient_name text; new_snapshot jsonb; old_log_id uuid; new_log_id uuid:=gen_random_uuid();
BEGIN
 table_name:=CASE p_kind WHEN 'approval' THEN 'private_booking_approval_deliveries' WHEN 'survey' THEN 'private_group_survey_deliveries'
  WHEN 'rejection' THEN 'private_booking_rejection_deliveries' END;
 IF table_name IS NULL OR auth.uid() IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED' USING ERRCODE='42501'; END IF;
 EXECUTE format('SELECT to_jsonb(d) FROM public.%I d WHERE id=$1',table_name) INTO d USING p_delivery_id;
 IF d IS NULL THEN RAISE EXCEPTION 'DELIVERY_NOT_FOUND' USING ERRCODE='22023'; END IF;
 SELECT * INTO r FROM public.reservations WHERE id=(d->>'reservation_id')::uuid AND organization_id=(d->>'organization_id')::uuid FOR UPDATE NOWAIT;
 IF NOT FOUND OR public.get_user_organization_id() IS DISTINCT FROM r.organization_id
  OR NOT coalesce(public.is_org_admin() OR EXISTS(SELECT 1 FROM public.staff WHERE user_id=auth.uid()
   AND organization_id=r.organization_id AND status='active'),false) THEN RAISE EXCEPTION 'UNAUTHORIZED' USING ERRCODE='42501'; END IF;
 EXECUTE format('SELECT to_jsonb(d) FROM public.%I d WHERE id=$1 FOR UPDATE NOWAIT',table_name) INTO d USING p_delivery_id;
 IF d->>'status'<>'failed' OR d->>'first_attempt_at' IS NOT NULL OR d->>'provider_message_id' IS NOT NULL THEN
  RAISE EXCEPTION 'DELIVERY_NOT_PROVEN_UNSENT' USING ERRCODE='55000';
 END IF;
 IF p_kind='approval' AND NOT public.is_private_approval_delivery_current(p_delivery_id) THEN
  RAISE EXCEPTION 'APPROVAL_CHANGED' USING ERRCODE='55000';
 ELSIF p_kind='survey' AND (r.status IS NULL OR r.status NOT IN ('confirmed','gm_confirmed','checked_in','completed')
  OR r.schedule_event_id IS DISTINCT FROM (d->>'schedule_event_id')::uuid
  OR NOT EXISTS(SELECT 1 FROM public.private_groups g WHERE g.id=(d->>'group_id')::uuid AND g.reservation_id=r.id AND g.organization_id=r.organization_id AND g.status='confirmed')) THEN
  RAISE EXCEPTION 'SURVEY_RESERVATION_CHANGED' USING ERRCODE='55000';
 ELSIF p_kind='rejection' AND (r.status IS DISTINCT FROM 'cancelled' OR r.cancelled_at IS DISTINCT FROM (d->>'cancelled_at')::timestamptz
  OR r.cancellation_reason IS DISTINCT FROM '貸切リクエストを却下しました'
  OR (r.private_group_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.private_groups g WHERE g.id=r.private_group_id AND g.organization_id=r.organization_id AND g.reservation_id=r.id AND g.status='date_adjusting'))) THEN
  RAISE EXCEPTION 'REJECTION_CHANGED' USING ERRCODE='55000';
 END IF;
 recipient:=nullif(btrim(r.customer_email),'');recipient_name:=coalesce(nullif(r.customer_name,''),'お客様');
 IF recipient IS NULL AND r.customer_id IS NOT NULL THEN
  SELECT nullif(btrim(c.email),''),coalesce(nullif(c.name,''),recipient_name) INTO recipient,recipient_name
   FROM public.customers c WHERE c.id=r.customer_id AND (c.organization_id=r.organization_id OR c.organization_id IS NULL);
 END IF;
 IF p_kind='approval' THEN
  new_snapshot:=d->'snapshot';
  IF d->>'kind'='confirmation_email' THEN
   new_snapshot:=new_snapshot||jsonb_build_object('customerEmail',recipient,'customerName',coalesce(recipient_name,'お客様'));
  ELSE
   SELECT * INTO STRICT s FROM public.staff WHERE id=(d->>'recipient_key')::uuid AND organization_id=r.organization_id AND status='active';
   new_snapshot:=new_snapshot||jsonb_build_object('gmEmail',nullif(btrim(s.email),''),'gmDiscordChannelId',nullif(btrim(s.discord_channel_id),''),'gmDiscordUserId',nullif(btrim(s.discord_user_id),''));
  END IF;
  UPDATE public.private_booking_approval_deliveries SET snapshot=new_snapshot WHERE id=p_delivery_id;
 ELSE
  EXECUTE format('UPDATE public.%I SET customer_email=$2,customer_name=$3 WHERE id=$1',table_name) USING p_delivery_id,recipient,coalesce(recipient_name,'お客様');
 END IF;
 old_log_id:=coalesce((d->>'email_log_id')::uuid,p_delivery_id);
 UPDATE public.email_logs SET status='failed',error_message='送信開始前の失敗。設定を更新して再試行を登録済み'
  WHERE id=old_log_id AND organization_id=r.organization_id AND status='queued' AND provider_message_id IS NULL;
 EXECUTE format('UPDATE public.%I SET status=''pending'',attempt_count=0,next_attempt_at=now(),provider_payload=NULL,provider_account_hash=NULL,
  email_log_id=$2,last_error=NULL,lease_token=NULL,lease_until=NULL,updated_at=now() WHERE id=$1',table_name) USING p_delivery_id,new_log_id;
 IF p_kind='approval' THEN UPDATE public.private_booking_approval_deliveries SET provider_target=NULL WHERE id=p_delivery_id; END IF;
 INSERT INTO public.private_delivery_resolutions(organization_id,delivery_kind,delivery_id,actor_id,action,previous_status)
 VALUES(r.organization_id,p_kind,p_delivery_id,auth.uid(),'retry_unsent','failed');
 RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.retry_private_unsent_delivery(text,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.retry_private_unsent_delivery(text,uuid) TO authenticated,service_role;

-- Discord準備の結果不明から復帰する。作成済み記録がある場合だけメール準備を再開する。
-- チャンネルを作り直すことも、送信開始済みの通知を再送することもない。
CREATE OR REPLACE FUNCTION public.resume_private_approval_preparation(p_delivery_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp SET row_security=off AS $$
DECLARE d public.private_booking_approval_deliveries%ROWTYPE; r public.reservations%ROWTYPE;
BEGIN
 SELECT * INTO d FROM public.private_booking_approval_deliveries WHERE id=p_delivery_id;
 IF NOT FOUND OR auth.uid() IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED' USING ERRCODE='42501'; END IF;
 SELECT * INTO r FROM public.reservations WHERE id=d.reservation_id AND organization_id=d.organization_id FOR UPDATE NOWAIT;
 IF NOT FOUND OR public.get_user_organization_id() IS DISTINCT FROM r.organization_id
  OR NOT coalesce(public.is_org_admin() OR EXISTS(SELECT 1 FROM public.staff WHERE user_id=auth.uid()
   AND organization_id=r.organization_id AND status='active'),false) THEN RAISE EXCEPTION 'UNAUTHORIZED' USING ERRCODE='42501'; END IF;
 SELECT * INTO STRICT d FROM public.private_booking_approval_deliveries WHERE id=p_delivery_id FOR UPDATE NOWAIT;
 IF d.status<>'uncertain' OR d.kind<>'confirmation_email' OR d.first_attempt_at IS NOT NULL
  OR d.provider_message_id IS NOT NULL OR d.provider_payload IS NOT NULL OR d.preparation_attempted_at IS NULL
  OR NOT public.is_private_approval_delivery_current(d.id) THEN
  RAISE EXCEPTION 'PREPARATION_NOT_RESUMABLE' USING ERRCODE='55000';
 END IF;
 IF NOT EXISTS(SELECT 1 FROM public.private_booking_discord_rooms room
  WHERE room.organization_id=d.organization_id AND room.reservation_id=d.reservation_id AND room.schedule_event_id=d.schedule_event_id
   AND nullif(btrim(room.player_invite_url),'') IS NOT NULL AND nullif(btrim(room.spectator_invite_url),'') IS NOT NULL) THEN
  RAISE EXCEPTION 'PREPARATION_RECORD_NOT_CONFIRMED' USING ERRCODE='55000';
 END IF;
 UPDATE public.private_booking_approval_deliveries SET status='pending',attempt_count=0,next_attempt_at=now(),
  last_error=NULL,lease_token=NULL,lease_until=NULL,updated_at=now() WHERE id=d.id;
 INSERT INTO public.private_delivery_resolutions(organization_id,delivery_kind,delivery_id,actor_id,action,previous_status)
 VALUES(d.organization_id,'approval',d.id,auth.uid(),'preparation_verified','uncertain');
 RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.resume_private_approval_preparation(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.resume_private_approval_preparation(uuid) TO authenticated,service_role;

CREATE OR REPLACE FUNCTION public.approve_private_booking_with_notifications(
 p_request_id uuid,p_reservation_id uuid,p_selected_date date,p_selected_start_time time,p_selected_end_time time,
 p_selected_store_id uuid,p_selected_gm_id uuid,p_candidate_datetimes jsonb,p_scenario_title text,
 p_customer_name text,p_selected_sub_gm_id uuid DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp SET row_security=off AS $$
DECLARE approval_result jsonb;
BEGIN
 approval_result:=public.approve_private_booking_with_delivery(p_request_id,p_reservation_id,p_selected_date,p_selected_start_time,
  p_selected_end_time,p_selected_store_id,p_selected_gm_id,p_candidate_datetimes,p_scenario_title,p_customer_name,p_selected_sub_gm_id);
 -- 旧版の通信再試行を、新しい通知要求と誤認しない。
 IF approval_result->>'replayed'='true' THEN RETURN approval_result; END IF;
 PERFORM public.enqueue_private_approval_deliveries(p_request_id);
 approval_result:=approval_result||jsonb_build_object('approval_delivery_queued',true);
 UPDATE public.private_booking_approval_requests AS receipt SET result=approval_result WHERE receipt.id=p_request_id;
 RETURN approval_result;
END $$;
REVOKE ALL ON FUNCTION public.approve_private_booking_with_notifications(uuid,uuid,date,time,time,uuid,uuid,jsonb,text,text,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.approve_private_booking_with_notifications(uuid,uuid,date,time,time,uuid,uuid,jsonb,text,text,uuid) TO authenticated,service_role;

NOTIFY pgrst, 'reload schema';
