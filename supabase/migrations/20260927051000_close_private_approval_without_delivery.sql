-- QW-20260917-001: 画面移行後、配送予定を作らない旧承認入口をブラウザから閉鎖。
BEGIN;
REVOKE EXECUTE ON FUNCTION public.approve_private_booking_with_notice(uuid,date,time,time,uuid,uuid,jsonb,text,text,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.approve_private_booking_with_notice(uuid,date,time,time,uuid,uuid,jsonb,text,text,uuid) TO service_role;
COMMIT;
