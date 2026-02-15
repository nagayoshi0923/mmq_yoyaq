-- =============================================================================
-- カスタム休日設定カラム追加
-- =============================================================================
-- 
-- 【目的】
-- GW、年末年始などのカスタム休日を組織ごとに設定可能にする
-- スケジュール画面から日付を右クリックして休日設定できる
-- 
-- =============================================================================

-- custom_holidays カラムを追加（JSONB配列: ["2026-05-03", "2026-05-04", ...]）
ALTER TABLE public.organization_settings
ADD COLUMN IF NOT EXISTS custom_holidays JSONB DEFAULT '[]'::jsonb;

-- コメント追加
COMMENT ON COLUMN public.organization_settings.custom_holidays IS 'カスタム休日（YYYY-MM-DD形式の日付配列）';

-- インデックス（GINインデックスでJSONB配列の検索を高速化）
CREATE INDEX IF NOT EXISTS idx_organization_settings_custom_holidays
  ON public.organization_settings USING GIN (custom_holidays);
