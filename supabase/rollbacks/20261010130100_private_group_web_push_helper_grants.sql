-- 20261010130100 の取り消し: 補助関数・トリガー関数の service_role への実行権限を外す（staging の適用前の状態）
REVOKE EXECUTE ON FUNCTION public.web_push_kick() FROM service_role;
REVOKE EXECUTE ON FUNCTION public.web_push_on_group_message() FROM service_role;
REVOKE EXECUTE ON FUNCTION public.web_push_on_user_notification() FROM service_role;
REVOKE EXECUTE ON FUNCTION public.private_group_on_date_response() FROM service_role;
REVOKE EXECUTE ON FUNCTION public.web_push_group_title(uuid) FROM service_role;
REVOKE EXECUTE ON FUNCTION public.web_push_snippet(text, integer) FROM service_role;
REVOKE EXECUTE ON FUNCTION public.web_push_group_enabled(uuid, uuid) FROM service_role;
