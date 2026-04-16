-- =============================================================================
-- pg_cron の公演中止判定ジョブを無効化（GitHub Actions に移行）
-- =============================================================================
--
-- 理由:
--   pg_cron + net.http_post の構成は以下の問題がある:
--   1. net.http_post は「キューに積んだら成功」→ Edge Function が実際に
--      実行されたかどうかわからない（失敗してもサイレント）
--   2. app.settings.service_role_key / cron_secret をDBに格納する必要があり、
--      設定ミスで無音で失敗するリスクがある
--
--   GitHub Actions cron に移行することで:
--   - 実行ログが GitHub UI に残る
--   - 失敗時にワークフロー自体がエラーになり検知できる
--   - Secrets は GitHub Secrets で安全に管理できる
--
-- 移行後の cron:
--   .github/workflows/check-performance-day-before.yml   (23:59 JST)
--   .github/workflows/check-performance-four-hours.yml   (毎時 :00)
-- =============================================================================

DO $$
BEGIN
  -- pg_cron が導入されていない環境（ローカル等）はスキップ
  BEGIN
    PERFORM 1 FROM cron.job LIMIT 1;
  EXCEPTION
    WHEN undefined_table OR undefined_object THEN
      RAISE NOTICE 'ℹ️  pg_cron 未導入のためスキップ';
      RETURN;
  END;

  -- 前日チェックのジョブを無効化
  BEGIN
    PERFORM cron.unschedule('check-performances-day-before');
    RAISE NOTICE '✅ check-performances-day-before を無効化しました';
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE '⚠️  check-performances-day-before は未登録（スキップ）';
  END;

  -- 4時間前チェックのジョブを無効化
  BEGIN
    PERFORM cron.unschedule('check-performances-four-hours');
    RAISE NOTICE '✅ check-performances-four-hours を無効化しました';
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE '⚠️  check-performances-four-hours は未登録（スキップ）';
  END;

  RAISE NOTICE 'ℹ️  GitHub Actions (.github/workflows/check-performance-*.yml) で代替します';
END $$;
