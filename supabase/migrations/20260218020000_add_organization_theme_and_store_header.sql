-- 組織テーマカラーと店舗ヘッダー画像の追加

-- 組織にテーマカラーを追加
ALTER TABLE organizations
ADD COLUMN IF NOT EXISTS theme_color TEXT DEFAULT '#E60012';

-- 店舗にヘッダー画像URLを追加
ALTER TABLE stores
ADD COLUMN IF NOT EXISTS header_image_url TEXT;

-- コメント追加
COMMENT ON COLUMN organizations.theme_color IS '組織のイメージカラー（HEX形式、例: #E60012）';
COMMENT ON COLUMN stores.header_image_url IS '店舗のヘッダー画像URL';
