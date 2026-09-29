-- 新しい一括保存の本番受入後に適用。所有者経由とservice_roleを保持する。
BEGIN;
REVOKE EXECUTE ON FUNCTION public.mark_private_group_rejected_after_booking_rejection(uuid) FROM PUBLIC,anon,authenticated;
COMMIT;
