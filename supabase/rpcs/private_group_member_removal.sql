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

-- 「メンバーを外す」（マイページ改修 段階 2）。チャットに記録し、申込済み・確定後は店舗へ人数変更を知らせる。
CREATE OR REPLACE FUNCTION public.private_group_remove_member_with_notice(p_member_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE target public.private_group_members%ROWTYPE; g public.private_groups%ROWTYPE; r public.reservations%ROWTYPE;
 v_name text; v_before integer; v_channel text; v_body text; v_store boolean:=false;
BEGIN
 SELECT * INTO target FROM public.private_group_members WHERE id=p_member_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'メンバーを削除できません' USING ERRCODE='42501'; END IF;
 SELECT * INTO g FROM public.private_groups WHERE id=target.group_id;
 SELECT count(*) INTO v_before FROM public.private_group_members WHERE group_id=g.id AND status='joined';
 v_name:=CASE WHEN target.user_id IS NULL THEN nullif(btrim(target.guest_name),'') ELSE coalesce(
   (SELECT coalesce(nullif(c.nickname,''),nullif(c.name,'')) FROM public.customers c WHERE c.user_id=target.user_id ORDER BY c.id LIMIT 1),
   nullif(btrim(target.guest_name),'')) END;
 -- 権限確認・クーポン解放・削除は既存の関数に任せる（主催者・スタッフのみ）
 PERFORM public.private_group_remove_member(p_member_id);
 IF EXISTS(SELECT 1 FROM public.private_group_members WHERE id=p_member_id) THEN
  RAISE EXCEPTION 'メンバーを外せませんでした' USING ERRCODE='P0001';
 END IF;
 IF target.status IS DISTINCT FROM 'joined' THEN RETURN jsonb_build_object('store_notified',false); END IF;
 INSERT INTO public.private_group_messages(group_id,sender_type,message) VALUES(g.id,'system',
  jsonb_build_object('type','system','action','member_removed','memberName',coalesce(v_name,'メンバー'))::text);
 -- 申込済み・確定後は店舗へ人数変更として知らせる（申込が取り消されていれば知らせない）
 SELECT * INTO r FROM public.reservations
  WHERE (id=g.reservation_id OR private_group_id=g.id) AND organization_id=g.organization_id AND status<>'cancelled'
  ORDER BY (id=g.reservation_id) DESC, created_at DESC LIMIT 1;
 IF FOUND AND g.status IN ('booking_requested','confirmed') THEN
  SELECT nullif(btrim(notification_settings->>'private_cancellation_channel_id'),'')
   INTO v_channel FROM public.organization_settings WHERE organization_id=g.organization_id;
  IF v_channel ~ '^[0-9]{17,20}$' THEN
   v_body:=format('貸切グループのメンバーが外れました（人数変更）。%s作品：%s%s予約番号：%s%s状態：%s%s参加人数：%s名 → %s名（申込時 %s名）%s外れた方：%s',
    chr(10), coalesce(nullif(regexp_replace(coalesce(r.title,''),'^【貸切希望】|^【貸切】',''),''),'不明'),
    chr(10), coalesce(r.reservation_number,'不明'),
    chr(10), CASE WHEN g.status='confirmed' THEN '確定済み' ELSE '申込中（店舗の確認待ち）' END,
    chr(10), v_before, greatest(v_before-1,0), coalesce(r.participant_count::text,'不明'),
    chr(10), coalesce(v_name,'メンバー'));
   INSERT INTO public.discord_notification_queue
    (organization_id,notification_type,reference_id,dedupe_key,webhook_url,message_payload,max_retries)
   VALUES (g.organization_id,'private_cancellation',NULL,
    r.id::text||':member_removed:'||p_member_id::text,
    'https://discord.com/api/v10/channels/'||v_channel||'/messages',
    jsonb_build_object('content',v_body,'channel_id',v_channel,'reservation_id',r.id,'epoch',r.id,
     'allowed_mentions',jsonb_build_object('parse','[]'::jsonb)),3)
   ON CONFLICT (organization_id,notification_type,dedupe_key) DO NOTHING;
   v_store:=true;
  END IF;
 END IF;
 RETURN jsonb_build_object('store_notified',v_store);
END $function$;
REVOKE ALL ON FUNCTION public.private_group_remove_member_with_notice(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.private_group_remove_member_with_notice(uuid) TO authenticated,service_role;
