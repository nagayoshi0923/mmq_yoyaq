-- スタッフにDiscordチャンネルIDを設定
-- 各GMの個別チャンネルIDを設定する必要があります

-- まず、現在のGMスタッフを確認
SELECT 
  id,
  name,
  discord_channel_id,
  discord_id,
  status
FROM staff
WHERE 'gm' = ANY(role)
  AND status = 'active'
ORDER BY name;

-- 各GMにDiscordチャンネルIDを設定
-- ⚠️ 'YOUR_CHANNEL_ID' を実際のDiscordチャンネルIDに置き換えてください

-- 例: まつい さんのチャンネルIDを設定
-- UPDATE staff 
-- SET discord_channel_id = '1234567890123456789'
-- WHERE name = 'まつい';

-- 例: 崎 さんのチャンネルIDを設定  
-- UPDATE staff 
-- SET discord_channel_id = '1234567890123456789'
-- WHERE name = '崎';

-- 例: えいきち さんのチャンネルIDを設定
-- UPDATE staff 
-- SET discord_channel_id = '1234567890123456789'
-- WHERE name = 'えいきち';

-- 例: れみあ さんのチャンネルIDを設定
-- UPDATE staff 
-- SET discord_channel_id = '1234567890123456789'
-- WHERE name = 'れみあ';

-- 例: りえぞー さんのチャンネルIDを設定
-- UPDATE staff 
-- SET discord_channel_id = '1234567890123456789'
-- WHERE name = 'りえぞー';

-- ⚠️ 注意: 
-- 1. DiscordチャンネルIDの取得方法:
--    - Discordで開発者モードを有効化（設定 → 詳細設定 → 開発者モード）
--    - チャンネルを右クリック → 「IDをコピー」
-- 
-- 2. 各GMごとに個別のチャンネル（DM or 専用チャンネル）が必要です
--
-- 3. ボットが各チャンネルにメッセージを送信する権限を持っている必要があります

-- 設定後、確認
SELECT 
  name,
  discord_channel_id,
  CASE 
    WHEN discord_channel_id IS NOT NULL THEN '✅ 設定済み'
    ELSE '❌ 未設定'
  END as status
FROM staff
WHERE 'gm' = ANY(role)
  AND status = 'active'
ORDER BY name;

