-- =============================================================================
-- マイグレーション: 前日チェックcronのミッドナイトレースコンディション修正
-- =============================================================================
--
-- 問題:
--   check-performances-day-before は 23:59 JST にスケジュールされているが、
--   pg_cron は net.http_post() でリクエストをキューに積んだ時点で完了する。
--   実際の Edge Function 実行が 00:00 JST を過ぎると
--   RPC 内の v_target_date_jst = NOW()::date + 1 が「翌々日」になり、
--   対象公演が0件 → サイレントに何もしないという不具合が発生した。
--   （2026-04-15 実績: job 49 succeeded だが performance_cancellation_logs 未記録）
--
-- 修正:
--   cron body に target_date を明示的に含める。
--   target_date は cron 実行時点（23:59 JST）で評価されるため、
--   Edge Function がいつ実行されても正しい翌日の日付が渡される。
--   スケジュール自体（23:59 JST）は変更しない。
-- =============================================================================

DO $$
DECLARE
  v_jobid BIGINT;
BEGIN
  -- pg_cron の存在チェック
  BEGIN
    PERFORM 1 FROM cron.job LIMIT 1;
  EXCEPTION
    WHEN undefined_table OR undefined_object THEN
      RAISE NOTICE 'ℹ️  cron.job が存在しません（pg_cron 未導入のためスキップ）';
      RETURN;
  END;

  -- check-performances-day-before ジョブを取得
  SELECT jobid INTO v_jobid
  FROM cron.job
  WHERE jobname = 'check-performances-day-before';

  IF v_jobid IS NULL THEN
    RAISE WARNING '⚠️  check-performances-day-before ジョブが見つかりません';
    RETURN;
  END IF;

  -- cron コマンドを更新（スケジュールは 23:59 JST のまま維持）
  -- target_date を body に含めることでレースコンディションを排除する
  -- current_setting() は cron 実行時に評価されるため、
  -- timezone('Asia/Tokyo', NOW())::date + 1 も cron 起動時点の翌日になる
  PERFORM cron.alter_job(
    v_jobid,
    command := $new_cmd$
      SELECT net.http_post(
        url := current_setting('app.settings.supabase_url', true) || '/functions/v1/check-performance-cancellation',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true),
          'x-cron-secret', current_setting('app.settings.cron_secret', true)
        ),
        body := jsonb_build_object(
          'check_type', 'day_before',
          'target_date', (timezone('Asia/Tokyo', NOW())::date + 1)::text
        )
      );
    $new_cmd$
  );

  RAISE NOTICE '✅ check-performances-day-before のコマンドを更新しました';
  RAISE NOTICE '   変更内容: cron body に target_date を追加（レースコンディション修正）';
  RAISE NOTICE '   スケジュール: 変更なし（59 14 * * * = 23:59 JST）';
END $$;
