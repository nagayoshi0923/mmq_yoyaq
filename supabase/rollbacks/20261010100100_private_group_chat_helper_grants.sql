-- 20261010100100 の取り消し: 補助関数の service_role への実行権限を外す（staging の適用前の状態）
REVOKE EXECUTE ON FUNCTION public.private_group_member_display_name(uuid) FROM service_role;
REVOKE EXECUTE ON FUNCTION public.private_group_message_is_system(text) FROM service_role;
