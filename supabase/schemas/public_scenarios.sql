-- 正規ソース: supabase/schemas/public_scenarios.sql
-- 最終更新: 2026-08-02
-- 公式サイト(queenswaltz.jp)向け 公開シナリオビュー。
-- 設計の正: docs/HP_PUBLIC_SCENARIO_API.md §4-2 / §3-4。
--
-- 公開カラムのホワイトリスト。ブラックリスト列（ライセンス料8種・原価・GM報酬/実名・
-- notes・author_email/author_id・survey_*・characters・available_stores・booking_*・
-- private_booking_*・play_count・kit_count・master_status・report_display_name・
-- required_props・gm_test_participation_fee・difficulty）は1つも含めない。
-- 行は org_status='available' AND web_published に固定。
-- security_invoker=true。読み取りは service_role 経由の /api/public/scenarios 専用。
CREATE OR REPLACE VIEW public.public_scenarios
WITH (security_invoker = true) AS
SELECT
  os.id,
  os.organization_id,
  os.slug,
  COALESCE(os.override_title, sm.title)                            AS title,
  COALESCE(os.override_author, sm.author)                          AS author,
  COALESCE(os.custom_key_visual_url, sm.key_visual_url)            AS key_visual_url,
  COALESCE(os.custom_description, sm.description)                  AS description,
  COALESCE(os.custom_caution, sm.caution)                          AS caution,
  COALESCE(os.override_player_count_min, sm.player_count_min)      AS player_count_min,
  COALESCE(os.override_player_count_max, sm.player_count_max)      AS player_count_max,
  COALESCE(os.duration, sm.official_duration)                      AS duration,
  COALESCE(os.weekend_duration, sm.weekend_duration)              AS weekend_duration,
  COALESCE(os.override_genre, sm.genre, '{}'::text[])              AS genre,
  COALESCE(os.custom_sensitive_tags, sm.sensitive_tags, '{}'::text[]) AS sensitive_tags,
  COALESCE(os.override_has_pre_reading, sm.has_pre_reading, false) AS has_pre_reading,
  COALESCE(os.scenario_type, 'normal'::text)                       AS scenario_type,
  COALESCE(os.is_recommended, false)                               AS is_recommended,
  sm.release_date,
  os.participation_fee,
  os.participation_costs,
  os.web_display_order,
  os.updated_at
FROM public.organization_scenarios os
JOIN public.scenario_masters sm ON sm.id = os.scenario_master_id
WHERE os.org_status = 'available' AND os.web_published;

REVOKE ALL ON public.public_scenarios FROM anon, authenticated;
GRANT SELECT ON public.public_scenarios TO service_role;
