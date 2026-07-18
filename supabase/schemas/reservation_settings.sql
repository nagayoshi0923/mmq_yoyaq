-- reservation_settings テーブルの正規定義（本番スキーマと同期）
-- 店舗ごとの予約関連設定。store_id で1店舗1行（UNIQUE）。
--
-- RLS: SELECT/INSERT/UPDATE/DELETE は admin かつ自組織のみ。
-- anon は直接 SELECT できないため、公開ページが必要とする値は RPC 経由で公開する
-- （例: get_private_booking_deadline_days）。

CREATE TABLE IF NOT EXISTS public.reservation_settings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  store_id UUID REFERENCES public.stores(id) ON DELETE CASCADE,
  organization_id UUID,

  -- 通常公演の予約制限
  max_participants_per_booking INTEGER DEFAULT 8,
  advance_booking_days INTEGER DEFAULT 90,
  same_day_booking_cutoff INTEGER DEFAULT 0,
  max_bookings_per_customer INTEGER,
  require_phone_verification BOOLEAN DEFAULT false,

  -- 貸切公演: 公演日の何日前まで申込を受け付けるか
  -- 全貸切フロー（シナリオ詳細・グループ候補日追加・リクエストページ・予約トップ）が
  -- get_private_booking_deadline_days RPC 経由でこの値を参照する
  private_booking_deadline_days INTEGER DEFAULT 14,

  -- キャンセルポリシー（通常公演）
  cancellation_policy TEXT,
  cancellation_deadline_hours INTEGER DEFAULT 24,
  cancellation_fees JSONB DEFAULT '[{"description": "1週間前まで無料", "hours_before": 168, "fee_percentage": 0}, {"description": "3日前まで30%", "hours_before": 72, "fee_percentage": 30}, {"description": "前日まで50%", "hours_before": 24, "fee_percentage": 50}, {"description": "当日100%", "hours_before": 0, "fee_percentage": 100}]'::jsonb,
  cancellation_policy_items JSONB DEFAULT '[]'::jsonb,

  -- キャンセルポリシー（貸切公演）
  private_booking_cancellation_fees JSONB DEFAULT '[]'::jsonb,
  private_cancellation_policy TEXT,
  private_cancellation_deadline_hours INTEGER DEFAULT 48,
  private_cancellation_fees JSONB,
  private_cancellation_policy_items JSONB DEFAULT '[]'::jsonb,

  -- 店舗都合キャンセル・中止判定
  organizer_cancel_reasons JSONB DEFAULT '[]'::jsonb,
  organizer_cancel_refund_note TEXT DEFAULT '参加料金は全額返金いたします。',
  cancellation_judgment_rules JSONB DEFAULT '[]'::jsonb,
  cancellation_notice_note TEXT DEFAULT '中止が決定した場合、ご登録のメールアドレスに自動でお知らせします。中止の場合、参加料金は一切発生しません。',

  -- 予約変更
  reservation_change_deadline_hours INTEGER DEFAULT 24,
  reservation_change_note TEXT DEFAULT '参加人数の変更は、マイページから公演開始24時間前まで無料で行えます。日程の変更をご希望の場合は、一度キャンセルの上、再度ご予約をお願いいたします。',
  private_reservation_change_deadline_hours INTEGER DEFAULT 168,
  private_reservation_change_note TEXT DEFAULT '貸切予約の変更は、公演開始1週間前まで可能です。日程変更は空き状況によります。',

  -- 支払い・返金
  payment_method_label TEXT DEFAULT '現地決済',
  payment_method_description TEXT DEFAULT 'ご来店時にお支払いください',
  refund_method_note TEXT DEFAULT '当日現地決済のため、事前にお支払いいただく金額はありません。キャンセル料が発生した場合は、次回ご来店時にお支払いいただくか、別途ご連絡させていただきます。',
  auto_refund_enabled BOOLEAN DEFAULT false,
  refund_processing_days INTEGER DEFAULT 7,
  policy_updated_at DATE DEFAULT CURRENT_DATE,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(store_id)
);
