ALTER TABLE public.performance_recruitment_notices ADD COLUMN first_failed_at timestamptz;

-- メール結果とDiscord通知予約を同じトランザクションに保持する。
CREATE FUNCTION public.queue_recruitment_mail_alert() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_kind text; v_kinds text[]:='{}'; v_channel text; v_message text;
BEGIN
 IF NEW.status='failed' THEN
  NEW.first_failed_at:=COALESCE(OLD.first_failed_at,now());
  IF OLD.first_failed_at IS NULL THEN v_kinds:=array_append(v_kinds,'recruitment_mail_failed'); END IF;
  IF NEW.attempts>=10 THEN v_kinds:=array_append(v_kinds,'recruitment_mail_exhausted'); END IF;
 ELSIF NEW.status='sent' AND OLD.first_failed_at IS NOT NULL THEN
  v_kinds:=array_append(v_kinds,'recruitment_mail_recovered');
 ELSIF NEW.status='expired' AND OLD.first_failed_at IS NOT NULL THEN
  v_kinds:=array_append(v_kinds,'recruitment_mail_exhausted');
 END IF;
 IF cardinality(v_kinds)=0 THEN RETURN NEW; END IF;
 SELECT discord_business_channel_id INTO v_channel FROM organization_settings WHERE organization_id=NEW.organization_id;
 IF v_channel IS NULL OR v_channel !~ '^[0-9]+$' THEN RAISE EXCEPTION '開催・中止通知のDiscord送信先が未設定です'; END IF;
 FOREACH v_kind IN ARRAY v_kinds LOOP
  v_message:=CASE v_kind
   WHEN 'recruitment_mail_failed' THEN '【追加募集メール：送信失敗】自動再送を続けています。'
   WHEN 'recruitment_mail_recovered' THEN '【追加募集メール：送信できました】先ほど失敗したメールの送信処理が成功しました。'
   ELSE '【追加募集メール：運営対応依頼】自動送信を完了できませんでした。運営担当は電話やDMなど別の方法でお客様への連絡をお願いします。' END;
  v_message:=v_message||E'\n'||COALESCE(NEW.snapshot->>'date','')||' '||COALESCE(NEW.snapshot->>'start_time','')||' '||COALESCE(NEW.snapshot->>'scenario','')
   ||E'\n通知参照: '||NEW.id::text||E'\n予約参照: '||NEW.reservation_id::text;
  INSERT INTO discord_notification_queue(organization_id,webhook_url,message_payload,notification_type,reference_id,dedupe_key,max_retries,next_retry_at)
   VALUES(NEW.organization_id,'https://discord.com/api/v10/channels/'||v_channel||'/messages',
    jsonb_build_object('content',v_message,'allowed_mentions',jsonb_build_object('parse','[]'::jsonb)),v_kind,NEW.id,NEW.id::text,10,now())
   ON CONFLICT DO NOTHING;
 END LOOP;
 RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.queue_recruitment_mail_alert() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER queue_recruitment_mail_alert BEFORE UPDATE OF status ON public.performance_recruitment_notices
 FOR EACH ROW EXECUTE FUNCTION public.queue_recruitment_mail_alert();

-- 最終試行の通信断、または締切到達により再送できなくなった失敗を回収する。
CREATE FUNCTION public.recover_recruitment_mail_alerts() RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 UPDATE discord_notification_queue SET status='pending',updated_at=now()
  WHERE notification_type IN ('recruitment_mail_failed','recruitment_mail_recovered','recruitment_mail_exhausted')
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
