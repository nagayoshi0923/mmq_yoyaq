-- 営業時間設定を一般ユーザーも読み取れるようにする
-- 貸切予約フォームで営業時間設定を参照する必要があるため

-- 既存のSELECTポリシーを削除（存在する場合）
DROP POLICY IF EXISTS "business_hours_settings_select_admin" ON public.business_hours_settings;
DROP POLICY IF EXISTS "business_hours_settings_select_public" ON public.business_hours_settings;

-- 管理者は組織内のデータを読み取れる
CREATE POLICY "business_hours_settings_select_admin" ON public.business_hours_settings
  FOR SELECT
  USING (is_admin() AND organization_id = get_user_organization_id());

-- 認証済みユーザーは全ての営業時間設定を読み取れる（公開情報）
-- 営業時間は公開情報であり、貸切予約フォームで必要
CREATE POLICY "business_hours_settings_select_authenticated" ON public.business_hours_settings
  FOR SELECT
  USING (auth.role() = 'authenticated');

COMMENT ON POLICY "business_hours_settings_select_authenticated" ON public.business_hours_settings 
  IS '認証済みユーザーは営業時間設定を読み取れる（貸切予約フォームで必要）';
