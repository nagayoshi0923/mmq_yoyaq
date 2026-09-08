BEGIN;
-- A new invoice appearing after the bank comparison invalidates uniqueness.
CREATE FUNCTION public.lock_cancellation_billing_organization() RETURNS trigger
LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(NEW.organization_id::text, 908001));
  RETURN NEW;
END;
$$;
CREATE TRIGGER cancellation_billing_organization_lock BEFORE INSERT OR UPDATE ON public.cancellation_billing_claims
  FOR EACH ROW EXECUTE FUNCTION public.lock_cancellation_billing_organization();
REVOKE ALL ON FUNCTION public.lock_cancellation_billing_organization() FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.settle_cancellation_billing_snapshot(
  p_organization_id uuid, p_claim_id uuid, p_revision integer, p_entry_id text, p_snapshot jsonb
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_snapshot jsonb;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(p_organization_id::text, 908001));
  SELECT COALESCE(jsonb_agg(jsonb_build_object('id',id,'revision',revision) ORDER BY id),'[]'::jsonb)
    INTO v_snapshot FROM public.cancellation_billing_claims WHERE organization_id=p_organization_id;
  IF p_snapshot IS NULL OR p_snapshot <> v_snapshot THEN RETURN false; END IF;
  RETURN public.settle_cancellation_billing_claim(p_organization_id,p_claim_id,p_revision,p_entry_id);
END;
$$;
REVOKE ALL ON FUNCTION public.settle_cancellation_billing_snapshot(uuid,uuid,integer,text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.settle_cancellation_billing_snapshot(uuid,uuid,integer,text,jsonb) TO service_role;
COMMIT;
