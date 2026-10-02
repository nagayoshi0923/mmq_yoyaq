-- H1: 旧顧客一覧の本文・データを維持し、外部の直接実行だけを閉じる。
-- 取得済みprod/staging本文に一致しない環境は別レビューを要求する。
BEGIN;
DO $h1_guard$
DECLARE
  f record;
  roles text[];
  plain_execute boolean;
BEGIN
  SELECT p.oid, p.proowner, p.prosrc, p.prosecdef, p.proretset,
         p.prorettype, p.proconfig, p.proacl
  INTO f FROM pg_proc p
  WHERE p.oid = to_regprocedure('public.get_org_customers(uuid)');
  IF NOT FOUND THEN
    RAISE EXCEPTION 'H1: 対象関数がありません' USING ERRCODE = '55000';
  END IF;
  IF md5(f.prosrc) <> '3ec1354069722203c583b66a8cc62e33'
     OR NOT f.prosecdef OR NOT f.proretset
     OR f.prorettype <> 'public.customers'::regtype
     OR f.proconfig IS DISTINCT FROM ARRAY['search_path=public']::text[] THEN
    RAISE EXCEPTION 'H1: 関数定義の再確認が必要です' USING ERRCODE = '55000';
  END IF;
  SELECT coalesce(array_agg(role_name ORDER BY role_name COLLATE "C"), ARRAY[]::text[]),
         coalesce(bool_and(privilege_type = 'EXECUTE' AND NOT is_grantable), true)
  INTO roles, plain_execute
  FROM (
    SELECT CASE WHEN a.grantee = 0 THEN 'PUBLIC'
                ELSE pg_get_userbyid(a.grantee)::text END AS role_name,
           a.privilege_type, a.is_grantable
    FROM aclexplode(coalesce(f.proacl, acldefault('f', f.proowner))) a
    WHERE a.grantee <> f.proowner
  ) acl;
  IF NOT plain_execute OR (
    roles IS DISTINCT FROM ARRAY['PUBLIC','anon','authenticated','service_role']::text[]
    AND roles IS DISTINCT FROM ARRAY['service_role']::text[]
  ) THEN
    RAISE EXCEPTION 'H1: 実行権限の再確認が必要です' USING ERRCODE = '55000';
  END IF;
END
$h1_guard$;

REVOKE EXECUTE ON FUNCTION public.get_org_customers(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_org_customers(uuid) TO service_role;

DO $h1_effective$
BEGIN
  IF has_function_privilege('anon','public.get_org_customers(uuid)','EXECUTE')
     OR has_function_privilege('authenticated','public.get_org_customers(uuid)','EXECUTE')
     OR NOT has_function_privilege('service_role','public.get_org_customers(uuid)','EXECUTE') THEN
    RAISE EXCEPTION 'H1: 継承を含む実効権限を確認してください' USING ERRCODE = '55000';
  END IF;
END
$h1_effective$;
COMMIT;
