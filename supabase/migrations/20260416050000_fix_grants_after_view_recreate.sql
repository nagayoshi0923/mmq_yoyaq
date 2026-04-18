-- DROP+CREATE VIEW でGRANTが消えた問題を修正
-- 20260416040000 で organization_scenarios_with_master を DROP+CREATE したため
-- authenticated / anon ロールへの権限が失われた
-- manual_internal_performance_overrides テーブルにも SELECT 権限が未付与だったため追加

GRANT SELECT ON public.organization_scenarios_with_master TO authenticated;
GRANT SELECT ON public.organization_scenarios_with_master TO anon;

GRANT SELECT ON public.manual_internal_performance_overrides TO authenticated;

NOTIFY pgrst, 'reload schema';
