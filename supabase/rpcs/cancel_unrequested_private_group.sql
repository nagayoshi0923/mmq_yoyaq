CREATE OR REPLACE FUNCTION public.cancel_unrequested_private_group(p_group_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE g public.private_groups%ROWTYPE; r record;
BEGIN
 SELECT * INTO g FROM public.private_groups WHERE id=p_group_id FOR UPDATE;
 IF NOT FOUND OR auth.uid() IS NULL OR g.organizer_id IS DISTINCT FROM auth.uid() THEN
   RAISE EXCEPTION 'このグループをキャンセルする権限がありません' USING ERRCODE='42501';
 END IF;
 IF g.status NOT IN ('gathering','date_adjusting','cancelled') OR g.status IS NULL THEN
   RAISE EXCEPTION '予約申込済みのため、グループだけをキャンセルできません。予約の取消手続きを行ってください。' USING ERRCODE='22023';
 END IF;
 -- group-first の申込と直列化。reservation-first の承認・取消とは待ち合わない。
 FOR r IN SELECT id,status,organization_id,private_group_id FROM public.reservations
   WHERE id=g.reservation_id OR private_group_id=g.id FOR SHARE NOWAIT
 LOOP
   IF r.organization_id IS DISTINCT FROM g.organization_id OR r.private_group_id IS DISTINCT FROM g.id THEN
     RAISE EXCEPTION '予約とグループの紐づきを確認できません。店舗へお問い合わせください。' USING ERRCODE='P0051';
   END IF;
   IF r.status IS DISTINCT FROM 'cancelled' THEN
     RAISE EXCEPTION '有効な予約があるため、グループだけをキャンセルできません。予約の取消手続きを行ってください。' USING ERRCODE='22023';
   END IF;
 END LOOP;
 IF g.reservation_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.reservations WHERE id=g.reservation_id) THEN
   RAISE EXCEPTION '紐づく予約を確認できません。店舗へお問い合わせください。' USING ERRCODE='P0051';
 END IF;
 UPDATE public.private_groups SET status='cancelled',updated_at=now() WHERE id=g.id AND status!='cancelled';
 RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.cancel_unrequested_private_group(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.cancel_unrequested_private_group(uuid) TO authenticated,service_role;
