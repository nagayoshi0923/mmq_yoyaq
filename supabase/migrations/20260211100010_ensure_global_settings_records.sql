-- 全組織に global_settings レコードが存在することを保証
INSERT INTO public.global_settings (organization_id)
SELECT id FROM public.organizations
WHERE id NOT IN (SELECT organization_id FROM public.global_settings)
ON CONFLICT DO NOTHING;
