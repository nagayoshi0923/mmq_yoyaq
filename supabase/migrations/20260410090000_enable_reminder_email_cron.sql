-- =============================================================================
-- マイグレーション: 前日リマインドメールの Cron ジョブを登録
-- =============================================================================
--
-- 毎朝 9:00 JST (= 00:00 UTC) に auto-send-reminder-emails を呼び出し、
-- 翌日の公演の予約者へリマインドメールを送信する。
--
-- Body に { "days_before": 1 } を渡すことで前日リマインドとして動作する。
-- =============================================================================

DO $$
DECLARE
  v_jobid BIGINT;
  v_supabase_url TEXT;
  v_service_role_key TEXT;
BEGIN
  -- pg_cron が導入されているか確認
  BEGIN
    PERFORM 1 FROM cron.job LIMIT 1;
  EXCEPTION
    WHEN undefined_table OR undefined_object THEN
      RAISE NOTICE 'ℹ️  cron.job が存在しません（pg_cron 未導入のためスキップ）';
      RETURN;
  END;

  -- Supabase URL を取得
  BEGIN
    v_supabase_url := current_setting('app.settings.supabase_url', true);
  EXCEPTION WHEN OTHERS THEN
    v_supabase_url := 'https://cznpcewciwywcqcxktba.supabase.co';
  END;

  -- Service Role Key を取得
  BEGIN
    v_service_role_key := current_setting('app.settings.service_role_key', true);
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'service_role_key が設定されていません。Supabase Dashboard の Settings > API から取得してください。';
  END;

  -- 既存のジョブを確認
  SELECT jobid INTO v_jobid
  FROM cron.job
  WHERE jobname = 'auto-send-reminder-emails-day-before';

  IF v_jobid IS NOT NULL THEN
    PERFORM cron.alter_job(v_jobid, active => true);
    RAISE NOTICE '✅ 前日リマインドメール cron を有効化しました (jobid: %)', v_jobid;
  ELSE
    -- 毎日 00:00 UTC = 09:00 JST
    SELECT cron.schedule(
      'auto-send-reminder-emails-day-before',
      '0 0 * * *',
      $cmd$
      SELECT net.http_post(
        url := current_setting('app.settings.supabase_url', true) || '/functions/v1/auto-send-reminder-emails',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true),
          'x-cron-secret', current_setting('app.settings.cron_secret', true)
        ),
        body := '{"days_before": 1}'::jsonb
      );
      $cmd$
    ) INTO v_jobid;
    RAISE NOTICE '✅ 前日リマインドメール cron を作成しました (jobid: %)', v_jobid;
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
  WHERE jobname = 'auto-send-reminder-emails-day-before';

  IF v_active IS NOT NULL THEN
    RAISE NOTICE '📧 前日リマインドメール cron: active=%, schedule=%', v_active, v_schedule;
  ELSE
    RAISE WARNING '⚠️ 前日リマインドメール cron が見つかりませんでした';
  END IF;
END $$;
