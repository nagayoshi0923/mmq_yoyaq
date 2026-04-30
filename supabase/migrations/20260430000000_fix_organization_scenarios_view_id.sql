-- organization_scenarios_with_master ビューのid定義を修正
-- id = scenario_master_id に統一（org_scenario_id との混在を解消）
CREATE OR REPLACE VIEW public.organization_scenarios_with_master AS
 SELECT os.scenario_master_id AS id,
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
    os.gm_costs,
    os.gm_count,
    os.gm_assignments,
    COALESCE(( SELECT array_agg(st.name ORDER BY st.name)
           FROM (public.staff_scenario_assignments ssa
             JOIN public.staff st ON ((st.id = ssa.staff_id)))
          WHERE ((ssa.scenario_id = os.scenario_master_id) AND (ssa.organization_id = os.organization_id) AND ((ssa.can_main_gm = true) OR (ssa.can_sub_gm = true)))), ARRAY[]::text[]) AS available_gms,
    COALESCE(( SELECT array_agg(st.name ORDER BY st.name)
           FROM (public.staff_scenario_assignments ssa
             JOIN public.staff st ON ((st.id = ssa.staff_id)))
          WHERE ((ssa.scenario_id = os.scenario_master_id) AND (ssa.organization_id = os.organization_id) AND (ssa.is_experienced = true) AND (COALESCE(ssa.can_main_gm, false) = false) AND (COALESCE(ssa.can_sub_gm, false) = false))), ARRAY[]::text[]) AS experienced_staff,
    os.available_stores,
    os.production_cost,
    os.production_costs,
    os.depreciation_per_performance,
    os.extra_preparation_time,
    ( SELECT (count(*))::integer
           FROM public.schedule_events se
          WHERE ((se.scenario_master_id = os.scenario_master_id) AND (se.organization_id = os.organization_id) AND (se.date <= CURRENT_DATE) AND (se.is_cancelled IS NOT TRUE) AND (se.category <> 'offsite'::text))) AS play_count,
    os.notes,
    os.created_at,
    os.updated_at,
    sm.master_status,
    os.pricing_patterns,
    true AS is_shared,
    COALESCE(os.scenario_type, 'normal'::text) AS scenario_type,
    (0)::numeric AS rating,
    COALESCE(os.kit_count, 1) AS kit_count,
    '[]'::jsonb AS license_rewards,
    COALESCE(os.is_recommended, false) AS is_recommended,
    os.survey_url,
    COALESCE(os.survey_enabled, false) AS survey_enabled,
    COALESCE(os.survey_deadline_days, 1) AS survey_deadline_days,
    COALESCE(os.characters, '[]'::jsonb) AS characters,
    os.pre_reading_notice_message
   FROM (public.organization_scenarios os
     JOIN public.scenario_masters sm ON ((sm.id = os.scenario_master_id)));

COMMENT ON VIEW public.organization_scenarios_with_master IS '組織シナリオとマスタを結合したビュー。report_display_name対応';
