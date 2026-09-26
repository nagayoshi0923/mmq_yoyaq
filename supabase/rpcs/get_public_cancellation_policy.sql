CREATE OR REPLACE FUNCTION public.get_public_cancellation_policy(p_organization_slug text, p_store_id uuid DEFAULT NULL)
RETURNS TABLE(organization_id uuid, organization_slug text, organization_name text, store_id uuid, store_name text, store_short_name text, is_configured boolean, cancellation_policy text, cancellation_policy_items jsonb, cancellation_deadline_hours integer, cancellation_fees jsonb, cancellation_fee_basis text, private_cancellation_policy text, private_cancellation_policy_items jsonb, private_cancellation_deadline_hours integer, private_cancellation_fees jsonb, private_cancellation_fee_basis text, organizer_cancel_reasons jsonb, organizer_cancel_refund_note text, cancellation_judgment_rules jsonb, cancellation_notice_note text, reservation_change_deadline_hours integer, reservation_change_note text, private_reservation_change_deadline_hours integer, private_reservation_change_note text, refund_method_note text, policy_updated_at date)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT * FROM public.get_public_cancellation_policy_for_context(p_organization_slug, p_store_id, NULL, NULL);
$$;
REVOKE ALL ON FUNCTION public.get_public_cancellation_policy(text,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_cancellation_policy(text,uuid) TO anon, authenticated;
