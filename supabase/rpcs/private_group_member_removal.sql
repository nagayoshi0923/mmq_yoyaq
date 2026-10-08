-- QW-20260917-001: 既存の退出・削除動作を認証付きRPCへ移行。実データの一括変更はしない。
CREATE OR REPLACE FUNCTION public.private_group_remove_member(p_member_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE target_group uuid; target public.private_group_members%ROWTYPE; actor_role text;
BEGIN
 SELECT group_id INTO target_group FROM public.private_group_members WHERE id=p_member_id;
 IF target_group IS NULL THEN RAISE EXCEPTION 'メンバーを削除できません' USING ERRCODE='42501'; END IF;
 PERFORM 1 FROM public.private_groups WHERE id=target_group FOR UPDATE;
 actor_role:=public.private_group_actor_role(target_group);
 IF actor_role IS NULL THEN RAISE EXCEPTION 'メンバーを削除する管理権限がありません' USING ERRCODE='42501'; END IF;
 PERFORM public.lock_coupon_customer_identity((SELECT c.customer_id FROM public.customer_coupons c JOIN public.private_group_members m ON m.coupon_id=c.id WHERE m.id=p_member_id));
 PERFORM 1 FROM public.customers WHERE id=(SELECT c.customer_id FROM public.customer_coupons c JOIN public.private_group_members m ON m.coupon_id=c.id WHERE m.id=p_member_id) FOR UPDATE;
 PERFORM 1 FROM public.customer_coupons WHERE id=(SELECT coupon_id FROM public.private_group_members WHERE id=p_member_id) FOR UPDATE;
 SELECT * INTO target FROM public.private_group_members WHERE id=p_member_id AND group_id=target_group FOR UPDATE;
 IF NOT FOUND THEN RETURN; END IF;
 IF target.is_organizer AND actor_role<>'staff' THEN RAISE EXCEPTION '主催者を削除する権限がありません' USING ERRCODE='42501'; END IF;
 DELETE FROM public.private_group_members WHERE id=target.id AND group_id=target_group;
END $$;
REVOKE ALL ON FUNCTION public.private_group_remove_member(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.private_group_remove_member(uuid) TO authenticated,service_role;

CREATE OR REPLACE FUNCTION public.private_group_leave(p_group_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE organizer uuid; held record;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'ログインが必要です' USING ERRCODE='42501'; END IF;
 SELECT organizer_id INTO organizer FROM public.private_groups WHERE id=p_group_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'グループから退出できません' USING ERRCODE='42501'; END IF;
 IF organizer=auth.uid() OR EXISTS(SELECT 1 FROM public.private_group_members WHERE group_id=p_group_id AND user_id=auth.uid() AND is_organizer) THEN
  RAISE EXCEPTION '主催者は退出できません' USING ERRCODE='42501';
 END IF;
 FOR held IN SELECT cc.id,cc.customer_id FROM public.private_group_members m JOIN public.customer_coupons cc ON cc.id=m.coupon_id WHERE m.group_id=p_group_id AND m.user_id=auth.uid() ORDER BY cc.customer_id,cc.id LOOP
  PERFORM public.lock_coupon_customer_identity(held.customer_id);
  PERFORM 1 FROM public.customers WHERE id=held.customer_id FOR UPDATE;
  PERFORM 1 FROM public.customer_coupons WHERE id=held.id FOR UPDATE;
 END LOOP;
 -- 既存の同一user_idの複数行がある場合も、他人の行を残して本人だけを退出させる。
 DELETE FROM public.private_group_members WHERE group_id=p_group_id AND user_id=auth.uid();
END $$;
REVOKE ALL ON FUNCTION public.private_group_leave(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.private_group_leave(uuid) TO authenticated,service_role;
