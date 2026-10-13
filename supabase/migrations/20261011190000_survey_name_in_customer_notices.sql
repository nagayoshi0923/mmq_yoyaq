-- お客様への知らせ（ベル・メール）の「公演前アンケート」を「事前配役アンケート」に（2026-10-11 社長決定の名称）。
-- 文面だけの変更。対象・条件・送り先は変えない（staging の実物 pg_get_functiondef から文言だけ置換）。
BEGIN;
CREATE OR REPLACE FUNCTION public.customer_notice_on_group_message()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v jsonb; v_action text; g public.private_groups%ROWTYPE; r public.reservations%ROWTYPE; m public.private_group_members%ROWTYPE;
 v_work text; v_link text; v_author uuid; v_when text; v_when_long text; v_store text; v_survey jsonb; v_deadline text; v_survey_on boolean:=false;
 v_title text; v_msg text; v_subject text; v_lines text[];
BEGIN
 BEGIN
  v := NEW.message::jsonb;
 EXCEPTION WHEN others THEN RETURN NULL;
 END;
 IF jsonb_typeof(v) IS DISTINCT FROM 'object' OR v->>'type' IS DISTINCT FROM 'system' THEN RETURN NULL; END IF;
 v_action := v->>'action';
 IF v_action IS NULL OR v_action NOT IN ('member_joined','candidate_dates_added','schedule_confirmed','booking_cancelled') THEN RETURN NULL; END IF;
 BEGIN
  SELECT * INTO g FROM public.private_groups WHERE id=NEW.group_id;
  IF NOT FOUND THEN RETURN NULL; END IF;
  v_work := coalesce((SELECT s.title FROM public.scenario_masters s WHERE s.id=g.scenario_master_id),'貸切');
  v_link := '/group/invite/'||g.invite_code;

  IF v_action='member_joined' THEN
   -- メンバーが参加した → 主催者へ（ベル）
   SELECT * INTO m FROM public.private_group_members WHERE id=coalesce(nullif(v->>'memberId','')::uuid, NEW.member_id) AND group_id=g.id;
   IF NOT FOUND OR m.is_organizer OR m.user_id IS NOT DISTINCT FROM g.organizer_id OR g.status='cancelled' THEN RETURN NULL; END IF;
   PERFORM public.customer_notice_bell(g.organizer_id,NULL,g.organization_id,'system','private_member_joined','private_member_joined:'||m.id::text,
    'メンバーが参加しました',format('「%s」の貸切グループに%sさんが参加しました。',v_work,coalesce(nullif(btrim(v->>'memberName'),''),'メンバー')),
    v_link,NULL,NULL,jsonb_build_object('group_id',g.id));

  ELSIF v_action='candidate_dates_added' THEN
   -- 候補日が追加された → 主催者・追加した本人以外のメンバーへ（ベル）
   IF g.status NOT IN ('gathering','date_adjusting') THEN RETURN NULL; END IF;
   SELECT user_id INTO v_author FROM public.private_group_members WHERE id=NEW.member_id;
   PERFORM public.customer_notice_group_members(g.id,'private_dates_added','private_dates_added:'||NEW.id::text,'system',
    '候補日が追加されました',
    format('「%s」の貸切に候補日が%s追加されました。日程に回答してください。',v_work,coalesce(nullif(v->>'count','')||'件','')),
    v_link||'?tab=schedule',ARRAY[g.organizer_id,v_author]);

  ELSIF v_action='schedule_confirmed' THEN
   -- 店舗が日程を確定した → 全員にベル。メールは主催者以外（主催者には既存の確定メールが届く）
   IF g.status IS DISTINCT FROM 'confirmed' THEN RETURN NULL; END IF;
   SELECT * INTO r FROM public.reservations WHERE id=g.reservation_id;
   v_when := concat_ws(' ',public.customer_notice_when(nullif(v->>'confirmedDate','')::date),nullif(v->>'confirmedTimeSlot',''));
   v_when_long := concat_ws(' ',public.customer_notice_when_long(nullif(v->>'confirmedDate','')::date),nullif(v->>'confirmedTimeSlot',''));
   v_store := nullif(btrim(v->>'storeName'),'');
   BEGIN
    v_survey := public.get_private_group_survey_settings(g.organization_id,g.id);
   EXCEPTION WHEN others THEN v_survey := NULL;
   END;
   v_survey_on := coalesce((v_survey->>'survey_enabled')::boolean,false) AND coalesce(v_survey->>'survey_url','')='';
   IF v_survey_on AND nullif(v_survey->>'survey_deadline_at','') IS NOT NULL THEN
    v_deadline := public.customer_notice_when_long(((v_survey->>'survey_deadline_at')::timestamptz AT TIME ZONE 'Asia/Tokyo')::date);
   END IF;
   v_lines := ARRAY[format('「%s」の貸切の日程を、店舗が確定しました。',v_work),'','■ ご予約内容','作品: '||v_work,
    CASE WHEN v_when_long<>'' THEN '開催日時: '||v_when_long END, CASE WHEN v_store IS NOT NULL THEN '会場: '||v_store END,
    CASE WHEN r.reservation_number IS NOT NULL THEN '予約番号: '||r.reservation_number END];
   IF v_survey_on THEN
    v_lines := v_lines || ARRAY['','■ 事前配役アンケート','当日の準備のため、グループ画面の「事前配役アンケート」からご回答をお願いします。',
     CASE WHEN v_deadline IS NOT NULL THEN '回答期限: '||v_deadline||'まで' END];
   END IF;
   v_lines := v_lines || ARRAY['','当日のご来店をお待ちしております。'];
   PERFORM public.customer_notice_group_members(g.id,'private_confirmed','private_confirmed:'||coalesce(r.id,g.id)::text,'reservation_confirmed',
    '貸切の日程が確定しました',
    format('「%s」の貸切は %s%s に決まりました。',v_work,coalesce(nullif(v_when,''),'確定した日程'),coalesce('（'||v_store||'）','')),
    v_link,'{}'::uuid[],true,'【日程確定】'||v_work||coalesce(' - '||public.customer_notice_when_long(nullif(v->>'confirmedDate','')::date),''),v_lines,'reservation_confirmed',true);
   IF v_survey_on THEN
    -- アンケートに回答してください → 会員全員（ベル）。メールは上の確定メール（メンバー）と既存のアンケート案内（主催者）
    PERFORM public.customer_notice_group_members(g.id,'private_survey','private_survey:'||coalesce(r.id,g.id)::text,'system',
     '事前配役アンケートに回答してください',
     format('「%s」の貸切の事前配役アンケートにご回答ください。%s',v_work,coalesce('回答期限は'||v_deadline||'です。','')),
     v_link||'?tab=survey');
   END IF;

  ELSIF v_action='booking_cancelled' THEN
   -- グループが閉じた（閉じる・申込の取り下げ・確定後のキャンセル） → 主催者以外の全メンバー（ベル＋メール）
   IF g.status IS DISTINCT FROM 'cancelled' THEN RETURN NULL; END IF;
   IF nullif(v->>'reservationId','') IS NOT NULL THEN
    SELECT * INTO r FROM public.reservations WHERE id=(v->>'reservationId')::uuid AND organization_id=g.organization_id;
   END IF;
   IF r.id IS NOT NULL AND r.cancellation_reason='お客様による貸切申込の取り下げ' THEN
    v_title := '貸切の申込が取り下げられました';
    v_msg := format('主催者が「%s」の貸切の申込を取り下げました。グループは閉じられました。',v_work);
    v_subject := '【申込の取り下げ】'||v_work;
    v_lines := ARRAY[format('主催者が「%s」の貸切の、店舗への申込を取り下げました。',v_work),
     'このグループは閉じられ、日程の回答やチャットはできなくなりました。'];
   ELSIF r.id IS NOT NULL THEN
    SELECT public.customer_notice_when(e.date,e.start_time), public.customer_notice_when_long(e.date,e.start_time) INTO v_when, v_when_long
      FROM public.schedule_events e WHERE e.id=r.schedule_event_id;
    v_title := '貸切のご予約がキャンセルされました';
    v_msg := format('「%s」の貸切%sはキャンセルされました。グループは閉じられました。',v_work,coalesce('（'||v_when||'）',''));
    v_subject := '【キャンセル】'||v_work||coalesce(' - '||v_when_long,'');
    v_lines := ARRAY[format('「%s」の貸切%sはキャンセルされました。',v_work,coalesce('（'||v_when_long||'）','')),
     'このグループは閉じられ、日程の回答やチャットはできなくなりました。'];
   ELSE
    v_title := '貸切グループが閉じられました';
    v_msg := format('主催者が「%s」の貸切グループを閉じました。日程の回答やチャットはできません。',v_work);
    v_subject := '【お知らせ】「'||v_work||'」の貸切グループが閉じられました';
    v_lines := ARRAY[format('主催者が「%s」の貸切グループを閉じました。',v_work),
     '日程の回答やチャットはできなくなりました。'];
   END IF;
   PERFORM public.customer_notice_group_members(g.id,'private_group_closed','private_group_closed:'||g.id::text,'reservation_cancelled',
    v_title,v_msg,v_link,ARRAY[g.organizer_id],true,v_subject,v_lines,'reservation_cancelled');
  END IF;
 EXCEPTION WHEN others THEN
  RAISE WARNING 'customer_notice_on_group_message failed: %', SQLERRM;
 END;
 RETURN NULL;
