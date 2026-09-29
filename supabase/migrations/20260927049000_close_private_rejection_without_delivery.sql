-- QW-20260917-001: API移行後、配送予定を作らない旧却下入口をブラウザから閉鎖。
BEGIN;
REVOKE EXECUTE ON FUNCTION public.reject_private_booking_with_notice(uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.reject_private_booking_with_notice(uuid,text) TO service_role;
COMMIT;
