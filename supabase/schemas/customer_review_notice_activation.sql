-- 来歴のない旧retryを黙って取り残さない。残件があれば切替を止め、承認された移行/排出を先に行う。
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM public.waitlist_notification_queue WHERE status IN ('pending','processing')) THEN
  RAISE EXCEPTION '旧キャンセル待ち通知キューに未処理があります。来歴を照合して移行/排出するまで反映できません' USING ERRCODE='P0057';
 END IF;
END $$;
-- notify-waitlist/process-waitlist-queue先行配備後に有効化。
REVOKE ALL ON FUNCTION public.notify_all_waitlist_entries(uuid) FROM PUBLIC,anon,authenticated,service_role;

-- 古いブラウザの失敗時fallbackは、新しいDBintentが存在する場合だけ冗長なwake-upとして無害化する。
CREATE OR REPLACE FUNCTION public.redirect_legacy_waitlist_retry() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF NEW.status='pending' AND EXISTS(SELECT 1 FROM public.waitlist_notice_events
 WHERE schedule_event_id=NEW.schedule_event_id AND organization_id=NEW.organization_id) THEN RETURN NULL; END IF;
 RAISE EXCEPTION '旧通知キューは停止済みです。保存済みの取消/減員通知を使用してください' USING ERRCODE='P0057';
END $$;
REVOKE ALL ON FUNCTION public.redirect_legacy_waitlist_retry() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER redirect_legacy_waitlist_retry BEFORE INSERT ON public.waitlist_notification_queue
FOR EACH ROW EXECUTE FUNCTION public.redirect_legacy_waitlist_retry();
