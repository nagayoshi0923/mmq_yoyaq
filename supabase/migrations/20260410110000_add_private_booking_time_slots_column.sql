-- =============================================================================
-- 20260410110000: organization_scenarios に private_booking_time_slots カラムを追加
-- =============================================================================
-- シナリオ編集で「受付可能な時間帯」を設定する機能のDB列が未作成だった。
-- UI・ロジックは実装済みだが保存先が無かったため、設定が反映されなかった。
-- =============================================================================

ALTER TABLE public.organization_scenarios
ADD COLUMN IF NOT EXISTS private_booking_time_slots text[] DEFAULT NULL;

COMMENT ON COLUMN public.organization_scenarios.private_booking_time_slots
  IS '貸切受付可能時間帯（朝公演、昼公演、夜公演）。NULLまたは空配列は全時間帯受付。';
