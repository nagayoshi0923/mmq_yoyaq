-- 重要RPCの timezone 設定確認（Asia/Tokyo になっているか）
SELECT
  n.nspname AS schema_name,
  p.proname AS function_name,
  p.oid::regprocedure::text AS signature,
  COALESCE(array_to_string(p.proconfig, ', '), '(no config)') AS function_config
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN (
    'check_performances_day_before',
    'check_performances_four_hours_before',
    'create_reservation_with_lock_v2',
    'create_reservation_with_lock'
  )
ORDER BY p.proname, signature;

