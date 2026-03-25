-- =============================================================================
-- マイグレーション: キット移動計画の定期Discord通知 cronジョブ
-- =============================================================================
--
-- 毎週月曜日と金曜日の朝9時(JST)に notify-kit-transfer-plan Edge Function を呼び出し、
-- 運営グループの Discord 業務連絡チャンネルにキット移動計画を送信する。
--
-- スケジュール: 月曜・金曜 09:00 JST = 00:00 UTC
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
  WHERE jobname = 'notify-kit-transfer-plan';

  IF v_jobid IS NOT NULL THEN
    -- 既に存在する場合は有効化のみ
    PERFORM cron.alter_job(v_jobid, active => true);
    RAISE NOTICE '✅ キット移動計画cronジョブを有効化しました (jobid: %)', v_jobid;
  ELSE
    -- 毎週月曜・金曜 00:00 UTC = 09:00 JST
    SELECT cron.schedule(
      'notify-kit-transfer-plan',
      '0 0 * * 1,5',
      $cmd$
      SELECT net.http_post(
        url := current_setting('app.settings.supabase_url', true) || '/functions/v1/notify-kit-transfer-plan',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true),
          'x-cron-secret', current_setting('app.settings.cron_secret', true)
        ),
        body := '{}'::jsonb
      );
      $cmd$
    ) INTO v_jobid;
    RAISE NOTICE '✅ キット移動計画cronジョブを作成しました (jobid: %)', v_jobid;
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
  WHERE jobname = 'notify-kit-transfer-plan';

  IF v_active IS NOT NULL THEN
    RAISE NOTICE '📦 キット移動計画cron: active=%, schedule=%', v_active, v_schedule;
  ELSE
    RAISE WARNING '⚠️ キット移動計画cronジョブが見つかりませんでした';
  END IF;
END $$;
