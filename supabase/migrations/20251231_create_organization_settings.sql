-- =============================================================================
-- 組織設定テーブル作成
-- =============================================================================
-- 
-- 【目的】
-- 各組織ごとのDiscord/メール/その他の設定を管理
-- Edge Functionsから組織IDで設定を取得
-- 
-- =============================================================================

-- -----------------------------------------------------------------------------
-- organization_settings テーブル作成
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.organization_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  
  -- Discord設定
  discord_bot_token TEXT,                    -- Discord Bot Token
  discord_webhook_url TEXT,                  -- 通知用Webhook URL
  discord_channel_id TEXT,                   -- 通知先チャンネルID
  discord_private_booking_channel_id TEXT,   -- 貸切予約通知チャンネルID
  discord_shift_channel_id TEXT,             -- シフト通知チャンネルID
  discord_public_key TEXT,                   -- Discord Public Key（Interactions用）
  
  -- メール設定
  resend_api_key TEXT,                       -- Resend API Key
  sender_email TEXT,                         -- 送信元メールアドレス
  sender_name TEXT,                          -- 送信元名
  reply_to_email TEXT,                       -- 返信先メールアドレス
  
  -- LINE設定（将来用）
  line_channel_access_token TEXT,
  line_channel_secret TEXT,
  
  -- Google設定（将来用）
  google_sheets_id TEXT,                     -- シフト同期用スプレッドシートID
  google_service_account_key JSONB,          -- サービスアカウントキー
  
  -- 通知設定
  notification_settings JSONB DEFAULT '{
    "new_reservation_email": true,
    "new_reservation_discord": true,
    "private_booking_email": true,
    "private_booking_discord": true,
    "shift_request_discord": true,
    "reminder_email": true
  }'::jsonb,
  
  -- メタデータ
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- 1組織1設定
  UNIQUE(organization_id)
);

-- -----------------------------------------------------------------------------
-- インデックス
-- -----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_organization_settings_org_id 
  ON public.organization_settings(organization_id);

-- -----------------------------------------------------------------------------
-- RLS有効化
-- -----------------------------------------------------------------------------
ALTER TABLE public.organization_settings ENABLE ROW LEVEL SECURITY;

-- -----------------------------------------------------------------------------
-- RLSポリシー
-- -----------------------------------------------------------------------------
-- SELECT: 自分の組織の設定のみ参照可能
CREATE POLICY "organization_settings_select_own_org" ON public.organization_settings
  FOR SELECT
  USING (
    is_admin() AND 
    organization_id = get_user_organization_id()
  );

-- INSERT: 自分の組織の設定のみ作成可能
CREATE POLICY "organization_settings_insert_own_org" ON public.organization_settings
  FOR INSERT
  WITH CHECK (
    is_admin() AND 
    organization_id = get_user_organization_id()
  );

-- UPDATE: 自分の組織の設定のみ更新可能
CREATE POLICY "organization_settings_update_own_org" ON public.organization_settings
  FOR UPDATE
  USING (
    is_admin() AND 
    organization_id = get_user_organization_id()
  );

-- DELETE: 自分の組織の設定のみ削除可能
CREATE POLICY "organization_settings_delete_own_org" ON public.organization_settings
  FOR DELETE
  USING (
    is_admin() AND 
    organization_id = get_user_organization_id()
  );

-- -----------------------------------------------------------------------------
-- Edge Functions用: サービスロールからのアクセス許可
-- -----------------------------------------------------------------------------
-- Edge Functionsはservice_roleを使用するため、RLSをバイパス
-- ただし、明示的にorganization_idを指定してクエリする必要がある

-- -----------------------------------------------------------------------------
-- 更新日時トリガー
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION update_organization_settings_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_organization_settings_updated_at ON public.organization_settings;
CREATE TRIGGER trigger_organization_settings_updated_at
  BEFORE UPDATE ON public.organization_settings
  FOR EACH ROW
  EXECUTE FUNCTION update_organization_settings_updated_at();

-- -----------------------------------------------------------------------------
-- コメント
-- -----------------------------------------------------------------------------
COMMENT ON TABLE public.organization_settings IS '組織ごとの設定（Discord/メール/通知等）';
COMMENT ON COLUMN public.organization_settings.discord_bot_token IS 'Discord Bot Token（暗号化推奨）';
COMMENT ON COLUMN public.organization_settings.resend_api_key IS 'Resend API Key（暗号化推奨）';
COMMENT ON COLUMN public.organization_settings.notification_settings IS '通知設定（JSON）';

-- =============================================================================
-- 完了
-- =============================================================================


