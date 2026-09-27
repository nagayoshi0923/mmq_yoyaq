-- フロントを旧版に戻し、120100の権限を復元した後に実行する。
-- 保存済みの配送/受付照合/監査履歴は消さない。配送Edgeとcronは既存の配送が終わるまで維持する。
REVOKE EXECUTE ON FUNCTION public.approve_private_booking_with_notifications(uuid,uuid,date,time,time,uuid,uuid,jsonb,text,text,uuid) FROM PUBLIC,anon,authenticated;
REVOKE EXECUTE ON FUNCTION public.retry_private_unsent_delivery(text,uuid) FROM PUBLIC,anon,authenticated;
REVOKE EXECUTE ON FUNCTION public.resume_private_approval_preparation(uuid) FROM PUBLIC,anon,authenticated;
NOTIFY pgrst, 'reload schema';
