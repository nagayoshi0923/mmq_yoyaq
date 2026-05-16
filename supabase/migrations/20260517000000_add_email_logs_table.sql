-- =============================================================================
-- email_logs テーブル
-- Resendの保持期間（約30日）に依存せず、アプリ側でメール送信履歴を長期保存する
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. email_logs テーブル作成
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.email_logs (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   UUID        REFERENCES public.organizations(id) ON DELETE SET NULL,
  reservation_id    UUID        REFERENCES public.reservations(id)  ON DELETE SET NULL,
  schedule_event_id UUID        REFERENCES public.schedule_events(id) ON DELETE SET NULL,
  customer_id       UUID        REFERENCES public.users(id)          ON DELETE SET NULL,
  email_type        TEXT        NOT NULL,
  to_email          TEXT        NOT NULL,
  to_name           TEXT,
  subject           TEXT        NOT NULL,
  body_text         TEXT,
  body_html         TEXT,
  provider          TEXT        NOT NULL DEFAULT 'resend',
  provider_message_id TEXT,
  status            TEXT        NOT NULL DEFAULT 'queued'
                                CHECK (status IN (
                                  'queued','sent','delivered','opened','clicked',
                                  'bounced','complained','failed','delivery_delayed'
                                )),
  error_message     TEXT,
  sent_at           TIMESTAMPTZ,
  delivered_at      TIMESTAMPTZ,
  opened_at         TIMESTAMPTZ,
  bounced_at        TIMESTAMPTZ,
  complained_at     TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT email_logs_email_type_check CHECK (email_type IN (
    'reservation_confirmed',
    'reservation_cancelled',
    'reservation_changed',
    'reservation_request',
    'reminder',
    'gm_notification',
    'staff_invitation',
    'waitlist_confirmed',
    'guest_pin',
    'performance_cancellation',
    'license_report',
    'contact_inquiry',
    'other'
  ))
);

-- ---------------------------------------------------------------------------
-- 2. インデックス
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_email_logs_org
  ON public.email_logs (organization_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_email_logs_provider_message_id
  ON public.email_logs (provider_message_id)
  WHERE provider_message_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_email_logs_reservation
  ON public.email_logs (reservation_id)
  WHERE reservation_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_email_logs_status
  ON public.email_logs (status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_email_logs_created_at
  ON public.email_logs (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_email_logs_sent_at
  ON public.email_logs (sent_at DESC)
  WHERE sent_at IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 3. updated_at 自動更新トリガー（set_updated_at_manual を再利用）
-- ---------------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_email_logs_updated_at ON public.email_logs;
CREATE TRIGGER trg_email_logs_updated_at
  BEFORE UPDATE ON public.email_logs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_manual();

-- ---------------------------------------------------------------------------
-- 4. RLS 設定
-- ---------------------------------------------------------------------------
ALTER TABLE public.email_logs ENABLE ROW LEVEL SECURITY;

-- SELECT: license_admin は全組織を閲覧可、admin は自組織のみ閲覧可
DROP POLICY IF EXISTS "email_logs_select" ON public.email_logs;
CREATE POLICY "email_logs_select" ON public.email_logs
  FOR SELECT
  USING (
    -- service_role は RLS をバイパスするため実質不要だが明示
    auth.role() = 'service_role'
    OR public.is_license_admin()
    OR (
      -- 組織管理者は自組織のログのみ閲覧可
      (SELECT role FROM public.users WHERE id = auth.uid() LIMIT 1) = 'admin'
      AND organization_id = public.get_user_organization_id()
    )
  );

-- INSERT/UPDATE: service_role のみ（service_role は RLS をバイパスするため
--   INSERT/UPDATE ポリシーを明示しない = authenticated ユーザーは書き込み不可）

-- ---------------------------------------------------------------------------
-- 5. コメント
-- ---------------------------------------------------------------------------
COMMENT ON TABLE public.email_logs IS
  'メール送信ログ。Resendの保持期間（約30日）に依存せず長期保存する。';
COMMENT ON COLUMN public.email_logs.email_type IS
  '送信種別: reservation_confirmed/cancelled/changed/request, reminder, gm_notification, staff_invitation, waitlist_confirmed, guest_pin, performance_cancellation, license_report, contact_inquiry, other';
COMMENT ON COLUMN public.email_logs.status IS
  'queued=送信待, sent=送信完了, delivered=配信済, opened=開封, clicked=クリック, bounced=バウンス, complained=苦情, failed=送信失敗, delivery_delayed=遅延';
COMMENT ON COLUMN public.email_logs.provider_message_id IS
  'Resend メッセージID (email_id)。Webhook でステータス更新に使用。';
COMMENT ON COLUMN public.email_logs.body_html IS
  'HTMLメール本文。PIIを含む可能性があるため閲覧制限に注意。';
COMMENT ON COLUMN public.email_logs.body_text IS
  'テキストメール本文。PIIを含む可能性があるため閲覧制限に注意。';

-- ---------------------------------------------------------------------------
-- 完了通知
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  RAISE NOTICE '✅ email_logs テーブルを作成しました';
  RAISE NOTICE '   - organization_id / provider_message_id / reservation_id / status / created_at インデックス追加済み';
  RAISE NOTICE '   - RLS: license_admin=全閲覧, admin=自組織のみ, service_role=書き込み';
END $$;
