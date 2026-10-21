-- 20261011150000 の取り消し: 「予約が確定しました」ベルの本文を日時なしに戻す（20261009140000 の定義）
BEGIN;
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

  -- 貸切グループの予約はグループのお知らせ（日程が確定しました）で全員に出す（段階 4）
  IF NEW.private_group_id IS NOT NULL THEN
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

    -- 通知を作成（押した先は予約詳細）
    PERFORM create_notification(
      v_customer_user_id,
      NEW.customer_id,
      NEW.organization_id,
      'reservation_confirmed',
      '予約が確定しました',
      '「' || COALESCE(NEW.title, '公演') || '」のご予約を承りました',
      '/mypage/reservation/' || NEW.id::text,
      NEW.id,
      NEW.schedule_event_id,
      NULL,
      jsonb_build_object('reservation_number', NEW.reservation_number)
    );
  END IF;

  RETURN NEW;
END;
$function$;
COMMIT;
