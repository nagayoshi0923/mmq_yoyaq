-- QW-20260917-001 A04: preserve financial/event records and never partially delete a request.
CREATE FUNCTION public.delete_private_booking_request_atomic(p_reservation_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_user uuid:=auth.uid(); v_org uuid; v_role text; v_group_id uuid; v_group public.private_groups; v_res public.reservations;
BEGIN
 SELECT role::text INTO v_role FROM users WHERE id=v_user;
 v_org:=public.get_user_organization_id();
 IF v_user IS NULL OR v_org IS NULL OR v_role IS NULL OR v_role NOT IN ('admin','staff','license_admin') THEN
  RAISE EXCEPTION '貸切申込を削除する権限がありません' USING ERRCODE='42501';
 END IF;
 SELECT private_group_id INTO v_group_id FROM reservations WHERE id=p_reservation_id AND organization_id=v_org;
 IF NOT FOUND THEN RAISE EXCEPTION '対象の貸切申込が見つかりません' USING ERRCODE='42501'; END IF;
 -- Guest writes lock group first. Approval/cancellation lock reservation first,
 -- so never wait on the reservation while holding the group lock.
 IF v_group_id IS NOT NULL THEN
  SELECT * INTO v_group FROM private_groups WHERE id=v_group_id FOR UPDATE;
  IF NOT FOUND OR v_group.organization_id IS DISTINCT FROM v_org THEN
   RAISE EXCEPTION '申込とグループの所属を確認できません' USING ERRCODE='42501';
  END IF;
 END IF;
 SELECT * INTO v_res FROM reservations WHERE id=p_reservation_id AND organization_id=v_org FOR UPDATE NOWAIT;
 IF NOT FOUND OR v_res.private_group_id IS DISTINCT FROM v_group_id THEN
  RAISE EXCEPTION '申込が変更されました。再読み込みしてください' USING ERRCODE='40001';
 END IF;
 IF v_res.reservation_source IS DISTINCT FROM 'web_private' THEN
  RAISE EXCEPTION 'この画面から削除できるのは貸切申込のみです' USING ERRCODE='22023';
 END IF;
 IF v_res.status NOT IN ('pending','cancelled') OR v_res.schedule_event_id IS NOT NULL OR v_res.event_id IS NOT NULL
  OR EXISTS(SELECT 1 FROM schedule_events WHERE reservation_id=v_res.id)
  OR coalesce(v_res.payment_status,'pending')<>'pending' THEN
  RAISE EXCEPTION '公演・支払履歴がある申込は完全削除できません。取消操作で履歴を残してください' USING ERRCODE='22023';
 END IF;
 IF v_group_id IS NOT NULL AND (v_group.reservation_id IS NOT NULL AND v_group.reservation_id<>v_res.id
  OR EXISTS(SELECT 1 FROM reservations WHERE private_group_id=v_group_id AND id<>v_res.id)) THEN
  RAISE EXCEPTION '別の予約でも使われているグループは削除できません' USING ERRCODE='22023';
 END IF;
 INSERT INTO audit_logs(user_id,organization_id,action,resource_type,resource_id,old_values)
 VALUES(v_user,v_org,'private_booking.request_delete','reservations',v_res.id,
   jsonb_build_object('reservation',to_jsonb(v_res),'group',CASE WHEN v_group_id IS NOT NULL THEN to_jsonb(v_group) END));
 -- Restrictive FKs intentionally retain billing, coupon claims, compensation and Discord history.
 -- Any failure here or during the group cascade rolls back the audit and every deletion.
 DELETE FROM reservations WHERE id=v_res.id;
 IF v_group_id IS NOT NULL THEN DELETE FROM private_groups WHERE id=v_group_id; END IF;
EXCEPTION WHEN lock_not_available THEN
 RAISE EXCEPTION 'この申込は別の処理で更新中です。少し待って再度お試しください' USING ERRCODE='55P03';
WHEN foreign_key_violation THEN
 RAISE EXCEPTION '請求・補償・通知などの関連履歴があるため完全削除できません。取消操作で履歴を残してください' USING ERRCODE='23503';
END $$;
REVOKE ALL ON FUNCTION public.delete_private_booking_request_atomic(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.delete_private_booking_request_atomic(uuid) TO authenticated,service_role;
