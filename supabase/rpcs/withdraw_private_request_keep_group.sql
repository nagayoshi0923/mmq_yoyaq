-- 店舗の返事待ちの貸切申込を、グループを残したまま取り下げる（2026-10-20 社長決定）。
-- 「グループも閉じる」は従来どおり cancel_reservation_and_group_with_notice（/api/reservations?action=cancel-with-group-lock）。
-- 残す場合: 申込（予約）は取消（理由「お客様による貸切申込の取り下げ」）にし、グループは募集中（gathering）へ戻す。
-- 候補日・日程の回答・メンバー・チャットはそのまま。グループの reservation_id は取消済みの申込を指したまま残す
-- （申込し直しは create_private_booking_request_with_notice が「紐づく申込が取消済み」なら受け付ける。店舗の却下後と同じ形）。
-- グループを先に戻してから申込を取り消す（申込取消のお知らせのトリガーが「グループは残っている」を見て文面を変えるため）。
-- 呼べるのは申込者本人かつグループの主催者だけ。取消済み・返事待ちでない申込は理由付きのエラー（二重実行は P0054）。
CREATE OR REPLACE FUNCTION public.withdraw_private_request_keep_group(p_reservation_id uuid)
 RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' SET row_security TO 'off' AS $function$
DECLARE
 r public.reservations%ROWTYPE;
 g public.private_groups%ROWTYPE;
 v_member uuid;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='P0009'; END IF;
 SELECT * INTO r FROM public.reservations WHERE id=p_reservation_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'RESERVATION_NOT_FOUND' USING ERRCODE='P0005'; END IF;
 IF NOT EXISTS (SELECT 1 FROM public.customers c WHERE c.id=r.customer_id AND c.user_id=auth.uid()) THEN
  RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='P0009';
 END IF;
 IF r.status='cancelled' THEN RAISE EXCEPTION 'PRIVATE_REQUEST_ALREADY_CANCELLED' USING ERRCODE='P0054'; END IF;
 IF r.private_group_id IS NULL OR r.schedule_event_id IS NOT NULL
   OR r.status NOT IN ('pending','pending_gm','gm_confirmed','pending_store') THEN
  RAISE EXCEPTION 'PRIVATE_REQUEST_NOT_PENDING' USING ERRCODE='P0055';
 END IF;
 -- 申込処理（グループ→予約の順にロック）と競合したら待たずに再試行してもらう
 SELECT * INTO g FROM public.private_groups WHERE id=r.private_group_id FOR UPDATE NOWAIT;
 IF NOT FOUND OR g.organization_id IS DISTINCT FROM r.organization_id THEN
  RAISE EXCEPTION 'PRIVATE_GROUP_ORGANIZATION_MISMATCH' USING ERRCODE='P0050';
 END IF;
 IF g.reservation_id IS DISTINCT FROM r.id THEN
  RAISE EXCEPTION 'PRIVATE_GROUP_RESERVATION_MISMATCH' USING ERRCODE='P0051';
 END IF;
 IF g.organizer_id IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='P0009'; END IF;
 IF g.status IS DISTINCT FROM 'booking_requested' THEN
  RAISE EXCEPTION 'PRIVATE_REQUEST_NOT_PENDING' USING ERRCODE='P0055';
 END IF;

 UPDATE public.private_groups SET status='gathering', updated_at=now() WHERE id=g.id;
 UPDATE public.reservations
  SET status='cancelled', cancelled_at=now(), cancellation_reason='お客様による貸切申込の取り下げ', updated_at=now()
  WHERE id=r.id;

 SELECT m.id INTO v_member FROM public.private_group_members m
  WHERE m.group_id=g.id AND m.user_id=auth.uid() AND m.is_organizer=true
  ORDER BY m.created_at, m.id LIMIT 1;
 INSERT INTO public.private_group_messages(group_id, member_id, message) VALUES (g.id, v_member,
  jsonb_build_object('type','system','action','booking_withdrawn','reservationId',r.id,
   'title','申込を取り下げました。候補日を直してもう一度申し込めます')::text);
 RETURN true;
END $function$;
REVOKE ALL ON FUNCTION public.withdraw_private_request_keep_group(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.withdraw_private_request_keep_group(uuid) TO authenticated, service_role;
