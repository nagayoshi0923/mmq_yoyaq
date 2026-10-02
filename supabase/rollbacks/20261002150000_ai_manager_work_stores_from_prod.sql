-- rollback: AI マネージャー連携の関数と表を消す。本番では AI マネージャーの作業台帳（items）が消えるので、
-- 本番で戻す場合は先に ai_manager_work_stores の中身を退避すること。
DROP FUNCTION IF EXISTS public.replace_ai_manager_work_store(uuid, integer, jsonb, uuid);
DROP TABLE IF EXISTS public.ai_manager_work_stores;
