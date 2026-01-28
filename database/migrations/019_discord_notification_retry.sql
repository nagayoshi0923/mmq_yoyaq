-- =============================================================================
-- マイグレーション 019: Discord通知リトライ機能
-- =============================================================================
-- 
-- Discord通知が失敗した場合にキューに保存し、定期的にリトライする
-- =============================================================================

-- 1. Discord通知キューテーブル
CREATE TABLE IF NOT EXISTS discord_notification_queue (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES organizations(id),
  webhook_url TEXT NOT NULL,
  message_payload JSONB NOT NULL,
  notification_type TEXT NOT NULL, -- 'reservation', 'cancellation', 'waitlist', 'performance_cancel', etc.
  reference_id UUID, -- 関連するレコードのID（予約ID、イベントIDなど）
  status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'completed', 'failed'
  retry_count INTEGER DEFAULT 0,
  max_retries INTEGER DEFAULT 3,
  last_error TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  next_retry_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE discord_notification_queue IS 
'Discord通知の送信キュー。失敗した通知をリトライするために使用';

-- インデックス
CREATE INDEX IF NOT EXISTS idx_discord_queue_status 
ON discord_notification_queue(status, next_retry_at);

CREATE INDEX IF NOT EXISTS idx_discord_queue_org 
ON discord_notification_queue(organization_id);

-- 2. リトライ処理関数
CREATE OR REPLACE FUNCTION process_discord_notification_queue()
RETURNS TABLE(
  processed INTEGER,
  succeeded INTEGER,
  failed INTEGER,
  details JSONB
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_processed INTEGER := 0;
  v_succeeded INTEGER := 0;
  v_failed INTEGER := 0;
  v_details JSONB := '[]'::JSONB;
  v_notification RECORD;
BEGIN
  -- pending状態で、next_retry_atが現在時刻を過ぎているものを取得
  FOR v_notification IN
    SELECT *
    FROM discord_notification_queue
    WHERE status = 'pending'
      AND next_retry_at <= NOW()
      AND retry_count < max_retries
    ORDER BY created_at
    LIMIT 10  -- 一度に処理する最大数
    FOR UPDATE SKIP LOCKED
  LOOP
    v_processed := v_processed + 1;
    
    -- リトライカウントを増やし、次回リトライ時刻を設定
    UPDATE discord_notification_queue
    SET 
      retry_count = retry_count + 1,
      next_retry_at = NOW() + (INTERVAL '5 minutes' * (retry_count + 1)),
      updated_at = NOW()
    WHERE id = v_notification.id;
    
    v_details := v_details || jsonb_build_object(
      'id', v_notification.id,
      'notification_type', v_notification.notification_type,
      'retry_count', v_notification.retry_count + 1,
      'webhook_url', LEFT(v_notification.webhook_url, 50) || '...'
    );
  END LOOP;
  
  RETURN QUERY SELECT 
    v_processed,
    v_succeeded,
    v_failed,
    v_details;
END;
$$;

COMMENT ON FUNCTION process_discord_notification_queue() IS 
'Discord通知キューを処理し、リトライ対象を返す。実際の送信はEdge Functionで行う';

-- 3. 古いキューエントリをクリーンアップする関数
CREATE OR REPLACE FUNCTION cleanup_discord_notification_queue()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deleted INTEGER;
BEGIN
  -- 7日以上前の完了済み・失敗済みエントリを削除
  DELETE FROM discord_notification_queue
  WHERE (status IN ('completed', 'failed') AND created_at < NOW() - INTERVAL '7 days')
     OR (status = 'pending' AND retry_count >= max_retries AND created_at < NOW() - INTERVAL '1 day');
  
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  
  -- 失敗扱いに更新
  UPDATE discord_notification_queue
  SET status = 'failed',
      updated_at = NOW()
  WHERE status = 'pending'
    AND retry_count >= max_retries;
  
  RETURN v_deleted;
END;
$$;

COMMENT ON FUNCTION cleanup_discord_notification_queue() IS 
'古いDiscord通知キューエントリを削除';

-- 4. RLSポリシー
ALTER TABLE discord_notification_queue ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS discord_queue_admin ON discord_notification_queue;
CREATE POLICY discord_queue_admin
ON discord_notification_queue
FOR ALL
USING (is_org_admin());

COMMENT ON POLICY discord_queue_admin ON discord_notification_queue IS 
'管理者のみDiscord通知キューにアクセス可能';

-- 5. 実行権限
GRANT EXECUTE ON FUNCTION process_discord_notification_queue() TO authenticated;
GRANT EXECUTE ON FUNCTION cleanup_discord_notification_queue() TO authenticated;

-- 6. Cronジョブ設定のコメント
-- Supabase DashboardのCron Jobsで設定:
-- 
-- Discord通知リトライ（5分ごと）:
-- SELECT cron.schedule(
--   'retry-discord-notifications',
--   '*/5 * * * *',
--   $$ SELECT net.http_post(...) $$
-- );
-- 
-- クリーンアップ（毎日3:30）:
-- SELECT cron.schedule(
--   'cleanup-discord-queue',
--   '30 3 * * *',
--   $$ SELECT cleanup_discord_notification_queue(); $$
-- );

DO $$
BEGIN
  RAISE NOTICE '✅ マイグレーション 019 完了: Discord通知リトライ機能を追加しました。';
  RAISE NOTICE '  - discord_notification_queue テーブルを作成';
  RAISE NOTICE '  - process_discord_notification_queue() 関数を作成';
  RAISE NOTICE '  - cleanup_discord_notification_queue() 関数を作成';
END $$;

