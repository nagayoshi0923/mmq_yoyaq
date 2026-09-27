-- 新しい予約画面の本番配信後に適用。予約本体はSECURITY DEFINERの新入口からだけ呼ぶ。
-- service_roleと関数所有者の権限、既存RLS/テーブル権限は変更しない。
REVOKE EXECUTE ON FUNCTION public.create_private_booking_request(uuid,uuid,text,text,text,integer,jsonb,text,text,uuid) FROM PUBLIC,anon,authenticated;
