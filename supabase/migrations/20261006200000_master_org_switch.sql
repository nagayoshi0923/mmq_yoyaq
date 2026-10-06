-- マスター（社長）だけ、本部とフランチャイズの組織を切り替えて、その組織の管理者と同じ画面を見られるようにする（2026-10-06 社長指示）。
-- あわせて、応急で「組織の管理者」の判定をクインズワルツの管理者に限っていたのを元に戻す（札幌店の管理者が自分の組織を管理できるように）。
-- 戻す前提: 組織ごとの表には自分の組織に限る追加の制限（20261006160000）、組織をまたげた関数は直し済み・停止済み（20261006170000・180000）。
-- 組織の項目が無く、管理者の判定だけで守っていた 3 表をここで直す。

-- 1) クーポンの利用記録: 変更・削除はそのクーポンの組織のスタッフ（とマスター）だけ
DROP POLICY IF EXISTS org_scope_restrict_update ON public.coupon_usages;
DROP POLICY IF EXISTS org_scope_restrict_delete ON public.coupon_usages;
CREATE POLICY org_scope_restrict_update ON public.coupon_usages AS RESTRICTIVE FOR UPDATE TO authenticated
  USING ((SELECT public.is_platform_master()) OR EXISTS (SELECT 1 FROM public.customer_coupons cc WHERE cc.id = coupon_usages.customer_coupon_id AND cc.organization_id = (SELECT public.get_user_organization_id())))
  WITH CHECK ((SELECT public.is_platform_master()) OR EXISTS (SELECT 1 FROM public.customer_coupons cc WHERE cc.id = coupon_usages.customer_coupon_id AND cc.organization_id = (SELECT public.get_user_organization_id())));
CREATE POLICY org_scope_restrict_delete ON public.coupon_usages AS RESTRICTIVE FOR DELETE TO authenticated
  USING ((SELECT public.is_platform_master()) OR EXISTS (SELECT 1 FROM public.customer_coupons cc WHERE cc.id = coupon_usages.customer_coupon_id AND cc.organization_id = (SELECT public.get_user_organization_id())));

-- 2) 在庫の点検の記録・作品名の読み替え表（全組織共通）: 本部の管理者とマスターだけ
DROP POLICY IF EXISTS inventory_consistency_logs_admin_only ON public.inventory_consistency_logs;
CREATE POLICY inventory_consistency_logs_admin_only ON public.inventory_consistency_logs FOR ALL TO authenticated
  USING ((SELECT public.is_license_admin()) OR (SELECT public.is_platform_master()));
DROP POLICY IF EXISTS admin_can_manage_scenario_import_aliases ON public.scenario_import_aliases;
CREATE POLICY admin_can_manage_scenario_import_aliases ON public.scenario_import_aliases FOR ALL TO authenticated
  USING ((SELECT public.is_license_admin()) OR (SELECT public.is_platform_master()))
  WITH CHECK ((SELECT public.is_license_admin()) OR (SELECT public.is_platform_master()));

-- 3) 「組織の管理者か」を元に戻す（どの決まり・関数でも組織の一致と組み合わせて使う）
CREATE OR REPLACE FUNCTION public.is_org_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE
AS $function$
  SELECT COALESCE(
    (SELECT role = 'admin' FROM public.users WHERE id = auth.uid() LIMIT 1),
    false
  );
$function$;

-- 4) マスター用: 組織の一覧と切り替え。切り替えると、その組織の管理者として扱われる（利用者の所属組織を書き換える）
CREATE OR REPLACE FUNCTION public.platform_master_organizations()
RETURNS TABLE(id uuid, name text, slug text, is_current boolean)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF NOT public.is_platform_master() THEN RAISE EXCEPTION 'マスターだけが使えます' USING ERRCODE = '42501'; END IF;
  RETURN QUERY SELECT o.id, o.name::text, o.slug::text, o.id = (SELECT u.organization_id FROM public.users u WHERE u.id = auth.uid())
    FROM public.organizations o WHERE o.is_active ORDER BY (o.id = 'a0000000-0000-0000-0000-000000000001'::uuid) DESC, o.name;
END $$;
REVOKE ALL ON FUNCTION public.platform_master_organizations() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.platform_master_organizations() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.platform_master_switch_organization(p_organization_id uuid)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_slug text;
BEGIN
  IF NOT public.is_platform_master() THEN RAISE EXCEPTION 'マスターだけが使えます' USING ERRCODE = '42501'; END IF;
  SELECT slug INTO v_slug FROM public.organizations WHERE id = p_organization_id AND is_active;
  IF v_slug IS NULL THEN RAISE EXCEPTION '組織が見つかりません' USING ERRCODE = '22023'; END IF;
  UPDATE public.users SET organization_id = p_organization_id, updated_at = now() WHERE id = auth.uid() AND role = 'admin';
  IF NOT FOUND THEN RAISE EXCEPTION '管理者の利用者だけが切り替えられます' USING ERRCODE = '42501'; END IF;
  RETURN v_slug;
END $$;
REVOKE ALL ON FUNCTION public.platform_master_switch_organization(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.platform_master_switch_organization(uuid) TO authenticated, service_role;
