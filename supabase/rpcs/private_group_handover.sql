-- マイページ改修 段階 3「主催者の引き継ぎ」の RPC（migration 20261009120000）。表は supabase/schemas/private_group_handover_requests.sql
-- 仕様: docs/product-spec/マイページ改修_2026-10.md「段階 3」

-- 表示名（ニックネーム→氏名→グループでの名前）。段階 2 の「外す」の知らせと同じ順
CREATE OR REPLACE FUNCTION public.private_group_handover_user_name(p_user_id uuid, p_group_id uuid)
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
 SELECT coalesce(
  (SELECT coalesce(nullif(c.nickname,''),nullif(c.name,'')) FROM public.customers c WHERE c.user_id=p_user_id ORDER BY c.id LIMIT 1),
  (SELECT nullif(btrim(m.guest_name),'') FROM public.private_group_members m WHERE m.group_id=p_group_id AND m.user_id=p_user_id ORDER BY m.id LIMIT 1),
  'メンバー')
$function$;
REVOKE ALL ON FUNCTION public.private_group_handover_user_name(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.private_group_handover_user_name(uuid,uuid) TO service_role;

-- 依頼を閉じる（断る・取り消し・期限切れ）。両者に通知ベル、チャットに記録を残す
CREATE OR REPLACE FUNCTION public.private_group_handover_close(p_request_id uuid, p_status text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE h public.private_group_handover_requests%ROWTYPE; g public.private_groups%ROWTYPE;
 v_from text; v_to text; v_title text; v_body text; v_work text;
BEGIN
 IF p_status NOT IN ('declined','cancelled','expired') THEN RAISE EXCEPTION '引き継ぎ依頼の状態が正しくありません' USING ERRCODE='22023'; END IF;
 UPDATE public.private_group_handover_requests SET status=p_status,responded_at=now(),updated_at=now()
  WHERE id=p_request_id AND status='requested' RETURNING * INTO h;
 IF NOT FOUND THEN RETURN false; END IF;
 SELECT * INTO g FROM public.private_groups WHERE id=h.group_id;
 v_from:=public.private_group_handover_user_name(h.from_user_id,h.group_id);
 v_to:=public.private_group_handover_user_name(h.to_user_id,h.group_id);
 v_work:=coalesce((SELECT s.title FROM public.scenario_masters s WHERE s.id=g.scenario_master_id),'貸切');
 IF p_status='declined' THEN
  v_title:='主催者の引き継ぎは断られました';
  v_body:=format('%sさんが、%sさんからの主催者の引き継ぎ依頼を断りました。主催者は%sさんのままです。',v_to,v_from,v_from);
 ELSIF p_status='cancelled' THEN
  v_title:='主催者の引き継ぎ依頼が取り消されました';
  v_body:=format('%sさんから%sさんへの主催者の引き継ぎ依頼は取り消されました。主催者は%sさんのままです。',v_from,v_to,v_from);
 ELSE
  v_title:='主催者の引き継ぎ依頼の期限が切れました';
  v_body:=format('%sさんから%sさんへの主催者の引き継ぎ依頼は、期限（72 時間）までに同意がなかったため終了しました。主催者は%sさんのままです。',v_from,v_to,v_from);
 END IF;
 INSERT INTO public.private_group_messages(group_id,sender_type,message) VALUES(h.group_id,'system',
  jsonb_build_object('type','system','action','organizer_handover','result',p_status,'title',v_title,'body',v_body,'handover_request_id',h.id)::text);
 INSERT INTO public.user_notifications(user_id,organization_id,type,title,message,link,metadata)
 SELECT u,h.organization_id,'system',v_title,format('「%s」の貸切: %s',v_work,v_body),'/group/invite/'||g.invite_code,
  jsonb_build_object('kind','private_group_handover','request_id',h.id,'group_id',h.group_id,'status',p_status)
 FROM unnest(ARRAY[h.from_user_id,h.to_user_id]) AS u;
 -- メール通知は段階 4（通知の整備）で足す。ここで両者へ送る。
 RETURN true;
END $function$;
REVOKE ALL ON FUNCTION public.private_group_handover_close(uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.private_group_handover_close(uuid,text) TO service_role;

-- 読み取り時に依頼の状態を寄せる。期限切れ→expired。グループが閉じた・主催者が変わった・宛先が抜けた→cancelled
CREATE OR REPLACE FUNCTION public.private_group_handover_settle(p_group_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE h record;
BEGIN
 FOR h IN SELECT r.id,r.expires_at,r.to_member_id,r.to_user_id,r.from_user_id,g.status AS group_status,g.organizer_id
  FROM public.private_group_handover_requests r JOIN public.private_groups g ON g.id=r.group_id
  WHERE r.group_id=p_group_id AND r.status='requested' LOOP
  IF h.group_status='cancelled' OR h.organizer_id IS DISTINCT FROM h.from_user_id
   OR NOT EXISTS(SELECT 1 FROM public.private_group_members m WHERE m.id=h.to_member_id AND m.user_id=h.to_user_id AND m.status='joined') THEN
   PERFORM public.private_group_handover_close(h.id,'cancelled');
  ELSIF h.expires_at<=now() THEN
   PERFORM public.private_group_handover_close(h.id,'expired');
  END IF;
 END LOOP;
END $function$;
REVOKE ALL ON FUNCTION public.private_group_handover_settle(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.private_group_handover_settle(uuid) TO service_role;

-- 依頼する（主催者のみ。宛先は会員＝アカウントのある参加中メンバー）
CREATE OR REPLACE FUNCTION public.private_group_handover_request(p_group_id uuid, p_to_member_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE g public.private_groups%ROWTYPE; target public.private_group_members%ROWTYPE; me public.private_group_members%ROWTYPE;
 res public.reservations%ROWTYPE; v_id uuid; v_expires timestamptz; v_from text; v_to text; v_work text; v_due text; v_body text;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'ログインが必要です' USING ERRCODE='42501'; END IF;
 SELECT * INTO g FROM public.private_groups WHERE id=p_group_id FOR UPDATE;
 IF NOT FOUND OR g.organizer_id IS DISTINCT FROM auth.uid() THEN
  RAISE EXCEPTION '主催者だけが引き継ぎを依頼できます' USING ERRCODE='42501';
 END IF;
 IF g.status NOT IN ('gathering','date_adjusting','booking_requested','confirmed') THEN
  RAISE EXCEPTION 'このグループでは主催者の引き継ぎを依頼できません' USING ERRCODE='22023';
 END IF;
 PERFORM public.private_group_handover_settle(g.id);
 IF EXISTS(SELECT 1 FROM public.private_group_handover_requests WHERE group_id=g.id AND status='requested') THEN
  RAISE EXCEPTION 'すでに主催者の引き継ぎを依頼しています。取り消してから依頼し直してください' USING ERRCODE='23505';
 END IF;
 SELECT * INTO target FROM public.private_group_members WHERE id=p_to_member_id AND group_id=g.id AND status='joined';
 IF NOT FOUND THEN RAISE EXCEPTION '引き継ぐメンバーが見つかりません' USING ERRCODE='22023'; END IF;
 IF target.user_id IS NULL THEN RAISE EXCEPTION 'ゲストには引き継げません。主催者になるにはアカウント登録が必要です' USING ERRCODE='22023'; END IF;
 IF target.user_id=auth.uid() OR target.is_organizer THEN RAISE EXCEPTION 'このメンバーには引き継げません' USING ERRCODE='22023'; END IF;
 SELECT * INTO me FROM public.private_group_members WHERE group_id=g.id AND user_id=auth.uid() AND status='joined' ORDER BY is_organizer DESC,id LIMIT 1;
 SELECT * INTO res FROM public.reservations
  WHERE (id=g.reservation_id OR private_group_id=g.id) AND organization_id=g.organization_id AND status<>'cancelled'
  ORDER BY (id=g.reservation_id) DESC, created_at DESC LIMIT 1;
 v_expires:=now()+interval '72 hours';
 INSERT INTO public.private_group_handover_requests(organization_id,group_id,reservation_id,from_member_id,to_member_id,from_user_id,to_user_id,expires_at)
 VALUES(g.organization_id,g.id,res.id,me.id,target.id,auth.uid(),target.user_id,v_expires) RETURNING id INTO v_id;
 v_from:=public.private_group_handover_user_name(auth.uid(),g.id);
 v_to:=public.private_group_handover_user_name(target.user_id,g.id);
 v_work:=coalesce((SELECT s.title FROM public.scenario_masters s WHERE s.id=g.scenario_master_id),'貸切');
 v_due:=to_char(v_expires AT TIME ZONE 'Asia/Tokyo','FMMM/FMDD')
  ||'('||(ARRAY['日','月','火','水','木','金','土'])[extract(dow FROM v_expires AT TIME ZONE 'Asia/Tokyo')::int+1]||') '
  ||to_char(v_expires AT TIME ZONE 'Asia/Tokyo','HH24:MI');
 v_body:=format('%sさんから「%s」の貸切の主催者の引き継ぎを頼まれています。引き継ぐと、あなたが申込者（店舗への連絡先・キャンセル料の負担者）になります。同意するまでは%sさんが主催者のままです。%sまでに内容を確認してください。',
  v_from,v_work,v_from,v_due);
 -- 宛先本人だけに見えるお知らせ（個別お知らせと同じ表示・読み取り制限）に「確認する」を出す
 INSERT INTO public.private_group_messages(group_id,sender_type,message) VALUES(g.id,'system',
  jsonb_build_object('type','system','action','individual_notice','target_member_id',target.id,'target_member_name',v_to,
   'target_user_id',target.user_id,'message',v_body,'handover_request_id',v_id,'title','主催者の引き継ぎのお願い')::text);
 INSERT INTO public.user_notifications(user_id,organization_id,type,title,message,link,metadata)
 VALUES(target.user_id,g.organization_id,'system','主催者の引き継ぎを頼まれています',v_body,
  '/group/invite/'||g.invite_code||'?sheet=handover',
  jsonb_build_object('kind','private_group_handover','request_id',v_id,'group_id',g.id,'status','requested'));
 -- メール通知は段階 4（通知の整備）で足す。ここで新主催者（宛先）へ送る。
 RETURN jsonb_build_object('id',v_id,'expires_at',v_expires);
END $function$;
REVOKE ALL ON FUNCTION public.private_group_handover_request(uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.private_group_handover_request(uuid,uuid) TO authenticated,service_role;

-- 依頼を取り消す（依頼した本人）
CREATE OR REPLACE FUNCTION public.private_group_handover_cancel(p_request_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_group uuid; v_status text;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'ログインが必要です' USING ERRCODE='42501'; END IF;
 SELECT group_id INTO v_group FROM public.private_group_handover_requests WHERE id=p_request_id AND from_user_id=auth.uid();
 IF NOT FOUND THEN RAISE EXCEPTION '引き継ぎの依頼が見つかりません' USING ERRCODE='42501'; END IF;
 PERFORM 1 FROM public.private_groups WHERE id=v_group FOR UPDATE;
 PERFORM public.private_group_handover_settle(v_group);
 SELECT status INTO v_status FROM public.private_group_handover_requests WHERE id=p_request_id;
 IF v_status<>'requested' THEN RETURN jsonb_build_object('ok',false,'status',v_status); END IF;
 PERFORM public.private_group_handover_close(p_request_id,'cancelled');
 RETURN jsonb_build_object('ok',true,'status','cancelled');
END $function$;
REVOKE ALL ON FUNCTION public.private_group_handover_cancel(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.private_group_handover_cancel(uuid) TO authenticated,service_role;

-- 断る（宛先の本人）
CREATE OR REPLACE FUNCTION public.private_group_handover_decline(p_request_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_group uuid; v_status text;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'ログインが必要です' USING ERRCODE='42501'; END IF;
 SELECT group_id INTO v_group FROM public.private_group_handover_requests WHERE id=p_request_id AND to_user_id=auth.uid();
 IF NOT FOUND THEN RAISE EXCEPTION '引き継ぎの依頼が見つかりません' USING ERRCODE='42501'; END IF;
 PERFORM 1 FROM public.private_groups WHERE id=v_group FOR UPDATE;
 PERFORM public.private_group_handover_settle(v_group);
 SELECT status INTO v_status FROM public.private_group_handover_requests WHERE id=p_request_id;
 IF v_status<>'requested' THEN RETURN jsonb_build_object('ok',false,'status',v_status); END IF;
 PERFORM public.private_group_handover_close(p_request_id,'declined');
 RETURN jsonb_build_object('ok',true,'status','declined');
END $function$;
REVOKE ALL ON FUNCTION public.private_group_handover_decline(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.private_group_handover_decline(uuid) TO authenticated,service_role;

-- 同意する（宛先の本人）。主催者・メンバーの立場・申込者（予約の連絡先）・チャット・店舗への知らせ・記録を 1 トランザクションで切り替える
CREATE OR REPLACE FUNCTION public.private_group_handover_accept(p_request_id uuid, p_customer_id uuid, p_contact_name text, p_contact_phone text, p_displayed_policy jsonb DEFAULT NULL::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_group uuid; h public.private_group_handover_requests%ROWTYPE; g public.private_groups%ROWTYPE;
 cust public.customers%ROWTYPE; res public.reservations%ROWTYPE; has_res boolean:=false;
 v_name text; v_phone text; v_email text; v_policy jsonb; v_prev jsonb; v_from text; v_to text; v_work text;
 v_channel text; v_body text; v_store boolean:=false;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'ログインが必要です' USING ERRCODE='42501'; END IF;
 SELECT group_id INTO v_group FROM public.private_group_handover_requests WHERE id=p_request_id AND to_user_id=auth.uid();
 IF NOT FOUND THEN RAISE EXCEPTION '引き継ぎの依頼が見つかりません' USING ERRCODE='42501'; END IF;
 SELECT * INTO g FROM public.private_groups WHERE id=v_group FOR UPDATE;
 PERFORM public.private_group_handover_settle(g.id);
 SELECT * INTO h FROM public.private_group_handover_requests WHERE id=p_request_id FOR UPDATE;
 IF h.status<>'requested' THEN RETURN jsonb_build_object('ok',false,'status',h.status); END IF;
 IF h.organization_id IS DISTINCT FROM g.organization_id THEN RAISE EXCEPTION '引き継ぎの依頼が見つかりません' USING ERRCODE='42501'; END IF;
 v_name:=btrim(coalesce(p_contact_name,''));
 IF v_name='' OR length(v_name)>100 THEN RAISE EXCEPTION 'お名前を入力してください' USING ERRCODE='22023'; END IF;
 v_phone:=btrim(coalesce(p_contact_phone,''));
 IF regexp_replace(v_phone,'[-[:space:]]','','g') !~ '^[0-9]{10,11}$' THEN RAISE EXCEPTION '電話番号は10〜11桁で入力してください' USING ERRCODE='P0022'; END IF;
 -- 申込者になる本人の顧客情報（共通〔組織なし〕か、このグループと同じ組織のものだけ）
 SELECT * INTO cust FROM public.customers WHERE id=p_customer_id AND user_id=auth.uid();
 IF NOT FOUND OR (cust.organization_id IS NOT NULL AND cust.organization_id<>g.organization_id) THEN
  RAISE EXCEPTION 'お客様情報を確認できませんでした' USING ERRCODE='42501';
 END IF;
 v_email:=coalesce(nullif(btrim(cust.email),''),(SELECT nullif(btrim(u.email),'') FROM auth.users u WHERE u.id=auth.uid()));
 IF v_email IS NULL THEN RAISE EXCEPTION 'メールアドレスを確認できませんでした' USING ERRCODE='22023'; END IF;
 v_from:=public.private_group_handover_user_name(h.from_user_id,g.id);
 v_to:=public.private_group_handover_user_name(h.to_user_id,g.id);
 v_work:=coalesce((SELECT s.title FROM public.scenario_masters s WHERE s.id=g.scenario_master_id),'貸切');
 SELECT * INTO res FROM public.reservations
  WHERE (id=g.reservation_id OR private_group_id=g.id) AND organization_id=g.organization_id AND status<>'cancelled'
  ORDER BY (id=g.reservation_id) DESC, created_at DESC LIMIT 1 FOR UPDATE;
 has_res:=FOUND;
 IF has_res THEN
  v_prev:=jsonb_build_object('customer_id',res.customer_id,'customer_name',res.customer_name,'customer_email',res.customer_email,
   'customer_phone',res.customer_phone,'user_id',h.from_user_id,'display_name',v_from);
  -- 申込時に固定された規定があれば、その版を同意の記録にする（画面もその版を出している）
  IF res.cancellation_policy_snapshot_version=1 AND res.cancellation_policy_store_id IS NOT NULL THEN
   v_policy:=jsonb_build_object('source','reservation_snapshot','version',res.cancellation_policy_snapshot_version,
    'store_id',res.cancellation_policy_store_id,'performance_type',res.cancellation_policy_performance_type,
    'deadline_hours',res.cancellation_policy_deadline_hours,'fees',res.cancellation_policy_fees,
    'fee_basis',res.cancellation_policy_fee_basis,'updated_at',res.cancellation_policy_updated_at);
  END IF;
  -- 申込者（契約者）を新主催者へ。旧値は依頼行の previous_customer と予約の変更履歴（reservations_history）に残る
  UPDATE public.reservations SET customer_id=cust.id,customer_name=v_name,customer_phone=v_phone,customer_email=v_email,updated_at=now()
   WHERE id=res.id;
 END IF;
 IF v_policy IS NULL THEN
  -- 未固定（申込前・店舗未確定）は、画面に出した現在の規定をそのまま記録する
  v_policy:=jsonb_build_object('source','current_at_acceptance','displayed',coalesce(p_displayed_policy,'null'::jsonb));
 END IF;
 UPDATE public.private_groups SET organizer_id=h.to_user_id WHERE id=g.id;
 UPDATE public.private_group_members SET is_organizer=false WHERE group_id=g.id AND is_organizer AND id IS DISTINCT FROM h.to_member_id;
 UPDATE public.private_group_members SET is_organizer=true WHERE id=h.to_member_id AND group_id=g.id;
 UPDATE public.private_group_handover_requests SET status='accepted',responded_at=now(),updated_at=now(),
  reservation_id=CASE WHEN has_res THEN res.id ELSE reservation_id END,
  accepted_contact=jsonb_build_object('name',v_name,'phone',v_phone,'email',v_email,'customer_id',cust.id),
  accepted_policy=v_policy||jsonb_build_object('agreed_at',now()),
  previous_customer=v_prev
  WHERE id=h.id;
 INSERT INTO public.private_group_messages(group_id,sender_type,message) VALUES(g.id,'system',
  jsonb_build_object('type','system','action','organizer_handover','result','accepted','title','主催者が変わりました',
   'body',format('主催者が%sさんから%sさんに変わりました。%s',v_from,v_to,
    CASE WHEN has_res THEN '店舗への申込者（連絡先）も'||v_to||'さんになりました。' ELSE '' END),
   'handover_request_id',h.id)::text);
 INSERT INTO public.user_notifications(user_id,organization_id,type,title,message,link,metadata) VALUES
  (h.from_user_id,g.organization_id,'system','主催者の引き継ぎが完了しました',
   format('%sさんが同意し、「%s」の貸切の主催者が%sさんに変わりました。あなたはメンバーとして残ります。',v_to,v_work,v_to),
   '/group/invite/'||g.invite_code,jsonb_build_object('kind','private_group_handover','request_id',h.id,'group_id',g.id,'status','accepted')),
  (h.to_user_id,g.organization_id,'system','あなたが主催者になりました',
   format('「%s」の貸切の主催者を%sさんから引き継ぎました。%s',v_work,v_from,
    CASE WHEN has_res THEN '店舗への申込者（連絡先）はあなたです。' ELSE '' END),
   '/group/invite/'||g.invite_code,jsonb_build_object('kind','private_group_handover','request_id',h.id,'group_id',g.id,'status','accepted'));
 -- 店舗へ知らせる（申込があり、貸切キャンセル共有チャンネルが設定されているとき。段階 2 の人数変更と同じ経路）
 IF has_res THEN
  SELECT nullif(btrim(notification_settings->>'private_cancellation_channel_id'),'')
   INTO v_channel FROM public.organization_settings WHERE organization_id=g.organization_id;
  IF v_channel ~ '^[0-9]{17,20}$' THEN
   v_body:=format('貸切の申込者（契約者）が変わりました。%s作品：%s%s予約番号：%s%s状態：%s%s申込者：%s → %s%s新しい連絡先：電話 %s／メール %s',
    chr(10), coalesce(nullif(regexp_replace(coalesce(res.title,''),'^【貸切希望】|^【貸切】',''),''),v_work),
    chr(10), coalesce(res.reservation_number,'不明'),
    chr(10), CASE WHEN res.status IN ('confirmed','checked_in','completed') THEN '確定済み' ELSE '申込中（店舗の確認待ち）' END,
    chr(10), coalesce(nullif(btrim(res.customer_name),''),v_from), v_name,
    chr(10), v_phone, v_email);
   INSERT INTO public.discord_notification_queue
    (organization_id,notification_type,reference_id,dedupe_key,webhook_url,message_payload,max_retries)
   VALUES (g.organization_id,'private_cancellation',NULL,
    res.id::text||':organizer_handover:'||h.id::text,
    'https://discord.com/api/v10/channels/'||v_channel||'/messages',
    jsonb_build_object('content',v_body,'channel_id',v_channel,'reservation_id',res.id,'epoch',res.id,
     'allowed_mentions',jsonb_build_object('parse','[]'::jsonb)),3)
   ON CONFLICT (organization_id,notification_type,dedupe_key) DO NOTHING;
   v_store:=true;
  END IF;
 END IF;
 -- メール通知は段階 4（通知の整備）で足す。ここで両者（と店舗）へ送る。
 RETURN jsonb_build_object('ok',true,'status','accepted','store_notified',v_store);
END $function$;
REVOKE ALL ON FUNCTION public.private_group_handover_accept(uuid,uuid,text,text,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.private_group_handover_accept(uuid,uuid,text,text,jsonb) TO authenticated,service_role;

-- 引き継ぎ確認画面の材料（宛先・依頼者・同組織スタッフだけ）
CREATE OR REPLACE FUNCTION public.private_group_handover_detail(p_request_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE h public.private_group_handover_requests%ROWTYPE; g public.private_groups%ROWTYPE; res public.reservations%ROWTYPE;
 has_res boolean:=false; v_reservation jsonb; v_members jsonb; v_dates jsonb; v_scenario jsonb; v_contact jsonb; v_confirmed jsonb;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'ログインが必要です' USING ERRCODE='42501'; END IF;
 SELECT * INTO h FROM public.private_group_handover_requests WHERE id=p_request_id;
 IF NOT FOUND OR NOT (auth.uid() IN (h.from_user_id,h.to_user_id) OR public.reservation_actor_is_org_operator(h.organization_id)) THEN
  RAISE EXCEPTION '引き継ぎの依頼が見つかりません' USING ERRCODE='42501';
 END IF;
 PERFORM public.private_group_handover_settle(h.group_id);
 SELECT * INTO h FROM public.private_group_handover_requests WHERE id=p_request_id;
 SELECT * INTO g FROM public.private_groups WHERE id=h.group_id;
 SELECT jsonb_build_object('title',s.title,'key_visual_url',s.key_visual_url) INTO v_scenario FROM public.scenario_masters s WHERE s.id=g.scenario_master_id;
 SELECT * INTO res FROM public.reservations
  WHERE (id=g.reservation_id OR private_group_id=g.id) AND organization_id=g.organization_id AND status<>'cancelled'
  ORDER BY (id=g.reservation_id) DESC, created_at DESC LIMIT 1;
 has_res:=FOUND;
 IF has_res THEN
  SELECT jsonb_build_object('date',e.date,'start_time',e.start_time,'end_time',e.end_time,'store_id',e.store_id,'store_name',COALESCE(s.name,e.venue))
   INTO v_confirmed
  FROM public.schedule_events e LEFT JOIN public.stores s ON s.id=e.store_id AND s.organization_id=g.organization_id
  WHERE e.id=res.schedule_event_id AND e.organization_id=g.organization_id AND res.status IN ('confirmed','checked_in','completed') AND NOT COALESCE(e.is_cancelled,false);
  v_reservation:=jsonb_build_object('id',res.id,'reservation_number',res.reservation_number,'status',res.status,
   'participant_count',res.participant_count,'total_price',res.total_price,'customer_name',res.customer_name,'store_id',res.store_id,
   'candidates',COALESCE((SELECT jsonb_agg(jsonb_build_object('date',c->>'date','startTime',c->>'startTime','endTime',c->>'endTime') ORDER BY ord)
     FROM jsonb_array_elements(CASE WHEN jsonb_typeof(res.candidate_datetimes->'candidates')='array' THEN res.candidate_datetimes->'candidates' ELSE '[]'::jsonb END) WITH ORDINALITY AS t(c,ord)),'[]'::jsonb),
   'requested_store_ids',COALESCE((SELECT jsonb_agg(st->>'storeId' ORDER BY ord)
     FROM jsonb_array_elements(CASE WHEN jsonb_typeof(res.candidate_datetimes->'requestedStores')='array' THEN res.candidate_datetimes->'requestedStores' ELSE '[]'::jsonb END) WITH ORDINALITY AS u(st,ord)
     WHERE nullif(st->>'storeId','') IS NOT NULL),'[]'::jsonb),
   'confirmed',v_confirmed,
   'policy',CASE WHEN res.cancellation_policy_snapshot_version=1 AND res.cancellation_policy_store_id IS NOT NULL THEN jsonb_build_object(
     'version',res.cancellation_policy_snapshot_version,'store_id',res.cancellation_policy_store_id,
     'store_name',(SELECT s.name FROM public.stores s WHERE s.id=res.cancellation_policy_store_id AND s.organization_id=g.organization_id),
     'performance_type',res.cancellation_policy_performance_type,'deadline_hours',res.cancellation_policy_deadline_hours,
     'fees',res.cancellation_policy_fees,'fee_basis',res.cancellation_policy_fee_basis,'updated_at',res.cancellation_policy_updated_at) END);
 END IF;
 SELECT COALESCE(jsonb_agg(jsonb_build_object('id',m.id,
   'name',CASE WHEN m.user_id IS NULL THEN coalesce(nullif(btrim(m.guest_name),''),'ゲスト') ELSE coalesce((SELECT nullif(c.nickname,'') FROM public.customers c WHERE c.user_id=m.user_id ORDER BY c.id LIMIT 1),nullif(btrim(m.guest_name),''),'メンバー') END,
   'is_organizer',m.is_organizer,'is_guest',m.user_id IS NULL,'is_me',m.user_id IS NOT NULL AND m.user_id=auth.uid()) ORDER BY m.is_organizer DESC,m.joined_at,m.id),'[]'::jsonb)
  INTO v_members FROM public.private_group_members m WHERE m.group_id=g.id AND m.status='joined';
 SELECT COALESCE(jsonb_agg(jsonb_build_object('date',d.date,'time_slot',d.time_slot,'start_time',d.start_time,'end_time',d.end_time) ORDER BY d.order_num,d.id),'[]'::jsonb)
  INTO v_dates FROM public.private_group_candidate_dates d WHERE d.group_id=g.id AND d.status IS DISTINCT FROM 'rejected' AND d.withdrawn_at IS NULL;
 IF auth.uid()=h.to_user_id THEN
  -- 連絡先の初期値（本人の顧客情報。共通〔組織なし〕かこのグループと同じ組織のもの）
  SELECT jsonb_build_object('name',c.name,'phone',c.phone,'email',coalesce(nullif(c.email,''),(SELECT u.email FROM auth.users u WHERE u.id=auth.uid())))
   INTO v_contact FROM public.customers c
   WHERE c.user_id=auth.uid() AND (c.organization_id IS NULL OR c.organization_id=g.organization_id)
   ORDER BY (c.organization_id IS NULL) DESC, c.updated_at DESC NULLS LAST, c.id LIMIT 1;
  IF v_contact IS NULL THEN
   v_contact:=jsonb_build_object('name',NULL,'phone',NULL,'email',(SELECT u.email FROM auth.users u WHERE u.id=auth.uid()));
  END IF;
 END IF;
 RETURN jsonb_build_object(
  'request',jsonb_build_object('id',h.id,'status',h.status,'requested_at',h.requested_at,'expires_at',h.expires_at,'responded_at',h.responded_at,
   'from_name',public.private_group_handover_user_name(h.from_user_id,g.id),'to_name',public.private_group_handover_user_name(h.to_user_id,g.id),
   'is_recipient',auth.uid()=h.to_user_id,'is_requester',auth.uid()=h.from_user_id),
  'group',jsonb_build_object('id',g.id,'status',g.status,'invite_code',g.invite_code,'organization_id',g.organization_id,
   'organization_slug',(SELECT o.slug FROM public.organizations o WHERE o.id=g.organization_id),
   'scenario_master_id',g.scenario_master_id,'preferred_store_ids',to_jsonb(g.preferred_store_ids),
   'total_price',g.total_price,'per_person_price',g.per_person_price,'target_participant_count',g.target_participant_count),
  'scenario',v_scenario,'reservation',v_reservation,'members',v_members,'candidate_dates',v_dates,'my_contact',v_contact);
END $function$;
REVOKE ALL ON FUNCTION public.private_group_handover_detail(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.private_group_handover_detail(uuid) TO authenticated,service_role;

-- マイページのカード用: 自分が依頼した・頼まれている進行中の依頼
CREATE OR REPLACE FUNCTION public.private_group_handover_mine()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_group uuid;
BEGIN
 IF auth.uid() IS NULL THEN RETURN '[]'::jsonb; END IF;
 FOR v_group IN SELECT DISTINCT group_id FROM public.private_group_handover_requests
  WHERE status='requested' AND (to_user_id=auth.uid() OR from_user_id=auth.uid()) LOOP
  PERFORM public.private_group_handover_settle(v_group);
 END LOOP;
 RETURN COALESCE((SELECT jsonb_agg(jsonb_build_object('id',h.id,'group_id',h.group_id,'expires_at',h.expires_at,'requested_at',h.requested_at,
   'from_name',public.private_group_handover_user_name(h.from_user_id,h.group_id),
   'to_name',public.private_group_handover_user_name(h.to_user_id,h.group_id),
   'to_member_id',h.to_member_id,'is_recipient',h.to_user_id=auth.uid()) ORDER BY h.requested_at)
  FROM public.private_group_handover_requests h
  WHERE h.status='requested' AND (h.to_user_id=auth.uid() OR h.from_user_id=auth.uid())),'[]'::jsonb);
END $function$;
REVOKE ALL ON FUNCTION public.private_group_handover_mine() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.private_group_handover_mine() TO authenticated,service_role;
