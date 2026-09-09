-- 公演報告の手入力公演数がリロードで消える問題の修正
--
-- 原因:
--   manual_internal_performance_overrides / manual_external_performances の RLS が
--   users.organization_id のみを参照していた。
--   users.organization_id が NULL で staff.organization_id にだけ組織が載っている
--   アカウントでは、SECURITY DEFINER の upsert RPC では保存できるが、
--   SELECT が RLS で全行弾かれ、リロード後に手入力が消えて見えた。
--
-- 修正:
--   get_user_organization_id()（users → staff フォールバック）に統一する。

-- ─── manual_internal_performance_overrides ───────────────────────────────
DROP POLICY IF EXISTS manual_internal_overrides_select ON public.manual_internal_performance_overrides;
CREATE POLICY manual_internal_overrides_select ON public.manual_internal_performance_overrides
  FOR SELECT USING (organization_id = public.get_user_organization_id());

DROP POLICY IF EXISTS manual_internal_overrides_insert ON public.manual_internal_performance_overrides;
CREATE POLICY manual_internal_overrides_insert ON public.manual_internal_performance_overrides
  FOR INSERT WITH CHECK (organization_id = public.get_user_organization_id());

DROP POLICY IF EXISTS manual_internal_overrides_update ON public.manual_internal_performance_overrides;
CREATE POLICY manual_internal_overrides_update ON public.manual_internal_performance_overrides
  FOR UPDATE
  USING (organization_id = public.get_user_organization_id())
  WITH CHECK (organization_id = public.get_user_organization_id());

-- ─── manual_external_performances ────────────────────────────────────────
DROP POLICY IF EXISTS "Users can view their org manual externals" ON public.manual_external_performances;
CREATE POLICY "Users can view their org manual externals"
  ON public.manual_external_performances
  FOR SELECT
  USING (organization_id = public.get_user_organization_id());

DROP POLICY IF EXISTS "Users can insert their org manual externals" ON public.manual_external_performances;
CREATE POLICY "Users can insert their org manual externals"
  ON public.manual_external_performances
  FOR INSERT
  WITH CHECK (organization_id = public.get_user_organization_id());

DROP POLICY IF EXISTS "Users can update their org manual externals" ON public.manual_external_performances;
CREATE POLICY "Users can update their org manual externals"
  ON public.manual_external_performances
  FOR UPDATE
  USING (organization_id = public.get_user_organization_id())
  WITH CHECK (organization_id = public.get_user_organization_id());

DROP POLICY IF EXISTS "Users can delete their org manual externals" ON public.manual_external_performances;
CREATE POLICY "Users can delete their org manual externals"
  ON public.manual_external_performances
  FOR DELETE
  USING (organization_id = public.get_user_organization_id());

-- SELECT 権限が欠けている環境向け（無ければ no-op 相当）
GRANT SELECT ON public.manual_internal_performance_overrides TO authenticated;
GRANT SELECT ON public.manual_external_performances TO authenticated;
