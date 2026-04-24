-- stores_public ビューに ownership_type を追加
-- 目的: getAllPublic 経由でフロントの JS フィルター (ownership_type !== 'office') が機能するようにする
CREATE OR REPLACE VIEW public.stores_public AS
SELECT
  id, name, short_name, address,
  opening_date, status, capacity, rooms, color,
  is_temporary, temporary_date, temporary_dates,
  organization_id, display_order, region,
  temporary_venue_names, kit_group_id, access_info,
  created_at, updated_at,
  ownership_type
FROM stores
WHERE ownership_type IS NULL OR ownership_type != 'office';

GRANT SELECT ON public.stores_public TO anon;
GRANT SELECT ON public.stores_public TO authenticated;
