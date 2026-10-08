-- 旧本体の復元は安全な認可/配送を巻き戻すため禁止。forward復旧でデータと安全なACLを維持する。
REVOKE ALL ON FUNCTION public.apply_coupon_to_group_member(uuid,uuid),public.remove_coupon_from_group_member(uuid) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.notify_all_waitlist_entries(uuid) FROM PUBLIC,anon,authenticated,service_role;
