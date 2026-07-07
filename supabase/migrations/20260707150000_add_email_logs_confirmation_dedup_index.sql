-- =============================================================================
-- 開催決定メール(performance_confirmation)の二重送信を DB レベルで防ぐ
-- 部分ユニークインデックス (#323)
--
-- cron の重複トリガーが同時並行で走ると、アプリ側の重複ガード(read)と
-- email_logs への書き込み(write)が非原子的なため TOCTOU で二重送信が起こり得る。
-- 「送信成功」を示すステータスのログを (schedule_event_id, lower(to_email)) ごとに
-- 1 件までに制限し、DB レベルで重複した成功記録が残らないようにする。
--
-- - queued / failed は対象外 → 未送信/失敗分の再送・リトライは引き続き許容する。
-- - to_email はアプリ側の重複ガードと揃えて小文字化して比較する。
-- - performance_confirmation のみに限定し、既存データへの影響を最小化する。
--
-- ロールバック:
--   DROP INDEX IF EXISTS public.uq_email_logs_performance_confirmation_sent;
-- =============================================================================

CREATE UNIQUE INDEX IF NOT EXISTS uq_email_logs_performance_confirmation_sent
  ON public.email_logs (schedule_event_id, lower(to_email))
  WHERE email_type = 'performance_confirmation'
    AND schedule_event_id IS NOT NULL
    AND status IN (
      'sent', 'delivered', 'opened', 'clicked',
      'bounced', 'complained', 'delivery_delayed'
    );
