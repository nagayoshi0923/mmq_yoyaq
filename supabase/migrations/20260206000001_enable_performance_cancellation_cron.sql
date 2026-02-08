-- =============================================================================
-- マイグレーション: 公演中止判定のcronジョブを再有効化
-- =============================================================================
-- 
-- 機能概要:
-- 前日23:59チェックと4時間前チェックのcronジョブを再有効化します
-- ジョブが存在しない場合は作成します
-- =============================================================================

-- Supabase URLとService Role Keyの設定（必要に応じて変更）
-- 注意: 実際の値は Supabase Dashboard の Settings > API で確認してください
DO $$
DECLARE
  v_supabase_url TEXT;
  v_service_role_key TEXT;
BEGIN
  -- 環境変数から取得を試みる（設定されていない場合は手動で設定が必要）
  BEGIN
    v_supabase_url := current_setting('app.settings.supabase_url', true);
  EXCEPTION WHEN OTHERS THEN
    v_supabase_url := 'https://cznpcewciwywcqcxktba.supabase.co';
  END;
  
  BEGIN
    v_service_role_key := current_setting('app.settings.service_role_key', true);
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING '⚠️  service_role_key が設定されていません。手動で設定してください。';
    v_service_role_key := 'YOUR_SERVICE_ROLE_KEY_HERE';
  END;
  
  RAISE NOTICE 'Supabase URL: %', v_supabase_url;
END $$;

-- 1. 前日チェックのcronジョブを有効化または作成
DO $$
DECLARE
  v_jobid BIGINT;
  v_supabase_url TEXT;
  v_service_role_key TEXT;
BEGIN
  -- 設定値を取得
  BEGIN
    v_supabase_url := current_setting('app.settings.supabase_url', true);
  EXCEPTION WHEN OTHERS THEN
    v_supabase_url := 'https://cznpcewciwywcqcxktba.supabase.co';
  END;
  
  BEGIN
    v_service_role_key := current_setting('app.settings.service_role_key', true);
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'service_role_key が設定されていません。Supabase Dashboard の Settings > API から取得してください。';
  END;
  
  -- 既存のジョブを確認
  SELECT jobid INTO v_jobid
  FROM cron.job 
  WHERE jobname = 'check-performances-day-before';
  
  IF v_jobid IS NOT NULL THEN
    -- ジョブが存在する場合は有効化
    PERFORM cron.alter_job(v_jobid, active => true);
    RAISE NOTICE '✅ 前日チェックのcronジョブを有効化しました: check-performances-day-before (jobid: %)', v_jobid;
  ELSE
    -- ジョブが存在しない場合は作成
    -- 前日23:59チェック（毎日23:59 JST = 14:59 UTC）
    SELECT cron.schedule(
      'check-performances-day-before',
      '59 14 * * *',  -- 14:59 UTC = 23:59 JST
      $$
      SELECT net.http_post(
        url := v_supabase_url || '/functions/v1/check-performance-cancellation',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || v_service_role_key,
          'x-cron-secret', current_setting('app.settings.cron_secret', true)
        ),
        body := '{"check_type": "day_before"}'::jsonb
      );
      $$
    ) INTO v_jobid;
    RAISE NOTICE '✅ 前日チェックのcronジョブを作成しました: check-performances-day-before (jobid: %)', v_jobid;
  END IF;
END $$;

-- 2. 4時間前チェックのcronジョブを有効化または作成
DO $$
DECLARE
  v_jobid BIGINT;
  v_supabase_url TEXT;
  v_service_role_key TEXT;
BEGIN
  -- 設定値を取得
  BEGIN
    v_supabase_url := current_setting('app.settings.supabase_url', true);
  EXCEPTION WHEN OTHERS THEN
    v_supabase_url := 'https://cznpcewciwywcqcxktba.supabase.co';
  END;
  
  BEGIN
    v_service_role_key := current_setting('app.settings.service_role_key', true);
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'service_role_key が設定されていません。Supabase Dashboard の Settings > API から取得してください。';
  END;
  
  -- 既存のジョブを確認
  SELECT jobid INTO v_jobid
  FROM cron.job 
  WHERE jobname = 'check-performances-four-hours';
  
  IF v_jobid IS NOT NULL THEN
    -- ジョブが存在する場合は有効化
    PERFORM cron.alter_job(v_jobid, active => true);
    RAISE NOTICE '✅ 4時間前チェックのcronジョブを有効化しました: check-performances-four-hours (jobid: %)', v_jobid;
  ELSE
    -- ジョブが存在しない場合は作成
    -- 4時間前チェック（毎時0分に実行）
    SELECT cron.schedule(
      'check-performances-four-hours',
      '0 * * * *',  -- 毎時0分
      $$
      SELECT net.http_post(
        url := v_supabase_url || '/functions/v1/check-performance-cancellation',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || v_service_role_key,
          'x-cron-secret', current_setting('app.settings.cron_secret', true)
        ),
        body := '{"check_type": "four_hours_before"}'::jsonb
      );
      $$
    ) INTO v_jobid;
    RAISE NOTICE '✅ 4時間前チェックのcronジョブを作成しました: check-performances-four-hours (jobid: %)', v_jobid;
  END IF;
END $$;

-- 3. 確認: 有効化されたcronジョブを表示
DO $$
DECLARE
  v_active_count INTEGER;
  v_inactive_count INTEGER;
BEGIN
  SELECT 
    COUNT(*) FILTER (WHERE active = true),
    COUNT(*) FILTER (WHERE active = false)
  INTO v_active_count, v_inactive_count
  FROM cron.job 
  WHERE jobname LIKE '%check-performance%' 
     OR jobname LIKE '%performance%cancellation%'
     OR command LIKE '%check-performance-cancellation%';
  
  IF v_active_count > 0 THEN
    RAISE NOTICE '✅ 公演中止判定のcronジョブが有効化されました';
    RAISE NOTICE '   有効なジョブ数: %', v_active_count;
    IF v_inactive_count > 0 THEN
      RAISE NOTICE '   無効なジョブ数: %', v_inactive_count;
    END IF;
  ELSE
    RAISE WARNING '⚠️  有効なcronジョブが見つかりませんでした';
  END IF;
END $$;
