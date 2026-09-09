-- anon に対するシナリオ系オブジェクトの列レベル権限ハードニング
--
-- 背景（本番実測 2026-08-01）:
--   public.organization_scenarios_with_master / organization_scenarios / scenario_masters は
--   anon にテーブル全体の SELECT が付いており、未認証で以下が読める状態だった。
--     - license_amount ほかライセンス料 8種
--     - production_cost / production_costs / depreciation_per_performance
--     - gm_costs / gm_count / gm_assignments / available_gms / experienced_staff（GM実名）
--     - notes（内部メモ） / author_email（作者連絡先）
--     - survey_url / individual_notice_template / pricing_patterns / flexible_pricing
--
-- 方針:
--   顧客向け公開画面（トップ / 予約トップ / カタログ / シナリオ詳細 / 貸切申込 /
--   グループ招待 / 予約確定）はいずれも anon キーでこれらを直接読んでおり、
--   テーブルごと REVOKE すると予約が完了できなくなる。
--   公開画面のクエリは全て明示カラム指定（select('*') は皆無）であることを確認済みのため、
--   テーブルレベル SELECT を剥がし、実際に使われている列だけを列レベルで GRANT し直す。
--   → 画面の挙動は不変のまま、機密列だけが読めなくなる。
--
-- 既知の残課題（本migrationでは塞がない）:
--   1. organization_scenarios.external_license_amount は /{org}/rental-report
--      （ルートガード無しの公開ページ）が anon で読んでいるため、回帰を避けて暫定的に許可を残す。
--      当該ページの API 経由化で別途塞ぐこと。
--   2. ビューは security_invoker 未設定（owner=postgres、base table は FORCE RLS 無し）のため
--      RLS が効かず、anon から非 available 行のタイトル等も見える。
--      security_invoker=true 化は staff 画面の可視範囲に影響するため別タスクとする。

BEGIN;

-- ─────────────────────────────────────────────
-- 1. organization_scenarios_with_master（ビュー）
-- ─────────────────────────────────────────────
REVOKE ALL ON public.organization_scenarios_with_master FROM anon;

GRANT SELECT (
  id, org_scenario_id, organization_id, scenario_master_id, slug,
  status, org_status, master_status,
  title, author, key_visual_url, description, synopsis, caution,
  player_count_min, player_count_max, male_count, female_count, other_count,
  duration, weekend_duration, extra_preparation_time,
  genre, difficulty, has_pre_reading, release_date, official_site_url, required_props,
  participation_fee, participation_costs,
  scenario_type, is_shared, is_recommended, rating, kit_count,
  available_stores, characters,
  survey_enabled, survey_deadline_days,
  pre_reading_notice_message, character_assignment_method,
  private_booking_time_slots, private_booking_blocked_slots,
  booking_start_date, booking_end_date,
  created_at, updated_at
) ON public.organization_scenarios_with_master TO anon;

-- 書き込み権限は authenticated からも剥がす（ビューへの INSERT/UPDATE/DELETE は用途なし）
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON public.organization_scenarios_with_master FROM authenticated;
GRANT SELECT ON public.organization_scenarios_with_master TO authenticated;

-- ─────────────────────────────────────────────
-- 2. organization_scenarios_public（ビュー / アプリからの参照はゼロ）
-- ─────────────────────────────────────────────
REVOKE ALL ON public.organization_scenarios_public FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON public.organization_scenarios_public FROM authenticated;
GRANT SELECT ON public.organization_scenarios_public TO authenticated;

-- ─────────────────────────────────────────────
-- 3. scenario_masters（テーブル）
-- ─────────────────────────────────────────────
REVOKE SELECT ON public.scenario_masters FROM anon;

GRANT SELECT (
  id, title, author, author_id, key_visual_url,
  description, synopsis, caution,
  player_count_min, player_count_max, official_duration, weekend_duration,
  genre, difficulty, has_pre_reading,
  release_date, official_site_url, required_items,
  master_status, gallery_images, sensitive_tags,
  created_at, updated_at
) ON public.scenario_masters TO anon;
-- 非公開: author_email, submitted_by_organization_id, approved_by, approved_at,
--         rejection_reason, created_by, report_display_name

-- ─────────────────────────────────────────────
-- 4. organization_scenarios（テーブル）
-- ─────────────────────────────────────────────
REVOKE SELECT ON public.organization_scenarios FROM anon;

GRANT SELECT (
  id, organization_id, scenario_master_id, slug, org_status,
  override_title, override_author, override_genre, override_difficulty,
  override_player_count_min, override_player_count_max, override_has_pre_reading,
  custom_key_visual_url, custom_description, custom_synopsis, custom_caution,
  custom_sensitive_tags,
  male_count, female_count, other_count,
  duration, weekend_duration, extra_preparation_time,
  participation_fee, participation_costs,
  scenario_type, is_recommended, kit_count,
  available_stores, characters,
  survey_enabled, survey_deadline_days,
  pre_reading_notice_message, character_assignment_method,
  private_booking_time_slots, private_booking_blocked_slots,
  booking_start_date, booking_end_date,
  external_license_amount,   -- 暫定: /{org}/rental-report が anon で読むため。API化で別途剥がす
  created_at, updated_at
) ON public.organization_scenarios TO anon;
-- 非公開: license_amount, gm_test_license_amount, franchise_license_amount,
--         franchise_gm_test_license_amount, external_gm_test_license_amount,
--         fc_receive_license_amount, fc_receive_gm_test_license_amount,
--         fc_author_license_amount, fc_author_gm_test_license_amount,
--         gm_costs, gm_count, gm_assignments, available_gms, experienced_staff,
--         production_cost, production_costs, depreciation_per_performance,
--         notes, play_count, gm_test_participation_fee,
--         flexible_pricing, use_flexible_pricing, pricing_patterns,
--         survey_url, individual_notice_template, report_display_name

COMMIT;
