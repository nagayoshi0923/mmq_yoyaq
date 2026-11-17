-- 店舗スタッフの「個別にお知らせ」（配役されたキャラクターの資料 URL＝HO の URL を添付できる）を、宛先の本人へメール（とベル）でも届ける（2026-11-17 社長依頼）。
-- 社長方針: 事前配役まわりはメール必須。配役された HO の URL もメールで配布する。
-- これまでは private_group_send_individual_notice がチャットに本人だけに見えるお知らせを書くだけだった。
-- 本文はチャットのお知らせと同じ（スタッフの文・定型文・キャラクターのアンケート用説明・【キャラクター名の資料】URL）。予約内容と「あなたの配役」を添える。
-- スタッフ権限を確かめたこの関数の中で積むので、チャットに system の形を書き込めるだけの人（主催者など）からは送れない。
-- 重複防止キーはお知らせ 1 件ごと。メールを積めなくてもチャットへのお知らせは残す。
-- 元は staging の実物（20260927030000 の版、md5(prosrc)=6f8d68b2d452357bff6242c20fe77044）。権限の確認・本文の組み立て・チャットへの書き込みは変えない。
BEGIN;
CREATE OR REPLACE FUNCTION public.private_group_send_individual_notice(
 p_group_id uuid,p_member_id uuid,p_message text DEFAULT '',p_character_id text DEFAULT NULL,p_attach_template boolean DEFAULT false
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE
 g public.private_groups%ROWTYPE;
 member public.private_group_members%ROWTYPE;
 scenario record;
 character jsonb;
 template text;
 sender_name text;
 target_name text;
 body text;
 saved public.private_group_messages%ROWTYPE;
 v_work text; v_when text; v_store text; v_link text; v_email text; v_name text; v_bell uuid; v_lines text[];
BEGIN
 IF public.private_group_actor_role(p_group_id) IS DISTINCT FROM 'staff' AND coalesce(auth.role(),'')<>'service_role' THEN
  RAISE EXCEPTION 'スタッフ権限が必要です' USING ERRCODE='42501';
 END IF;
 SELECT * INTO STRICT g FROM public.private_groups WHERE id=p_group_id FOR UPDATE;
 SELECT * INTO member FROM public.private_group_members WHERE id=p_member_id AND group_id=g.id AND status IN ('joined','active');
 IF NOT FOUND THEN RAISE EXCEPTION '宛先の参加状況が変更されています' USING ERRCODE='22023'; END IF;
 SELECT v.characters,v.individual_notice_template INTO scenario FROM public.organization_scenarios_with_master v
 WHERE v.organization_id=g.organization_id AND (v.scenario_master_id=g.scenario_master_id OR v.org_scenario_id=g.scenario_master_id)
 ORDER BY (v.scenario_master_id=g.scenario_master_id) DESC LIMIT 1;
 IF p_character_id IS NOT NULL AND p_character_id<>'' THEN
  SELECT c INTO character FROM jsonb_array_elements(coalesce(scenario.characters,'[]'::jsonb)) c WHERE c->>'id'=p_character_id;
  IF character IS NULL THEN RAISE EXCEPTION '作品のキャラクターが変更されています' USING ERRCODE='22023'; END IF;
 END IF;
 IF coalesce(p_attach_template,false) THEN
  template:=nullif(scenario.individual_notice_template,'');
  IF template IS NULL THEN SELECT individual_notice_default_body INTO template FROM public.global_settings WHERE organization_id=g.organization_id; END IF;
 END IF;
 body:=concat_ws(E'\n\n',nullif(btrim(p_message),''),nullif(template,''),nullif(character->>'survey_description',''),
  CASE WHEN nullif(character->>'url','') IS NOT NULL THEN '【'||coalesce(character->>'name','キャラクター')||E'の資料】\n'||(character->>'url') END);
 IF body='' AND character IS NULL THEN RAISE EXCEPTION 'お知らせの本文を入力してください' USING ERRCODE='22023'; END IF;
 target_name:=CASE WHEN member.user_id IS NULL THEN coalesce(nullif(member.guest_name,''),'参加者')
  ELSE coalesce((SELECT nullif(c.nickname,'') FROM public.customers c WHERE c.user_id=member.user_id ORDER BY c.id LIMIT 1),'ニックネーム未設定') END;
 SELECT name INTO sender_name FROM public.staff WHERE user_id=auth.uid() AND organization_id=g.organization_id AND (status IS NULL OR status NOT IN ('inactive','resigned')) ORDER BY id LIMIT 1;
 INSERT INTO public.private_group_messages(group_id,member_id,message) VALUES(g.id,member.id,jsonb_build_object(
  'type','system','action','individual_notice','target_member_id',member.id,'target_member_name',target_name,'target_user_id',member.user_id,
  'message',body,'character_id',character->>'id','character_name',character->>'name','character_url',character->>'url',
  'template_attached',coalesce(nullif(template,'') IS NOT NULL,false),'sent_by',sender_name)::text) RETURNING * INTO saved;
 -- 個別のお知らせ（配役されたキャラクターの資料 URL など）を、宛先の本人へメールでも届ける（2026-11-17 社長依頼）。
 -- スタッフ権限を確かめたこの関数の中だけで積む（チャットに system のお知らせを書き込めるだけでは送らない）。
 -- 送信は process-customer-notice-emails（app_config の customer_notice_email が on の環境だけ・1 通ずつ間隔あけ）。
 BEGIN
  v_work := coalesce((SELECT s.title FROM public.scenario_masters s WHERE s.id=g.scenario_master_id),'貸切');
  v_link := '/group/invite/'||g.invite_code;
  IF g.reservation_id IS NOT NULL THEN
   SELECT public.customer_notice_when_long(e.date,e.start_time), nullif(btrim(public.customer_store_name(st.id, e.date, st.name)),'') INTO v_when, v_store
     FROM public.reservations rr JOIN public.schedule_events e ON e.id=rr.schedule_event_id
     LEFT JOIN public.stores st ON st.id=e.store_id AND st.organization_id=g.organization_id
    WHERE rr.id=g.reservation_id AND rr.status IS DISTINCT FROM 'cancelled';
  END IF;
  IF member.user_id IS NOT NULL THEN
   v_bell := public.customer_notice_bell(member.user_id,NULL,g.organization_id,'system','private_individual_notice','private_individual_notice:'||saved.id::text,
    '店舗から個別のお知らせが届きました',format('「%s」の貸切について、店舗からあなた宛てのお知らせが届きました。',v_work),
    v_link,NULL,NULL,jsonb_build_object('group_id',g.id));
   SELECT c.email, c.name INTO v_email, v_name FROM public.customer_notice_user_contact(member.user_id) c;
  ELSE
   SELECT coalesce(nullif(btrim(pii.guest_email),''),nullif(btrim(member.guest_email),'')),
          coalesce(nullif(btrim(pii.guest_name),''),nullif(btrim(member.guest_name),''))
     INTO v_email, v_name
     FROM (SELECT 1) x LEFT JOIN public.private_group_members_pii pii ON pii.member_id=member.id;
  END IF;
  v_lines := ARRAY[format('「%s」の貸切について、店舗からあなた宛てのお知らせです。',v_work),'',
   '■ ご予約内容','作品: '||v_work,
   CASE WHEN nullif(v_when,'') IS NOT NULL THEN '開催日時: '||v_when END,
   CASE WHEN v_store IS NOT NULL THEN '会場: '||v_store END,
   CASE WHEN character IS NOT NULL THEN 'あなたの配役: '||coalesce(character->>'name','キャラクター') END,
   '','■ お知らせ'] || string_to_array(body,E'\n')
   || ARRAY['','このお知らせはグループ画面のチャットにも、あなたにだけ表示されています。'];
  PERFORM public.customer_notice_enqueue_email(g.organization_id,'private_individual_notice','private_individual_notice:'||saved.id::text||':mail','other',
   v_email,v_name,'【店舗からのお知らせ】'||v_work||coalesce(' - '||nullif(v_when,''),''),array_remove(v_lines,NULL),v_link,
   'ご不明な点は、グループ画面の歯車マークから「店舗へのお問い合わせ」をご利用ください。',member.user_id IS NULL,v_bell);
 EXCEPTION WHEN others THEN
  -- メールを積めなくても、チャットへのお知らせは残す（送信の失敗で配役の連絡そのものを止めない）
  RAISE WARNING 'private_group_send_individual_notice mail failed: %', SQLERRM;
 END;
 RETURN to_jsonb(saved);
END $$;
REVOKE ALL ON FUNCTION public.private_group_send_individual_notice(uuid,uuid,text,text,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.private_group_send_individual_notice(uuid,uuid,text,text,boolean) TO authenticated,service_role;
COMMIT;
