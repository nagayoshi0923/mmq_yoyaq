-- 申込中の貸切リクエスト（公演未確定）をお客様が取り下げたとき、打診先GMと貸切キャンセル共有チャンネルへ知らせる。
-- 既存の enqueue_private_cancellation と同じ discord_notification_queue（private_cancellation）に積む。
-- 公演が無いので payload に event_id は入れない（配送側は event_id が無い行は復活判定をせずに送る）。
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
