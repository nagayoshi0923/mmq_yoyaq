CREATE OR REPLACE FUNCTION public.set_reservation_cancellation_policy_snapshot()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_settings public.reservation_settings%ROWTYPE;
  v_performance_type TEXT;
  v_is_private BOOLEAN;
  v_validate_store BOOLEAN := false;
  v_scenario uuid;
  v_prefix text;
BEGIN
  -- 新規予約と店舗/組織の変更時は、設定取得より先にtenant整合を検証する。
  -- 既存の不整合行に対する無関係な更新は互換性のため阻害しない。
  IF TG_OP = 'INSERT' THEN
    v_validate_store := true;
  ELSIF NEW.store_id IS DISTINCT FROM OLD.store_id
    OR NEW.organization_id IS DISTINCT FROM OLD.organization_id THEN
    v_validate_store := true;
  END IF;

  IF v_validate_store AND NEW.store_id IS NOT NULL THEN
    PERFORM 1
    FROM public.stores s
    WHERE s.id = NEW.store_id
      AND s.organization_id = NEW.organization_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION '予約店舗が予約organizationに所属していません'
        USING ERRCODE = '23514';
    END IF;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    -- 一度保存したスナップショットは、店舗や管理設定が変わっても上書きしない。
    NEW.cancellation_policy_snapshot_version := OLD.cancellation_policy_snapshot_version;
    NEW.cancellation_policy_store_id := OLD.cancellation_policy_store_id;
    NEW.cancellation_policy_performance_type := OLD.cancellation_policy_performance_type;
    NEW.cancellation_policy_deadline_hours := OLD.cancellation_policy_deadline_hours;
    NEW.cancellation_policy_fees := OLD.cancellation_policy_fees;
    NEW.cancellation_policy_fee_basis := OLD.cancellation_policy_fee_basis;
    NEW.cancellation_policy_updated_at := OLD.cancellation_policy_updated_at;

    -- migration以前の予約はNULLのまま維持する。新規貸切申込だけ、初回店舗確定時に補完する。
    IF OLD.cancellation_policy_snapshot_version IS NULL
      OR OLD.cancellation_policy_store_id IS NOT NULL
      OR NEW.store_id IS NULL THEN
      RETURN NEW;
    END IF;

    v_performance_type := OLD.cancellation_policy_performance_type;
  ELSE
    -- 呼び出し元から渡された値を信用せず、DB内の設定から必ず作り直す。
    NEW.cancellation_policy_snapshot_version := 1;
    NEW.cancellation_policy_store_id := NULL;
    NEW.cancellation_policy_deadline_hours := NULL;
    NEW.cancellation_policy_fees := NULL;
    NEW.cancellation_policy_fee_basis := NULL;
    NEW.cancellation_policy_updated_at := NULL;

    SELECT EXISTS (
      SELECT 1
      FROM public.schedule_events se
      WHERE se.id = NEW.schedule_event_id
        AND se.organization_id = NEW.organization_id
        AND (se.category = 'private' OR se.is_private_booking = true)
    ) INTO v_is_private;

    v_performance_type := CASE
      WHEN NEW.private_group_id IS NOT NULL
        OR NEW.reservation_source = 'web_private'
        OR NEW.reservation_type IN ('private', 'private_booking')
        OR v_is_private
      THEN 'private'
      ELSE 'open'
    END;
    NEW.cancellation_policy_performance_type := v_performance_type;

    -- 貸切申込は店舗未確定で作られるため、初回store_id設定時に同じtriggerで補完する。
    IF NEW.store_id IS NULL THEN
      RETURN NEW;
    END IF;
  END IF;

  SELECT rs.*
  INTO v_settings
  FROM public.reservation_settings rs
  JOIN public.stores s
    ON s.id = rs.store_id
   AND s.organization_id = NEW.organization_id
  WHERE rs.store_id = NEW.store_id
    AND (rs.organization_id = NEW.organization_id OR rs.organization_id IS NULL)
  ORDER BY (rs.organization_id = NEW.organization_id) DESC, rs.updated_at DESC
  LIMIT 1;

  NEW.cancellation_policy_store_id := NEW.store_id;
  IF FOUND THEN
    IF v_performance_type = 'private' THEN
      NEW.cancellation_policy_deadline_hours := COALESCE(v_settings.private_cancellation_deadline_hours, 0);
      NEW.cancellation_policy_fees := COALESCE(
        v_settings.private_cancellation_fees,
        '[{"hours_before":168,"fee_percentage":50,"description":"7日前より公演価格全額の50%"},{"hours_before":72,"fee_percentage":100,"description":"3日前より公演価格全額の100%"},{"hours_before":-1,"fee_percentage":100,"description":"公演開始後・無断キャンセル100%"}]'::jsonb
      );
      NEW.cancellation_policy_fee_basis := v_settings.private_cancellation_fee_basis;
    ELSE
      NEW.cancellation_policy_deadline_hours := COALESCE(v_settings.cancellation_deadline_hours, 0);
      NEW.cancellation_policy_fees := COALESCE(
        v_settings.cancellation_fees,
        '[{"hours_before":48,"fee_percentage":50,"description":"前日より50%"},{"hours_before":24,"fee_percentage":100,"description":"当日より100%"},{"hours_before":-1,"fee_percentage":100,"description":"公演開始後・無断100%"}]'::jsonb
      );
      NEW.cancellation_policy_fee_basis := v_settings.cancellation_fee_basis;
    END IF;
    NEW.cancellation_policy_updated_at := COALESCE(v_settings.updated_at, transaction_timestamp());
  ELSE
    -- 設定行がない店舗でも予約作成を止めず、不変の既定ポリシーをその場で固定する。
    IF v_performance_type = 'private' THEN
      NEW.cancellation_policy_deadline_hours := 0;
      NEW.cancellation_policy_fees := '[{"hours_before":168,"fee_percentage":50,"description":"7日前より公演価格全額の50%"},{"hours_before":72,"fee_percentage":100,"description":"3日前より公演価格全額の100%"},{"hours_before":-1,"fee_percentage":100,"description":"公演開始後・無断キャンセル100%"}]'::jsonb;
      NEW.cancellation_policy_fee_basis := 'performance_total';
    ELSE
      NEW.cancellation_policy_deadline_hours := 0;
      NEW.cancellation_policy_fees := '[{"hours_before":48,"fee_percentage":50,"description":"前日より50%"},{"hours_before":24,"fee_percentage":100,"description":"当日より100%"},{"hours_before":-1,"fee_percentage":100,"description":"公演開始後・無断100%"}]'::jsonb;
      NEW.cancellation_policy_fee_basis := 'participant_total';
    END IF;
    NEW.cancellation_policy_updated_at := transaction_timestamp();
  END IF;

  -- 初回に条件を固定する時点だけ、組織→店舗→作品→公演の実効値を採用する。
  -- UPDATE時の既存スナップショットを返す分岐は上で維持している。
  IF NEW.schedule_event_id IS NULL THEN
    SELECT os.id INTO v_scenario FROM public.organization_scenarios os
      WHERE os.organization_id = NEW.organization_id
        AND os.scenario_master_id = NEW.scenario_master_id;
  END IF;
  v_prefix := CASE WHEN v_performance_type = 'private' THEN 'private_' ELSE '' END;
  NEW.cancellation_policy_deadline_hours := (
    public.resolve_operating_setting(NEW.organization_id, v_prefix || 'cancellation_deadline_hours',
      to_jsonb(NEW.cancellation_policy_deadline_hours), NEW.store_id, v_scenario, NEW.schedule_event_id)->>'value')::integer;
  NEW.cancellation_policy_fees := public.resolve_operating_setting(NEW.organization_id, v_prefix || 'cancellation_fees',
    NEW.cancellation_policy_fees, NEW.store_id, v_scenario, NEW.schedule_event_id)->'value';
  NEW.cancellation_policy_fee_basis := public.resolve_operating_setting(NEW.organization_id, v_prefix || 'cancellation_fee_basis',
    to_jsonb(NEW.cancellation_policy_fee_basis), NEW.store_id, v_scenario, NEW.schedule_event_id)->>'value';

  RETURN NEW;
END;
$function$;

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
CREATE OR REPLACE FUNCTION public.get_public_cancellation_policy(p_organization_slug text, p_store_id uuid DEFAULT NULL)
RETURNS TABLE(organization_id uuid, organization_slug text, organization_name text, store_id uuid, store_name text, store_short_name text, is_configured boolean, cancellation_policy text, cancellation_policy_items jsonb, cancellation_deadline_hours integer, cancellation_fees jsonb, cancellation_fee_basis text, private_cancellation_policy text, private_cancellation_policy_items jsonb, private_cancellation_deadline_hours integer, private_cancellation_fees jsonb, private_cancellation_fee_basis text, organizer_cancel_reasons jsonb, organizer_cancel_refund_note text, cancellation_judgment_rules jsonb, cancellation_notice_note text, reservation_change_deadline_hours integer, reservation_change_note text, private_reservation_change_deadline_hours integer, private_reservation_change_note text, refund_method_note text, policy_updated_at date)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT * FROM public.get_public_cancellation_policy_for_context(p_organization_slug, p_store_id, NULL, NULL);
$$;
REVOKE ALL ON FUNCTION public.get_public_cancellation_policy(text,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_cancellation_policy(text,uuid) TO anon, authenticated;
