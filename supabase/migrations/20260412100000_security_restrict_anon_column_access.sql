-- ====================================================================
-- セキュリティ修正: anon ロールのカラムレベルアクセス制限
-- 
-- 問題: anon に付与された SELECT 権限はテーブル全体に適用されるため、
-- PostgREST の select パラメータを操作するだけで
-- GM情報・ライセンス料・PII等の非公開カラムを取得できてしまう。
--
-- 対策: テーブルレベルの SELECT を REVOKE し、
-- 公開して問題のないカラムのみカラムレベルで GRANT する。
-- authenticated ロールには影響しない。
-- ====================================================================

-- ============================================================
-- 1. private_group_members（最高優先: PII・認証情報の漏洩防止）
-- ============================================================
-- 非公開: access_pin（認証情報）, guest_phone（PII）,
--         payment_amount, coupon_id, coupon_discount, final_amount, payment_status（決済情報）
REVOKE SELECT ON public.private_group_members FROM anon;
GRANT SELECT (
  id, group_id, user_id, guest_name, guest_email,
  is_organizer, status, joined_at, created_at
) ON public.private_group_members TO anon;

-- ============================================================
-- 2. organization_scenarios（経営・GM情報の漏洩防止）
-- ============================================================
-- 非公開: license_amount系（全8カラム）, gm_costs, gm_count, gm_assignments,
--         available_gms, experienced_staff, production_cost, production_costs,
--         depreciation_per_performance, play_count, notes, report_display_name
REVOKE SELECT ON public.organization_scenarios FROM anon;
GRANT SELECT (
  id, organization_id, scenario_master_id, slug, org_status,
  override_title, override_author,
  custom_key_visual_url, custom_description, custom_synopsis, custom_caution,
  override_player_count_min, override_player_count_max,
  male_count, female_count, other_count,
  duration, weekend_duration,
  override_genre, override_difficulty, override_has_pre_reading,
  participation_fee, gm_test_participation_fee,
  participation_costs, flexible_pricing, use_flexible_pricing, pricing_patterns,
  available_stores, kit_count, scenario_type,
  is_recommended, survey_url, survey_enabled, survey_deadline_days,
  characters, pre_reading_notice_message,
  booking_start_date, booking_end_date,
  individual_notice_template, character_assignment_method,
  private_booking_time_slots, private_booking_blocked_slots,
  extra_preparation_time,
  created_at, updated_at
) ON public.organization_scenarios TO anon;

-- ============================================================
-- 3. schedule_events（売上・コスト・GM情報の漏洩防止）
-- ============================================================
-- 非公開: gms, gm_roles（スタッフ情報）,
--         venue_rental_fee, total_revenue, gm_cost, license_cost（財務）,
--         notes, reservation_notes, cancellation_reason（内部メモ）,
--         reservation_id, reservation_name, is_reservation_name_overwritten（予約紐付け）,
--         is_tentative（内部ワークフロー）
REVOKE SELECT ON public.schedule_events FROM anon;
GRANT SELECT (
  id, date, venue, scenario, start_time, end_time,
  category, is_cancelled, scenario_id, store_id,
  start_at, end_at, published, capacity, status,
  max_participants, reservation_deadline_hours,
  is_reservation_enabled, current_participants, time_slot,
  organization_id, participant_count,
  is_private_request, organization_scenario_id,
  is_recruitment_extended, is_private_booking,
  is_extended, extended_at,
  cancelled_at, scenario_master_id,
  created_at, updated_at
) ON public.schedule_events TO anon;

-- ============================================================
-- 4. stores（コスト・内部情報の漏洩防止）
-- ============================================================
-- 非公開: fixed_costs, franchise_fee, venue_cost_per_performance,
--         transport_allowance（財務）,
--         notes, ownership_type（内部）,
--         manager_name, phone_number, email（スタッフPII）
REVOKE SELECT ON public.stores FROM anon;
GRANT SELECT (
  id, name, short_name, address,
  opening_date, status, capacity, rooms, color,
  is_temporary, temporary_date, temporary_dates,
  organization_id, display_order, region,
  temporary_venue_names, kit_group_id, access_info,
  created_at, updated_at
) ON public.stores TO anon;

-- ============================================================
-- 5. scenario_masters（ワークフロー情報の漏洩防止）
-- ============================================================
-- 非公開: author_email（PII）,
--         submitted_by_organization_id, approved_by, approved_at,
--         rejection_reason, created_by（内部ワークフロー）
REVOKE SELECT ON public.scenario_masters FROM anon;
GRANT SELECT (
  id, title, author, author_id,
  key_visual_url, description, synopsis, caution,
  player_count_min, player_count_max,
  official_duration, genre, difficulty,
  required_items, master_status,
  has_pre_reading, release_date, official_site_url,
  gallery_images, weekend_duration, report_display_name,
  created_at, updated_at
) ON public.scenario_masters TO anon;

-- ============================================================
-- 6. organization_scenarios_with_master ビュー
-- ============================================================
-- ビューは underlying テーブルの RLS とカラム権限を継承するが、
-- ビュー自体にも明示的にカラム制限を設定する。
-- 非公開: gm_costs, gm_count, gm_assignments, available_gms, experienced_staff,
--         production_cost, production_costs, depreciation_per_performance,
--         license_amount, gm_test_license_amount, franchise_*_license_amount,
--         notes, author_email, play_count
DO $$
BEGIN
  -- ビューへの anon SELECT が存在する場合のみ制限
  IF EXISTS (
    SELECT 1 FROM information_schema.role_table_grants
    WHERE grantee = 'anon'
      AND table_name = 'organization_scenarios_with_master'
      AND privilege_type = 'SELECT'
  ) THEN
    EXECUTE 'REVOKE SELECT ON public.organization_scenarios_with_master FROM anon';
    EXECUTE 'GRANT SELECT (
      id, org_scenario_id, organization_id, scenario_master_id, slug,
      status, org_status,
      title, author, report_display_name,
      key_visual_url, description, synopsis, caution,
      player_count_min, player_count_max,
      male_count, female_count, other_count,
      duration, weekend_duration,
      genre, difficulty, has_pre_reading,
      release_date, official_site_url, required_props,
      participation_fee, gm_test_participation_fee,
      participation_costs, flexible_pricing, use_flexible_pricing,
      pricing_patterns,
      available_stores,
      is_shared, scenario_type, rating, kit_count, license_rewards,
      is_recommended, survey_url, survey_enabled, survey_deadline_days,
      characters, pre_reading_notice_message,
      booking_start_date, booking_end_date,
      individual_notice_template, character_assignment_method,
      private_booking_time_slots, private_booking_blocked_slots,
      extra_preparation_time,
      master_status,
      created_at, updated_at
    ) ON public.organization_scenarios_with_master TO anon';
  END IF;
END $$;
