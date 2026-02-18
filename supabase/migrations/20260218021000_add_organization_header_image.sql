-- 組織ヘッダー画像を追加
ALTER TABLE organizations
ADD COLUMN IF NOT EXISTS header_image_url TEXT;

COMMENT ON COLUMN organizations.header_image_url IS '組織トップページのヘッダー画像URL';
