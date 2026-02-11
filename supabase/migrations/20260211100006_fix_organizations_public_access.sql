-- =============================================================================
-- 緊急修正: organizations テーブルの公開アクセスを復旧
-- =============================================================================
-- 問題: Round 2 で organizations の SELECT を認証済みユーザーのみに制限したが、
-- 公開予約ページが organizations テーブルを匿名で slug 検索する必要がある。
-- 
-- 影響: 公開予約ページ（/{organizationSlug}）で組織が見つからず、
-- 全てのイベントスケジュールが表示されなくなった。
--
-- 対応コード箇所:
-- src/pages/PublicBookingTop/hooks/useBookingData.ts 行82-87
--   supabase.from('organizations').select('id, name').eq('slug', ...).single()
-- =============================================================================

-- 認証済みのみのポリシーを削除
DROP POLICY IF EXISTS "organizations_select_authenticated" ON public.organizations;

-- 公開予約ページ用: 匿名でも is_active=true の組織を slug で検索可能
-- 認証済みユーザー: 自分の組織のデータを閲覧可能
CREATE POLICY "organizations_select_public"
  ON public.organizations
  FOR SELECT
  USING (
    -- 公開予約ページ用（匿名含む）: アクティブな組織は公開
    is_active = true
    -- 認証済みユーザー: 自分の組織（非アクティブでも）
    OR id = get_user_organization_id()
    -- admin: 全組織
    OR is_admin()
  );
