-- シナリオ種別 (scenario_kind) と貸切受付制御カラムを追加
--
-- 目的:
--   1. scenario_masters.scenario_kind で「シナリオの種類」を分類
--      - regular: 通常シナリオ（予約・貸切OK）
--      - online_item: オンライン販売アイテム（予約サイト非掲載・ライセンス報告でのみ使う）
--      - offsite_only: 出張公演限定（予約サイト掲載するが貸切は受け付けない）
--
--   2. organization_scenarios.accepts_private_booking で「貸切受付の一時休止」フラグ
--
--   3. organization_scenarios.available_from / available_until で「シナリオ全体の公演期間」
--      （NULL = 期間制限なし。設定時は通常公演・貸切・サイト掲載すべてに効く）
--
-- 既存カラムとの関係:
--   - booking_start_date / booking_end_date は引き続き「貸切受付だけ」の期間として使う
--   - available_from / available_until は「シナリオ自体の公演可能期間」
--   - org_status (available/maintenance/retired/coming_soon) は維持。kind と直交

-- 1. scenario_masters: scenario_kind を追加
ALTER TABLE public.scenario_masters
  ADD COLUMN IF NOT EXISTS scenario_kind TEXT NOT NULL DEFAULT 'regular';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.check_constraints
    WHERE constraint_schema = 'public'
      AND constraint_name = 'scenario_masters_scenario_kind_check'
  ) THEN
    ALTER TABLE public.scenario_masters
      ADD CONSTRAINT scenario_masters_scenario_kind_check
      CHECK (scenario_kind IN ('regular', 'online_item', 'offsite_only'));
  END IF;
END $$;

COMMENT ON COLUMN public.scenario_masters.scenario_kind IS
  'シナリオ種別: regular=通常 / online_item=オンライン販売アイテム(予約サイト非掲載) / offsite_only=出張公演限定(貸切不可)';

-- 2. organization_scenarios: 貸切受付フラグと公演期間を追加
ALTER TABLE public.organization_scenarios
  ADD COLUMN IF NOT EXISTS accepts_private_booking BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS available_from DATE,
  ADD COLUMN IF NOT EXISTS available_until DATE;

COMMENT ON COLUMN public.organization_scenarios.accepts_private_booking IS
  '貸切受付を受け付けるか (false = 貸切休止中。通常公演は継続)';
COMMENT ON COLUMN public.organization_scenarios.available_from IS
  'シナリオ全体の公演開始日 (NULL = 制限なし)。掲載・通常公演・貸切すべてに影響';
COMMENT ON COLUMN public.organization_scenarios.available_until IS
  'シナリオ全体の公演終了日 (NULL = 制限なし)。掲載・通常公演・貸切すべてに影響';

-- 3. organization_scenarios_with_master ビューを再構築して新カラムを露出
-- ベース: 20260519080000_fix_is_shared_in_views.sql
-- 追加: sm.scenario_kind / os.accepts_private_booking / os.available_from / os.available_until

DROP VIEW IF EXISTS public.organization_scenarios_with_master;

