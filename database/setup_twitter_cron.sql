-- =====================================================
-- Twitter自動ツイートのCronジョブ設定
-- 毎日19:00 JSTに翌日の空き公演をツイート
-- =====================================================

-- pg_netとpg_cronの有効化（まだの場合）
-- Supabaseダッシュボードの Database > Extensions から有効化してください

-- 既存のジョブがあれば削除
SELECT cron.unschedule('tweet-available-seats-daily');

-- 毎日19:00 JST（10:00 UTC）に実行
-- 注意: Supabaseのcronはデフォルトでタイムゾーン指定が必要
SELECT cron.schedule(
  'tweet-available-seats-daily',
  '0 10 * * *',  -- 10:00 UTC = 19:00 JST
  $$
  SELECT net.http_post(
    url := current_setting('app.settings.supabase_url') || '/functions/v1/tweet-available-seats',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key')
    ),
    body := '{}'::jsonb
  );
  $$
);

-- ジョブの確認
SELECT * FROM cron.job WHERE jobname = 'tweet-available-seats-daily';

-- =====================================================
-- 手動でURLとキーを直接指定する場合はこちらを使用
-- =====================================================
-- SELECT cron.schedule(
--   'tweet-available-seats-daily',
--   '0 10 * * *',
--   $$
--   SELECT net.http_post(
--     url := 'https://YOUR_PROJECT_REF.supabase.co/functions/v1/tweet-available-seats',
--     headers := '{"Content-Type": "application/json", "Authorization": "Bearer YOUR_SERVICE_ROLE_KEY"}'::jsonb,
--     body := '{}'::jsonb
--   );
--   $$
-- );

-- =====================================================
-- デバッグ用: 手動実行テスト
-- =====================================================
-- SELECT net.http_post(
--   url := 'https://YOUR_PROJECT_REF.supabase.co/functions/v1/tweet-available-seats',
--   headers := '{"Content-Type": "application/json", "Authorization": "Bearer YOUR_SERVICE_ROLE_KEY"}'::jsonb,
--   body := '{}'::jsonb
-- );





