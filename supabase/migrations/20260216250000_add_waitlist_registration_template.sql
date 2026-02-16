-- キャンセル待ち登録完了テンプレートをemail_settingsに追加
ALTER TABLE email_settings 
ADD COLUMN IF NOT EXISTS waitlist_registration_template TEXT;

-- 既存レコードにデフォルトテンプレートを設定
UPDATE email_settings
SET waitlist_registration_template = '{customer_name} 様

キャンセル待ちへのご登録ありがとうございます。

━━━━━━━━━━━━━━━━━━━━━━
■ 登録内容
━━━━━━━━━━━━━━━━━━━━━━

シナリオ: {scenario_title}
日時: {date} {time}
会場: {venue}
ご希望人数: {participants}名

━━━━━━━━━━━━━━━━━━━━━━
■ 今後の流れ
━━━━━━━━━━━━━━━━━━━━━━

空席が出た場合、メールでお知らせいたします。
先着順となりますので、通知を受け取りましたら
お早めにご予約手続きをお願いいたします。

━━━━━━━━━━━━━━━━━━━━━━

ご不明な点がございましたら、お気軽にお問い合わせください。'
WHERE waitlist_registration_template IS NULL;

-- organization_settingsにもemail_templatesの構造を更新するコメント
COMMENT ON COLUMN email_settings.waitlist_registration_template IS 'キャンセル待ち登録完了時に送信されるメールテンプレート';
