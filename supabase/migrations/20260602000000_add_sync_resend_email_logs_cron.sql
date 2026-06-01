-- =============================================================================
-- マイグレーション: Resend のメール本文を email_logs に同期する cron を登録
-- =============================================================================
--
-- 経緯:
--   Resend はダッシュボード/API 上のメールログを送信から 1 ヶ月で削除する。
--   送信時に email_logs.body_html / body_text を保存する経路 (各 send-* Edge
--   Function) は別途用意したが、 セーフティネットとして定期的に Resend から
--   未取得分を取得し email_logs に backfill する cron を追加する。
--
-- 動作:
--   毎日 20:00 UTC = 05:00 JST に sync-resend-email-logs を呼び出す。
--   Edge Function 側で provider_message_id がある かつ body が NULL の
--   email_logs レコードを最大 200 件取得し、 Resend GET /emails/:id で本文取得。
-- =============================================================================

DO $$
DECLARE
  v_jobid BIGINT;
BEGIN
  -- pg_cron が導入されているか確認
  BEGIN
    PERFORM 1 FROM cron.job LIMIT 1;
  EXCEPTION
    WHEN undefined_table OR undefined_object THEN
      RAISE NOTICE 'ℹ️  cron.job が存在しません（pg_cron 未導入のためスキップ）';
      RETURN;
  END;

  SELECT jobid INTO v_jobid FROM cron.job WHERE jobname = 'sync-resend-email-logs';

  IF v_jobid IS NOT NULL THEN
    -- 既存ジョブを最新のコマンドに上書き
    PERFORM cron.alter_job(v_jobid, command => $cmd$
      SELECT net.http_post(
        url := (SELECT value FROM public.app_config WHERE key = 'supabase_url') || '/functions/v1/sync-resend-email-logs',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || (SELECT value FROM public.app_config WHERE key = 'supabase_anon_key'),
          'x-cron-secret', (SELECT value FROM public.app_config WHERE key = 'trigger_secret')
        ),
        body := '{}'::jsonb
      ) AS request_id
    $cmd$);
    PERFORM cron.alter_job(v_jobid, schedule => '0 20 * * *', active => true);
    RAISE NOTICE '✅ sync-resend-email-logs cron を更新しました (jobid: %)', v_jobid;
  ELSE
    SELECT cron.schedule(
      'sync-resend-email-logs',
      '0 20 * * *',  -- 20:00 UTC = 05:00 JST
      $cmd$
      SELECT net.http_post(
        url := (SELECT value FROM public.app_config WHERE key = 'supabase_url') || '/functions/v1/sync-resend-email-logs',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || (SELECT value FROM public.app_config WHERE key = 'supabase_anon_key'),
          'x-cron-secret', (SELECT value FROM public.app_config WHERE key = 'trigger_secret')
        ),
        body := '{}'::jsonb
      ) AS request_id
      $cmd$
    ) INTO v_jobid;
    RAISE NOTICE '✅ sync-resend-email-logs cron を作成しました (jobid: %)', v_jobid;
  END IF;
END $$;

-- 確認
DO $$
DECLARE
  v_active BOOLEAN;
  v_schedule TEXT;
BEGIN
  BEGIN
    PERFORM 1 FROM cron.job LIMIT 1;
  EXCEPTION
    WHEN undefined_table OR undefined_object THEN
      RETURN;
  END;

  SELECT active, schedule INTO v_active, v_schedule
  FROM cron.job
  WHERE jobname = 'sync-resend-email-logs';

  IF v_active IS NOT NULL THEN
    RAISE NOTICE '📬 sync-resend-email-logs cron: active=%, schedule=%', v_active, v_schedule;
  ELSE
    RAISE WARNING '⚠️ sync-resend-email-logs cron が見つかりませんでした';
  END IF;
END $$;
