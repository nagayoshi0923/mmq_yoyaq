CREATE FUNCTION public.enqueue_recruitment_x_post() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF TG_OP='UPDATE' AND NEW.status=OLD.status AND NEW.cycle=OLD.cycle THEN RETURN NEW; END IF;
 IF NOT EXISTS(SELECT 1 FROM performance_recruitment_policies WHERE organization_id=NEW.organization_id AND one_seat_enabled AND x_enabled AND x_username='queens_waltz') THEN RETURN NEW; END IF;
 INSERT INTO recruitment_x_posts(organization_id,schedule_event_id,cycle,kind,snapshot)
 VALUES(NEW.organization_id,NEW.schedule_event_id,NEW.cycle,CASE NEW.status WHEN 'active' THEN 'extension' ELSE NEW.status END,recruitment_event_snapshot(NEW.organization_id,NEW.schedule_event_id)) ON CONFLICT DO NOTHING;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.enqueue_recruitment_x_post() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER enqueue_recruitment_x_post AFTER INSERT OR UPDATE OF status,cycle ON public.performance_recruitment_deadlines FOR EACH ROW EXECUTE FUNCTION public.enqueue_recruitment_x_post();

CREATE FUNCTION public.claim_recruitment_x_posts(p_org uuid) RETURNS SETOF public.recruitment_x_posts
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 -- 通信結果不明の投稿は再投稿せず、運営へ照合を依頼する。
 UPDATE recruitment_x_posts SET status='uncertain',last_error='送信処理の結果が不明です。X上の投稿を確認してください。',updated_at=now() WHERE organization_id=p_org AND status='sending' AND lease_until<now();
 RETURN QUERY WITH candidates AS(SELECT j.id FROM recruitment_x_posts j JOIN performance_recruitment_policies p ON p.organization_id=j.organization_id
 WHERE j.organization_id=p_org AND p.x_enabled AND p.one_seat_enabled AND p.x_username='queens_waltz' AND j.status IN ('pending','failed') AND j.attempts<10 AND j.next_attempt_at<=now()
 ORDER BY j.created_at,j.kind='extension' DESC LIMIT 5 FOR UPDATE OF j SKIP LOCKED)
 UPDATE recruitment_x_posts j SET status='sending',attempts=attempts+1,lease_until=now()+interval '2 minutes',updated_at=now() FROM candidates c WHERE j.id=c.id RETURNING j.*;
END $$;
REVOKE ALL ON FUNCTION public.claim_recruitment_x_posts(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_recruitment_x_posts(uuid) TO service_role;

CREATE FUNCTION public.alert_recruitment_x_result() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE message text; kind text;
BEGIN
 IF NEW.status IN ('failed','uncertain') THEN
  NEW.first_failed_at:=COALESCE(OLD.first_failed_at,now());
  IF OLD.first_failed_at IS NULL THEN kind:='recruitment_x_failed';message:='【追加募集X告知：送信失敗】'; END IF;
  IF NEW.status='uncertain' OR NEW.attempts>=10 THEN kind:='recruitment_x_attention';message:='【追加募集X告知：運営対応依頼】投稿の有無をXで確認してください。重複防止のため自動再投稿を停止しています。'; END IF;
 ELSIF NEW.status='sent' AND OLD.first_failed_at IS NOT NULL THEN kind:='recruitment_x_recovered';message:='【追加募集X告知：投稿できました】';
 END IF;
 IF kind IS NOT NULL THEN PERFORM queue_recruitment_operation_alert(NEW.organization_id,NEW.schedule_event_id,kind,NEW.id::text,message||E'\n'||COALESCE(NEW.snapshot->>'scenario','')||E'\n通知参照: '||NEW.id::text); END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.alert_recruitment_x_result() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER alert_recruitment_x_result BEFORE UPDATE OF status ON public.recruitment_x_posts FOR EACH ROW EXECUTE FUNCTION public.alert_recruitment_x_result();
