-- フロントを直前の版に戻してから実行。既存予約は変更しない。
DROP FUNCTION IF EXISTS public.add_manual_reservations(jsonb);
