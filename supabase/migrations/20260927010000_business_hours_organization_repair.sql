-- QW-20260917-001 / PR466: restore the missing tenant key from the verified store.
-- Both environments contain this legacy row. Never infer a person or move a row
-- already owned by an organization; only fill the verified NULL relationship.
BEGIN;
UPDATE public.business_hours_settings b
SET organization_id = s.organization_id
FROM public.stores s
WHERE b.id = '867b2bb1-9ce2-4db6-9692-dd79c2ac375e'
  AND b.store_id = '45e39d14-061f-4d01-ae8a-5d4f8893e3cd'
  AND s.id = b.store_id
  AND s.organization_id = 'a0000000-0000-0000-0000-000000000001'
  AND b.organization_id IS NULL;
COMMIT;
