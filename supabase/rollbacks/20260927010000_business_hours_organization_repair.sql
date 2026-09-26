-- Restore only the verified legacy row's original NULL organization key.
BEGIN;
UPDATE public.business_hours_settings
SET organization_id = NULL
WHERE id = '867b2bb1-9ce2-4db6-9692-dd79c2ac375e'
  AND store_id = '45e39d14-061f-4d01-ae8a-5d4f8893e3cd'
  AND organization_id = 'a0000000-0000-0000-0000-000000000001';
COMMIT;
