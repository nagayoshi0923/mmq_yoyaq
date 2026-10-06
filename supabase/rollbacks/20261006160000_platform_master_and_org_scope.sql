-- rollback: 組織ごとの追加の制限を外し、マスターの仕組みを取り除く（他組織の管理者が届く状態に戻るので、戻すのは業務が止まった場合だけ）
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT tablename, policyname FROM pg_policies WHERE schemaname='public' AND policyname IN ('org_scope_restrict','org_scope_restrict_insert','org_scope_restrict_update','org_scope_restrict_delete') LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.policyname, r.tablename);
  END LOOP;
END $$;
DROP FUNCTION IF EXISTS public.is_my_org(uuid);
DROP FUNCTION IF EXISTS public.is_platform_master();
DROP TABLE IF EXISTS public.platform_masters;
