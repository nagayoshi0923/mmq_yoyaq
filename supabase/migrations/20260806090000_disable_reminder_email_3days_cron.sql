-- =============================================================================
-- マイグレーション: リマインドメールを「前日のみ」にする（3日前を停止）
-- issue #389
-- =============================================================================
--
-- 背景:
--   土曜公演のリマインドが水曜に届いた。これは cron ジョブ
--   'auto-send-reminder-emails'（body: {"days_before": 3}）が 3 日前に発火する
--   仕様どおりの挙動だったが、email_settings.reminder_template の本文に
--   「明日の」がハードコードされているため、文面と送信タイミングが矛盾していた。
--
-- PO判断:
--   B. 3日前の送信を止めて「前日のみ」にする。
--   前日のみになればテンプレートの「明日の」は正しい文面になるため、
--   テンプレート本文の一括置換は行わない。
--
-- 変更内容:
--   1. 'auto-send-reminder-emails'（3日前ジョブ）を unschedule（存在しなければスキップ）
--   2. 'auto-send-reminder-emails-day-before'（前日ジョブ）を
--      無ければ作成 / あれば schedule・command を正して active 化
--      - schedule: '0 0 * * *'（UTC 00:00 = JST 09:00）
--      - body: {"days_before": 1}
--      - 接続情報は public.app_config から取得（Supabase Cloud では
--        current_setting() が NULL を返しサイレント失敗するため）
--
-- 冪等性:
--   何度実行しても安全（unschedule は存在チェック付き、作成/更新は分岐）。
-- =============================================================================

DO $$
DECLARE
  v_jobid BIGINT;
BEGIN
  -- pg_cron が利用可能かチェック
  BEGIN
    PERFORM 1 FROM cron.job LIMIT 1;
  EXCEPTION
    WHEN undefined_table OR undefined_object THEN
      RAISE NOTICE 'ℹ️  cron.job が存在しません（pg_cron 未導入のためスキップ）';
      RETURN;
  END;

  -- 1. 3日前リマインド（auto-send-reminder-emails）を停止
  SELECT jobid INTO v_jobid FROM cron.job WHERE jobname = 'auto-send-reminder-emails';
  IF v_jobid IS NOT NULL THEN
    PERFORM cron.unschedule(v_jobid);
    RAISE NOTICE '🛑 3日前リマインド cron を停止しました (jobid: %)', v_jobid;
  ELSE
    RAISE NOTICE 'ℹ️  auto-send-reminder-emails が見つかりません（既に停止済み・スキップ）';
  END IF;

  -- 2. 前日リマインド（auto-send-reminder-emails-day-before）を有効化
  v_jobid := NULL;
  SELECT jobid INTO v_jobid FROM cron.job WHERE jobname = 'auto-send-reminder-emails-day-before';

  IF v_jobid IS NOT NULL THEN
    PERFORM cron.alter_job(
      v_jobid,
      schedule => '0 0 * * *',
      command => $cmd$
      SELECT net.http_post(
        url := (SELECT value FROM public.app_config WHERE key = 'supabase_url') || '/functions/v1/auto-send-reminder-emails',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || (SELECT value FROM public.app_config WHERE key = 'supabase_anon_key'),
          'x-cron-secret', (SELECT value FROM public.app_config WHERE key = 'trigger_secret')
        ),
        body := '{"days_before": 1}'::jsonb
      ) AS request_id
      $cmd$,
      active => true
    );
    RAISE NOTICE '✅ 前日リマインド cron を更新・有効化しました (jobid: %)', v_jobid;
  ELSE
    SELECT cron.schedule(
      'auto-send-reminder-emails-day-before',
      '0 0 * * *',
      $cmd$
      SELECT net.http_post(
        url := (SELECT value FROM public.app_config WHERE key = 'supabase_url') || '/functions/v1/auto-send-reminder-emails',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || (SELECT value FROM public.app_config WHERE key = 'supabase_anon_key'),
          'x-cron-secret', (SELECT value FROM public.app_config WHERE key = 'trigger_secret')
        ),
        body := '{"days_before": 1}'::jsonb
      ) AS request_id
      $cmd$
    ) INTO v_jobid;
    RAISE NOTICE '✅ 前日リマインド cron を作成しました (jobid: %)', v_jobid;
  END IF;
END $$;

-- 確認
DO $$
DECLARE
  v_rec RECORD;
  v_found BOOLEAN := false;
BEGIN
  BEGIN
    PERFORM 1 FROM cron.job LIMIT 1;
  EXCEPTION
    WHEN undefined_table OR undefined_object THEN
      RETURN;
  END;

  FOR v_rec IN
    SELECT jobname, schedule, active
    FROM cron.job
    WHERE jobname LIKE 'auto-send-reminder-emails%'
    ORDER BY jobname
  LOOP
    v_found := true;
    RAISE NOTICE '📧 % : active=%, schedule=%', v_rec.jobname, v_rec.active, v_rec.schedule;
  END LOOP;

  IF NOT v_found THEN
    RAISE WARNING '⚠️ リマインドメール cron が1件も見つかりませんでした';
  END IF;
END $$;
