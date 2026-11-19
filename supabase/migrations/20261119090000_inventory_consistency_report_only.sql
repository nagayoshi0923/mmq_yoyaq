-- 席数（schedule_events.current_participants）の毎日の点検を「数えて記録するだけ」で動かし直す
-- 2026-11-19 社長判断「まず点検だけ動かす」（MMQ 毎日点検 / 自動点検 Issue #1309）
--
-- 経緯:
-- - pg_cron の check-inventory-consistency（12:00 JST）/ daily-inventory-consistency-check（05:00 JST）は
--   run_inventory_consistency_check() を引数なしで呼ぶが、20260130300000 の組織境界の強化で
--   service_role / 組織管理者以外は organization_id 必須になり、2026-02-02 から毎回
--   organization_id_required で失敗していた（cron は JWT を持たないため）。
-- - 旧関数は数え方が checked_in（来店済み）を数えず、動いていれば過去公演の人数を 0 などへ
--   誤って書き換えていた（2026-11-19 の本番照合: 旧条件で 20 件不一致、checked_in を含めると 0 件）。
--
-- 方針:
-- - 書き換えはしない。点検結果を inventory_consistency_logs に auto_fixed = 0 で記録するだけ
-- - 数え方は予約 RPC と同じ pending / confirmed / gm_confirmed / checked_in
-- - 旧 2 ジョブを止め、05:00 JST の 1 ジョブにまとめる。旧関数は残す（呼び出し元は cron のみ）
-- - 自動修正を戻すかは、記録を見てから別に決める
-- 戻し方: supabase/rollbacks/20261119090000_inventory_consistency_report_only.sql

CREATE OR REPLACE FUNCTION public.report_inventory_consistency()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_start timestamptz := clock_timestamp();
  v_total integer;
  v_found integer;
  v_details jsonb;
  v_ms integer;
BEGIN
  WITH ev AS (
    SELECT
      se.id,
      se.organization_id,
      se.date,
      se.start_time,
      COALESCE(se.current_participants, 0) AS stored,
      COALESCE(se.max_participants, se.capacity) AS cap,
      (
        SELECT COALESCE(SUM(r.participant_count), 0)
        FROM public.reservations r
        WHERE r.schedule_event_id = se.id
          AND r.status IN ('pending', 'confirmed', 'gm_confirmed', 'checked_in')
      ) AS actual
    FROM public.schedule_events se
    WHERE se.date >= CURRENT_DATE - INTERVAL '30 days'
      AND se.date <= CURRENT_DATE + INTERVAL '90 days'
      AND se.is_cancelled = false
  )
  SELECT
    COUNT(*)::integer,
    (COUNT(*) FILTER (WHERE stored <> actual))::integer,
    COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'event_id', id,
          'organization_id', organization_id,
          'date', date,
          'start_time', start_time,
          'stored_count', stored,
          'actual_count', actual,
          'max_capacity', cap,
          'difference', stored - actual
        ) ORDER BY date DESC
      ) FILTER (WHERE stored <> actual),
      '[]'::jsonb
    )
  INTO v_total, v_found, v_details
  FROM ev;

  v_ms := EXTRACT(MILLISECONDS FROM (clock_timestamp() - v_start))::integer;

  INSERT INTO public.inventory_consistency_logs (total_checked, inconsistencies_found, auto_fixed, details, execution_time_ms)
  VALUES (v_total, v_found, 0, v_details, v_ms);

  RETURN jsonb_build_object('total_checked', v_total, 'inconsistencies_found', v_found, 'auto_fixed', 0, 'execution_time_ms', v_ms);
END;
$$;

COMMENT ON FUNCTION public.report_inventory_consistency() IS
'席数の点検（書き換えなし）。過去30日〜未来90日の公演の current_participants と有効な予約人数（pending/confirmed/gm_confirmed/checked_in）を比べ、inventory_consistency_logs に auto_fixed=0 で記録する。pg_cron（postgres）と service_role のみ実行可。';

REVOKE ALL ON FUNCTION public.report_inventory_consistency() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.report_inventory_consistency() FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.report_inventory_consistency() TO service_role;

DO $$
BEGIN
  IF to_regclass('cron.job') IS NULL THEN RAISE NOTICE 'pg_cron is not available; skipped'; RETURN; END IF;
  PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname IN ('check-inventory-consistency', 'daily-inventory-consistency-check');
  -- 毎日 20:00 UTC = 05:00 JST
  PERFORM cron.schedule('daily-inventory-consistency-report', '0 20 * * *', $job$SELECT public.report_inventory_consistency()$job$);
END $$;