CREATE VIEW public.organization_scenarios_with_master AS
SELECT
  os.scenario_master_id AS id,
  os.id AS org_scenario_id,
  os.organization_id,
  os.scenario_master_id,
  os.slug,
  os.org_status AS status,
  os.org_status,
  COALESCE(os.override_title, sm.title) AS title,
  COALESCE(os.override_author, sm.author) AS author,
  COALESCE(os.report_display_name, sm.report_display_name, COALESCE(os.override_author, sm.author)) AS report_display_name,
  sm.author_email,
  sm.author_id,
  COALESCE(os.custom_key_visual_url, sm.key_visual_url) AS key_visual_url,
  COALESCE(os.custom_description, sm.description) AS description,
  COALESCE(os.custom_synopsis, sm.synopsis) AS synopsis,
  COALESCE(os.custom_caution, sm.caution) AS caution,
  COALESCE(os.override_player_count_min, sm.player_count_min) AS player_count_min,
  COALESCE(os.override_player_count_max, sm.player_count_max) AS player_count_max,
  os.male_count,
  os.female_count,
  os.other_count,
  COALESCE(os.duration, sm.official_duration) AS duration,
  os.weekend_duration,
  COALESCE(os.override_genre, sm.genre) AS genre,
  COALESCE(os.override_difficulty, sm.difficulty) AS difficulty,
  COALESCE(os.override_has_pre_reading, sm.has_pre_reading) AS has_pre_reading,
  sm.release_date,
  sm.official_site_url,
  sm.required_items AS required_props,
  os.participation_fee,
  os.gm_test_participation_fee,
  os.participation_costs,
  os.flexible_pricing,
  os.use_flexible_pricing,
  os.license_amount,
  os.gm_test_license_amount,
  os.franchise_license_amount,
  os.franchise_gm_test_license_amount,
  os.external_license_amount,
  os.external_gm_test_license_amount,
  os.fc_receive_license_amount,
  os.fc_receive_gm_test_license_amount,
  os.fc_author_license_amount,
  os.fc_author_gm_test_license_amount,
  os.gm_costs,
  os.gm_count,
  os.gm_assignments,
  COALESCE((
    SELECT array_agg(st.name ORDER BY st.name)
    FROM staff_scenario_assignments ssa
    JOIN staff st ON st.id = ssa.staff_id
    WHERE ssa.scenario_master_id = os.scenario_master_id
      AND ssa.organization_id = os.organization_id
      AND (ssa.can_main_gm = true OR ssa.can_sub_gm = true)
  ), ARRAY[]::text[]) AS available_gms,
  COALESCE((
    SELECT array_agg(st.name ORDER BY st.name)
    FROM staff_scenario_assignments ssa
    JOIN staff st ON st.id = ssa.staff_id
    WHERE ssa.scenario_master_id = os.scenario_master_id
      AND ssa.organization_id = os.organization_id
      AND ssa.is_experienced = true
      AND COALESCE(ssa.can_main_gm, false) = false
      AND COALESCE(ssa.can_sub_gm, false) = false
  ), ARRAY[]::text[]) AS experienced_staff,
  os.available_stores,
  os.production_cost,
  os.production_costs,
  os.depreciation_per_performance,
  os.extra_preparation_time,
  (
    SELECT count(*)::integer
    FROM schedule_events se
    WHERE se.scenario_master_id = os.scenario_master_id
      AND se.organization_id = os.organization_id
      AND se.date <= CURRENT_DATE
      AND se.is_cancelled IS NOT TRUE
      AND se.category <> 'offsite'::text
  ) AS play_count,
  os.notes,
  os.created_at,
  os.updated_at,
  sm.master_status,
  os.pricing_patterns,
  sm.is_shared,
  COALESCE(os.scenario_type, 'normal'::text) AS scenario_type,
  0::numeric AS rating,
  COALESCE(os.kit_count, 1) AS kit_count,
  '[]'::jsonb AS license_rewards,
  COALESCE(os.is_recommended, false) AS is_recommended,
  os.survey_url,
  COALESCE(os.survey_enabled, false) AS survey_enabled,
  COALESCE(os.survey_deadline_days, 1) AS survey_deadline_days,
  COALESCE(os.characters, '[]'::jsonb) AS characters,
  os.pre_reading_notice_message,
  os.booking_start_date,
  os.booking_end_date,
  os.individual_notice_template,
  COALESCE(os.character_assignment_method, 'survey'::text) AS character_assignment_method,
  COALESCE(os.private_booking_time_slots, ARRAY[]::text[]) AS private_booking_time_slots,
  COALESCE(os.private_booking_blocked_slots, ARRAY[]::text[]) AS private_booking_blocked_slots,
  -- 新カラム
  COALESCE(sm.scenario_kind, 'regular'::text) AS scenario_kind,
  COALESCE(os.accepts_private_booking, true) AS accepts_private_booking,
  os.available_from,
  os.available_until
FROM organization_scenarios os
JOIN scenario_masters sm ON sm.id = os.scenario_master_id;

GRANT SELECT ON public.organization_scenarios_with_master TO authenticated;
GRANT SELECT ON public.organization_scenarios_with_master TO anon;

NOTIFY pgrst, 'reload schema';
