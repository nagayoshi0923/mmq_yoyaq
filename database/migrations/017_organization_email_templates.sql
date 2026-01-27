-- =============================================================================
-- マイグレーション 017: 組織別メールテンプレート
-- =============================================================================
-- 
-- 🎯 解決する問題:
--   メール本文が全組織で同じ内容になっている
--
-- 📋 追加するカスタマイズ項目:
--   - 署名（signature）: メール末尾の署名
--   - フッター（footer）: 追加情報やリンク
--   - 挨拶文（greeting）: メール冒頭の挨拶
--
-- =============================================================================

-- 1. organization_settings にメールテンプレートカラムを追加
ALTER TABLE organization_settings
ADD COLUMN IF NOT EXISTS email_templates JSONB DEFAULT '{}'::JSONB;

COMMENT ON COLUMN organization_settings.email_templates IS 
'メールテンプレート設定。構造:
{
  "greeting": "いつもご利用ありがとうございます。",
  "signature": "株式会社○○\nTEL: 03-xxxx-xxxx\nEmail: info@example.com",
  "footer": "※このメールは自動送信です。",
  "booking_confirmation": { "subject_prefix": "【予約確定】", "additional_notes": "..." },
  "cancellation_confirmation": { "subject_prefix": "【キャンセル】", ... },
  "waitlist_notification": { "subject_prefix": "【空席のお知らせ】", ... },
  "reminder": { "subject_prefix": "【リマインダー】", ... }
}';

-- 2. Queens Waltz のデフォルトテンプレートを設定
UPDATE organization_settings
SET email_templates = '{
  "greeting": "いつもクインズワルツをご利用いただき、誠にありがとうございます。",
  "signature": "クインズワルツ スタッフ一同\n\n━━━━━━━━━━━━━━━━━━━━\n🎭 マーダーミステリー専門店 クインズワルツ\n🌐 https://queenswaltz.com\n📧 info@mmq.game\n━━━━━━━━━━━━━━━━━━━━",
  "footer": "※このメールは自動送信されています。\n※ご不明点がございましたら、上記メールアドレスまでお問い合わせください。"
}'::JSONB
WHERE organization_id = 'a0000000-0000-0000-0000-000000000001';

-- 3. デフォルト値取得関数
CREATE OR REPLACE FUNCTION get_email_template(
  p_organization_id UUID,
  p_template_key TEXT
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_templates JSONB;
  v_value TEXT;
BEGIN
  -- 組織のテンプレートを取得
  SELECT email_templates INTO v_templates
  FROM organization_settings
  WHERE organization_id = p_organization_id;
  
  IF v_templates IS NULL THEN
    v_templates := '{}'::JSONB;
  END IF;
  
  -- キーに対応する値を取得
  v_value := v_templates ->> p_template_key;
  
  -- デフォルト値
  IF v_value IS NULL THEN
    CASE p_template_key
      WHEN 'greeting' THEN
        v_value := 'いつもご利用いただきありがとうございます。';
      WHEN 'signature' THEN
        v_value := 'MMQ予約システム';
      WHEN 'footer' THEN
        v_value := '※このメールは自動送信されています。';
      ELSE
        v_value := '';
    END CASE;
  END IF;
  
  RETURN v_value;
END;
$$;

COMMENT ON FUNCTION get_email_template(UUID, TEXT) IS 
'組織のメールテンプレートを取得。未設定時はデフォルト値を返す。';

GRANT EXECUTE ON FUNCTION get_email_template(UUID, TEXT) TO service_role;

-- 完了確認
DO $$ 
BEGIN
  RAISE NOTICE '✅ マイグレーション 017 完了';
  RAISE NOTICE '  - email_templates カラム追加';
  RAISE NOTICE '  - Queens Waltz デフォルトテンプレート設定';
  RAISE NOTICE '  - get_email_template() 関数作成';
END $$;

