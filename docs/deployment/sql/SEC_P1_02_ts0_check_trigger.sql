-- SEC-P1-02 TS-0: current_participants 再計算トリガの存在確認（置換不要）

SELECT
  EXISTS (
    SELECT 1
    FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = 'reservations'
      AND t.tgname = 'trigger_recalc_participants'
      AND NOT t.tgisinternal
  ) AS trigger_exists;

