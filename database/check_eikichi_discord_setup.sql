-- えいきちさんのDiscord設定を確認

-- 1. スタッフテーブルの設定を確認
SELECT 
  id,
  name,
  discord_channel_id,
  LENGTH(discord_channel_id) as channel_id_length,
  discord_id,
  role,
  status,
  CASE 
    WHEN discord_channel_id IS NULL THEN '❌ discord_channel_id が NULL'
    WHEN discord_channel_id = '' THEN '❌ discord_channel_id が空文字'
    WHEN LENGTH(discord_channel_id) < 17 THEN '⚠️ discord_channel_id が短すぎる（正しくない可能性）'
    WHEN LENGTH(discord_channel_id) > 20 THEN '⚠️ discord_channel_id が長すぎる（正しくない可能性）'
    ELSE '✅ discord_channel_id 設定済み'
  END as channel_status
FROM staff
WHERE name LIKE '%えいきち%'
  OR name LIKE '%エイキチ%'
  OR name LIKE '%eikichi%';

-- 2. GMロールを持つスタッフ全員の設定状況
SELECT 
  name,
  discord_channel_id,
  LENGTH(discord_channel_id) as length,
  CASE 
    WHEN discord_channel_id IS NOT NULL AND discord_channel_id != '' THEN '✅'
    ELSE '❌'
  END as status
FROM staff
WHERE 'gm' = ANY(role)
  AND status = 'active'
ORDER BY name;

