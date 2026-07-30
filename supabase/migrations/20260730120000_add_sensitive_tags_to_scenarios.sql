-- センシティブ内容セルフ診断: 作品側が申告する「含まれる描写」タグを追加
--
-- - scenario_masters.sensitive_tags        : マスタ側の申告（既定は空配列 = 未申告）
-- - organization_scenarios.custom_sensitive_tags : 店舗ごとの上書き（NULL = マスタ準拠）
--
-- 保存する値は src/constants/sensitiveTopics.ts の SENSITIVE_TOPICS.key と一致させる。

-- ============================================================
-- 1. カラム追加
-- ============================================================
ALTER TABLE public.scenario_masters
  ADD COLUMN IF NOT EXISTS sensitive_tags text[] NOT NULL DEFAULT '{}';

ALTER TABLE public.organization_scenarios
  ADD COLUMN IF NOT EXISTS custom_sensitive_tags text[];

COMMENT ON COLUMN public.scenario_masters.sensitive_tags IS
  'この作品に含まれるセンシティブ描写のキー配列。値は src/constants/sensitiveTopics.ts の SENSITIVE_TOPICS.key と一致させる。空配列=未申告（顧客側の診断セクションは非表示）';

COMMENT ON COLUMN public.organization_scenarios.custom_sensitive_tags IS
  '店舗ごとのセンシティブ描写キー配列の上書き。NULL=マスタ (scenario_masters.sensitive_tags) 準拠。値は src/constants/sensitiveTopics.ts の SENSITIVE_TOPICS.key と一致させる';

-- ============================================================
-- 2. ビュー再作成（末尾に sensitive_tags を1列追加するだけ）
--    ベース定義: 20260523010000_move_scenario_kind_to_org_scenarios.sql
--    既存列の順序・名前・式は一切変更しない（末尾追加のみ = CREATE OR REPLACE 可）
-- ============================================================
CREATE OR REPLACE VIEW public.organization_scenarios_with_master AS
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
  -- 種別と貸切受付フラグ・公演期間 (organization_scenarios 側に統一)
  COALESCE(os.scenario_kind, 'regular'::text) AS scenario_kind,
  COALESCE(os.accepts_private_booking, true) AS accepts_private_booking,
  os.available_from,
  os.available_until,
  -- センシティブ内容セルフ診断用（店舗上書き → マスタ → 空配列）
  COALESCE(os.custom_sensitive_tags, sm.sensitive_tags, ARRAY[]::text[]) AS sensitive_tags
FROM organization_scenarios os
JOIN scenario_masters sm ON sm.id = os.scenario_master_id;

GRANT SELECT ON public.organization_scenarios_with_master TO authenticated;
GRANT SELECT ON public.organization_scenarios_with_master TO anon;

-- ============================================================
-- 3. anon のカラムレベル権限に新カラムを追加（意図的な公開）
--    20260412100000 で設定したカラム単位 GRANT の系譜。
--    現行は 20260412110000 でテーブル全体 SELECT に戻っているため実質冗長だが、
--    再びカラム制限を敷いた場合に取りこぼさないよう明示しておく。
--    ※他カラムの権限には一切触れない（REVOKE しない）。
-- ============================================================
GRANT SELECT (sensitive_tags) ON public.scenario_masters TO anon;
GRANT SELECT (custom_sensitive_tags) ON public.organization_scenarios TO anon;

NOTIFY pgrst, 'reload schema';
