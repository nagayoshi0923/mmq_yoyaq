-- 共通FAQ（MMQ汎用）をライセンス管理者組織で管理するためのカラム追加
-- common_faq_items は JSON 配列として保存: [{ "question": "...", "answer": "...", "category": "..." }, ...]

ALTER TABLE organizations
ADD COLUMN IF NOT EXISTS common_faq_items JSONB DEFAULT NULL;

COMMENT ON COLUMN organizations.common_faq_items IS 'MMQ共通FAQ項目（ライセンス管理者組織のみ使用）';
