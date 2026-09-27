-- 両環境で確認した適用前ACLへ戻す。業務データ・配送記録には触れない。
BEGIN;
REVOKE EXECUTE ON FUNCTION public.reject_private_booking_with_notice(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.reject_private_booking_with_notice(uuid,text) TO authenticated,service_role;
COMMIT;
