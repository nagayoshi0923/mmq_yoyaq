-- SEC-P0-04 TS-0: RPC存在/シグネチャ確認（置換不要）

SELECT
  p.oid::regprocedure AS signature,
  pg_get_function_identity_arguments(p.oid) AS identity_args
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = 'approve_private_booking'
ORDER BY signature;

