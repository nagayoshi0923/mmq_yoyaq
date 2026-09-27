-- 先にフロントを旧経路へ戻す。保存済み候補・通知・再送記録は保持する。
BEGIN;
DROP FUNCTION IF EXISTS public.private_group_add_candidate_dates(uuid,uuid,uuid,uuid[],jsonb);
DROP FUNCTION IF EXISTS public.private_booking_store_day_slots(date,jsonb,boolean,boolean);
COMMIT;
