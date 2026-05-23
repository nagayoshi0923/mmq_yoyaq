-- 貸切グループチャット周りの設定カラムを global_settings に追加
--
-- 追加対象 (Issue #80):
--   1. チャット機能の有効化・ゲスト許可フラグ
--   2. 個別お知らせの組織デフォルト本文
--   3. 未設定だったシステムメッセージのテンプレ
--      (candidate_dates_added / pre_reading_notice / survey_notice / performance_cancelled)

-- 1. チャット機能設定
ALTER TABLE public.global_settings
  ADD COLUMN IF NOT EXISTS chat_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS chat_guest_allowed BOOLEAN NOT NULL DEFAULT TRUE;

COMMENT ON COLUMN public.global_settings.chat_enabled IS
  '貸切グループチャット機能を有効にするか（false=チャットUI非表示・送信不可）';
COMMENT ON COLUMN public.global_settings.chat_guest_allowed IS
  'ゲスト（MMQアカウント非所有）にもチャット送信を許可するか（false=ログインユーザーのみ）';

-- 2. 個別お知らせの組織デフォルト本文
ALTER TABLE public.global_settings
  ADD COLUMN IF NOT EXISTS individual_notice_default_body TEXT;

COMMENT ON COLUMN public.global_settings.individual_notice_default_body IS
  '個別お知らせ送信時のデフォルト本文（シナリオごとの individual_notice_template より優先度低）';

-- 3. 未設定だったシステムメッセージのテンプレ
ALTER TABLE public.global_settings
  ADD COLUMN IF NOT EXISTS system_msg_candidate_dates_added_title TEXT DEFAULT '候補日程が追加されました',
  ADD COLUMN IF NOT EXISTS system_msg_candidate_dates_added_body  TEXT DEFAULT '日程を確認して回答してください。',
  ADD COLUMN IF NOT EXISTS system_msg_pre_reading_notice_title    TEXT DEFAULT '事前読み込みについて',
  ADD COLUMN IF NOT EXISTS system_msg_pre_reading_notice_body     TEXT,
  ADD COLUMN IF NOT EXISTS system_msg_survey_notice_title         TEXT DEFAULT 'アンケートのご協力のお願い',
  ADD COLUMN IF NOT EXISTS system_msg_survey_notice_body          TEXT,
  ADD COLUMN IF NOT EXISTS system_msg_performance_cancelled_title TEXT DEFAULT '公演中止のお知らせ',
  ADD COLUMN IF NOT EXISTS system_msg_performance_cancelled_body  TEXT;

COMMENT ON COLUMN public.global_settings.system_msg_candidate_dates_added_title IS
  '候補日程追加時のチャット内タイトル';
COMMENT ON COLUMN public.global_settings.system_msg_pre_reading_notice_title IS
  '事前読み込み通知のチャット内タイトル';
COMMENT ON COLUMN public.global_settings.system_msg_survey_notice_title IS
  'アンケート依頼のチャット内タイトル';
COMMENT ON COLUMN public.global_settings.system_msg_performance_cancelled_title IS
  '公演中止通知のチャット内タイトル';

NOTIFY pgrst, 'reload schema';
