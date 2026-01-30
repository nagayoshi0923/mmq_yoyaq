-- SEC-P1-XX TS-0: booking_email_queue の冪等性制約確認（置換不要）

SELECT
  EXISTS (
    SELECT 1
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind = 'i'
      AND c.relname = 'booking_email_queue_reservation_type_unique'
  ) AS unique_index_exists;

