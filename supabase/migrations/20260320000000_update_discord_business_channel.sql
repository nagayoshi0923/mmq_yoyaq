-- 公演中止判定・4時間前判定の通知先チャンネルを変更
UPDATE organization_settings
SET discord_business_channel_id = '1412665260908740749'
WHERE discord_business_channel_id IS NOT NULL;
