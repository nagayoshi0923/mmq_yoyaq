-- 新しい通知付き入口の本番受入後に適用する。所有者経由とサービス権限は保持する。
BEGIN;
REVOKE EXECUTE ON FUNCTION public.cancel_reservation_and_group_with_lock(uuid,uuid,text) FROM PUBLIC,anon,authenticated;
COMMIT;
