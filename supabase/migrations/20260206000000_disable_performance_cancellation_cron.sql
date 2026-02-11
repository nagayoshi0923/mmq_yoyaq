-- =============================================================================
-- マイグレーション: 公演中止判定のcronジョブを無効化（再有効化可能）
-- =============================================================================
-- 
-- 機能概要:
-- 前日23:59チェックと4時間前チェックのcronジョブを無効化します
-- 削除ではなく無効化するため、後で再有効化できます
--
-- 注意: cron.job は pg_cron 拡張で提供。ローカル環境では存在しない場合あり。
-- =============================================================================

DO $$
DECLARE
  v_jobid BIGINT;
  v_job RECORD;
  v_active_count INTEGER;
  v_inactive_count INTEGER;
BEGIN
  -- cron.job へのアクセス試行（pg_cron 未導入のローカル環境ではスキップ）
  BEGIN
    PERFORM 1 FROM cron.job LIMIT 1;
  EXCEPTION
    WHEN undefined_table OR undefined_object THEN
      RAISE NOTICE 'ℹ️  cron.job が存在しません（pg_cron 未導入のためスキップ）';
      RETURN;
  END;

  -- 1. 前日チェックのcronジョブを無効化
  SELECT jobid INTO v_jobid FROM cron.job WHERE jobname = 'check-performances-day-before';
  IF v_jobid IS NOT NULL THEN
    PERFORM cron.alter_job(v_jobid, active => false);
    RAISE NOTICE '✅ 前日チェックのcronジョブを無効化しました: check-performances-day-before (jobid: %)', v_jobid;
  ELSE
    RAISE NOTICE 'ℹ️  前日チェックのcronジョブは存在しませんでした';
  END IF;

  -- 2. 4時間前チェックのcronジョブを無効化
  SELECT jobid INTO v_jobid FROM cron.job WHERE jobname = 'check-performances-four-hours';
  IF v_jobid IS NOT NULL THEN
    PERFORM cron.alter_job(v_jobid, active => false);
    RAISE NOTICE '✅ 4時間前チェックのcronジョブを無効化しました: check-performances-four-hours (jobid: %)', v_jobid;
  ELSE
    RAISE NOTICE 'ℹ️  4時間前チェックのcronジョブは存在しませんでした';
  END IF;

  -- 3. その他の関連するcronジョブも無効化
  FOR v_job IN
    SELECT jobid, jobname FROM cron.job
    WHERE (jobname LIKE '%check-performance%' OR jobname LIKE '%performance%cancellation%'
           OR COALESCE(command, '')::text LIKE '%check-performance-cancellation%')
      AND active = true
  LOOP
    PERFORM cron.alter_job(v_job.jobid, active => false);
    RAISE NOTICE '✅ 関連するcronジョブを無効化しました: % (jobid: %)', v_job.jobname, v_job.jobid;
  END LOOP;

  -- 4. 確認
  SELECT COUNT(*) FILTER (WHERE active = true), COUNT(*) FILTER (WHERE active = false)
  INTO v_active_count, v_inactive_count
  FROM cron.job
  WHERE jobname LIKE '%check-performance%' OR jobname LIKE '%performance%cancellation%' OR COALESCE(command, '')::text LIKE '%check-performance-cancellation%';

  IF v_active_count = 0 AND v_inactive_count > 0 THEN
    RAISE NOTICE '✅ 公演中止判定のcronジョブは全て無効化されました（再有効化可能）';
  ELSIF v_active_count > 0 THEN
    RAISE WARNING '⚠️  まだ % 個のcronジョブが有効です', v_active_count;
  ELSE
    RAISE NOTICE 'ℹ️  公演中止判定のcronジョブは設定されていません';
  END IF;
END $$;
