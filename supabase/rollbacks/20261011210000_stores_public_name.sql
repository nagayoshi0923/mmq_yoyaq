-- 20261011210000 の取り消し: 公開ビューを元の列に戻し、stores.public_name を消す（入れた値も消える）。
BEGIN;

DROP VIEW public.stores_public;
CREATE VIEW public.stores_public AS
SELECT
  id, name, short_name, address,
  opening_date, status, capacity, rooms, color,
  is_temporary, temporary_date, temporary_dates,
  organization_id, display_order, region,
  temporary_venue_names, kit_group_id, access_info,
  created_at, updated_at,
  ownership_type
FROM public.stores
WHERE ownership_type IS NULL OR ownership_type <> 'office';
GRANT SELECT ON public.stores_public TO anon, authenticated;

ALTER TABLE public.stores DROP COLUMN IF EXISTS public_name;

COMMIT;
