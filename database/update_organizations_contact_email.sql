-- organizationsテーブルにcontact_email設定を追加
-- 実行日: 2026-01-23
-- 目的: 問い合わせフォームからのメール送信先を設定

-- クインズワルツの問い合わせ先を設定
UPDATE organizations
SET 
  contact_email = 'info@mmq.game',  -- ← 実際の問い合わせ先メールアドレスに変更してください
  contact_name = 'クインズワルツ お問い合わせ窓口',
  updated_at = NOW()
WHERE slug = 'queens-waltz';

-- 確認
SELECT id, name, slug, contact_email, contact_name
FROM organizations
WHERE slug = 'queens-waltz';

-- ================================================
-- 注意事項
-- ================================================
-- 1. contact_email は実際に受信できるメールアドレスを設定してください
-- 2. 組織ごとに異なる問い合わせ先を設定できます
-- 3. contact_email が NULL の場合、デフォルト送信先（DEFAULT_CONTACT_EMAIL環境変数）に送信されます
-- 4. 推奨設定例:
--    - info@mmq.game (MMQ全体の問い合わせ先)
--    - 個人のGmailアドレス
--    - 組織専用のメールアドレス

