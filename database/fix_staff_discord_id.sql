-- えいきちのDiscord IDを確認・設定

-- 現在の状態を確認
SELECT id, name, discord_id, discord_channel_id 
FROM staff 
WHERE name = 'えいきち';

-- Discord IDを設定（discord_idカラムに設定する必要があります）
-- ログから確認されたDiscord ID: 575304486784860160
UPDATE staff
SET discord_id = '575304486784860160'
WHERE name = 'えいきち';

-- 設定後の確認
SELECT id, name, discord_id, discord_channel_id 
FROM staff 
WHERE name = 'えいきち';

-- 全GMのDiscord ID設定状況を確認
-- （以下のクエリを実行してください）
SELECT 
  name,
  discord_id,
  discord_channel_id,
  CASE 
    WHEN discord_id IS NOT NULL AND discord_id != '' THEN 'OK'
    ELSE 'NG'
  END as discord_id_status,
  CASE 
    WHEN discord_channel_id IS NOT NULL AND discord_channel_id != '' THEN 'OK'
    ELSE 'NG'
  END as channel_id_status
FROM staff
WHERE role = 'gm' OR role = 'admin'
ORDER BY name;

