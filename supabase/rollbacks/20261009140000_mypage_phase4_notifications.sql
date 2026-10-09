-- 20261009140000 の取り消し: 段階 4 の通知（ベルのトリガー・メールの送信待ち）を外し、変えた 2 つの関数を直前へ戻す
-- 注意: 送信待ちの表を消すと、まだ送っていないメールと送信の記録も消える。作られた通知ベル（user_notifications の行）は残る
BEGIN;
DO $$ BEGIN
  IF to_regclass('cron.job') IS NOT NULL AND EXISTS (SELECT 1 FROM cron.job WHERE jobname='process-customer-notice-emails') THEN
    PERFORM cron.unschedule('process-customer-notice-emails');
  END IF;
END $$;
DROP TRIGGER IF EXISTS customer_notice_on_group_message ON public.private_group_messages;
DROP TRIGGER IF EXISTS customer_notice_on_private_request ON public.reservations;
DROP TRIGGER IF EXISTS customer_notice_on_reservation_cancelled ON public.reservations;
DROP TRIGGER IF EXISTS customer_notice_on_participants_changed ON public.reservations;
DROP TRIGGER IF EXISTS customer_notice_on_performance_confirmed ON public.performance_recruitment_notices;
DROP TRIGGER IF EXISTS customer_notice_on_reminder_sent ON public.scheduled_reminder_deliveries;
DROP TRIGGER IF EXISTS customer_notice_on_coupon_granted ON public.customer_coupons;
DROP TRIGGER IF EXISTS customer_notice_on_survey_reminder ON public.private_group_survey_reminders;
DROP TRIGGER IF EXISTS customer_notice_on_handover_bell ON public.user_notifications;
DROP FUNCTION IF EXISTS public.customer_notice_on_group_message();
DROP FUNCTION IF EXISTS public.customer_notice_on_private_request();
DROP FUNCTION IF EXISTS public.customer_notice_on_reservation_cancelled();
DROP FUNCTION IF EXISTS public.customer_notice_on_participants_changed();
DROP FUNCTION IF EXISTS public.customer_notice_on_performance_confirmed();
DROP FUNCTION IF EXISTS public.customer_notice_on_reminder_sent();
DROP FUNCTION IF EXISTS public.customer_notice_on_coupon_granted();
DROP FUNCTION IF EXISTS public.customer_notice_on_survey_reminder();
DROP FUNCTION IF EXISTS public.customer_notice_on_handover_bell();
DROP FUNCTION IF EXISTS public.ensure_profile_incomplete_notice();
DROP FUNCTION IF EXISTS public.announce_mypage_update_2026_10();
DROP FUNCTION IF EXISTS public.claim_customer_notice_emails(integer);
DROP FUNCTION IF EXISTS public.finish_customer_notice_email(uuid,boolean,text,text,uuid,boolean);
-- 外された本人への知らせを外す（段階 3 時点の定義へ）
CREATE OR REPLACE FUNCTION public.private_group_remove_member_with_notice(p_member_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE target public.private_group_members%ROWTYPE; g public.private_groups%ROWTYPE; r public.reservations%ROWTYPE;
 v_name text; v_before integer; v_channel text; v_body text; v_store boolean:=false;
BEGIN
 SELECT * INTO target FROM public.private_group_members WHERE id=p_member_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'メンバーを削除できません' USING ERRCODE='42501'; END IF;
 SELECT * INTO g FROM public.private_groups WHERE id=target.group_id;
 SELECT count(*) INTO v_before FROM public.private_group_members WHERE group_id=g.id AND status='joined';
 v_name:=CASE WHEN target.user_id IS NULL THEN nullif(btrim(target.guest_name),'') ELSE coalesce(
   (SELECT coalesce(nullif(c.nickname,''),nullif(c.name,'')) FROM public.customers c WHERE c.user_id=target.user_id ORDER BY c.id LIMIT 1),
   nullif(btrim(target.guest_name),'')) END;
 -- 権限確認・クーポン解放・削除は既存の関数に任せる（主催者・スタッフのみ）
 PERFORM public.private_group_remove_member(p_member_id);
 IF EXISTS(SELECT 1 FROM public.private_group_members WHERE id=p_member_id) THEN
  RAISE EXCEPTION 'メンバーを外せませんでした' USING ERRCODE='P0001';
 END IF;
 IF target.status IS DISTINCT FROM 'joined' THEN RETURN jsonb_build_object('store_notified',false); END IF;
 INSERT INTO public.private_group_messages(group_id,sender_type,message) VALUES(g.id,'system',
  jsonb_build_object('type','system','action','member_removed','memberName',coalesce(v_name,'メンバー'))::text);
 -- 申込済み・確定後は店舗へ人数変更として知らせる（申込が取り消されていれば知らせない）
 SELECT * INTO r FROM public.reservations
  WHERE (id=g.reservation_id OR private_group_id=g.id) AND organization_id=g.organization_id AND status<>'cancelled'
  ORDER BY (id=g.reservation_id) DESC, created_at DESC LIMIT 1;
 IF FOUND AND g.status IN ('booking_requested','confirmed') THEN
  SELECT nullif(btrim(notification_settings->>'private_cancellation_channel_id'),'')
   INTO v_channel FROM public.organization_settings WHERE organization_id=g.organization_id;
  IF v_channel ~ '^[0-9]{17,20}$' THEN
   v_body:=format('貸切グループのメンバーが外れました（人数変更）。%s作品：%s%s予約番号：%s%s状態：%s%s参加人数：%s名 → %s名（申込時 %s名）%s外れた方：%s',
    chr(10), coalesce(nullif(regexp_replace(coalesce(r.title,''),'^【貸切希望】|^【貸切】',''),''),'不明'),
    chr(10), coalesce(r.reservation_number,'不明'),
    chr(10), CASE WHEN g.status='confirmed' THEN '確定済み' ELSE '申込中（店舗の確認待ち）' END,
    chr(10), v_before, greatest(v_before-1,0), coalesce(r.participant_count::text,'不明'),
    chr(10), coalesce(v_name,'メンバー'));
   INSERT INTO public.discord_notification_queue
    (organization_id,notification_type,reference_id,dedupe_key,webhook_url,message_payload,max_retries)
   VALUES (g.organization_id,'private_cancellation',NULL,
    r.id::text||':member_removed:'||p_member_id::text,
    'https://discord.com/api/v10/channels/'||v_channel||'/messages',
    jsonb_build_object('content',v_body,'channel_id',v_channel,'reservation_id',r.id,'epoch',r.id,
     'allowed_mentions',jsonb_build_object('parse','[]'::jsonb)),3)
   ON CONFLICT (organization_id,notification_type,dedupe_key) DO NOTHING;
   v_store:=true;
  END IF;
 END IF;
 RETURN jsonb_build_object('store_notified',v_store);
END $function$
;
-- 「予約が確定しました」ベルを直前へ（押した先 /mypage、貸切グループの予約にも出す）
CREATE OR REPLACE FUNCTION public.notify_on_reservation_confirmed()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_customer_user_id UUID;
  v_existing_notification_id UUID;
BEGIN
  -- customer_id が NULL の場合はスキップ（スタッフ予約など）
  IF NEW.customer_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- 予約がconfirmedまたはgm_confirmedになった場合
  IF NEW.status IN ('confirmed', 'gm_confirmed') AND 
     (OLD.status IS NULL OR OLD.status NOT IN ('confirmed', 'gm_confirmed')) THEN
    
    -- 既に同じ予約に対する確定通知が存在するかチェック（重複防止）
    SELECT id INTO v_existing_notification_id
    FROM user_notifications
    WHERE related_reservation_id = NEW.id
      AND type = 'reservation_confirmed'
    LIMIT 1;
    
    -- 既存の通知がある場合はスキップ
    IF v_existing_notification_id IS NOT NULL THEN
      RETURN NEW;
    END IF;
    
    -- 顧客のuser_idを取得
    SELECT user_id INTO v_customer_user_id
    FROM customers
    WHERE id = NEW.customer_id;
    
    -- user_id も customer_id も NULL の場合はスキップ
    IF v_customer_user_id IS NULL AND NEW.customer_id IS NULL THEN
      RETURN NEW;
    END IF;
    
    -- 通知を作成
    PERFORM create_notification(
      v_customer_user_id,
      NEW.customer_id,
      NEW.organization_id,
      'reservation_confirmed',
      '予約が確定しました',
      '「' || COALESCE(NEW.title, '公演') || '」のご予約を承りました',
      '/mypage',
      NEW.id,
      NEW.schedule_event_id,
      NULL,
      jsonb_build_object('reservation_number', NEW.reservation_number)
    );
  END IF;
  
  RETURN NEW;
END;
$function$
;
DROP FUNCTION IF EXISTS public.customer_notice_group_members(uuid,text,text,text,text,text,text,uuid[],boolean,text,text[],text,boolean);
DROP FUNCTION IF EXISTS public.customer_notice_enqueue_email(uuid,text,text,text,text,text,text,text[],text,text,boolean,uuid,uuid);
DROP FUNCTION IF EXISTS public.customer_notice_user_contact(uuid);
DROP FUNCTION IF EXISTS public.customer_notice_bell(uuid,uuid,uuid,text,text,text,text,text,text,uuid,uuid,jsonb);
DROP FUNCTION IF EXISTS public.customer_notice_reservation_link(public.reservations);
DROP FUNCTION IF EXISTS public.customer_notice_work_title(text);
DROP FUNCTION IF EXISTS public.customer_notice_when_long(date,time);
DROP FUNCTION IF EXISTS public.customer_notice_when(date,time);
DROP TABLE IF EXISTS public.customer_notice_emails;
DROP INDEX IF EXISTS public.user_notifications_dedupe_key_idx;
COMMIT;
