-- YOYAQ-002: activeな組織・店舗の公開キャンセルポリシーだけを返す
-- reservation_settings への匿名SELECT権限は追加せず、公開可能な列をこのRPCで限定する。
CREATE OR REPLACE FUNCTION public.get_public_cancellation_policy(
  p_organization_slug TEXT,
  p_store_id UUID DEFAULT NULL
)
RETURNS TABLE (
  organization_id UUID,
  organization_slug TEXT,
  organization_name TEXT,
  store_id UUID,
  store_name TEXT,
  store_short_name TEXT,
  is_configured BOOLEAN,
  cancellation_policy TEXT,
  cancellation_policy_items JSONB,
  cancellation_deadline_hours INTEGER,
  cancellation_fees JSONB,
  cancellation_fee_basis TEXT,
  private_cancellation_policy TEXT,
  private_cancellation_policy_items JSONB,
  private_cancellation_deadline_hours INTEGER,
  private_cancellation_fees JSONB,
  private_cancellation_fee_basis TEXT,
  organizer_cancel_reasons JSONB,
  organizer_cancel_refund_note TEXT,
  cancellation_judgment_rules JSONB,
  cancellation_notice_note TEXT,
  reservation_change_deadline_hours INTEGER,
  reservation_change_note TEXT,
  private_reservation_change_deadline_hours INTEGER,
  private_reservation_change_note TEXT,
  refund_method_note TEXT,
  policy_updated_at DATE
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    o.id AS organization_id,
    o.slug::TEXT AS organization_slug,
    o.name::TEXT AS organization_name,
    s.id AS store_id,
    s.name::TEXT AS store_name,
    s.short_name::TEXT AS store_short_name,
    (rs.id IS NOT NULL) AS is_configured,
    rs.cancellation_policy,
    rs.cancellation_policy_items,
    rs.cancellation_deadline_hours,
    rs.cancellation_fees,
    rs.cancellation_fee_basis,
    rs.private_cancellation_policy,
    rs.private_cancellation_policy_items,
    rs.private_cancellation_deadline_hours,
    rs.private_cancellation_fees,
    rs.private_cancellation_fee_basis,
    rs.organizer_cancel_reasons,
    rs.organizer_cancel_refund_note,
    rs.cancellation_judgment_rules,
    rs.cancellation_notice_note,
    rs.reservation_change_deadline_hours,
    rs.reservation_change_note,
    rs.private_reservation_change_deadline_hours,
    rs.private_reservation_change_note,
    rs.refund_method_note,
    rs.policy_updated_at
  FROM public.organizations o
  INNER JOIN public.stores s
    ON s.organization_id = o.id
   AND s.status = 'active'
  LEFT JOIN public.reservation_settings rs
    ON rs.store_id = s.id
   AND rs.organization_id = o.id
  WHERE o.slug = p_organization_slug
    AND o.is_active = TRUE
    AND o.booking_site_status = 'approved'
    AND (p_store_id IS NULL OR s.id = p_store_id)
  ORDER BY s.display_order NULLS LAST, s.name, s.id;
$$;

REVOKE ALL ON FUNCTION public.get_public_cancellation_policy(TEXT, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_cancellation_policy(TEXT, UUID) TO anon, authenticated;

COMMENT ON FUNCTION public.get_public_cancellation_policy(TEXT, UUID) IS
  'activeかつ公開承認済みの組織について、active店舗の非機密キャンセルポリシーだけを組織slug・任意の明示store_idで返す。';
