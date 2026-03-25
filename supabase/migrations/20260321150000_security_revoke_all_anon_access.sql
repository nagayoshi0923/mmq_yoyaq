-- =============================================================================
-- 🚨 緊急セキュリティ修正: 全テーブルから anon 権限を取り消し
-- =============================================================================
-- 問題: ほぼ全テーブルに anon がフルアクセス可能だった
-- 解決: 全テーブルから anon 権限を取り消し、必要最小限のみ許可
-- =============================================================================

-- =============================================================================
-- 1. 全テーブルから anon 権限を一括取り消し
-- =============================================================================
DO $$
DECLARE
  tbl RECORD;
BEGIN
  FOR tbl IN 
    SELECT table_name 
    FROM information_schema.tables 
    WHERE table_schema = 'public' 
      AND table_type = 'BASE TABLE'
  LOOP
    EXECUTE format('REVOKE ALL ON public.%I FROM anon', tbl.table_name);
    RAISE NOTICE 'Revoked anon from: %', tbl.table_name;
  END LOOP;
END $$;

-- =============================================================================
-- 2. organizations のみ公開予約ページで必要なので SELECT を許可
-- =============================================================================
GRANT SELECT ON public.organizations TO anon;

-- =============================================================================
-- 3. 危険な USING (true) ポリシーを修正
-- =============================================================================

-- stores
DROP POLICY IF EXISTS "stores_select_public_or_org" ON public.stores;

-- private_group 関連
DROP POLICY IF EXISTS "private_group_candidate_dates_select" ON public.private_group_candidate_dates;
CREATE POLICY "private_group_candidate_dates_select" ON public.private_group_candidate_dates
  FOR SELECT USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "private_group_date_responses_select" ON public.private_group_date_responses;
CREATE POLICY "private_group_date_responses_select" ON public.private_group_date_responses
  FOR SELECT USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "private_group_messages_select" ON public.private_group_messages;
CREATE POLICY "private_group_messages_select" ON public.private_group_messages
  FOR SELECT USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "private_groups_select_by_invite_code" ON public.private_groups;
CREATE POLICY "private_groups_select_by_invite_code" ON public.private_groups
  FOR SELECT USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "private_group_survey_responses_public_select" ON public.private_group_survey_responses;
DROP POLICY IF EXISTS "private_group_survey_responses_select" ON public.private_group_survey_responses;
CREATE POLICY "private_group_survey_responses_select" ON public.private_group_survey_responses
  FOR SELECT USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "private_group_survey_responses_public_update" ON public.private_group_survey_responses;
DROP POLICY IF EXISTS "private_group_survey_responses_update" ON public.private_group_survey_responses;
CREATE POLICY "private_group_survey_responses_update" ON public.private_group_survey_responses
  FOR UPDATE USING (auth.uid() IS NOT NULL);

-- business_hours_settings
DROP POLICY IF EXISTS "anon_read_business_hours" ON public.business_hours_settings;
DROP POLICY IF EXISTS "business_hours_settings_select_public" ON public.business_hours_settings;
DROP POLICY IF EXISTS "authenticated_full_access" ON public.business_hours_settings;
DROP POLICY IF EXISTS "business_hours_settings_authenticated" ON public.business_hours_settings;
CREATE POLICY "business_hours_settings_authenticated" ON public.business_hours_settings
  FOR ALL USING (auth.uid() IS NOT NULL);

-- contact_inquiries（認証なしINSERTは必要だがSELECTは不要）
DROP POLICY IF EXISTS "contact_inquiries_service_policy" ON public.contact_inquiries;
DROP POLICY IF EXISTS "contact_inquiries_insert_anon" ON public.contact_inquiries;
DROP POLICY IF EXISTS "contact_inquiries_select_admin" ON public.contact_inquiries;
CREATE POLICY "contact_inquiries_insert_anon" ON public.contact_inquiries
  FOR INSERT WITH CHECK (true);
CREATE POLICY "contact_inquiries_select_admin" ON public.contact_inquiries
  FOR SELECT USING (public.is_admin());

-- organization_scenarios
DROP POLICY IF EXISTS "organization_scenarios_public_select" ON public.organization_scenarios;
DROP POLICY IF EXISTS "organization_scenarios_select_authenticated" ON public.organization_scenarios;
CREATE POLICY "organization_scenarios_select_authenticated" ON public.organization_scenarios
  FOR SELECT USING (auth.uid() IS NOT NULL);

-- scenario 関連
DROP POLICY IF EXISTS "scenario_characters_select_all" ON public.scenario_characters;
DROP POLICY IF EXISTS "scenario_characters_select_auth" ON public.scenario_characters;
DROP POLICY IF EXISTS "scenario_likes_select" ON public.scenario_likes;
DROP POLICY IF EXISTS "scenario_likes_select_auth" ON public.scenario_likes;
DROP POLICY IF EXISTS "scenario_reviews_select" ON public.scenario_reviews;
DROP POLICY IF EXISTS "scenario_reviews_select_auth" ON public.scenario_reviews;
DROP POLICY IF EXISTS "Anyone can view reviews" ON public.scenario_reviews;

CREATE POLICY "scenario_characters_select_auth" ON public.scenario_characters
  FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "scenario_likes_select_auth" ON public.scenario_likes
  FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "scenario_reviews_select_auth" ON public.scenario_reviews
  FOR SELECT USING (auth.uid() IS NOT NULL);

-- org_scenario_survey_questions
DROP POLICY IF EXISTS "org_scenario_survey_questions_public_select" ON public.org_scenario_survey_questions;
DROP POLICY IF EXISTS "org_scenario_survey_questions_select_auth" ON public.org_scenario_survey_questions;
CREATE POLICY "org_scenario_survey_questions_select_auth" ON public.org_scenario_survey_questions
  FOR SELECT USING (auth.uid() IS NOT NULL);

-- =============================================================================
-- 4. contact_inquiries に anon INSERT 権限を付与（問い合わせフォーム用）
-- =============================================================================
GRANT INSERT ON public.contact_inquiries TO anon;

-- =============================================================================
-- 完了通知
-- =============================================================================
DO $$
BEGIN
  RAISE NOTICE '🔒 セキュリティ修正完了:';
  RAISE NOTICE '  - 全テーブルから anon 権限を取り消し';
  RAISE NOTICE '  - organizations のみ SELECT 許可（公開予約ページ用）';
  RAISE NOTICE '  - contact_inquiries のみ INSERT 許可（問い合わせフォーム用）';
  RAISE NOTICE '  - 危険な USING (true) ポリシーを修正';
END $$;
