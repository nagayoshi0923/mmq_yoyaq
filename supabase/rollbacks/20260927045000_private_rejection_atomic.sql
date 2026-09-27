-- 新API/画面を旧経路へ戻してから適用する。既存の予約・通知は削除しない。
DROP FUNCTION IF EXISTS public.reject_private_booking_with_notice(uuid,text);
