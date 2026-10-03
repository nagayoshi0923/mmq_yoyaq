-- 正本（#714）
-- #714: スタッフの操作で担当が外れた GM へ Discord で知らせる（社長判断 2026-10-04）。
-- 対象: スタッフが公演を中止したとき（中止日時が入る。自動の中止判定は中止日時を入れず、別の通知で GM に知らせている）、
--       公演を削除したとき、GM を外した・差し替えたとき。
-- 対象外: 貸切公演の中止・削除（private_cancellation で既に知らせている）、過去の公演、中止済みの公演。
-- 送り先は各 GM の個人チャンネル（discord_channel_id）。送信は既存の Discord 通知の予約表（5分ごとに送信）で行う。

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

CREATE OR REPLACE FUNCTION public.gm_assignment_released_trigger()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_today date := (now() AT TIME ZONE 'Asia/Tokyo')::date; v_private boolean; v_removed text[];
BEGIN
  IF TG_OP='DELETE' THEN
    v_private := coalesce(OLD.is_private_booking,false) OR OLD.category='private';
    IF OLD.is_cancelled IS NOT TRUE AND NOT v_private AND OLD.date>=v_today THEN
      PERFORM public.enqueue_gm_assignment_released(OLD,OLD.gms,'deleted',NULL);
    END IF;
    RETURN OLD;
  END IF;
  IF NEW.date<v_today AND OLD.date<v_today THEN RETURN NEW; END IF;
  v_private := coalesce(NEW.is_private_booking,false) OR NEW.category='private';
  -- スタッフの中止（中止日時が入る）。自動の中止判定は中止日時を入れない。
  IF OLD.is_cancelled IS NOT TRUE AND NEW.is_cancelled IS TRUE THEN
    IF NOT v_private AND NEW.cancelled_at IS NOT NULL AND NEW.cancelled_at IS DISTINCT FROM OLD.cancelled_at THEN
      PERFORM public.enqueue_gm_assignment_released(OLD,OLD.gms,'cancelled',NEW.cancellation_reason);
    END IF;
    RETURN NEW;
  END IF;
  -- 中止されていない公演で GM が外れた
  IF NEW.is_cancelled IS NOT TRUE AND OLD.gms IS DISTINCT FROM NEW.gms THEN
    SELECT coalesce(array_agg(DISTINCT btrim(n)),'{}') INTO v_removed
      FROM unnest(coalesce(OLD.gms,'{}')) n
      WHERE nullif(btrim(n),'') IS NOT NULL AND NOT (btrim(n)=ANY(coalesce(NEW.gms,'{}')));
    IF cardinality(v_removed)>0 THEN
      PERFORM public.enqueue_gm_assignment_released(NEW,v_removed,'gm_changed',NULL);
    END IF;
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.gm_assignment_released_trigger() FROM PUBLIC,anon,authenticated;

DROP TRIGGER IF EXISTS gm_assignment_released ON public.schedule_events;
CREATE TRIGGER gm_assignment_released AFTER UPDATE OF gms,is_cancelled OR DELETE ON public.schedule_events
  FOR EACH ROW EXECUTE FUNCTION public.gm_assignment_released_trigger();
