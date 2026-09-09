-- Preserve links and claims as an audit trail; revoke unclaimed links and remove execution.
UPDATE public.private_coupon_claim_links SET revoked=true;
REVOKE EXECUTE ON FUNCTION public.claim_private_compensation_coupon(text,uuid) FROM service_role;
-- Redeploy the previous Web/API release. Already granted coupons remain valid.
