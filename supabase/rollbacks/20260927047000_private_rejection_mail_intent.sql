-- 先にAPIを旧入口へ戻す。送信予定・結果は監査のため削除せず保持する。
-- 配送ワーカーは先に停止し、旧メール送信との重複を確認する。
BEGIN;
DROP FUNCTION IF EXISTS public.complete_private_rejection_delivery(uuid,uuid,text,timestamptz);
DROP FUNCTION IF EXISTS public.retry_private_rejection_delivery(uuid);
DROP FUNCTION IF EXISTS public.get_private_rejection_delivery_status(uuid[]);
DROP FUNCTION IF EXISTS public.reject_private_booking_with_delivery(uuid,text);
COMMIT;
