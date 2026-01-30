-- SEC-P1-03 TS-0: 監査証跡テーブル/トリガの存在確認（置換不要）

SELECT
  to_regclass('public.reservations_history') AS reservations_history_table,
  EXISTS (
    SELECT 1
    FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = 'reservations'
      AND t.tgname = 'trg_reservations_history'
      AND NOT t.tgisinternal
  ) AS trigger_exists;