END $function$
;

CREATE OR REPLACE FUNCTION public.customer_notice_on_survey_reminder()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE g public.private_groups%ROWTYPE; v_user uuid;
BEGIN
 BEGIN
  SELECT user_id INTO v_user FROM public.private_group_members WHERE id=NEW.member_id AND group_id=NEW.group_id;
  IF v_user IS NULL THEN RETURN NULL; END IF;
  SELECT * INTO g FROM public.private_groups WHERE id=NEW.group_id;
  PERFORM public.customer_notice_bell(v_user,NULL,g.organization_id,'system','private_survey','private_survey_reminder:'||NEW.id::text,
   '事前配役アンケートに回答してください',
   format('「%s」の貸切の事前配役アンケートにご回答ください。回答期限は%sです。',
    coalesce((SELECT s.title FROM public.scenario_masters s WHERE s.id=g.scenario_master_id),'貸切'),
    public.customer_notice_when((NEW.deadline_at AT TIME ZONE 'Asia/Tokyo')::date)),
   '/group/invite/'||g.invite_code||'?tab=survey',NULL,NULL,jsonb_build_object('group_id',g.id));
 EXCEPTION WHEN others THEN
  RAISE WARNING 'customer_notice_on_survey_reminder failed: %', SQLERRM;
 END;
 RETURN NULL;
END $function$
;
COMMIT;
