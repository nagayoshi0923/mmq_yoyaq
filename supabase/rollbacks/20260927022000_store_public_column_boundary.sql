BEGIN;
SET LOCAL lock_timeout = '5s';
REVOKE SELECT (
  id, organization_id, name, short_name, address, access_info, opening_date,
  status, ownership_type, capacity, rooms, color, is_temporary, temporary_date,
  temporary_dates, temporary_venue_names, display_order, region, kit_group_id,
  created_at, updated_at
) ON public.stores FROM anon, authenticated;
GRANT SELECT ON public.stores TO anon, authenticated;
NOTIFY pgrst, 'reload schema';
COMMIT;
