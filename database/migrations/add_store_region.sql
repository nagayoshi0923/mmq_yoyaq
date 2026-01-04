-- 店舗に地域（region）カラムを追加
-- 店舗選択でグループ分け表示に使用（例: "東京", "県外"）

ALTER TABLE stores ADD COLUMN IF NOT EXISTS region TEXT;

-- コメント追加
COMMENT ON COLUMN stores.region IS '地域（例: "東京", "県外"）- 店舗選択でグループ分け表示に使用';

-- 既存の店舗にデフォルト値を設定（必要に応じて手動で更新してください）
-- UPDATE stores SET region = '東京' WHERE address LIKE '%東京%';
-- UPDATE stores SET region = '県外' WHERE region IS NULL;


