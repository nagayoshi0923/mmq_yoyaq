-- 営業時間設定を全ユーザー（ログインなしでも）読み取れるようにする
-- 貸切予約フォームで営業時間設定を参照する必要があるため

-- 既存のSELECTポリシーを削除（存在する場合）
DROP POLICY IF EXISTS "business_hours_settings_select_admin" ON public.business_hours_settings;
DROP POLICY IF EXISTS "business_hours_settings_select_public" ON public.business_hours_settings;
DROP POLICY IF EXISTS "business_hours_settings_select_authenticated" ON public.business_hours_settings;

-- 営業時間は公開情報として全員が読み取れる（ログインなしでも）
-- 貸切予約フォームで必要
CREATE POLICY "business_hours_settings_select_public" ON public.business_hours_settings
  FOR SELECT
  USING (true);

COMMENT ON POLICY "business_hours_settings_select_public" ON public.business_hours_settings 
  IS '営業時間設定は公開情報として全員が読み取れる（貸切予約フォームで必要）';
