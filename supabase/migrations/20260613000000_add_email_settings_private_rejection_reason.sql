-- 貸切リクエスト却下メールの既定理由（{rejection_reason} に差し込まれる文）を
-- 店舗/組織ごとに保存する列。却下ダイアログの全文を組み立てる初期値として使う。
-- 未設定(null)のときはアプリ側の固定既定文にフォールバックする。
ALTER TABLE email_settings
  ADD COLUMN IF NOT EXISTS private_rejection_reason text;
