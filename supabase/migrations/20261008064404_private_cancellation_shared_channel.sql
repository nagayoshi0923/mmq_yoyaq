-- 貸切キャンセルの追加通知先。既存GM通知・認可・復活時の取消を維持する。
CREATE OR REPLACE FUNCTION public.enqueue_private_cancellation(p_event schedule_events)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE s record; v_epoch uuid; v_body text; v_channel text;
BEGIN
  IF p_event.organization_id IS NULL OR NOT (coalesce(p_event.is_private_booking,false) OR p_event.category='private') THEN RETURN; END IF;
  v_epoch := coalesce(p_event.gm_cancel_epoch,p_event.id);
  v_body := format('貸切公演がキャンセルされました。担当予定の解除をご確認ください。%s%s %s〜%s%s作品：%s%s会場：%s',
    chr(10),p_event.date,to_char(p_event.start_time,'HH24:MI'),to_char(p_event.end_time,'HH24:MI'),
    chr(10),p_event.scenario,chr(10),p_event.venue);
  FOR s IN SELECT id,name,discord_channel_id FROM public.staff
    WHERE organization_id=p_event.organization_id AND name=ANY(p_event.gms)
  LOOP
    INSERT INTO public.discord_notification_queue
      (organization_id,notification_type,reference_id,dedupe_key,webhook_url,message_payload,max_retries)
    VALUES (p_event.organization_id,'private_cancellation',NULL,
      p_event.id::text||':'||v_epoch::text||':'||s.id::text,
      CASE WHEN nullif(trim(s.discord_channel_id),'') IS NOT NULL THEN 'https://discord.com/api/v10/channels/'||trim(s.discord_channel_id)||'/messages' ELSE '' END,
      jsonb_build_object('content',v_body,'staff_id',s.id,'event_id',p_event.id,'epoch',v_epoch,'allowed_mentions',jsonb_build_object('parse','[]'::jsonb)),3)
    ON CONFLICT (organization_id,notification_type,dedupe_key) DO NOTHING;
  END LOOP;
  SELECT nullif(btrim(notification_settings->>'private_cancellation_channel_id'),'')
    INTO v_channel FROM public.organization_settings WHERE organization_id=p_event.organization_id;
  IF v_channel ~ '^[0-9]{17,20}$' AND NOT EXISTS (
    SELECT 1 FROM public.staff WHERE organization_id=p_event.organization_id
      AND name=ANY(p_event.gms) AND btrim(discord_channel_id)=v_channel
  ) THEN
    INSERT INTO public.discord_notification_queue
      (organization_id,notification_type,reference_id,dedupe_key,webhook_url,message_payload,max_retries)
    VALUES (p_event.organization_id,'private_cancellation',NULL,
      p_event.id::text||':'||v_epoch::text||':channel:'||v_channel,
      'https://discord.com/api/v10/channels/'||v_channel||'/messages',
      jsonb_build_object('content',v_body||chr(10)||'担当GM：'||coalesce(array_to_string(p_event.gms,'、'),'未登録'),
        'channel_id',v_channel,'event_id',p_event.id,'epoch',v_epoch,
        'allowed_mentions',jsonb_build_object('parse','[]'::jsonb)),3)
    ON CONFLICT (organization_id,notification_type,dedupe_key) DO NOTHING;
  END IF;
END $function$
;
