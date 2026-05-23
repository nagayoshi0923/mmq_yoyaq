-- 20260524020000: email_logs.email_type に 'coupon_granted' を追加
--
-- coupon_campaigns.notify_on_grant=true のキャンペーンで配布した際に
-- 送信される「クーポン付与通知」用の専用 type。

ALTER TABLE public.email_logs
  DROP CONSTRAINT IF EXISTS email_logs_email_type_check;

ALTER TABLE public.email_logs
  ADD CONSTRAINT email_logs_email_type_check
  CHECK (email_type IN (
    'reservation_confirmed',
    'reservation_cancelled',
    'reservation_changed',
    'reservation_request',
    'reminder',
    'gm_notification',
    'staff_invitation',
    'waitlist_confirmed',
    'guest_pin',
    'performance_cancellation',
    'license_report',
    'contact_inquiry',
    'coupon_granted',
    'other'
  ));

DO $$
BEGIN
  RAISE NOTICE '✅ email_logs.email_type に coupon_granted を追加';
END $$;
