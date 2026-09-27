-- 適用直前の実権限へ戻す（PUBLICには元々権限なし）。
GRANT EXECUTE ON FUNCTION public.create_private_booking_request(uuid,uuid,text,text,text,integer,jsonb,text,text,uuid) TO anon,authenticated;
