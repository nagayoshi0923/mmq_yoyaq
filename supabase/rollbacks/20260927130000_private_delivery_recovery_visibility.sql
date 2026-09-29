CREATE OR REPLACE FUNCTION public.get_private_booking_delivery_history(p_reservation_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp SET row_security=off AS $$
DECLARE r public.reservations%ROWTYPE; result jsonb;
BEGIN
 SELECT * INTO r FROM public.reservations WHERE id=p_reservation_id;
 IF auth.uid() IS NULL OR NOT FOUND OR public.get_user_organization_id() IS DISTINCT FROM r.organization_id
  OR NOT coalesce(public.is_org_admin() OR EXISTS(SELECT 1 FROM public.staff WHERE user_id=auth.uid()
   AND organization_id=r.organization_id AND status='active'),false) THEN
  RAISE EXCEPTION 'UNAUTHORIZED' USING ERRCODE='42501';
 END IF;
 SELECT coalesce(jsonb_agg(to_jsonb(d) ORDER BY d.created_at DESC,d.id),'[]'::jsonb) INTO result FROM (
  SELECT 'approval' AS delivery_kind,id,kind AS channel,status,snapshot->>'gmName' AS recipient_name,created_at,updated_at,last_error,
   status='failed' AND first_attempt_at IS NULL AND provider_message_id IS NULL AS can_retry,
   status IN ('uncertain','superseded','failed') AND first_attempt_at IS NOT NULL AS can_reconcile,
   status='uncertain' AND first_attempt_at IS NULL AND preparation_attempted_at IS NOT NULL AND provider_payload IS NULL AS can_resume_preparation
  FROM public.private_booking_approval_deliveries WHERE reservation_id=r.id AND organization_id=r.organization_id
  UNION ALL
  SELECT 'survey',id,'survey_email',status,'お客様',created_at,updated_at,last_error,
   status='failed' AND first_attempt_at IS NULL AND provider_message_id IS NULL,status IN ('uncertain','superseded','failed') AND first_attempt_at IS NOT NULL,false
  FROM public.private_group_survey_deliveries WHERE reservation_id=r.id AND organization_id=r.organization_id
  UNION ALL
  SELECT 'rejection',id,'rejection_email',status,'お客様',created_at,updated_at,last_error,
   status='failed' AND first_attempt_at IS NULL AND provider_message_id IS NULL,status IN ('uncertain','superseded','failed') AND first_attempt_at IS NOT NULL,false
  FROM public.private_booking_rejection_deliveries WHERE reservation_id=r.id AND organization_id=r.organization_id
 ) d;
 RETURN jsonb_build_object('organization_id',r.organization_id,'deliveries',result);
END $$;
REVOKE ALL ON FUNCTION public.get_private_booking_delivery_history(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_private_booking_delivery_history(uuid) TO authenticated,service_role;

NOTIFY pgrst, 'reload schema';
