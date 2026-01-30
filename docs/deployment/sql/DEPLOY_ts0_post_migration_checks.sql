-- DEPLOY TS-0: マイグレーション適用後の存在/定義チェック（置換不要）
--
-- Supabase SQL Editor に貼り付けて実行する。

-- 1) cancel_reservation_with_lock が存在するか（1行以上返ればOK）
SELECT proname, proargtypes
FROM pg_proc
WHERE proname = 'cancel_reservation_with_lock';

-- 2) create_reservation_with_lock_v2 が存在するか（1行返ればOK）
SELECT p.oid::regprocedure AS signature
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = 'create_reservation_with_lock_v2';

-- 3) waitlist_notification_queue テーブルが存在するか（1行返ればOK）
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name = 'waitlist_notification_queue';

