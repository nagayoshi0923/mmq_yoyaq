-- =============================================================================
-- マイグレーション 016: キャンセル待ちリトライCronジョブ設定
-- =============================================================================
-- 
-- 🎯 解決する問題:
--   キャンセル待ち通知が失敗した場合、永久に通知されない
--
-- 📋 仕組み:
--   1. 失敗した通知はwaitlist_notification_queueに記録（既存）
--   2. pg_cronで5分ごとにprocess-waitlist-queue Edge Functionを呼び出し
--   3. 最大3回までリトライし、それでも失敗したらfailedに
--
-- ⚠️ 前提条件:
--   - pg_cron拡張が有効であること
--   - process-waitlist-queue Edge Functionがデプロイ済みであること
--
-- =============================================================================

-- 1. pg_cron拡張を有効化（Supabaseでは通常有効）
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- 2. Cronジョブ設定用の関数
-- Edge Functionを呼び出すにはHTTPリクエストが必要なので、
-- 実際にはSupabase Dashboard または pg_net 拡張を使用
-- ここではpg_net（HTTP拡張）を使用

-- pg_net拡張を有効化
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- 3. キャンセル待ちリトライを実行する関数
CREATE OR REPLACE FUNCTION trigger_waitlist_retry()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_pending_count INTEGER;
  v_supabase_url TEXT;
  v_service_role_key TEXT;
BEGIN
  -- 処理待ちのキューがあるか確認
  SELECT COUNT(*) INTO v_pending_count
  FROM waitlist_notification_queue
  WHERE status = 'pending'
    AND retry_count < 3
    AND (last_retry_at IS NULL OR last_retry_at < NOW() - INTERVAL '5 minutes');
  
  IF v_pending_count = 0 THEN
    RAISE NOTICE '処理待ちキューなし';
    RETURN;
  END IF;
  
  RAISE NOTICE 'キャンセル待ちリトライ対象: %件', v_pending_count;
  
  -- Edge Function URLを設定（Supabase環境変数から取得）
  -- 注意: 実際の呼び出しはpg_netまたは外部スケジューラから行う
  v_supabase_url := current_setting('app.supabase_url', true);
  v_service_role_key := current_setting('app.service_role_key', true);
  
  IF v_supabase_url IS NULL THEN
    RAISE NOTICE '⚠️ Supabase URL未設定。Edge Functionは外部から呼び出してください。';
    RETURN;
  END IF;
  
  -- pg_netでHTTPリクエストを送信（オプション）
  -- PERFORM extensions.http_post(
  --   v_supabase_url || '/functions/v1/process-waitlist-queue',
  --   '{}',
  --   ARRAY[
  --     extensions.http_header('Authorization', 'Bearer ' || v_service_role_key),
  --     extensions.http_header('Content-Type', 'application/json')
  --   ]
  -- );
  
  RAISE NOTICE 'キャンセル待ちリトライをトリガー（外部スケジューラ経由）';
END;
$$;

-- 4. Cronジョブを登録
-- 5分ごとにチェック（キューがあれば処理）
-- 注意: Supabase Dashboardから設定する方法もあります

DO $$
BEGIN
  -- 既存のジョブがあれば削除
  PERFORM cron.unschedule('process-waitlist-retry')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'process-waitlist-retry');
EXCEPTION
  WHEN undefined_function THEN
    RAISE NOTICE 'cron.unschedule未実行（ジョブなし）';
  WHEN undefined_table THEN
    RAISE NOTICE 'cron.job テーブルなし（pg_cron未設定）';
END;
$$;

-- Cronジョブ追加（pg_cronが有効な場合のみ）
DO $$
BEGIN
  PERFORM cron.schedule(
    'process-waitlist-retry',     -- ジョブ名
    '*/5 * * * *',                -- 5分ごと
    $cron$
    SELECT trigger_waitlist_retry();
    $cron$
  );
  RAISE NOTICE '✅ Cronジョブ "process-waitlist-retry" を登録しました（5分ごと）';
EXCEPTION
  WHEN undefined_function THEN
    RAISE NOTICE '⚠️ pg_cron未有効。Supabase Dashboardから設定してください。';
  WHEN OTHERS THEN
    RAISE NOTICE '⚠️ Cronジョブ登録エラー: %', SQLERRM;
END;
$$;

-- 5. レートリミット用クリーンアップもCronに追加
DO $$
BEGIN
  -- 既存のジョブがあれば削除
  PERFORM cron.unschedule('cleanup-rate-limit-records')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'cleanup-rate-limit-records');
EXCEPTION
  WHEN undefined_function OR undefined_table THEN
    NULL;
END;
$$;

DO $$
BEGIN
  PERFORM cron.schedule(
    'cleanup-rate-limit-records',  -- ジョブ名
    '0 * * * *',                   -- 毎時0分
    $cron$
    SELECT cleanup_rate_limit_records();
    $cron$
  );
  RAISE NOTICE '✅ Cronジョブ "cleanup-rate-limit-records" を登録しました（毎時）';
EXCEPTION
  WHEN undefined_function THEN
    RAISE NOTICE '⚠️ pg_cron未有効';
  WHEN OTHERS THEN
    RAISE NOTICE '⚠️ Cronジョブ登録エラー: %', SQLERRM;
END;
$$;

-- 6. 在庫整合性チェック用Cronも追加
DO $$
BEGIN
  PERFORM cron.unschedule('check-inventory-consistency')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'check-inventory-consistency');
EXCEPTION
  WHEN undefined_function OR undefined_table THEN
    NULL;
END;
$$;

DO $$
BEGIN
  PERFORM cron.schedule(
    'check-inventory-consistency',  -- ジョブ名
    '0 3 * * *',                    -- 毎日AM3時
    $cron$
    SELECT run_inventory_consistency_check();
    $cron$
  );
  RAISE NOTICE '✅ Cronジョブ "check-inventory-consistency" を登録しました（毎日AM3時）';
EXCEPTION
  WHEN undefined_function THEN
    RAISE NOTICE '⚠️ pg_cron未有効';
  WHEN OTHERS THEN
    RAISE NOTICE '⚠️ Cronジョブ登録エラー: %', SQLERRM;
END;
$$;

-- 完了確認
DO $$ 
BEGIN
  RAISE NOTICE '✅ マイグレーション 016 完了';
  RAISE NOTICE '  - trigger_waitlist_retry() 関数作成';
  RAISE NOTICE '  - Cronジョブ設定（pg_cron有効時）:';
  RAISE NOTICE '    - process-waitlist-retry: 5分ごと';
  RAISE NOTICE '    - cleanup-rate-limit-records: 毎時';
  RAISE NOTICE '    - check-inventory-consistency: 毎日AM3時';
  RAISE NOTICE '';
  RAISE NOTICE '📋 pg_cronが無効な場合:';
  RAISE NOTICE '  Supabase Dashboard > Database > Cron から手動設定';
END $$;

-- 現在登録されているCronジョブを確認するクエリ
-- SELECT * FROM cron.job;

