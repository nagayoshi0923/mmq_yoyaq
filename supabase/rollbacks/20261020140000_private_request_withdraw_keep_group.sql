-- 20261020140000_private_request_withdraw_keep_group の巻き戻し。
-- グループを残す取り下げの関数を消し、申込取消のお知らせと店舗への取り下げ通知を
-- 20261009140000_mypage_phase4_notifications / 20261008140000_private_request_withdrawal_notice の定義へ戻す。
-- すでにグループを残して取り下げた申込（取消済み）とグループ（募集中）はそのまま残る（申込し直しも従来の入口でできる）。
BEGIN;
DROP FUNCTION IF EXISTS public.withdraw_private_request_keep_group(uuid);

CREATE OR REPLACE FUNCTION public.customer_notice_on_reservation_cancelled()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $function$
DECLARE v_user uuid; v_work text; v_when text; v_event_cancelled boolean; v_private boolean; v_link text; v_key text;
 v_title text; v_msg text; v_kind text; v_bell uuid; v_email text; v_name text; v_count integer; v_group boolean;
BEGIN
 BEGIN
  SELECT user_id INTO v_user FROM public.customers WHERE id=NEW.customer_id;
  v_work := public.customer_notice_work_title(NEW.title);
  SELECT public.customer_notice_when(e.date,e.start_time), coalesce(e.is_cancelled,false) INTO v_when, v_event_cancelled
    FROM public.schedule_events e WHERE e.id=NEW.schedule_event_id;
  v_private := NEW.private_group_id IS NOT NULL OR NEW.reservation_source='web_private';
  v_link := public.customer_notice_reservation_link(NEW);
  v_key := 'reservation_cancelled:'||NEW.id::text||':'||coalesce(floor(extract(epoch FROM NEW.cancelled_at))::bigint::text,'0');
  IF NOT v_private THEN
   IF coalesce(NEW.cancellation_reason,'') LIKE '%公演中止%' OR coalesce(v_event_cancelled,false) THEN
    v_kind := 'performance_cancelled'; v_title := '公演が中止になりました';
    v_msg := format('「%s」%sの公演は中止になりました。',v_work,coalesce(' '||v_when,''));
   ELSE
    v_kind := 'reservation_cancelled'; v_title := '予約がキャンセルされました';
    v_msg := format('「%s」%sのご予約はキャンセルされました。',v_work,coalesce(' '||v_when,''));
   END IF;
  ELSIF NEW.cancellation_reason='お客様による貸切申込の取り下げ' THEN
   v_kind := 'private_withdrawn'; v_title := '貸切の申込を取り下げました';
   v_msg := format('「%s」の貸切の申込を取り下げました（予約番号 %s）。',v_work,coalesce(NEW.reservation_number,'-'));
  ELSIF NEW.cancellation_reason='貸切リクエストを却下しました' THEN
   v_kind := 'private_rejected'; v_title := '店舗が貸切の申込をお断りしました';
   v_msg := format('「%s」の貸切の申込は、店舗の都合によりお受けできませんでした。詳しくはお送りしたメール・グループのお知らせをご確認ください。',v_work);
  ELSE
   v_kind := 'private_cancelled'; v_title := '貸切のご予約がキャンセルされました';
   v_msg := format('「%s」の貸切%sはキャンセルされました。',v_work,coalesce('（'||v_when||'）',''));
  END IF;
  v_bell := public.customer_notice_bell(v_user,NEW.customer_id,NEW.organization_id,'reservation_cancelled',v_kind,v_key,v_title,v_msg,v_link,
   NEW.id,NEW.schedule_event_id,jsonb_build_object('reservation_number',NEW.reservation_number,'cancellation_reason',NEW.cancellation_reason));
  IF v_kind='private_withdrawn' THEN
   -- 控えのメール（申込者）
   SELECT c.email, c.name INTO v_email, v_name FROM public.customer_notice_user_contact(v_user) c WHERE v_user IS NOT NULL;
   v_email := coalesce(nullif(btrim(NEW.customer_email),''),(SELECT nullif(btrim(email),'') FROM public.customers WHERE id=NEW.customer_id),v_email);
   v_name := coalesce(nullif(btrim(NEW.customer_name),''),v_name);
   v_count := CASE WHEN jsonb_typeof(NEW.candidate_datetimes->'candidates')='array' THEN jsonb_array_length(NEW.candidate_datetimes->'candidates') END;
   v_group := NEW.private_group_id IS NOT NULL;
   PERFORM public.customer_notice_enqueue_email(NEW.organization_id,'private_withdrawn',v_key||':mail','reservation_cancelled',v_email,v_name,
    '【申込の取り下げ】'||v_work,
    ARRAY[format('「%s」の貸切の申込を取り下げました。控えとしてお送りします。',v_work),'','■ 取り下げた申込','作品: '||v_work,
     CASE WHEN NEW.reservation_number IS NOT NULL THEN '予約番号: '||NEW.reservation_number END,
     CASE WHEN v_count IS NOT NULL THEN '候補日: '||v_count||'件（申込中だったもの）' END,
     CASE WHEN NEW.participant_count IS NOT NULL THEN '参加人数: '||NEW.participant_count||'名' END,
     CASE WHEN v_group THEN '' END,
     CASE WHEN v_group THEN 'グループは閉じられ、メンバーの皆さまにもお知らせしました。' END],
    v_link,
    CASE WHEN v_group THEN 'ご不明な点は、グループ画面の歯車マークから「店舗へのお問い合わせ」をご利用ください。' END,
    false,v_bell);
  END IF;
 EXCEPTION WHEN others THEN
  RAISE WARNING 'customer_notice_on_reservation_cancelled failed: %', SQLERRM;
 END;
 RETURN NULL;
