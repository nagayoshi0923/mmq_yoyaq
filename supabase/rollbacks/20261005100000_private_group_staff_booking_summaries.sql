-- rollback: 貸切予約管理の一覧用の読み込みを取り除く（画面は private_group_read_list に戻す版と合わせて戻す）
DROP FUNCTION IF EXISTS public.private_group_read_staff_booking_summaries(uuid,uuid[]);
