-- staffテーブルにdiscord_idカラムを追加
ALTER TABLE staff ADD COLUMN discord_id TEXT;

-- インデックスを追加（検索性能向上のため）
CREATE INDEX idx_staff_discord_id ON staff(discord_id);

-- 既存のスタッフにDiscord IDを設定（例）
-- 実際のDiscord IDに置き換えてください
UPDATE staff SET discord_id = '1427064798650040472' WHERE name = '田中 太郎';
-- 他のスタッフのDiscord IDも必要に応じて設定