END $function$;
REVOKE ALL ON FUNCTION public.customer_notice_on_reservation_cancelled() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS customer_notice_on_reservation_cancelled ON public.reservations;
CREATE TRIGGER customer_notice_on_reservation_cancelled AFTER UPDATE OF status ON public.reservations
 FOR EACH ROW WHEN (NEW.status='cancelled' AND OLD.status IS DISTINCT FROM 'cancelled' AND NEW.customer_id IS NOT NULL)
 EXECUTE FUNCTION public.customer_notice_on_reservation_cancelled();

CREATE OR REPLACE FUNCTION public.enqueue_private_request_withdrawal(p_reservation_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE r public.reservations; s record; v_body text; v_channel text; v_candidates text; v_customer text; v_gms text;
BEGIN
  SELECT * INTO r FROM public.reservations WHERE id=p_reservation_id;
  IF NOT FOUND OR r.organization_id IS NULL OR r.schedule_event_id IS NOT NULL
    OR NOT (r.private_group_id IS NOT NULL OR r.reservation_source='web_private')
    OR r.status<>'cancelled' THEN RETURN; END IF;
  SELECT string_agg(format('・%s(%s) %s〜%s', c->>'date',
      (ARRAY['日','月','火','水','木','金','土'])[extract(dow FROM (c->>'date')::date)::int+1],
      coalesce(c->>'startTime','--:--'), coalesce(c->>'endTime','--:--')), chr(10) ORDER BY ord)
    INTO v_candidates
    FROM jsonb_array_elements(CASE WHEN jsonb_typeof(r.candidate_datetimes->'candidates')='array'
      THEN r.candidate_datetimes->'candidates' ELSE '[]'::jsonb END) WITH ORDINALITY AS t(c,ord)
    WHERE ord<=6 AND (c->>'date') ~ '^\d{4}-\d{2}-\d{2}$';
  SELECT coalesce(nullif(btrim(r.customer_name),''),
      (SELECT nullif(btrim(name),'') FROM public.customers WHERE id=r.customer_id), '不明')
    INTO v_customer;
  v_body := format('貸切の申込がお客様により取り下げられました。%s作品：%s%s候補日時：%s%s%s参加人数：%s名%s申込者：%s%s予約番号：%s',
    chr(10), coalesce(nullif(regexp_replace(coalesce(r.title,''),'^【貸切希望】',''),''),'不明'),
    chr(10), chr(10), coalesce(v_candidates,'（候補なし）'),
    chr(10), coalesce(r.participant_count::text,'不明'),
    chr(10), v_customer,
    chr(10), coalesce(r.reservation_number,'不明'));
  FOR s IN SELECT DISTINCT st.id, btrim(st.discord_channel_id) AS channel
    FROM public.gm_availability_responses g
    JOIN public.staff st ON st.id=g.staff_id AND st.organization_id=r.organization_id
    WHERE g.reservation_id=r.id AND nullif(btrim(st.discord_channel_id),'') IS NOT NULL
  LOOP
    INSERT INTO public.discord_notification_queue
      (organization_id,notification_type,reference_id,dedupe_key,webhook_url,message_payload,max_retries)
    VALUES (r.organization_id,'private_cancellation',NULL,
      r.id::text||':withdraw:'||s.id::text,
      'https://discord.com/api/v10/channels/'||s.channel||'/messages',
      jsonb_build_object('content',v_body,'staff_id',s.id,'reservation_id',r.id,'epoch',r.id,
        'allowed_mentions',jsonb_build_object('parse','[]'::jsonb)),3)
    ON CONFLICT (organization_id,notification_type,dedupe_key) DO NOTHING;
  END LOOP;
  SELECT nullif(btrim(notification_settings->>'private_cancellation_channel_id'),'')
    INTO v_channel FROM public.organization_settings WHERE organization_id=r.organization_id;
  IF v_channel ~ '^[0-9]{17,20}$' AND NOT EXISTS (
    SELECT 1 FROM public.gm_availability_responses g
      JOIN public.staff st ON st.id=g.staff_id AND st.organization_id=r.organization_id
    WHERE g.reservation_id=r.id AND btrim(st.discord_channel_id)=v_channel
  ) THEN
    SELECT string_agg(DISTINCT st.name,'、') INTO v_gms
      FROM public.gm_availability_responses g
      JOIN public.staff st ON st.id=g.staff_id AND st.organization_id=r.organization_id
     WHERE g.reservation_id=r.id;
    INSERT INTO public.discord_notification_queue
      (organization_id,notification_type,reference_id,dedupe_key,webhook_url,message_payload,max_retries)
    VALUES (r.organization_id,'private_cancellation',NULL,
      r.id::text||':withdraw:channel:'||v_channel,
      'https://discord.com/api/v10/channels/'||v_channel||'/messages',
      jsonb_build_object('content',v_body||chr(10)||'打診先GM：'||coalesce(v_gms,'なし'),
        'channel_id',v_channel,'reservation_id',r.id,'epoch',r.id,
        'allowed_mentions',jsonb_build_object('parse','[]'::jsonb)),3)
    ON CONFLICT (organization_id,notification_type,dedupe_key) DO NOTHING;
  END IF;
END $function$
;
REVOKE ALL ON FUNCTION public.enqueue_private_request_withdrawal(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.enqueue_private_request_withdrawal(uuid) TO service_role;
COMMIT;
