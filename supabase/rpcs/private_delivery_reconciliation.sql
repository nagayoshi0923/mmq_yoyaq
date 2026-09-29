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
