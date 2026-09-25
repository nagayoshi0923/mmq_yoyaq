-- 組織・店舗の公開条件を維持し、作品／公演の規定を同じ順位で解決する。
CREATE OR REPLACE FUNCTION public.get_public_cancellation_policy_for_context(
  p_organization_slug text, p_store_id uuid, p_scenario_master_id uuid, p_event_id uuid
) RETURNS TABLE(organization_id uuid, organization_slug text, organization_name text, store_id uuid, store_name text, store_short_name text, is_configured boolean, cancellation_policy text, cancellation_policy_items jsonb, cancellation_deadline_hours integer, cancellation_fees jsonb, cancellation_fee_basis text, private_cancellation_policy text, private_cancellation_policy_items jsonb, private_cancellation_deadline_hours integer, private_cancellation_fees jsonb, private_cancellation_fee_basis text, organizer_cancel_reasons jsonb, organizer_cancel_refund_note text, cancellation_judgment_rules jsonb, cancellation_notice_note text, reservation_change_deadline_hours integer, reservation_change_note text, private_reservation_change_deadline_hours integer, private_reservation_change_note text, refund_method_note text, policy_updated_at date)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT
    o.id AS organization_id,
    o.slug::TEXT AS organization_slug,
    o.name::TEXT AS organization_name,
    s.id AS store_id,
    s.name::TEXT AS store_name,
    s.short_name::TEXT AS store_short_name,
    (rs.id IS NOT NULL OR changes.updated_at IS NOT NULL) AS is_configured,
    (public.resolve_operating_setting(o.id, 'cancellation_policy', to_jsonb(rs.cancellation_policy), s.id, os.id, ev.id)->>'value')::text,
    NULLIF(public.resolve_operating_setting(o.id, 'cancellation_policy_items', to_jsonb(rs.cancellation_policy_items), s.id, os.id, ev.id)->'value', 'null'::jsonb),
    (public.resolve_operating_setting(o.id, 'cancellation_deadline_hours', to_jsonb(rs.cancellation_deadline_hours), s.id, os.id, ev.id)->>'value')::integer,
    NULLIF(public.resolve_operating_setting(o.id, 'cancellation_fees', to_jsonb(rs.cancellation_fees), s.id, os.id, ev.id)->'value', 'null'::jsonb),
    (public.resolve_operating_setting(o.id, 'cancellation_fee_basis', to_jsonb(rs.cancellation_fee_basis), s.id, os.id, ev.id)->>'value')::text,
    (public.resolve_operating_setting(o.id, 'private_cancellation_policy', to_jsonb(rs.private_cancellation_policy), s.id, os.id, ev.id)->>'value')::text,
    NULLIF(public.resolve_operating_setting(o.id, 'private_cancellation_policy_items', to_jsonb(rs.private_cancellation_policy_items), s.id, os.id, ev.id)->'value', 'null'::jsonb),
    (public.resolve_operating_setting(o.id, 'private_cancellation_deadline_hours', to_jsonb(rs.private_cancellation_deadline_hours), s.id, os.id, ev.id)->>'value')::integer,
    NULLIF(public.resolve_operating_setting(o.id, 'private_cancellation_fees', to_jsonb(rs.private_cancellation_fees), s.id, os.id, ev.id)->'value', 'null'::jsonb),
    (public.resolve_operating_setting(o.id, 'private_cancellation_fee_basis', to_jsonb(rs.private_cancellation_fee_basis), s.id, os.id, ev.id)->>'value')::text,
    NULLIF(public.resolve_operating_setting(o.id, 'organizer_cancel_reasons', to_jsonb(rs.organizer_cancel_reasons), s.id, os.id, ev.id)->'value', 'null'::jsonb),
    (public.resolve_operating_setting(o.id, 'organizer_cancel_refund_note', to_jsonb(rs.organizer_cancel_refund_note), s.id, os.id, ev.id)->>'value')::text,
    NULLIF(public.resolve_operating_setting(o.id, 'cancellation_judgment_rules', to_jsonb(rs.cancellation_judgment_rules), s.id, os.id, ev.id)->'value', 'null'::jsonb),
    (public.resolve_operating_setting(o.id, 'cancellation_notice_note', to_jsonb(rs.cancellation_notice_note), s.id, os.id, ev.id)->>'value')::text,
    (public.resolve_operating_setting(o.id, 'reservation_change_deadline_hours', to_jsonb(rs.reservation_change_deadline_hours), s.id, os.id, ev.id)->>'value')::integer,
    (public.resolve_operating_setting(o.id, 'reservation_change_note', to_jsonb(rs.reservation_change_note), s.id, os.id, ev.id)->>'value')::text,
    (public.resolve_operating_setting(o.id, 'private_reservation_change_deadline_hours', to_jsonb(rs.private_reservation_change_deadline_hours), s.id, os.id, ev.id)->>'value')::integer,
    (public.resolve_operating_setting(o.id, 'private_reservation_change_note', to_jsonb(rs.private_reservation_change_note), s.id, os.id, ev.id)->>'value')::text,
    (public.resolve_operating_setting(o.id, 'refund_method_note', to_jsonb(rs.refund_method_note), s.id, os.id, ev.id)->>'value')::text,
    GREATEST(rs.policy_updated_at, (changes.updated_at AT TIME ZONE 'Asia/Tokyo')::date)
  FROM public.organizations o
  INNER JOIN public.stores s
    ON s.organization_id = o.id
   AND s.status = 'active'
  LEFT JOIN public.reservation_settings rs
    ON rs.store_id = s.id
   AND rs.organization_id = o.id
  LEFT JOIN public.schedule_events ev ON ev.id = p_event_id AND ev.organization_id = o.id AND ev.store_id = s.id
    AND COALESCE(ev.is_cancelled, false) = false
  LEFT JOIN public.organization_scenarios os ON os.organization_id = o.id
    AND CASE WHEN p_event_id IS NOT NULL THEN
      (os.id = ev.organization_scenario_id OR (ev.organization_scenario_id IS NULL AND os.scenario_master_id = ev.scenario_master_id))
      ELSE os.scenario_master_id = p_scenario_master_id END
  LEFT JOIN LATERAL (
    SELECT max(v.updated_at) AS updated_at FROM public.operating_setting_overrides v
    WHERE v.organization_id = o.id AND v.settings ?| ARRAY['cancellation_policy','cancellation_policy_items','cancellation_deadline_hours','cancellation_fees','cancellation_fee_basis','private_cancellation_policy','private_cancellation_policy_items','private_cancellation_deadline_hours','private_cancellation_fees','private_cancellation_fee_basis','organizer_cancel_reasons','organizer_cancel_refund_note','cancellation_judgment_rules','cancellation_notice_note','reservation_change_deadline_hours','reservation_change_note','private_reservation_change_deadline_hours','private_reservation_change_note','refund_method_note']
      AND ((v.store_id IS NULL AND v.organization_scenario_id IS NULL AND v.schedule_event_id IS NULL)
        OR v.store_id = s.id OR v.organization_scenario_id = os.id OR v.schedule_event_id = ev.id)
  ) changes ON true
  WHERE o.slug = p_organization_slug
    AND o.is_active = TRUE
    AND o.booking_site_status = 'approved'
    AND (p_store_id IS NULL OR s.id = p_store_id)
    AND (p_event_id IS NULL OR ev.id IS NOT NULL)
    AND (p_scenario_master_id IS NULL OR os.scenario_master_id = p_scenario_master_id)
  ORDER BY s.display_order NULLS LAST, s.name, s.id;
$$;
REVOKE ALL ON FUNCTION public.get_public_cancellation_policy_for_context(text,uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_cancellation_policy_for_context(text,uuid,uuid,uuid) TO anon, authenticated, service_role;
