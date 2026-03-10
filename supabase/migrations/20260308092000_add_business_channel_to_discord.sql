-- =============================================================================
-- マイグレーション: Discord業務連絡チャンネル設定を追加
-- =============================================================================
-- 
-- 作成日: 2026-03-08
-- 
-- 変更:
--   organization_settings に discord_business_channel_id カラムを追加
--   公演中止判定の結果などを通知する専用チャンネル
-- 
-- =============================================================================

-- 1. カラム追加
ALTER TABLE organization_settings 
ADD COLUMN IF NOT EXISTS discord_business_channel_id TEXT;

COMMENT ON COLUMN organization_settings.discord_business_channel_id IS 
'Discord業務連絡チャンネルID。公演中止判定結果などの業務通知用。';

-- 完了確認
DO $$ 
BEGIN
  RAISE NOTICE '✅ マイグレーション完了: discord_business_channel_id カラムを追加';
END $$;
