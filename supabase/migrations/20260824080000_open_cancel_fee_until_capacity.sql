-- 通常公演: 定数到達後は公演価格全額を選べるようにする
ALTER TABLE public.reservation_settings
  DROP CONSTRAINT IF EXISTS reservation_settings_cancellation_fee_basis_check;

ALTER TABLE public.reservation_settings
  ADD CONSTRAINT reservation_settings_cancellation_fee_basis_check
  CHECK (cancellation_fee_basis IN ('participant_total', 'performance_total', 'participant_until_capacity'));

ALTER TABLE public.reservations
  DROP CONSTRAINT IF EXISTS reservations_cancellation_policy_fee_basis_check;

ALTER TABLE public.reservations
  ADD CONSTRAINT reservations_cancellation_policy_fee_basis_check
  CHECK (
    cancellation_policy_fee_basis IS NULL
    OR cancellation_policy_fee_basis IN ('participant_total', 'performance_total', 'participant_until_capacity')
  );

COMMENT ON COLUMN public.reservation_settings.cancellation_fee_basis IS
  '通常公演のキャンセル料計算基準（participant_total / performance_total / participant_until_capacity）';
COMMENT ON COLUMN public.reservations.cancellation_policy_fee_basis IS
  '予約時点の料金基準（participant_total / performance_total / participant_until_capacity）';
