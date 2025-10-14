-- staffテーブルにdiscord_channel_idカラムを追加（discord_idは既に存在）
ALTER TABLE staff ADD COLUMN discord_channel_id TEXT;

-- インデックスを追加（検索性能向上のため）
CREATE INDEX idx_staff_discord_channel_id ON staff(discord_channel_id);

-- 既存のスタッフにDiscordチャンネルIDを設定（例）
-- 実際のチャンネルIDに置き換えてください
UPDATE staff SET 
  discord_channel_id = 'GM1のチャンネルID'
WHERE name = '田中 太郎';

-- 他のスタッフのDiscordチャンネルIDも必要に応じて設定
-- UPDATE staff SET 
--   discord_channel_id = 'GM2のチャンネルID'
-- WHERE name = 'GM2の名前';
