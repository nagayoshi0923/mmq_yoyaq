-- DEPLOY TS-2: pg_cron を使った在庫整合性チェックの定期実行設定
--
-- 注意:
-- - Supabase の設定/権限によっては pg_cron が使えない場合があります。
-- - 実行後、cron.job に登録されていることを確認してください。

-- pg_cron 拡張が有効か確認
SELECT * FROM pg_extension WHERE extname = 'pg_cron';

-- 有効でない場合は有効化
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- 毎日 5:00 AM JST（UTC 20:00）に在庫整合性チェックを実行
SELECT cron.schedule(
  'daily-inventory-consistency-check',
  '0 20 * * *',  -- UTC 20:00 = JST 05:00
  $$SELECT run_inventory_consistency_check();$$
);

-- ジョブが登録されたか確認
SELECT * FROM cron.job;

