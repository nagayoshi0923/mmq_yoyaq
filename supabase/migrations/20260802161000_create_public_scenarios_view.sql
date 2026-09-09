-- YOYAQ-007 (Phase 2): 公式サイト向け 公開シナリオビュー。
-- 設計の正: docs/HP_PUBLIC_SCENARIO_API.md §4-2 / §3-4。
--
-- ⚠️ このmigrationは監督経由でPO/Claudeが /db-change 手順で適用する。ここでは適用しない。
--
-- 方針:
-- ・公開カラムのホワイトリスト。ブラックリスト列（§3-4）は1つも SELECT しない。
-- ・行は org_status='available' AND web_published に固定（非公開・非availableは出さない）。
-- ・security_invoker=true（呼び出し元権限で基礎テーブルのRLSを評価する）。
-- ・anon/authenticated には GRANT しない。読み取りは service_role 経由の
--   専用API(/api/public/scenarios)だけ。participation_costs はビューに含めるが、
--   gmtest除去はAPI層の責務（anonにGRANTしないためビュー経由の漏洩はない）。
--
-- ブラックリスト列の非混入 自己照合（設計書 §3-4）:
--   license_amount / gm_test_license_amount / franchise_* / external_* / fc_* … 含めない
--   production_cost / production_costs / depreciation_per_performance … 含めない
--   gm_costs / gm_count / gm_assignments / available_gms / experienced_staff … 含めない
--   notes / author_email / author_id … 含めない
--   survey_url / survey_enabled / survey_deadline_days … 含めない
--   characters / available_stores … 含めない
--   booking_start_date / booking_end_date / individual_notice_template / private_booking_* … 含めない
--   play_count / kit_count / master_status / report_display_name / required_props / gm_test_participation_fee … 含めない
--   gm_test_participation_fee(gmtest価格) … 含めない
--   difficulty … 含めない（未運用）
-- ↑ 下の SELECT リストにこれらが1つも無いことを目視照合済み。

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

COMMENT ON VIEW public.public_scenarios IS
  '公式サイト向け公開シナリオ（org_status=available かつ web_published のみ）。公開カラムのホワイトリスト。読み取りは /api/public/scenarios（service_role）専用';

-- least-privilege: anon/authenticated には一切 GRANT しない。service_role のみ SELECT。
REVOKE ALL ON public.public_scenarios FROM anon, authenticated;
GRANT SELECT ON public.public_scenarios TO service_role;
