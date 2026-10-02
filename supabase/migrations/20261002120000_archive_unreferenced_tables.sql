-- QW-20261002-006 Phase 1-3: コードから参照されず、生きている表・関数からも参照されない28表を archive スキーマへ退避する。
-- 削除ではなく移動なので、rollback で元に戻せる。archive は PostgREST に公開されず、anon / authenticated からは見えない。
-- 対象の選定: 本番165表のうち src / api / supabase/functions / rpcs / schemas に参照ゼロの40表から、
--   DB 関数・トリガーが使う表（reservations_history, rate_limit_log, rate_limit_records, inventory_consistency_logs,
--   compensated_cancellations, album_character_records）、生きている表から FK で参照される表
--   （online_scenarios, game_sessions, game_online_scenarios, game_scenario_phases）、
--   AI マネージャー連携の表（ai_manager_gateway_approvals, ai_manager_work_stores）を除いたもの。
-- 行数: staff_scenario_assignments_backup_20260603 3,575 / customers_org_backfill_20260707 1,524 / event_categories 4 /
--   staff_settings 2 / ほか 0（2026-10-02 本番）。

CREATE SCHEMA IF NOT EXISTS archive;
REVOKE ALL ON SCHEMA archive FROM PUBLIC;
REVOKE ALL ON SCHEMA archive FROM anon, authenticated;
GRANT USAGE ON SCHEMA archive TO postgres, service_role;

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'ai_generations','character_relationships','customer_settings','customers_org_backfill_20260707','event_categories',
    'game_ai_generations','game_character_relationships','game_messages','game_play_history','game_players',
    'game_scenario_characters','game_scenario_clues','game_scenario_collaborators','game_scenario_purchases','game_scenario_reviews',
    'game_votes','pricing_settings','sales_report_settings','scenario_clues','scenario_collaborators','scenario_parts',
    'scenario_phases','scenario_purchases','scenario_reviews','staff_scenario_assignments_backup_20260603','staff_settings',
    'store_basic_settings','system_settings'
  ] LOOP
    IF to_regclass('public.' || t) IS NOT NULL THEN
      EXECUTE format('ALTER TABLE public.%I SET SCHEMA archive', t);
    END IF;
  END LOOP;
END $$;
