-- 本番の適用前ACLへ復元する。検証環境だけは下記のPUBLIC復元も必要。
-- GRANT EXECUTE ON FUNCTION public.mark_private_group_rejected_after_booking_rejection(uuid) TO PUBLIC;
BEGIN;
GRANT EXECUTE ON FUNCTION public.mark_private_group_rejected_after_booking_rejection(uuid) TO anon,authenticated;
COMMIT;
