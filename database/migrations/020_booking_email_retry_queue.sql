-- =============================================================================
-- マイグレーション 020: 予約確認メールのリトライキュー
-- =============================================================================
-- 
-- 作成日: 2026-01-29
-- 
-- 🚨 問題:
--   予約は成功したのにメール送信が失敗すると、お客様に確認メールが届かない
--   → 「本当に予約できた？」という不安・問い合わせが発生
-- 
-- ✅ 解決策:
--   メール送信失敗時にキューに記録し、定期的にリトライする
-- 
-- =============================================================================

-- 予約確認メールリトライキューテーブル
CREATE TABLE IF NOT EXISTS booking_email_queue (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  reservation_id UUID NOT NULL REFERENCES reservations(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  email_type TEXT NOT NULL DEFAULT 'booking_confirmation' CHECK (email_type IN ('booking_confirmation', 'booking_change', 'cancellation')),
  customer_email TEXT NOT NULL,
  customer_name TEXT NOT NULL,
  scenario_title TEXT NOT NULL,
  event_date DATE NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME,
  store_name TEXT NOT NULL,
  store_address TEXT,
  participant_count INTEGER NOT NULL,
  total_price INTEGER NOT NULL,
  reservation_number TEXT NOT NULL,
  retry_count INTEGER DEFAULT 0,
  max_retries INTEGER DEFAULT 3,
  last_retry_at TIMESTAMPTZ,
  last_error TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- インデックス
CREATE INDEX IF NOT EXISTS idx_booking_email_queue_status 
  ON booking_email_queue(status);
CREATE INDEX IF NOT EXISTS idx_booking_email_queue_created_at 
  ON booking_email_queue(created_at);
CREATE INDEX IF NOT EXISTS idx_booking_email_queue_reservation 
  ON booking_email_queue(reservation_id);
CREATE INDEX IF NOT EXISTS idx_booking_email_queue_organization 
  ON booking_email_queue(organization_id);

-- 古いレコードをクリーンアップする関数（7日以上前の completed レコード）
CREATE OR REPLACE FUNCTION cleanup_booking_email_queue()
RETURNS INTEGER AS $$
DECLARE
  v_deleted INTEGER;
BEGIN
  DELETE FROM booking_email_queue
  WHERE status = 'completed'
    AND created_at < NOW() - INTERVAL '7 days';
  
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$ LANGUAGE plpgsql;

-- RLSポリシー
ALTER TABLE booking_email_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY booking_email_queue_org_policy 
  ON booking_email_queue
  FOR ALL
  USING (
    organization_id = get_user_organization_id() OR is_org_admin()
  );

-- コメント
COMMENT ON TABLE booking_email_queue IS '予約確認メールのリトライキュー。send-booking-confirmation Edge Function失敗時に記録し、定期的にリトライする。';
COMMENT ON COLUMN booking_email_queue.retry_count IS 'リトライ回数';
COMMENT ON COLUMN booking_email_queue.max_retries IS '最大リトライ回数（デフォルト3回）';
COMMENT ON COLUMN booking_email_queue.status IS 'pending: 未処理, processing: 処理中, completed: 完了, failed: 最大リトライ回数に達した';

-- 完了確認
DO $$ 
BEGIN
  RAISE NOTICE '✅ マイグレーション 020 完了: 予約確認メールのリトライキューを作成';
END $$;
