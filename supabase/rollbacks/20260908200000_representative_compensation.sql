-- Disable new grants, retaining issued coupons and audit records.
REVOKE EXECUTE ON FUNCTION public.grant_representative_compensation(uuid,uuid,uuid,boolean,jsonb) FROM service_role;
