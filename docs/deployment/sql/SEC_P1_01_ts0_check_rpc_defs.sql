-- SEC-P1-01 TS-0: 予約制限強制がRPC定義に含まれることを確認（置換不要）

SELECT
  p.oid::regprocedure AS signature,
  pg_get_functiondef(p.oid) AS definition
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN ('create_reservation_with_lock_v2', 'create_reservation_with_lock')
ORDER BY signature;

