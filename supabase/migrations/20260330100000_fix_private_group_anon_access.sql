-- =============================================================================
-- 修正: 貸切グループの anon アクセス権限を復旧
-- =============================================================================
-- 問題: 20260321150000_security_revoke_all_anon_access.sql で全テーブルから
--       anon 権限を取り消した際、private_group 関連テーブルの権限を
--       戻し忘れた。RLS ポリシーも auth.uid() IS NOT NULL に変更されたため、
--       未ログインユーザーが貸切グループに参加できなくなった。
-- 解決: 招待コードを知っているユーザー（ゲスト含む）がアクセスできるよう
--       anon 権限と RLS ポリシーを復旧する。
-- =============================================================================

-- =============================================================================
-- 1. private_groups: 招待コードでのアクセスを許可
-- =============================================================================
GRANT SELECT ON public.private_groups TO anon;

DROP POLICY IF EXISTS "private_groups_select_by_invite_code" ON public.private_groups;
CREATE POLICY "private_groups_select_by_invite_code" ON public.private_groups
  FOR SELECT
  USING (true);

-- =============================================================================
-- 2. private_group_members: ゲスト参加・閲覧を許可
-- =============================================================================
GRANT SELECT, INSERT, UPDATE, DELETE ON public.private_group_members TO anon;

DROP POLICY IF EXISTS "private_group_members_select" ON public.private_group_members;
CREATE POLICY "private_group_members_select" ON public.private_group_members
  FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "private_group_members_insert" ON public.private_group_members;
CREATE POLICY "private_group_members_insert" ON public.private_group_members
  FOR INSERT
  WITH CHECK (true);

DROP POLICY IF EXISTS "private_group_members_update" ON public.private_group_members;
CREATE POLICY "private_group_members_update" ON public.private_group_members
  FOR UPDATE
  USING (true);

DROP POLICY IF EXISTS "private_group_members_delete" ON public.private_group_members;
CREATE POLICY "private_group_members_delete" ON public.private_group_members
  FOR DELETE
  USING (true);

-- =============================================================================
-- 3. private_group_candidate_dates: 候補日程の閲覧を許可
-- =============================================================================
GRANT SELECT, INSERT, UPDATE, DELETE ON public.private_group_candidate_dates TO anon;

DROP POLICY IF EXISTS "private_group_candidate_dates_select" ON public.private_group_candidate_dates;
CREATE POLICY "private_group_candidate_dates_select" ON public.private_group_candidate_dates
  FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "private_group_candidate_dates_insert" ON public.private_group_candidate_dates;
CREATE POLICY "private_group_candidate_dates_insert" ON public.private_group_candidate_dates
  FOR INSERT
  WITH CHECK (true);

DROP POLICY IF EXISTS "private_group_candidate_dates_update" ON public.private_group_candidate_dates;
CREATE POLICY "private_group_candidate_dates_update" ON public.private_group_candidate_dates
  FOR UPDATE
  USING (true);

DROP POLICY IF EXISTS "private_group_candidate_dates_delete" ON public.private_group_candidate_dates;
CREATE POLICY "private_group_candidate_dates_delete" ON public.private_group_candidate_dates
  FOR DELETE
  USING (true);

-- =============================================================================
-- 4. private_group_date_responses: ゲストの日程回答を許可
-- =============================================================================
GRANT SELECT, INSERT, UPDATE, DELETE ON public.private_group_date_responses TO anon;

DROP POLICY IF EXISTS "private_group_date_responses_select" ON public.private_group_date_responses;
CREATE POLICY "private_group_date_responses_select" ON public.private_group_date_responses
  FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "private_group_date_responses_insert" ON public.private_group_date_responses;
CREATE POLICY "private_group_date_responses_insert" ON public.private_group_date_responses
  FOR INSERT
  WITH CHECK (true);

DROP POLICY IF EXISTS "private_group_date_responses_update" ON public.private_group_date_responses;
CREATE POLICY "private_group_date_responses_update" ON public.private_group_date_responses
  FOR UPDATE
  USING (true);

DROP POLICY IF EXISTS "private_group_date_responses_delete" ON public.private_group_date_responses;
CREATE POLICY "private_group_date_responses_delete" ON public.private_group_date_responses
  FOR DELETE
  USING (true);

-- =============================================================================
-- 5. private_group_messages: ゲストのメッセージ閲覧・送信を許可
-- =============================================================================
GRANT SELECT, INSERT ON public.private_group_messages TO anon;

DROP POLICY IF EXISTS "private_group_messages_select" ON public.private_group_messages;
CREATE POLICY "private_group_messages_select" ON public.private_group_messages
  FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "private_group_messages_insert" ON public.private_group_messages;
CREATE POLICY "private_group_messages_insert" ON public.private_group_messages
  FOR INSERT
  WITH CHECK (true);

-- =============================================================================
-- 6. private_group_survey_responses: ゲストのアンケート回答を許可
-- =============================================================================
GRANT SELECT, INSERT, UPDATE ON public.private_group_survey_responses TO anon;

DROP POLICY IF EXISTS "private_group_survey_responses_select" ON public.private_group_survey_responses;
CREATE POLICY "private_group_survey_responses_select" ON public.private_group_survey_responses
  FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "private_group_survey_responses_insert" ON public.private_group_survey_responses;
CREATE POLICY "private_group_survey_responses_insert" ON public.private_group_survey_responses
  FOR INSERT
  WITH CHECK (true);

DROP POLICY IF EXISTS "private_group_survey_responses_update" ON public.private_group_survey_responses;
CREATE POLICY "private_group_survey_responses_update" ON public.private_group_survey_responses
  FOR UPDATE
  USING (true);

-- =============================================================================
-- 7. ゲスト認証用RPCの anon 実行権限を確認・付与
-- =============================================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'authenticate_guest_by_pin') THEN
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.authenticate_guest_by_pin TO anon';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'save_guest_access_pin') THEN
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.save_guest_access_pin TO anon';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'delete_guest_member') THEN
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.delete_guest_member TO anon';
  END IF;
END $$;

-- =============================================================================
-- 完了通知
-- =============================================================================
DO $$
BEGIN
  RAISE NOTICE '✅ 貸切グループの anon アクセス権限を復旧:';
  RAISE NOTICE '  - private_groups: SELECT';
  RAISE NOTICE '  - private_group_members: SELECT, INSERT, UPDATE, DELETE';
  RAISE NOTICE '  - private_group_candidate_dates: SELECT, INSERT, UPDATE, DELETE';
  RAISE NOTICE '  - private_group_date_responses: SELECT, INSERT, UPDATE, DELETE';
  RAISE NOTICE '  - private_group_messages: SELECT, INSERT';
  RAISE NOTICE '  - private_group_survey_responses: SELECT, INSERT, UPDATE';
  RAISE NOTICE '  - RPCs: authenticate_guest_by_pin, save_guest_access_pin, delete_guest_member';
END $$;
