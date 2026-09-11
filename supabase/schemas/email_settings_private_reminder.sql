-- email_settings の貸切リマインド拡張（既存列は保持）
ALTER TABLE public.email_settings ADD COLUMN IF NOT EXISTS private_reminder_template text;
COMMENT ON COLUMN public.email_settings.private_reminder_template IS '貸切公演専用リマインド。オープン用reminder_templateとは独立。未設定時は貸切専用の既定文面を使用。';
