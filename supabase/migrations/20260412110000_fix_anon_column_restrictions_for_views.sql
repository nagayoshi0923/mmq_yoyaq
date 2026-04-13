-- ====================================================================
-- 修正: organization_scenarios / scenario_masters のカラム制限を元に戻す
--
-- 問題: organization_scenarios_with_master ビューが SECURITY INVOKER で
-- 動作するため、underlying テーブルのカラム制限がビュー内の
-- サブクエリにも適用され、ビュー全体が失敗する。
--
-- 対策: これら2テーブルはフル SELECT を anon に戻す。
-- 代わりに anon 向けの公開専用ビュー organization_scenarios_public を作成し、
-- 機密カラムを除外する。フロントエンドの公開ページは順次このビューに移行する。
-- 
-- RLS による行レベル保護（org_status='available' 等）は引き続き有効。
-- ====================================================================

-- ============================================================
-- 1. organization_scenarios: フル SELECT に戻す
-- ============================================================
REVOKE SELECT ON public.organization_scenarios FROM anon;
GRANT SELECT ON public.organization_scenarios TO anon;

-- ============================================================
-- 2. scenario_masters: フル SELECT に戻す
-- ============================================================
REVOKE SELECT ON public.scenario_masters FROM anon;
GRANT SELECT ON public.scenario_masters TO anon;

-- ============================================================
-- 3. organization_scenarios_with_master ビュー: フル SELECT に戻す
-- ============================================================
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.views
    WHERE table_name = 'organization_scenarios_with_master'
      AND table_schema = 'public'
  ) THEN
    EXECUTE 'REVOKE ALL ON public.organization_scenarios_with_master FROM anon';
    EXECUTE 'GRANT SELECT ON public.organization_scenarios_with_master TO anon';
  END IF;
END $$;

-- ============================================================
-- 4. 公開専用ビュー organization_scenarios_public を作成
--    機密カラム（GM情報、ライセンス料、原価、ノート等）を除外
-- ============================================================
CREATE OR REPLACE VIEW public.organization_scenarios_public AS
SELECT
  os.scenario_master_id AS id,
  os.id AS org_scenario_id,
  os.organization_id,
  os.scenario_master_id,
  os.slug,
  os.org_status AS status,
  COALESCE(os.override_title, sm.title) AS title,
  COALESCE(os.override_author, sm.author) AS author,
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
  os.pricing_patterns,
  os.available_stores,
  os.extra_preparation_time,
  sm.master_status,
  true AS is_shared,
  COALESCE(os.scenario_type, 'normal'::text) AS scenario_type,
  0::numeric AS rating,
  COALESCE(os.kit_count, 1) AS kit_count,
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
  os.created_at,
  os.updated_at
FROM organization_scenarios os
JOIN scenario_masters sm ON sm.id = os.scenario_master_id;

-- anon に公開ビューの SELECT を許可
GRANT SELECT ON public.organization_scenarios_public TO anon;

-- RLS は underlying テーブルの RLS が SECURITY INVOKER 経由で適用される

-- ============================================================
-- 確認まとめ:
-- カラム制限が有効なテーブル（前のマイグレーションから継続）:
--   - private_group_members: access_pin, guest_phone, 決済情報を非公開
--   - schedule_events: GM情報, 売上, コスト, 内部メモを非公開
--   - stores: コスト情報, スタッフPIIを非公開
--
-- フル SELECT に戻したテーブル（ビュー互換性のため）:
--   - organization_scenarios（RLS で行レベル保護済み）
--   - scenario_masters（RLS で行レベル保護済み）
--   - organization_scenarios_with_master ビュー
--
-- 新規作成:
--   - organization_scenarios_public ビュー（機密カラム除外）
-- ============================================================
