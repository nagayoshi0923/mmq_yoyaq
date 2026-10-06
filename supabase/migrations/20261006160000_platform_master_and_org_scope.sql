-- 組織をまたいだ権限の本格的な直し（その 1、2026-10-06 社長方針）:
--   管理者・スタッフが届くのは自分の組織だけ。全組織を見られるのは「マスター」（社長）だけ。
--   ライセンス管理（作者・他社とのライセンス）の表は、これまでどおり本部の管理者（is_license_admin）も扱える。
-- 1) マスターの一覧と判定、2) 「自分の組織の行か」の判定（組織が空欄の古い行はクインズワルツのもの）、
-- 3) 組織ごとの表に、スタッフ・管理者を自分の組織に限る追加の制限（RESTRICTIVE）をかける。お客様の決まりには触れない。
--    予約サイトに出る公開の表は、読むのはそのまま、書き換えだけを制限する。お客様・利用者の表は #318 と合わせて別に扱う。

CREATE TABLE IF NOT EXISTS public.platform_masters (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.platform_masters ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.platform_masters FROM PUBLIC, anon, authenticated;
COMMENT ON TABLE public.platform_masters IS '全組織を見られるマスター（2026-10-06 社長のみ）。追加・削除は DB の管理者だけ';
INSERT INTO public.platform_masters(user_id, note)
SELECT id, '社長（2026-10-06 指示）' FROM auth.users WHERE lower(email) = 'mai.nagayoshi@gmail.com'
ON CONFLICT (user_id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.is_platform_master()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT auth.uid() IS NOT NULL AND EXISTS (SELECT 1 FROM public.platform_masters WHERE user_id = auth.uid());
$$;
REVOKE ALL ON FUNCTION public.is_platform_master() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_platform_master() TO anon, authenticated, service_role;

-- 自分の組織の行か（組織が空欄の古い行はクインズワルツのもの）。マスターはすべて
CREATE OR REPLACE FUNCTION public.is_my_org(p_org uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT public.is_platform_master()
      OR (p_org IS NOT NULL AND p_org = public.get_user_organization_id())
      OR (p_org IS NULL AND public.get_user_organization_id() = 'a0000000-0000-0000-0000-000000000001'::uuid);
$$;
REVOKE ALL ON FUNCTION public.is_my_org(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_my_org(uuid) TO anon, authenticated, service_role;

DO $$
DECLARE t text;
  -- 公開の表（読むのはそのまま、書き換えだけ自分の組織に限る）
  v_public text[] := ARRAY['stores','schedule_events','booking_notices','business_hours_settings','store_recruitment_pauses','organization_scenarios','staff','scenarios'];
  -- ライセンス管理の表（本部の管理者も扱える）
  v_license text[] := ARRAY['authors','organization_authors','license_partner_contracts','license_partner_monthly_reports','license_partner_stores','license_report_history','external_performance_reports','manual_external_performances','store_scenario_license_contracts'];
  -- 別に扱う表（お客様・利用者。#318）
  v_skip text[] := ARRAY['users','customers'];
  v_expr text;
BEGIN
  FOR t IN SELECT c.table_name FROM information_schema.columns c JOIN information_schema.tables tb ON tb.table_schema=c.table_schema AND tb.table_name=c.table_name AND tb.table_type='BASE TABLE'
           WHERE c.table_schema='public' AND c.column_name='organization_id' ORDER BY 1 LOOP
    CONTINUE WHEN t = ANY (v_skip);
    CONTINUE WHEN NOT (has_table_privilege('authenticated', 'public.'||t, 'SELECT') OR has_table_privilege('authenticated', 'public.'||t, 'INSERT')
                       OR has_table_privilege('authenticated', 'public.'||t, 'UPDATE') OR has_table_privilege('authenticated', 'public.'||t, 'DELETE'));
    -- 判定の関数は (SELECT ...) で包み、1 回の読み込みにつき 1 回だけ計算させる（行ごとに呼ぶと大きな表で 3〜4 倍遅くなった）
    v_expr := 'NOT (SELECT public.is_staff_or_admin()) OR (SELECT public.is_platform_master())'
           || ' OR organization_id = (SELECT public.get_user_organization_id())'
           || ' OR (organization_id IS NULL AND (SELECT public.get_user_organization_id()) = ''a0000000-0000-0000-0000-000000000001''::uuid)'
           || CASE WHEN t = ANY (v_license) THEN ' OR (SELECT public.is_license_admin())' ELSE '' END;
    EXECUTE format('DROP POLICY IF EXISTS org_scope_restrict ON public.%I', t);
    EXECUTE format('DROP POLICY IF EXISTS org_scope_restrict_insert ON public.%I', t);
    EXECUTE format('DROP POLICY IF EXISTS org_scope_restrict_update ON public.%I', t);
    EXECUTE format('DROP POLICY IF EXISTS org_scope_restrict_delete ON public.%I', t);
    IF t = ANY (v_public) THEN
      EXECUTE format('CREATE POLICY org_scope_restrict_insert ON public.%I AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (%s)', t, v_expr);
      EXECUTE format('CREATE POLICY org_scope_restrict_update ON public.%I AS RESTRICTIVE FOR UPDATE TO authenticated USING (%s) WITH CHECK (%s)', t, v_expr, v_expr);
      EXECUTE format('CREATE POLICY org_scope_restrict_delete ON public.%I AS RESTRICTIVE FOR DELETE TO authenticated USING (%s)', t, v_expr);
    ELSE
      EXECUTE format('CREATE POLICY org_scope_restrict ON public.%I AS RESTRICTIVE FOR ALL TO authenticated USING (%s) WITH CHECK (%s)', t, v_expr, v_expr);
    END IF;
  END LOOP;
END $$;
