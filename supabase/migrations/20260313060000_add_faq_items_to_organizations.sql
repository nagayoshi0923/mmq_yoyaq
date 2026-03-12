-- 組織固有のFAQ項目を保存するカラムを追加
-- faq_items は JSON 配列として保存: [{ "question": "...", "answer": "...", "category": "..." }, ...]

ALTER TABLE organizations
ADD COLUMN IF NOT EXISTS faq_items JSONB DEFAULT '[]'::jsonb;

-- コメント追加
COMMENT ON COLUMN organizations.faq_items IS '組織固有のFAQ項目（JSON配列）';
