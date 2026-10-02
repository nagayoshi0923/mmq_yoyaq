-- rollback: get_org_customers(uuid) の実行権限を H1 適用前（PUBLIC / anon / authenticated / service_role）へ戻す。
GRANT EXECUTE ON FUNCTION public.get_org_customers(uuid) TO PUBLIC, anon, authenticated, service_role;
