-- 公開承認された組織の支払い案内2項目だけを公開する。
CREATE OR REPLACE FUNCTION public.get_public_payment_settings(p_organization_slug text, p_event_id uuid)
RETURNS TABLE(payment_method_label text, payment_method_description text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_org uuid;
BEGIN
  SELECT o.id INTO v_org FROM public.organizations o
    JOIN public.schedule_events e ON e.organization_id = o.id AND e.id = p_event_id
    JOIN public.stores s ON s.id = e.store_id AND s.organization_id = o.id AND s.status = 'active'
    WHERE o.slug = p_organization_slug AND o.is_active = true AND o.booking_site_status = 'approved'
      AND COALESCE(e.is_cancelled, false) = false;
  IF v_org IS NULL THEN RETURN; END IF;
  RETURN QUERY SELECT
    public.resolve_operating_setting(v_org, 'payment_method_label', to_jsonb('現地決済'::text), NULL, NULL, p_event_id)->>'value',
    public.resolve_operating_setting(v_org, 'payment_method_description', to_jsonb('ご来店時にお支払いください'::text), NULL, NULL, p_event_id)->>'value';
END;
$$;
REVOKE ALL ON FUNCTION public.get_public_payment_settings(text,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_payment_settings(text,uuid) TO anon, authenticated, service_role;
