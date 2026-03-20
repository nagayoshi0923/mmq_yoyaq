-- =============================================================================
-- 貸切招待ページへのアクセス修正
-- =============================================================================
-- 問題: anon権限取り消しにより、未ログインユーザーが貸切招待ページにアクセスできない
-- 解決: invite_codeでのアクセスはanonにも許可（公開リンク機能）
-- =============================================================================

-- private_groups: anonにSELECT権限を付与
GRANT SELECT ON public.private_groups TO anon;

-- private_group_members: anonにSELECT権限を付与
GRANT SELECT ON public.private_group_members TO anon;

-- private_group_candidate_dates: anonにSELECT権限を付与
GRANT SELECT ON public.private_group_candidate_dates TO anon;

-- private_group_date_responses: anonにSELECT権限を付与
GRANT SELECT ON public.private_group_date_responses TO anon;

-- private_group_messages: anonにSELECT権限を付与（チャット表示用）
GRANT SELECT ON public.private_group_messages TO anon;

-- scenario_masters: anonにSELECT権限を付与（シナリオ情報表示用）
GRANT SELECT ON public.scenario_masters TO anon;

-- =============================================================================
-- RLSポリシーを調整（invite_codeでのアクセスを許可）
-- =============================================================================

-- private_groups: invite_codeでのアクセスを許可
DROP POLICY IF EXISTS "private_groups_select_by_invite_code" ON public.private_groups;
CREATE POLICY "private_groups_select_by_invite_code" ON public.private_groups
  FOR SELECT USING (true);

-- private_group_members: グループメンバーの表示を許可
DROP POLICY IF EXISTS "private_group_members_select" ON public.private_group_members;
CREATE POLICY "private_group_members_select" ON public.private_group_members
  FOR SELECT USING (true);

-- private_group_candidate_dates: 候補日程の表示を許可
DROP POLICY IF EXISTS "private_group_candidate_dates_select" ON public.private_group_candidate_dates;
CREATE POLICY "private_group_candidate_dates_select" ON public.private_group_candidate_dates
  FOR SELECT USING (true);

-- private_group_date_responses: 回答の表示を許可
DROP POLICY IF EXISTS "private_group_date_responses_select" ON public.private_group_date_responses;
CREATE POLICY "private_group_date_responses_select" ON public.private_group_date_responses
  FOR SELECT USING (true);

-- private_group_messages: メッセージの表示を許可
DROP POLICY IF EXISTS "private_group_messages_select" ON public.private_group_messages;
CREATE POLICY "private_group_messages_select" ON public.private_group_messages
  FOR SELECT USING (true);

-- =============================================================================
-- 書き込み権限は認証済みユーザーのみ（既存ポリシーを維持）
-- =============================================================================
-- INSERT/UPDATE/DELETEポリシーは既存のものを維持（auth.uid()チェックあり）

-- =============================================================================
-- 完了通知
-- =============================================================================
DO $$
BEGIN
  RAISE NOTICE '✅ 貸切招待ページアクセス修正完了:';
  RAISE NOTICE '  - private_groups: anon SELECT許可';
  RAISE NOTICE '  - private_group_members: anon SELECT許可';
  RAISE NOTICE '  - private_group_candidate_dates: anon SELECT許可';
  RAISE NOTICE '  - private_group_date_responses: anon SELECT許可';
  RAISE NOTICE '  - private_group_messages: anon SELECT許可';
  RAISE NOTICE '  - scenario_masters: anon SELECT許可';
END $$;
