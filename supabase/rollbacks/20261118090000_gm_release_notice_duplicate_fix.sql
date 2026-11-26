-- rollback: #1321 の修正前（reference_id に公演IDを入れる）に戻す。戻すと #1321 の不具合も戻る。
CREATE OR REPLACE FUNCTION public.enqueue_gm_assignment_released(p_event public.schedule_events, p_names text[], p_kind text, p_reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE s record; v_body text; v_head text;
BEGIN
  IF p_event.organization_id IS NULL OR coalesce(cardinality(p_names),0)=0 THEN RETURN; END IF;
  v_head := CASE p_kind
    WHEN 'cancelled' THEN '公演が中止になりました。担当予定の解除をご確認ください。'
    WHEN 'deleted' THEN '公演が削除されました。担当予定の解除をご確認ください。'
    ELSE '担当が外れました。担当予定の解除をご確認ください。' END;
  v_body := v_head||chr(10)||p_event.date::text||' '||coalesce(to_char(p_event.start_time,'HH24:MI'),'')
    ||CASE WHEN p_event.end_time IS NOT NULL THEN '〜'||to_char(p_event.end_time,'HH24:MI') ELSE '' END
    ||chr(10)||'作品：'||coalesce(nullif(p_event.scenario,''),'未定')
    ||chr(10)||'会場：'||coalesce(nullif(p_event.venue,''),'未定')
    ||CASE WHEN nullif(btrim(coalesce(p_reason,'')),'') IS NOT NULL THEN chr(10)||'理由：'||btrim(p_reason) ELSE '' END;
  FOR s IN SELECT id,discord_channel_id FROM public.staff
    WHERE organization_id=p_event.organization_id AND name=ANY(p_names) AND status='active'
      AND nullif(btrim(coalesce(discord_channel_id,'')),'') IS NOT NULL
  LOOP
    INSERT INTO public.discord_notification_queue
      (organization_id,notification_type,reference_id,dedupe_key,webhook_url,message_payload,max_retries)
    VALUES (p_event.organization_id,'gm_assignment_released',p_event.id,
      p_event.id::text||':'||p_kind||':'||s.id::text||':'||txid_current()::text,
      'https://discord.com/api/v10/channels/'||btrim(s.discord_channel_id)||'/messages',
      jsonb_build_object('content',v_body,'allowed_mentions',jsonb_build_object('parse','[]'::jsonb)),3)
    ON CONFLICT (organization_id,notification_type,dedupe_key) DO NOTHING;
  END LOOP;
END $$;
REVOKE ALL ON FUNCTION public.enqueue_gm_assignment_released(public.schedule_events,text[],text,text) FROM PUBLIC,anon,authenticated;
