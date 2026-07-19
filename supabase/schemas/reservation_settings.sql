-- 正規ソース: supabase/schemas/reservation_settings.sql
-- 最終更新: 2026-07-19
CREATE TABLE public.reservation_settings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  store_id UUID UNIQUE REFERENCES public.stores(id) ON DELETE CASCADE,
  organization_id UUID REFERENCES public.organizations(id),
  max_participants_per_booking INTEGER DEFAULT 8,
  advance_booking_days INTEGER DEFAULT 90,
  same_day_booking_cutoff INTEGER DEFAULT 0,
  private_booking_deadline_days INTEGER DEFAULT 14,
  cancellation_policy TEXT,
  cancellation_deadline_hours INTEGER DEFAULT 0,
  cancellation_fees JSONB DEFAULT '[{"hours_before":48,"fee_percentage":50,"description":"前日より50%"},{"hours_before":24,"fee_percentage":100,"description":"当日より100%"},{"hours_before":-1,"fee_percentage":100,"description":"公演開始後・無断100%"}]'::jsonb,
  cancellation_fee_basis TEXT NOT NULL DEFAULT 'participant_total'
    CHECK (cancellation_fee_basis IN ('participant_total', 'performance_total')),
  private_cancellation_policy TEXT,
  private_booking_cancellation_fees JSONB DEFAULT '[]'::jsonb,
  private_cancellation_deadline_hours INTEGER DEFAULT 0,
  private_cancellation_fees JSONB DEFAULT '[{"hours_before":168,"fee_percentage":50,"description":"7日前より公演価格全額の50%"},{"hours_before":72,"fee_percentage":100,"description":"3日前より公演価格全額の100%"},{"hours_before":-1,"fee_percentage":100,"description":"公演開始後・無断キャンセル100%"}]'::jsonb,
  private_cancellation_fee_basis TEXT NOT NULL DEFAULT 'performance_total'
    CHECK (private_cancellation_fee_basis IN ('participant_total', 'performance_total')),
  max_bookings_per_customer INTEGER,
  require_phone_verification BOOLEAN DEFAULT false,
  cancellation_policy_items JSONB DEFAULT '[]'::jsonb,
  private_cancellation_policy_items JSONB DEFAULT '[]'::jsonb,
  organizer_cancel_reasons JSONB DEFAULT '[]'::jsonb,
  organizer_cancel_refund_note TEXT DEFAULT '参加料金は全額返金いたします。',
  cancellation_judgment_rules JSONB DEFAULT '[]'::jsonb,
  cancellation_notice_note TEXT DEFAULT '中止が決定した場合、ご登録のメールアドレスに自動でお知らせします。中止の場合、参加料金は一切発生しません。',
  reservation_change_deadline_hours INTEGER DEFAULT 24,
  reservation_change_note TEXT DEFAULT '参加人数の変更は、マイページから公演開始24時間前まで無料で行えます。日程の変更をご希望の場合は、一度キャンセルの上、再度ご予約をお願いいたします。この場合、キャンセル時期によってキャンセル料が発生する場合があります。',
  private_reservation_change_deadline_hours INTEGER DEFAULT 168,
  private_reservation_change_note TEXT DEFAULT '貸切予約の変更は、公演開始1週間前まで可能です。日程変更は空き状況によります。',
  refund_method_note TEXT DEFAULT '当日現地決済のため、事前にお支払いいただく金額はありません。キャンセル料が発生した場合は、次回ご来店時にお支払いいただくか、別途ご連絡させていただきます。',
  policy_updated_at DATE DEFAULT CURRENT_DATE,
  payment_method_label TEXT DEFAULT '現地決済',
  payment_method_description TEXT DEFAULT 'ご来店時にお支払いください',
  auto_refund_enabled BOOLEAN NOT NULL DEFAULT false,
  refund_processing_days INTEGER NOT NULL DEFAULT 7,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON COLUMN public.reservation_settings.cancellation_fee_basis IS
  '通常公演のキャンセル料計算基準（participant_total / performance_total）';
COMMENT ON COLUMN public.reservation_settings.private_cancellation_fee_basis IS
  '貸切公演のキャンセル料計算基準（participant_total / performance_total）';
