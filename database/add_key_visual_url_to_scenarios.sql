-- scenariosテーブルにkey_visual_urlカラムを追加

ALTER TABLE scenarios
ADD COLUMN IF NOT EXISTS key_visual_url TEXT;

-- 既存のレコードにデフォルト値を設定（オプション）
COMMENT ON COLUMN scenarios.key_visual_url IS 'シナリオのキービジュアル画像URL';

