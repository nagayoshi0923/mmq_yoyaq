-- 初回公開前のDB追加分を撤回するときだけ使用する。
-- 利用開始後は個別指定を失うため、この逆DDLではなく修正migrationを使う。
-- 先にfrontend / Edge Functionsを直前版へ戻し、書込みを停止する。
BEGIN;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM public.reservations WHERE reservation_change_deadline_hours_snapshot IS NOT NULL) THEN
  RAISE EXCEPTION '新規予約へ設定が適用済みです。期限を維持するforward fixを実施してください。';
 END IF;
END $$;
DROP TRIGGER IF EXISTS reservation_change_policy_snapshot ON public.reservations;
DROP FUNCTION IF EXISTS public.set_reservation_change_policy_snapshot();
ALTER TABLE public.reservations DROP COLUMN IF EXISTS reservation_change_deadline_hours_snapshot;

-- Revert cross-day preparation guards before reverting preparation inheritance.
DO $migration$
DECLARE definition text; function_oid oid;
BEGIN
 SELECT p.oid INTO STRICT function_oid FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='approve_private_booking';
 definition:=pg_get_functiondef(function_oid);
 IF (length(definition)-length(replace(definition,$old$AND date + end_time + CASE WHEN end_time < start_time THEN interval '1 day' ELSE interval '0 days' END > v_calendar_date$old$,'')))/length($old$AND date + end_time + CASE WHEN end_time < start_time THEN interval '1 day' ELSE interval '0 days' END > v_calendar_date$old$)<>1 THEN RAISE EXCEPTION 'Unexpected approve_private_booking cross-day guard'; END IF;
 definition:=replace(definition,$old$AND date + end_time + CASE WHEN end_time < start_time THEN interval '1 day' ELSE interval '0 days' END > v_calendar_date$old$,$new$AND date + end_time > v_calendar_date$new$);
 IF (length(definition)-length(replace(definition,$old$v_calendar_date + p_selected_end_time + CASE WHEN p_selected_end_time < p_selected_start_time THEN interval '1 day' ELSE interval '0 days' END + make_interval$old$,'')))/length($old$v_calendar_date + p_selected_end_time + CASE WHEN p_selected_end_time < p_selected_start_time THEN interval '1 day' ELSE interval '0 days' END + make_interval$old$)<>1 THEN RAISE EXCEPTION 'Unexpected approve_private_booking cross-day guard'; END IF;
 definition:=replace(definition,$old$v_calendar_date + p_selected_end_time + CASE WHEN p_selected_end_time < p_selected_start_time THEN interval '1 day' ELSE interval '0 days' END + make_interval$old$,$new$v_calendar_date + p_selected_end_time + make_interval$new$);
 IF (length(definition)-length(replace(definition,$old$AND date BETWEEN v_calendar_date - 2 AND v_calendar_date + 2
    AND store_id = p_selected_store_id
    AND is_cancelled = false
    AND date + start_time$old$,'')))/length($old$AND date BETWEEN v_calendar_date - 2 AND v_calendar_date + 2
    AND store_id = p_selected_store_id
    AND is_cancelled = false
    AND date + start_time$old$)<>1 THEN RAISE EXCEPTION 'Unexpected approve_private_booking cross-day guard'; END IF;
 definition:=replace(definition,$old$AND date BETWEEN v_calendar_date - 2 AND v_calendar_date + 2
    AND store_id = p_selected_store_id
    AND is_cancelled = false
    AND date + start_time$old$,$new$AND date = v_calendar_date
    AND store_id = p_selected_store_id
    AND is_cancelled = false
    AND date + start_time$new$);
 EXECUTE definition;
END $migration$;
DO $migration$
DECLARE definition text; function_oid oid;
BEGIN
 SELECT p.oid INTO STRICT function_oid FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='create_private_booking_request';
 definition:=pg_get_functiondef(function_oid);
 IF (length(definition)-length(replace(definition,$old$AND event.date + event.end_time + CASE WHEN event.end_time < event.start_time THEN interval '1 day' ELSE interval '0 days' END > v_cand_date$old$,'')))/length($old$AND event.date + event.end_time + CASE WHEN event.end_time < event.start_time THEN interval '1 day' ELSE interval '0 days' END > v_cand_date$old$)<>1 THEN RAISE EXCEPTION 'Unexpected create_private_booking_request cross-day guard'; END IF;
 definition:=replace(definition,$old$AND event.date + event.end_time + CASE WHEN event.end_time < event.start_time THEN interval '1 day' ELSE interval '0 days' END > v_cand_date$old$,$new$AND event.date + event.end_time > v_cand_date$new$);
 IF (length(definition)-length(replace(definition,$old$v_cand_date + v_cand_end + CASE WHEN v_cand_end < v_cand_start THEN interval '1 day' ELSE interval '0 days' END + make_interval$old$,'')))/length($old$v_cand_date + v_cand_end + CASE WHEN v_cand_end < v_cand_start THEN interval '1 day' ELSE interval '0 days' END + make_interval$old$)<>1 THEN RAISE EXCEPTION 'Unexpected create_private_booking_request cross-day guard'; END IF;
 definition:=replace(definition,$old$v_cand_date + v_cand_end + CASE WHEN v_cand_end < v_cand_start THEN interval '1 day' ELSE interval '0 days' END + make_interval$old$,$new$v_cand_date + v_cand_end + make_interval$new$);
 IF (length(definition)-length(replace(definition,$old$AND event.date BETWEEN v_cand_date - 2 AND v_cand_date + 2
          AND event.is_cancelled = false
          AND event.date + event.start_time$old$,'')))/length($old$AND event.date BETWEEN v_cand_date - 2 AND v_cand_date + 2
          AND event.is_cancelled = false
          AND event.date + event.start_time$old$)<>1 THEN RAISE EXCEPTION 'Unexpected create_private_booking_request cross-day guard'; END IF;
 definition:=replace(definition,$old$AND event.date BETWEEN v_cand_date - 2 AND v_cand_date + 2
          AND event.is_cancelled = false
          AND event.date + event.start_time$old$,$new$AND event.date = v_cand_date
          AND event.is_cancelled = false
          AND event.date + event.start_time$new$);
 EXECUTE definition;
END $migration$;


DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.operating_setting_overrides WHERE revision>1 OR organization_scenario_id IS NOT NULL OR schedule_event_id IS NOT NULL) THEN
    RAISE EXCEPTION '設定が保存済みです。値を維持するforward fixを実施してください。';
  END IF;
END;
$$;
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

  RETURN NEW;
END;
$function$;


CREATE OR REPLACE FUNCTION public.get_public_cancellation_policy(p_organization_slug text, p_store_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(organization_id uuid, organization_slug text, organization_name text, store_id uuid, store_name text, store_short_name text, is_configured boolean, cancellation_policy text, cancellation_policy_items jsonb, cancellation_deadline_hours integer, cancellation_fees jsonb, cancellation_fee_basis text, private_cancellation_policy text, private_cancellation_policy_items jsonb, private_cancellation_deadline_hours integer, private_cancellation_fees jsonb, private_cancellation_fee_basis text, organizer_cancel_reasons jsonb, organizer_cancel_refund_note text, cancellation_judgment_rules jsonb, cancellation_notice_note text, reservation_change_deadline_hours integer, reservation_change_note text, private_reservation_change_deadline_hours integer, private_reservation_change_note text, refund_method_note text, policy_updated_at date)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$;


DROP FUNCTION public.get_public_cancellation_policy_for_context(text,uuid,uuid,uuid);
CREATE OR REPLACE FUNCTION public.check_performances_four_hours_before()
 RETURNS TABLE(events_checked integer, events_confirmed integer, events_cancelled integer, details jsonb)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
 SET "TimeZone" TO 'Asia/Tokyo'
AS $function$
DECLARE
  v_events_checked INTEGER := 0;
  v_events_confirmed INTEGER := 0;
  v_events_cancelled INTEGER := 0;
  v_details JSONB := '[]'::JSONB;
  v_event RECORD;
  v_current INTEGER;
  v_reservation_count INTEGER;
  v_unsynced_staff INTEGER;
  v_max INTEGER;
  v_min INTEGER;
  v_result TEXT;
  v_now TIMESTAMPTZ;
  v_check_time TIMESTAMPTZ;
BEGIN
  v_now := NOW();
  v_check_time := v_now + INTERVAL '4 hours';

  FOR v_event IN
    SELECT
      se.id,
      se.date,
      se.start_time,
      se.scenario,
      se.gm_roles,
      COALESCE(
        os.override_player_count_max,
        sm.player_count_max,
        sm2.player_count_max,
        se.max_participants,
        s.player_count_max,
        8
      ) AS max_participants,
      COALESCE(
        os.override_player_count_min,
        sm.player_count_min,
        sm2.player_count_min,
        s.player_count_min,
        -- min が一切設定されていない場合のみ旧仕様（定員の過半数）にフォールバック
        CEIL(COALESCE(
          os.override_player_count_max,
          sm.player_count_max,
          sm2.player_count_max,
          se.max_participants,
          s.player_count_max,
          8
        )::NUMERIC / 2)::INTEGER
      ) AS min_participants,
      se.organization_id,
      se.gms,
      se.store_id,
      st.name AS store_name,
      (se.date::text || ' ' || se.start_time::text || '+09:00')::timestamptz AS event_datetime
    FROM schedule_events se
    LEFT JOIN organization_scenarios os ON se.organization_scenario_id = os.id
    LEFT JOIN scenario_masters sm ON os.scenario_master_id = sm.id
    LEFT JOIN scenario_masters sm2 ON se.scenario_master_id = sm2.id
    LEFT JOIN scenarios s ON se.scenario_id = s.id
    LEFT JOIN stores st ON se.store_id = st.id
    WHERE se.is_recruitment_extended = TRUE
      AND se.is_cancelled = FALSE
      AND se.category = 'open'
      AND se.scenario IS NOT NULL
      AND se.scenario != ''
      AND (se.date::text || ' ' || se.start_time::text || '+09:00')::timestamptz <= v_check_time
      AND (se.date::text || ' ' || se.start_time::text || '+09:00')::timestamptz > v_now
      AND NOT EXISTS (
        SELECT 1 FROM performance_cancellation_logs pcl
        WHERE pcl.schedule_event_id = se.id
          AND pcl.check_type = 'four_hours_before'
      )
    ORDER BY se.date, se.start_time
  LOOP
    v_events_checked := v_events_checked + 1;

    SELECT COALESCE(SUM(r.participant_count), 0) INTO v_reservation_count
    FROM reservations r
    WHERE r.schedule_event_id = v_event.id
      AND r.status IN ('pending', 'confirmed', 'gm_confirmed', 'checked_in');

    SELECT COUNT(*) INTO v_unsynced_staff
    FROM (
      SELECT key AS staff_name, value AS staff_role
      FROM jsonb_each_text(COALESCE(v_event.gm_roles, '{}'::jsonb))
    ) AS gm_staff
    WHERE gm_staff.staff_role = 'staff'
      AND NOT EXISTS (
        SELECT 1 FROM reservations r2
        WHERE r2.schedule_event_id = v_event.id
          AND r2.status IN ('pending', 'confirmed', 'gm_confirmed', 'checked_in')
          AND r2.reservation_source = 'staff_entry'
          AND gm_staff.staff_name = ANY(r2.participant_names)
      );

    v_current := v_reservation_count + v_unsynced_staff;
    v_max := v_event.max_participants;

    -- 最低開催人数は 1 以上・定員以下に収める（データ不整合で中止が暴発しないようにする）
    v_min := GREATEST(COALESCE(v_event.min_participants, 1), 1);
    IF v_min > v_max THEN
      v_min := GREATEST(v_max, 1);
    END IF;

    IF v_current >= v_min THEN
      v_result := 'confirmed';
      v_events_confirmed := v_events_confirmed + 1;

      UPDATE schedule_events
      SET is_recruitment_extended = FALSE,
          updated_at = NOW()
      WHERE id = v_event.id;
    ELSE
      v_result := 'cancelled';
      v_events_cancelled := v_events_cancelled + 1;

      UPDATE schedule_events
      SET is_cancelled = TRUE,
          is_recruitment_extended = FALSE,
          updated_at = NOW()
      WHERE id = v_event.id;
    END IF;

    INSERT INTO performance_cancellation_logs (
      schedule_event_id,
      organization_id,
      check_type,
      current_participants,
      max_participants,
      result
    ) VALUES (
      v_event.id,
      v_event.organization_id,
      'four_hours_before',
      v_current,
      v_max,
      v_result
    );

    v_details := v_details || jsonb_build_object(
      'event_id', v_event.id,
      'date', v_event.date,
      'start_time', v_event.start_time,
      'scenario', v_event.scenario,
      'store_name', v_event.store_name,
      'current_participants', v_current,
      'max_participants', v_max,
      'min_required', v_min,
      -- half_required は旧キーの後方互換（値は min_required と同じ）
      'half_required', v_min,
      'result', v_result,
      'organization_id', v_event.organization_id,
      'gms', v_event.gms
    );
  END LOOP;

  RETURN QUERY SELECT
    v_events_checked,
    v_events_confirmed,
    v_events_cancelled,
    v_details;
END;
$function$;

CREATE OR REPLACE FUNCTION public.check_performances_with_recruitment_deadlines_for_org(p_organization_id uuid)
 RETURNS TABLE(events_checked integer, events_confirmed integer, events_cancelled integer, details jsonb)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
 SET "TimeZone" TO 'Asia/Tokyo'
AS $function$
DECLARE
  v_events_checked INTEGER := 0;
  v_events_confirmed INTEGER := 0;
  v_events_cancelled INTEGER := 0;
  v_details JSONB := '[]'::JSONB;
  v_event RECORD;
  v_current INTEGER;
  v_reservation_count INTEGER;
  v_unsynced_staff INTEGER;
  v_max INTEGER;
  v_min INTEGER;
  v_missing_limit INTEGER;
  v_result TEXT;
  v_now TIMESTAMPTZ;
  v_check_time TIMESTAMPTZ;
  v_deadline timestamptz;
  v_active boolean;
  v_has_decision boolean;
  v_prior_confirmed boolean;
  v_has_deadline boolean;
  v_status text;
  v_cycle integer;
  v_reopened boolean;
BEGIN
  v_now := NOW();
  v_check_time := v_now + INTERVAL '4 hours';

  FOR v_event IN
    SELECT
      se.id,
      se.date,
      se.start_time,
      se.scenario,
      se.gm_roles,
      se.is_recruitment_extended,
      (pol.one_seat_enabled AND CASE WHEN os.recruitment_enabled_source='custom' THEN os.recruitment_extension_enabled ELSE COALESCE(common.enabled,true) END) AS one_seat_enabled,
      rd.max_missing_participants AS saved_max_missing,
      CASE WHEN os.recruitment_target_source='custom' THEN os.recruitment_target_mode ELSE COALESCE(common.mode,'count') END AS target_mode,
      CASE WHEN os.recruitment_target_source='custom' THEN os.recruitment_target_value ELSE COALESCE(common.value,os.recruitment_max_missing,pol.max_missing_participants,2) END AS target_value,
      CASE WHEN os.recruitment_deadline_source='custom' THEN os.recruitment_deadline_minutes ELSE COALESCE(common.deadline_minutes,90) END AS deadline_minutes,
      pol.customer_site_url,
      rd.deadline AS recruitment_deadline,
      rd.status AS recruitment_status,
      COALESCE(
        os.override_player_count_max,
        sm.player_count_max,
        sm2.player_count_max,
        se.max_participants,
        s.player_count_max,
        8
      ) AS max_participants,
      COALESCE(
        os.override_player_count_min,
        sm.player_count_min,
        sm2.player_count_min,
        s.player_count_min,
        -- min が一切設定されていない場合のみ旧仕様（定員の過半数）にフォールバック
        CEIL(COALESCE(
          os.override_player_count_max,
          sm.player_count_max,
          sm2.player_count_max,
          se.max_participants,
          s.player_count_max,
          8
        )::NUMERIC / 2)::INTEGER
      ) AS min_participants,
      se.organization_id,
      se.gms,
      se.store_id,
      st.name AS store_name,
      (se.date::text || ' ' || se.start_time::text || '+09:00')::timestamptz AS event_datetime
    FROM schedule_events se
    LEFT JOIN performance_recruitment_policies pol ON pol.organization_id=se.organization_id
    LEFT JOIN organization_recruitment_settings common ON common.organization_id=se.organization_id
    LEFT JOIN performance_recruitment_deadlines rd ON rd.schedule_event_id = se.id
      AND rd.organization_id = se.organization_id
    LEFT JOIN LATERAL (SELECT sc.* FROM organization_scenarios sc WHERE sc.organization_id=se.organization_id AND
      ((se.organization_scenario_id IS NOT NULL AND sc.id=se.organization_scenario_id) OR
       (se.organization_scenario_id IS NULL AND sc.scenario_master_id=COALESCE(se.scenario_master_id,se.scenario_id))) LIMIT 1) os ON true
    LEFT JOIN scenario_masters sm ON os.scenario_master_id = sm.id
    LEFT JOIN scenario_masters sm2 ON se.scenario_master_id = sm2.id
    LEFT JOIN scenarios s ON se.scenario_id = s.id
    LEFT JOIN stores st ON se.store_id = st.id
    WHERE (p_organization_id IS NULL OR se.organization_id=p_organization_id)
      AND (se.is_recruitment_extended = TRUE OR (pol.one_seat_enabled AND EXISTS(SELECT 1 FROM performance_cancellation_logs c WHERE c.schedule_event_id=se.id AND c.result='confirmed')))
      AND se.is_cancelled = FALSE
      AND se.category = 'open'
      AND se.scenario IS NOT NULL
      AND se.scenario != ''
      AND (se.date::text || ' ' || se.start_time::text || '+09:00')::timestamptz <= v_check_time
      AND ((se.date::text || ' ' || se.start_time::text || '+09:00')::timestamptz > v_now
        OR rd.status = 'active')
      AND (rd.status = 'active' OR pol.one_seat_enabled OR NOT EXISTS (
        SELECT 1 FROM performance_cancellation_logs pcl
        WHERE pcl.schedule_event_id = se.id
          AND pcl.check_type = 'four_hours_before'
      )
      )
    ORDER BY se.date, se.start_time
    FOR UPDATE OF se SKIP LOCKED
  LOOP
    -- 公演ロックの取得直前に延長設定が完了した場合も、新しい文のスナップショットで再読込。
    SELECT deadline, status = 'active', status, cycle INTO v_deadline, v_active, v_status, v_cycle
      FROM performance_recruitment_deadlines
      WHERE schedule_event_id = v_event.id AND organization_id = v_event.organization_id;
    v_has_deadline := FOUND;
    v_cycle := COALESCE(v_cycle, 1);
    v_reopened := false;
    SELECT EXISTS(SELECT 1 FROM performance_cancellation_logs WHERE schedule_event_id=v_event.id AND check_type='four_hours_before'),
      EXISTS(SELECT 1 FROM performance_cancellation_logs WHERE schedule_event_id=v_event.id AND result='confirmed')
      INTO v_has_decision, v_prior_confirmed;

    SELECT COALESCE(SUM(r.participant_count), 0) INTO v_reservation_count
    FROM reservations r
    WHERE r.schedule_event_id = v_event.id
      AND r.status IN ('pending', 'confirmed', 'gm_confirmed', 'checked_in');

    SELECT COUNT(*) INTO v_unsynced_staff
    FROM (
      SELECT key AS staff_name, value AS staff_role
      FROM jsonb_each_text(COALESCE(v_event.gm_roles, '{}'::jsonb))
    ) AS gm_staff
    WHERE gm_staff.staff_role = 'staff'
      AND NOT EXISTS (
        SELECT 1 FROM reservations r2
        WHERE r2.schedule_event_id = v_event.id
          AND r2.status IN ('pending', 'confirmed', 'gm_confirmed', 'checked_in')
          AND r2.reservation_source = 'staff_entry'
          AND gm_staff.staff_name = ANY(r2.participant_names)
      );

    v_current := v_reservation_count + v_unsynced_staff;
    v_max := v_event.max_participants;

    -- 最低開催人数は 1 以上・定員以下に収める（データ不整合で中止が暴発しないようにする）
    v_min := GREATEST(COALESCE(v_event.min_participants, 1), 1);
    IF v_min > v_max THEN
      v_min := GREATEST(v_max, 1);
    END IF;

    -- 案内済み条件は固定。未案内だけ最新の共通/個別設定を使う。
    v_missing_limit := COALESCE(v_event.saved_max_missing, recruitment_missing_limit(v_min,v_event.target_mode,v_event.target_value));

    -- 再確定後の再欠員は同じ案内済み期限で再開。通知と辞退リンクは周回別に保持。
    IF v_status = 'confirmed'
      AND v_min-v_current BETWEEN 1 AND v_missing_limit THEN
      UPDATE performance_recruitment_deadlines SET status='active', cycle=cycle+1,
        was_confirmed=true, updated_at=now()
        WHERE schedule_event_id=v_event.id AND organization_id=v_event.organization_id
        RETURNING cycle INTO v_cycle;
      UPDATE schedule_events SET is_recruitment_extended=true, updated_at=now()
        WHERE id=v_event.id AND organization_id=v_event.organization_id;
      v_active := true;
      v_reopened := true;
      -- 旧周回の未送信通知は新しい状態へ持ち越さない。送信済み履歴は保持する。
      UPDATE performance_recruitment_notices SET status='expired', lease_until=NULL
        WHERE schedule_event_id=v_event.id AND organization_id=v_event.organization_id
          AND cycle<v_cycle AND kind<>'withdrawn' AND status IN ('pending','failed','sending');
    END IF;

    -- 社長確認済み: 最低開催人数まであと1〜2人なら、予約の増加履歴によらず90分前まで（組織設定で段階適用）。
    IF (v_reopened AND v_deadline>v_now) OR (v_event.one_seat_enabled AND NOT v_has_deadline
      AND v_min-v_current BETWEEN 1 AND v_missing_limit
      AND v_event.event_datetime - make_interval(mins=>v_event.deadline_minutes) > v_now) THEN
      IF NOT v_reopened THEN
      PERFORM set_performance_recruitment_deadline(v_event.organization_id,v_event.id,
        v_event.event_datetime-make_interval(mins=>v_event.deadline_minutes),format('最低開催人数まであと%s人のため、開始%s分前まで追加募集',v_min-v_current,v_event.deadline_minutes));
        v_deadline := v_event.event_datetime-make_interval(mins=>v_event.deadline_minutes);
        UPDATE performance_recruitment_deadlines SET max_missing_participants=v_missing_limit WHERE schedule_event_id=v_event.id AND organization_id=v_event.organization_id;
      END IF;
      INSERT INTO performance_recruitment_notices(schedule_event_id,organization_id,reservation_id,customer_email,snapshot,cycle)
      SELECT v_event.id,v_event.organization_id,r.id,COALESCE(NULLIF(btrim(r.customer_email),''),NULLIF(btrim(c.email),'')),
        jsonb_build_object('scenario',v_event.scenario,'date',v_event.date,'start_time',v_event.start_time,
          'store_name',v_event.store_name,'deadline',v_deadline,
          'was_confirmed',v_prior_confirmed,'site_url',v_event.customer_site_url,'missing_participants',v_min-v_current),v_cycle
      FROM reservations r LEFT JOIN customers c ON c.id=r.customer_id
      WHERE r.schedule_event_id=v_event.id AND r.organization_id=v_event.organization_id
        AND r.status IN ('pending','confirmed','gm_confirmed') AND r.reservation_source IS DISTINCT FROM 'staff_entry'
      ON CONFLICT(schedule_event_id,reservation_id,kind,cycle,withdrawal_sequence) DO NOTHING;
      CONTINUE;
    END IF;
    -- 確定済みの公演を毎分再確定しない。設定を超える欠員は今回の自動延長ルールに含めない。
    IF v_active IS NOT TRUE AND (v_has_decision OR v_event.is_recruitment_extended IS NOT TRUE) THEN CONTINUE; END IF;

    -- 人数が揃えば即確定。未達でも指定締切前は終端ログ・通知を作らない。
    IF v_current < v_min AND v_active AND v_deadline > v_now THEN CONTINUE; END IF;
    v_events_checked := v_events_checked + 1;

    IF v_current >= v_min THEN
      v_result := 'confirmed';
      v_events_confirmed := v_events_confirmed + 1;

      UPDATE schedule_events
      SET is_recruitment_extended = FALSE,
          updated_at = NOW()
      WHERE id = v_event.id;
    ELSE
      v_result := 'cancelled';
      v_events_cancelled := v_events_cancelled + 1;

      UPDATE schedule_events
      SET is_cancelled = TRUE,
          is_recruitment_extended = FALSE,
          updated_at = NOW()
      WHERE id = v_event.id;
    END IF;

    IF v_active THEN
      -- 最終通知も同じトランザクションで確保。過去の開催決定メールとは別に送る。
      INSERT INTO performance_recruitment_notices(schedule_event_id,organization_id,reservation_id,customer_email,snapshot,kind,cycle)
      SELECT v_event.id,v_event.organization_id,r.id,COALESCE(NULLIF(btrim(r.customer_email),''),NULLIF(btrim(c.email),'')),
        jsonb_build_object('scenario',v_event.scenario,'date',v_event.date,'start_time',v_event.start_time,
          'store_name',v_event.store_name,'deadline',v_deadline,'was_confirmed',v_prior_confirmed,'site_url',v_event.customer_site_url),v_result,v_cycle
      FROM reservations r LEFT JOIN customers c ON c.id=r.customer_id
      WHERE r.schedule_event_id=v_event.id AND r.organization_id=v_event.organization_id
        AND r.status IN ('pending','confirmed','gm_confirmed') AND r.reservation_source IS DISTINCT FROM 'staff_entry'
      ON CONFLICT(schedule_event_id,reservation_id,kind,cycle,withdrawal_sequence) DO NOTHING;
      IF v_result='cancelled' THEN
        UPDATE reservations SET status='cancelled',cancelled_at=now(),updated_at=now(),
          cancellation_reason='人数未達による公演中止（追加募集期限の判定・キャンセル料0円）'
          WHERE schedule_event_id=v_event.id AND organization_id=v_event.organization_id AND status IN ('pending','confirmed','gm_confirmed');
      END IF;
      UPDATE performance_recruitment_deadlines SET status = v_result, updated_at = now()
        WHERE schedule_event_id = v_event.id AND organization_id = v_event.organization_id;
    END IF;

    -- 以前の開催決定を保持する。追加募集の最終結果は期限テーブルにも残る。
    INSERT INTO performance_cancellation_logs (
      schedule_event_id,
      organization_id,
      check_type,
      current_participants,
      max_participants,
      result
    ) VALUES (
      v_event.id,
      v_event.organization_id,
      'four_hours_before',
      v_current,
      v_max,
      v_result
    ) ON CONFLICT (schedule_event_id, check_type) DO NOTHING;

    v_details := v_details || jsonb_build_object(
      'recruitment_deadline', CASE WHEN v_active THEN v_deadline ELSE NULL END,
      'event_id', v_event.id,
      'date', v_event.date,
      'start_time', v_event.start_time,
      'scenario', v_event.scenario,
      'store_name', v_event.store_name,
      'current_participants', v_current,
      'max_participants', v_max,
      'min_required', v_min,
      -- half_required は旧キーの後方互換（値は min_required と同じ）
      'half_required', v_min,
      'result', v_result,
      'organization_id', v_event.organization_id,
      'gms', v_event.gms
    );
  END LOOP;

  RETURN QUERY SELECT
    v_events_checked,
    v_events_confirmed,
    v_events_cancelled,
    v_details;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_performance_booking_window(p_event_id uuid)
 RETURNS TABLE(judgment_deadline timestamp with time zone, judgment_status text, booking_deadline timestamp with time zone, effective_booking_deadline timestamp with time zone, override_minutes integer, default_minutes integer, updated_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
 WITH settings AS (
  SELECT e.id,e.updated_at,e.booking_cutoff_minutes,
    (e.date+e.start_time) AT TIME ZONE 'Asia/Tokyo' AS starts_at,
    COALESCE(os.booking_cutoff_minutes,common.booking_cutoff_minutes,0) AS default_minutes,
    d.deadline,d.status,
    EXISTS(SELECT 1 FROM performance_cancellation_logs l WHERE l.schedule_event_id=e.id AND l.organization_id=e.organization_id AND l.result='confirmed') AS was_confirmed
  FROM schedule_events e
  LEFT JOIN global_settings common ON common.organization_id=e.organization_id
  LEFT JOIN LATERAL (
    SELECT sc.booking_cutoff_minutes FROM organization_scenarios sc
    WHERE sc.organization_id=e.organization_id AND
      ((e.organization_scenario_id IS NOT NULL AND sc.id=e.organization_scenario_id)
       OR (e.organization_scenario_id IS NULL AND sc.scenario_master_id=COALESCE(e.scenario_master_id,e.scenario_id)))
    LIMIT 1
  ) os ON true
  LEFT JOIN performance_recruitment_deadlines d ON d.schedule_event_id=e.id AND d.organization_id=e.organization_id
  WHERE e.id=p_event_id AND e.category='open' AND NOT e.is_cancelled
 ), resolved AS (
  SELECT *,starts_at-make_interval(mins=>COALESCE(booking_cutoff_minutes,default_minutes)) AS cutoff FROM settings
 )
 SELECT COALESCE(deadline,starts_at-interval '4 hours'),
   COALESCE(status,CASE WHEN was_confirmed THEN 'confirmed' ELSE 'pending' END),cutoff,
   CASE WHEN status='active' THEN deadline ELSE cutoff END,booking_cutoff_minutes,default_minutes,updated_at
 FROM resolved;
$function$;

CREATE OR REPLACE FUNCTION public.dispatch_performance_recruitment_checks()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE p record; base_url text; cron_key text;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM performance_recruitment_policies WHERE one_seat_enabled) THEN RETURN; END IF;
 SELECT value INTO base_url FROM app_config WHERE key='supabase_url';
 SELECT value INTO cron_key FROM app_config WHERE key='trigger_secret';
 IF base_url IS NULL OR cron_key IS NULL THEN RAISE EXCEPTION '募集判定の接続設定がありません'; END IF;
 FOR p IN SELECT organization_id FROM performance_recruitment_policies pol WHERE one_seat_enabled
   AND (EXISTS(SELECT 1 FROM schedule_events e WHERE e.organization_id=pol.organization_id
     AND NOT e.is_cancelled AND e.category='open'
     AND (e.date+e.start_time) AT TIME ZONE 'Asia/Tokyo' <= now()+interval '4 hours'
     AND ((e.date+e.start_time) AT TIME ZONE 'Asia/Tokyo'>now()
       OR EXISTS(SELECT 1 FROM performance_recruitment_deadlines d WHERE d.schedule_event_id=e.id AND d.status='active')))
     OR EXISTS(SELECT 1 FROM performance_recruitment_notices n WHERE n.organization_id=pol.organization_id
       AND n.kind<>'extension' AND n.status IN ('pending','failed','sending') AND n.attempts<10 AND n.created_at>now()-interval '1 day')
     OR EXISTS(SELECT 1 FROM recruitment_x_posts x WHERE x.organization_id=pol.organization_id AND x.status IN ('pending','failed','sending') AND x.attempts<10 AND x.created_at>now()-interval '1 day'))
 LOOP
   PERFORM net.http_post(url:=rtrim(base_url,'/')||'/functions/v1/check-performance-cancellation',
     headers:=jsonb_build_object('Content-Type','application/json','x-recruitment-cron-secret',cron_key),
     body:=jsonb_build_object('check_type','recruitment_deadline','organization_id',p.organization_id), timeout_milliseconds:=30000);
 END LOOP;
END;
$function$;

CREATE OR REPLACE FUNCTION public.set_performance_recruitment_deadline(p_organization_id uuid, p_event_id uuid, p_deadline timestamp with time zone, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_event public.schedule_events%ROWTYPE;
  v_existing public.performance_recruitment_deadlines%ROWTYPE;
  v_start timestamptz;
  v_confirmed boolean;
BEGIN
  SELECT * INTO v_event FROM public.schedule_events
  WHERE id = p_event_id AND organization_id = p_organization_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION '対象の公演が見つかりません' USING ERRCODE = '22023'; END IF;
  v_start := (v_event.date + v_event.start_time) AT TIME ZONE 'Asia/Tokyo';
  IF v_event.category <> 'open' OR v_event.is_cancelled IS DISTINCT FROM false THEN
    RAISE EXCEPTION '中止していないオープン公演のみ延長できます' USING ERRCODE = '22023';
  END IF;
  IF p_deadline IS NULL OR p_deadline <= now() OR p_deadline >= v_start OR p_deadline < v_start - interval '4 hours' THEN
    RAISE EXCEPTION '締切は現在より後かつ公演4時間前以降、公演開始より前を指定してください' USING ERRCODE = '22023';
  END IF;
  IF p_reason IS NULL OR length(btrim(p_reason)) NOT BETWEEN 1 AND 2000 THEN
    RAISE EXCEPTION '延長理由を1〜2000文字で指定してください' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_existing FROM public.performance_recruitment_deadlines WHERE schedule_event_id = p_event_id;
  IF FOUND THEN
    -- 再送は同じ結果を返す。顧客に案内した期限の黙示的な変更はしない。
    IF v_existing.status = 'active' AND v_existing.deadline = p_deadline
      AND v_existing.reason = btrim(p_reason) THEN
      RETURN jsonb_build_object('success', true, 'deadline', v_existing.deadline,
        'was_confirmed', v_existing.was_confirmed, 'replayed', true);
    END IF;
    RAISE EXCEPTION '既存の延長判断があります。期限の変更には顧客案内の再確認が必要です' USING ERRCODE = '22023';
  END IF;
  SELECT EXISTS(SELECT 1 FROM public.performance_cancellation_logs
    WHERE schedule_event_id = p_event_id AND organization_id = p_organization_id
      AND result = 'confirmed') INTO v_confirmed;
  INSERT INTO public.performance_recruitment_deadlines
    (schedule_event_id, organization_id, deadline, reason, was_confirmed)
    VALUES (p_event_id, p_organization_id, p_deadline, btrim(p_reason), v_confirmed);
  UPDATE public.schedule_events SET is_recruitment_extended = true, updated_at = now()
    WHERE id = p_event_id AND organization_id = p_organization_id;
  RETURN jsonb_build_object('success', true, 'deadline', p_deadline,
    'was_confirmed', v_confirmed, 'replayed', false);
END;
$function$;


CREATE OR REPLACE FUNCTION public.check_performances_day_before(p_target_date date DEFAULT NULL::date, p_dry_run boolean DEFAULT false)
 RETURNS TABLE(events_checked integer, events_confirmed integer, events_extended integer, events_cancelled integer, details jsonb)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
 SET "TimeZone" TO 'Asia/Tokyo'
AS $function$
DECLARE
  v_events_checked INTEGER := 0;
  v_events_confirmed INTEGER := 0;
  v_events_extended INTEGER := 0;
  v_events_cancelled INTEGER := 0;
  v_details JSONB := '[]'::JSONB;
  v_event RECORD;
  v_current INTEGER;
  v_reservation_count INTEGER;
  v_unsynced_staff INTEGER;
  v_max INTEGER;
  v_min INTEGER;
  v_half INTEGER;
  v_result TEXT;
  v_target_date_jst DATE;
BEGIN
  IF p_target_date IS NOT NULL THEN
    v_target_date_jst := p_target_date;
  ELSE
    v_target_date_jst := (timezone('Asia/Tokyo', NOW())::date + 1);
  END IF;

  RAISE NOTICE '前日チェック開始: 対象日=%, dry_run=%', v_target_date_jst, p_dry_run;

  FOR v_event IN
    SELECT
      se.id,
      se.date,
      se.start_time,
      se.scenario,
      se.gm_roles,
      COALESCE(
        os.override_player_count_max,
        sm.player_count_max,
        sm2.player_count_max,
        se.max_participants,
        s.player_count_max,
        8
      ) AS max_participants,
      COALESCE(
        os.override_player_count_min,
        sm.player_count_min,
        sm2.player_count_min,
        s.player_count_min,
        CEIL(COALESCE(
          os.override_player_count_max,
          sm.player_count_max,
          sm2.player_count_max,
          se.max_participants,
          s.player_count_max,
          8
        )::NUMERIC / 2)::INTEGER
      ) AS min_participants,
      se.organization_id,
      se.gms,
      se.store_id,
      se.category,
      st.name AS store_name
    FROM schedule_events se
    LEFT JOIN organization_scenarios os ON se.organization_scenario_id = os.id
    LEFT JOIN scenario_masters sm ON os.scenario_master_id = sm.id
    LEFT JOIN scenario_masters sm2 ON se.scenario_master_id = sm2.id
    LEFT JOIN scenarios s ON se.scenario_id = s.id
    LEFT JOIN stores st ON se.store_id = st.id
    WHERE se.date = v_target_date_jst
      AND se.is_cancelled = FALSE
      AND se.is_recruitment_extended IS NOT TRUE
      AND se.category IN (
        'open',
        'private',
        'gmtest',
        'testplay',
        'offsite',
        'venue_rental',
        'venue_rental_free',
        'package',
        'mtg'
      )
      AND (
        se.category <> 'open'
        OR (se.scenario IS NOT NULL AND se.scenario != '')
      )
      AND NOT EXISTS (
        SELECT 1 FROM performance_cancellation_logs pcl
        WHERE pcl.schedule_event_id = se.id
          AND pcl.check_type = 'day_before'
      )
    ORDER BY se.start_time
  LOOP
    v_events_checked := v_events_checked + 1;

    SELECT COALESCE(SUM(r.participant_count), 0) INTO v_reservation_count
    FROM reservations r
    WHERE r.schedule_event_id = v_event.id
      AND r.status IN ('pending', 'confirmed', 'gm_confirmed', 'checked_in');

    SELECT COUNT(*) INTO v_unsynced_staff
    FROM (
      SELECT key AS staff_name, value AS staff_role
      FROM jsonb_each_text(COALESCE(v_event.gm_roles, '{}'::jsonb))
    ) AS gm_staff
    WHERE gm_staff.staff_role = 'staff'
      AND NOT EXISTS (
        SELECT 1 FROM reservations r2
        WHERE r2.schedule_event_id = v_event.id
          AND r2.status IN ('pending', 'confirmed', 'gm_confirmed', 'checked_in')
          AND r2.reservation_source = 'staff_entry'
          AND gm_staff.staff_name = ANY(r2.participant_names)
      );

    v_current := v_reservation_count + v_unsynced_staff;
    v_max := v_event.max_participants;

    v_min := GREATEST(COALESCE(v_event.min_participants, 1), 1);
    IF v_min > v_max THEN
      v_min := GREATEST(v_max, 1);
    END IF;
    v_half := GREATEST(CEIL(v_min::NUMERIC / 2)::INTEGER, 1);

    IF v_event.category IS DISTINCT FROM 'open' THEN
      v_result := 'confirmed';
      v_events_confirmed := v_events_confirmed + 1;
    ELSIF v_current >= v_min THEN
      v_result := 'confirmed';
      v_events_confirmed := v_events_confirmed + 1;
    ELSIF v_current >= v_half THEN
      v_result := 'extended';
      v_events_extended := v_events_extended + 1;

      IF NOT COALESCE(p_dry_run, FALSE) THEN
        UPDATE schedule_events
        SET is_recruitment_extended = TRUE,
            updated_at = NOW()
        WHERE id = v_event.id;
      END IF;
    ELSE
      v_result := 'cancelled';
      v_events_cancelled := v_events_cancelled + 1;

      IF NOT COALESCE(p_dry_run, FALSE) THEN
        UPDATE schedule_events
        SET is_cancelled = TRUE,
            updated_at = NOW()
        WHERE id = v_event.id;
      END IF;
    END IF;

    IF NOT COALESCE(p_dry_run, FALSE) THEN
      INSERT INTO performance_cancellation_logs (
        schedule_event_id,
        organization_id,
        check_type,
        current_participants,
        max_participants,
        result
      ) VALUES (
        v_event.id,
        v_event.organization_id,
        'day_before',
        v_current,
        v_max,
        v_result
      );
    END IF;

    v_details := v_details || jsonb_build_array(jsonb_build_object(
      'event_id', v_event.id,
      'date', v_event.date,
      'start_time', v_event.start_time,
      'scenario', v_event.scenario,
      'store_name', v_event.store_name,
      'current_participants', v_current,
      'max_participants', v_max,
      'min_required', v_min,
      'half_required', v_half,
      'result', v_result,
      'category', v_event.category,
      'organization_id', v_event.organization_id,
      'gms', to_jsonb(v_event.gms)
    ));
  END LOOP;

  RETURN QUERY SELECT
    v_events_checked,
    v_events_confirmed,
    v_events_extended,
    v_events_cancelled,
    v_details;
END;
$function$;


CREATE OR REPLACE FUNCTION public.get_survey_data_for_member(p_group_id uuid, p_member_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_group RECORD;
  v_org_scenario RECORD;
  v_questions JSONB;
  v_existing_response RECORD;
  v_member_exists BOOLEAN;
BEGIN
  -- メンバーがグループに属しているか検証
  SELECT EXISTS(
    SELECT 1 FROM private_group_members
    WHERE id = p_member_id
      AND group_id = p_group_id
      AND status = 'joined'
  ) INTO v_member_exists;

  IF NOT v_member_exists THEN
    RAISE EXCEPTION 'Member does not belong to this group';
  END IF;

  -- グループのシナリオ情報を取得
  SELECT scenario_master_id, organization_id
  INTO v_group
  FROM private_groups
  WHERE id = p_group_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'group_not_found');
  END IF;

  -- organization_scenarios を scenario_master_id で検索
  SELECT id, survey_enabled, survey_deadline_days, characters
  INTO v_org_scenario
  FROM organization_scenarios
  WHERE scenario_master_id = v_group.scenario_master_id
    AND organization_id = v_group.organization_id
  LIMIT 1;

  -- 見つからなければ id で直接検索（scenario_master_id が org_scenario.id の場合）
  IF NOT FOUND THEN
    SELECT id, survey_enabled, survey_deadline_days, characters
    INTO v_org_scenario
    FROM organization_scenarios
    WHERE id = v_group.scenario_master_id
    LIMIT 1;
  END IF;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'scenario_not_found');
  END IF;

  IF NOT COALESCE(v_org_scenario.survey_enabled, false) THEN
    RETURN jsonb_build_object('survey_enabled', false);
  END IF;

  -- 質問を取得（order_num 順）
  SELECT jsonb_agg(
    jsonb_build_object(
      'id', q.id,
      'org_scenario_id', q.org_scenario_id,
      'question_text', q.question_text,
      'question_type', q.question_type,
      'options', q.options,
      'is_required', q.is_required,
      'order_num', q.order_num,
      'created_at', q.created_at,
      'updated_at', q.updated_at
    ) ORDER BY q.order_num
  )
  INTO v_questions
  FROM org_scenario_survey_questions q
  WHERE q.org_scenario_id = v_org_scenario.id;

  -- 既存の回答を取得
  SELECT id, responses
  INTO v_existing_response
  FROM private_group_survey_responses
  WHERE group_id = p_group_id
    AND member_id = p_member_id;

  RETURN jsonb_build_object(
    'survey_enabled', true,
    'org_scenario_id', v_org_scenario.id,
    'survey_deadline_days', v_org_scenario.survey_deadline_days,
    'characters', COALESCE(v_org_scenario.characters, '[]'::jsonb),
    'questions', COALESCE(v_questions, '[]'::jsonb),
    'existing_response_id', v_existing_response.id,
    'existing_responses', v_existing_response.responses
  );
END;
$function$;


DROP FUNCTION public.freeze_private_group_survey_deadline(uuid,uuid);
DROP FUNCTION public.get_private_groups_survey_settings(uuid,uuid[]);
DROP FUNCTION public.get_private_group_survey_settings(uuid,uuid);
DROP FUNCTION public.parse_announced_survey_deadline(text,date);
DROP TABLE public.private_group_survey_deadlines;
DO $migration$
DECLARE definition text; function_oid oid;
BEGIN
 SELECT p.oid INTO STRICT function_oid FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='approve_private_booking';
 definition:=pg_get_functiondef(function_oid);
 IF (length(definition)-length(replace(definition,$old$AND date + start_time < v_calendar_date + p_selected_end_time + make_interval(mins => public.resolve_preparation_minutes(v_org_id,NULL,NULL,id))$old$,'')))/length($old$AND date + start_time < v_calendar_date + p_selected_end_time + make_interval(mins => public.resolve_preparation_minutes(v_org_id,NULL,NULL,id))$old$)<>1 THEN RAISE EXCEPTION 'Unexpected approve_private_booking definition: preparation guard'; END IF;
 definition:=replace(definition,$old$AND date + start_time < v_calendar_date + p_selected_end_time + make_interval(mins => public.resolve_preparation_minutes(v_org_id,NULL,NULL,id))$old$,$new$AND start_time < p_selected_end_time + INTERVAL '60 minutes'$new$);
 IF (length(definition)-length(replace(definition,$old$AND date + end_time > v_calendar_date + p_selected_start_time - make_interval(mins => public.resolve_preparation_minutes(v_org_id,p_selected_store_id,v_reservation.scenario_master_id,NULL))$old$,'')))/length($old$AND date + end_time > v_calendar_date + p_selected_start_time - make_interval(mins => public.resolve_preparation_minutes(v_org_id,p_selected_store_id,v_reservation.scenario_master_id,NULL))$old$)<>1 THEN RAISE EXCEPTION 'Unexpected approve_private_booking definition: preparation guard'; END IF;
 definition:=replace(definition,$old$AND date + end_time > v_calendar_date + p_selected_start_time - make_interval(mins => public.resolve_preparation_minutes(v_org_id,p_selected_store_id,v_reservation.scenario_master_id,NULL))$old$,$new$AND end_time > p_selected_start_time - INTERVAL '60 minutes'$new$);
 EXECUTE definition;
END $migration$;
DO $migration$
DECLARE definition text; function_oid oid;
BEGIN
 SELECT p.oid INTO STRICT function_oid FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='create_private_booking_request';
 definition:=pg_get_functiondef(function_oid);
 IF (length(definition)-length(replace(definition,$old$AND event.date + event.start_time < v_cand_date + v_cand_end + make_interval(mins => public.resolve_preparation_minutes(v_org_id,NULL,NULL,event.id))$old$,'')))/length($old$AND event.date + event.start_time < v_cand_date + v_cand_end + make_interval(mins => public.resolve_preparation_minutes(v_org_id,NULL,NULL,event.id))$old$)<>1 THEN RAISE EXCEPTION 'Unexpected create_private_booking_request definition: preparation guard'; END IF;
 definition:=replace(definition,$old$AND event.date + event.start_time < v_cand_date + v_cand_end + make_interval(mins => public.resolve_preparation_minutes(v_org_id,NULL,NULL,event.id))$old$,$new$AND event.start_time < v_cand_end + INTERVAL '60 minutes'$new$);
 IF (length(definition)-length(replace(definition,$old$AND event.date + event.end_time > v_cand_date + v_cand_start - make_interval(mins => public.resolve_preparation_minutes(v_org_id,v_store_uuid,COALESCE(v_scenario_master_id,p_scenario_id),NULL))$old$,'')))/length($old$AND event.date + event.end_time > v_cand_date + v_cand_start - make_interval(mins => public.resolve_preparation_minutes(v_org_id,v_store_uuid,COALESCE(v_scenario_master_id,p_scenario_id),NULL))$old$)<>1 THEN RAISE EXCEPTION 'Unexpected create_private_booking_request definition: preparation guard'; END IF;
 definition:=replace(definition,$old$AND event.date + event.end_time > v_cand_date + v_cand_start - make_interval(mins => public.resolve_preparation_minutes(v_org_id,v_store_uuid,COALESCE(v_scenario_master_id,p_scenario_id),NULL))$old$,$new$AND event.end_time > v_cand_start - INTERVAL '60 minutes'$new$);
 EXECUTE definition;
END $migration$;

DROP FUNCTION public.get_public_preparation_context(uuid,uuid,date,date);
DROP FUNCTION public.resolve_preparation_minutes(uuid,uuid,uuid,uuid);
DROP FUNCTION public.get_public_payment_settings(text,uuid);
DROP FUNCTION public.resolve_operating_setting(uuid,text,jsonb,uuid,uuid,uuid);
DROP FUNCTION public.save_operating_setting_overrides(uuid, text, uuid, jsonb, bigint);
DROP FUNCTION public.get_operating_setting_default(text);
DROP TABLE public.operating_setting_overrides;
DROP FUNCTION IF EXISTS public.get_performance_judgment_deadline(uuid,uuid);
DROP TABLE IF EXISTS public.performance_judgment_deadlines;
COMMIT;

-- 自動リマインドの配備後に間隔だけ戻す場合（予約データ・送信履歴は消さない）:
-- SELECT cron.alter_job(jobid, schedule := '0 0 * * *')
-- FROM cron.job WHERE jobname='auto-send-reminder-emails-day-before';
-- 新しい送信記録が存在する場合、旧送信処理へ戻さず forward fix を行う。
