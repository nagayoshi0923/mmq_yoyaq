-- rollback: archive スキーマへ退避した28表を public へ戻す。archive スキーマ自体は残す（他の退避表が使うため）。
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
    IF to_regclass('archive.' || t) IS NOT NULL THEN
      EXECUTE format('ALTER TABLE archive.%I SET SCHEMA public', t);
    END IF;
  END LOOP;
END $$;
