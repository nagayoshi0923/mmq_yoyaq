-- YOYAQ-001: キャンセルポリシー共通基盤と予約時スナップショット
-- RLS policy は変更しない。新規予約だけを version=1 として固定し、既存予約は NULL のまま残す。

BEGIN;

ALTER TABLE public.reservation_settings
  ADD COLUMN cancellation_fee_basis TEXT NOT NULL DEFAULT 'participant_total',
  ADD COLUMN private_cancellation_fee_basis TEXT NOT NULL DEFAULT 'performance_total',
  ALTER COLUMN cancellation_fees SET DEFAULT '[{"hours_before":48,"fee_percentage":50,"description":"前日より50%"},{"hours_before":24,"fee_percentage":100,"description":"当日より100%"},{"hours_before":-1,"fee_percentage":100,"description":"公演開始後・無断100%"}]'::jsonb,
  ALTER COLUMN private_cancellation_fees SET DEFAULT '[{"hours_before":168,"fee_percentage":50,"description":"7日前より公演価格全額の50%"},{"hours_before":72,"fee_percentage":100,"description":"3日前より公演価格全額の100%"},{"hours_before":-1,"fee_percentage":100,"description":"公演開始後・無断キャンセル100%"}]'::jsonb,
  ADD CONSTRAINT reservation_settings_cancellation_fee_basis_check
    CHECK (cancellation_fee_basis IN ('participant_total', 'performance_total')),
  ADD CONSTRAINT reservation_settings_private_cancellation_fee_basis_check
    CHECK (private_cancellation_fee_basis IN ('participant_total', 'performance_total'));

-- 20260321120000で投入された既知の旧既定値だけを、記載済みの運用境界へ補正する。
-- 独自編集済みの店舗設定はJSONB完全一致しないため変更しない。
UPDATE public.reservation_settings
SET private_cancellation_fees = '[{"hours_before":168,"fee_percentage":50,"description":"7日前より公演価格全額の50%"},{"hours_before":72,"fee_percentage":100,"description":"3日前より公演価格全額の100%"},{"hours_before":-1,"fee_percentage":100,"description":"公演開始後・無断キャンセル100%"}]'::jsonb
WHERE private_cancellation_fees = '[{"hours_before":168,"fee_percentage":0,"description":"7日より前は無料"},{"hours_before":72,"fee_percentage":50,"description":"7日前より公演価格全額の50%"},{"hours_before":0,"fee_percentage":100,"description":"3日前より公演価格全額の100%"},{"hours_before":-1,"fee_percentage":100,"description":"公演開始後・無断キャンセル100%"}]'::jsonb;

COMMENT ON COLUMN public.reservation_settings.cancellation_fee_basis IS
  '通常公演のキャンセル料計算基準（participant_total / performance_total）';
COMMENT ON COLUMN public.reservation_settings.private_cancellation_fee_basis IS
  '貸切公演のキャンセル料計算基準（participant_total / performance_total）';

ALTER TABLE public.reservations
  ADD COLUMN cancellation_policy_snapshot_version SMALLINT,
  ADD COLUMN cancellation_policy_store_id UUID,
  ADD COLUMN cancellation_policy_performance_type TEXT,
  ADD COLUMN cancellation_policy_deadline_hours INTEGER,
  ADD COLUMN cancellation_policy_fees JSONB,
  ADD COLUMN cancellation_policy_fee_basis TEXT,
  ADD COLUMN cancellation_policy_updated_at TIMESTAMPTZ,
  ADD CONSTRAINT reservations_cancellation_policy_snapshot_version_check
    CHECK (cancellation_policy_snapshot_version IS NULL OR cancellation_policy_snapshot_version = 1),
  ADD CONSTRAINT reservations_cancellation_policy_performance_type_check
    CHECK (cancellation_policy_performance_type IS NULL OR cancellation_policy_performance_type IN ('open', 'private')),
  ADD CONSTRAINT reservations_cancellation_policy_fees_check
    CHECK (cancellation_policy_fees IS NULL OR jsonb_typeof(cancellation_policy_fees) = 'array'),
  ADD CONSTRAINT reservations_cancellation_policy_fee_basis_check
    CHECK (cancellation_policy_fee_basis IS NULL OR cancellation_policy_fee_basis IN ('participant_total', 'performance_total'));

COMMENT ON COLUMN public.reservations.cancellation_policy_snapshot_version IS
  'NULLはmigration以前の既存予約、1は予約時ポリシーを固定した予約';
COMMENT ON COLUMN public.reservations.cancellation_policy_store_id IS
  'キャンセルポリシーを取得した予約時点の店舗ID（参照先削除後も値を保持するためFKなし）';
COMMENT ON COLUMN public.reservations.cancellation_policy_performance_type IS
  '予約時点の公演種別（open / private）';
COMMENT ON COLUMN public.reservations.cancellation_policy_deadline_hours IS
  '予約時点の顧客キャンセル受付期限（開演何時間前までか）';
COMMENT ON COLUMN public.reservations.cancellation_policy_fees IS
  '予約時点のキャンセル料率表';
COMMENT ON COLUMN public.reservations.cancellation_policy_fee_basis IS
  '予約時点の料金基準（participant_total / performance_total）';
COMMENT ON COLUMN public.reservations.cancellation_policy_updated_at IS
  '予約時に参照したreservation_settings.updated_at。設定行がない場合は予約作成時刻';

CREATE FUNCTION public.set_reservation_cancellation_policy_snapshot()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
$$;

REVOKE ALL ON FUNCTION public.set_reservation_cancellation_policy_snapshot() FROM PUBLIC;

CREATE TRIGGER set_reservation_cancellation_policy_snapshot_on_insert
BEFORE INSERT ON public.reservations
FOR EACH ROW
EXECUTE FUNCTION public.set_reservation_cancellation_policy_snapshot();

CREATE TRIGGER preserve_reservation_cancellation_policy_snapshot_on_update
BEFORE UPDATE ON public.reservations
FOR EACH ROW
EXECUTE FUNCTION public.set_reservation_cancellation_policy_snapshot();

COMMIT;
