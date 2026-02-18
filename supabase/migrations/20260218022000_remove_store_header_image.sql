-- 店舗ヘッダー画像を削除（組織レベルでのみ管理するため）
ALTER TABLE stores
DROP COLUMN IF EXISTS header_image_url;
