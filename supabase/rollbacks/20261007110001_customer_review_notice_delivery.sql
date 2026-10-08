-- 安全なforward復旧専用。配送intent/使用履歴を保持し、旧匿名権限や送信前消費を復活させない。
-- 旧UI/APIだけを復旧する場合も新DB/Edgeは維持。関数変更は検証済みforward migrationで行う。
REVOKE ALL ON FUNCTION public.notify_all_waitlist_entries(uuid) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.apply_coupon_to_group_member(uuid,uuid),public.remove_coupon_from_group_member(uuid) FROM PUBLIC,anon;
