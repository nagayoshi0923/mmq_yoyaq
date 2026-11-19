-- 20261119090000_inventory_consistency_report_only の戻し: 新ジョブを止め、旧 2 ジョブを元の呼び出しで戻し、新関数を消す
DO $$
BEGIN
  IF to_regclass('cron.job') IS NULL THEN RAISE NOTICE 'pg_cron is not available; skipped'; RETURN; END IF;
  PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'daily-inventory-consistency-report';
  PERFORM cron.schedule('check-inventory-consistency', '0 3 * * *', $job$SELECT run_inventory_consistency_check();$job$);
  PERFORM cron.schedule('daily-inventory-consistency-check', '0 20 * * *', $job$SELECT run_inventory_consistency_check();$job$);
END $$;

DROP FUNCTION IF EXISTS public.report_inventory_consistency();
