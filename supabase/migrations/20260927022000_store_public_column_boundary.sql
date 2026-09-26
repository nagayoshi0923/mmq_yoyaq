-- 公開店舗情報を維持し、費用・内部メモ・担当者連絡先の直接参照を拒否する。
-- スタッフの内部項目は認証済み /api/stores (service_role + organization_id) 経由。
BEGIN;
SET LOCAL lock_timeout = '5s';
REVOKE SELECT ON public.stores FROM anon, authenticated;
GRANT SELECT (
  id, organization_id, name, short_name, address, access_info, opening_date,
  status, ownership_type, capacity, rooms, color, is_temporary, temporary_date,
  temporary_dates, temporary_venue_names, display_order, region, kit_group_id,
  created_at, updated_at
) ON public.stores TO anon, authenticated;
NOTIFY pgrst, 'reload schema';
COMMIT;
