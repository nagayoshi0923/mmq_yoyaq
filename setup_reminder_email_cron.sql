-- リマインダーメール自動送信用のCron Job設定
-- Supabase Dashboard → SQL Editor で実行してください

-- ステップ1: pg_cron拡張機能を有効化（必須）
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- ステップ2: pg_net拡張機能を有効化（HTTP POST用）
CREATE EXTENSION IF NOT EXISTS pg_net;

-- 既存のCron Jobがある場合は削除（初回は不要）
-- SELECT cron.unschedule('auto-send-reminder-emails');

-- 毎日 9:00 AM UTC（日本時間 18:00）に実行
-- 注意: YOUR_ANON_KEY の部分を実際の Supabase Anon Key に置き換えてください
-- Supabase Dashboard → Settings → API → anon/public key で確認できます
SELECT cron.schedule(
  'auto-send-reminder-emails',
  '0 9 * * *',
  $$
  SELECT net.http_post(
    url := 'https://cznpcewciwywcqcxktba.supabase.co/functions/v1/auto-send-reminder-emails',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer YOUR_ANON_KEY_HERE'
    ),
    body := '{}'::jsonb
  ) AS request_id;
  $$
);

-- 確認: 登録されたCron Jobを確認
-- SELECT * FROM cron.job WHERE jobname = 'auto-send-reminder-emails';

