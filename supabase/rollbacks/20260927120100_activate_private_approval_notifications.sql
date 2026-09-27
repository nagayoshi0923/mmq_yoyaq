-- 旧フロントへ戻す際に適用。保存済み通知を失わないため、配送Edge/cronは継続して残す。
GRANT EXECUTE ON FUNCTION public.approve_private_booking_with_delivery(uuid,uuid,date,time,time,uuid,uuid,jsonb,text,text,uuid) TO authenticated;
NOTIFY pgrst, 'reload schema';
