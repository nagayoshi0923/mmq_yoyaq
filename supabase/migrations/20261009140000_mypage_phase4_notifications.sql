-- マイページ改修 段階 4「通知の整備」（2026-10-09）
-- お客様への知らせを「通知ベル（user_notifications）」と「メール」にそろえる。仕様の一覧は
-- docs/product-spec/マイページ改修_2026-10.md の 21〜26。
--
-- 考え方:
--  - ベルは DB の出来事（予約の状態・人数の変更、貸切グループのお知らせ、リマインドの送信済み、クーポンの付与 など）から
--    トリガーで作る。同じ出来事で 2 回作らないよう metadata.dedupe_key に一意索引を張る。
--  - 既にメールがあるもの（予約受付・取消・開催決定/中止・前日のご案内・貸切リクエスト受付・日程確定（主催者）・却下・アンケート）は
--    メールの経路をそのままにして、ベルだけ足す。
--  - メールが無かったもの（日程確定のメンバー・取り下げ・グループを閉じた・メンバーから外された・主催者の引き継ぎ）は
--    送信待ちの表 customer_notice_emails に積み、送信処理 process-customer-notice-emails（5 分ごと）が送る
--    （公演前アンケートのリマインドメールと同じ形。Resend・email_logs を使う。新しい外部サービスは使わない）。
--  - 実際の送信は app_config の customer_notice_email が 'on' の環境だけ（検証環境は本番の写しで、ログインのメールが実在のため）。
--  - 通知の失敗で本来の処理（予約・取消・承認など）を止めない。各トリガーは失敗を WARNING にして続ける。

-- 1) ベルの重複防止キー -------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS user_notifications_dedupe_key_idx
  ON public.user_notifications ((metadata->>'dedupe_key')) WHERE (metadata ? 'dedupe_key');

-- 2) メールの送信待ち --------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.customer_notice_emails (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  kind text NOT NULL,
  dedupe_key text NOT NULL,
  notification_id uuid REFERENCES public.user_notifications(id) ON DELETE SET NULL,
  email_type text NOT NULL DEFAULT 'other',
  to_email text NOT NULL,
  to_name text,
  subject text NOT NULL,
  body_text text NOT NULL,
  reply_to text,
  sender_name text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sending','sent','failed','skipped')),
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count>=0),
  next_attempt_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  lease_until timestamptz,
  email_log_id uuid,
  provider_message_id text,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  sent_at timestamptz,
  CONSTRAINT customer_notice_emails_dedupe_key_key UNIQUE (dedupe_key)
);
CREATE INDEX IF NOT EXISTS customer_notice_emails_due_idx ON public.customer_notice_emails(next_attempt_at) WHERE status IN ('pending','sending');
ALTER TABLE public.customer_notice_emails ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.customer_notice_emails FROM PUBLIC, anon, authenticated;
COMMENT ON TABLE public.customer_notice_emails IS 'お客様への知らせのメール（段階 4 で足したもの）の送信待ちと結果。本文は積んだ時点の文面。{{SITE_URL}} は送信時に置き換える';

-- 3) 部品 ---------------------------------------------------------------------------
-- 日付（10/25(日) 14:00）
CREATE OR REPLACE FUNCTION public.customer_notice_when(p_date date, p_time time DEFAULT NULL)
 RETURNS text LANGUAGE sql IMMUTABLE SET search_path TO 'public', 'pg_temp' AS $$
  SELECT CASE WHEN p_date IS NULL THEN NULL ELSE
    to_char(p_date,'FMMM/FMDD')||'('||(ARRAY['日','月','火','水','木','金','土'])[extract(dow FROM p_date)::int+1]||')'
    ||coalesce(' '||to_char(p_time,'HH24:MI'),'') END
$$;

-- メール用の日付（2026年10月25日(日) 14:00。既存のお客様向けメールと同じ書き方）
CREATE OR REPLACE FUNCTION public.customer_notice_when_long(p_date date, p_time time DEFAULT NULL)
 RETURNS text LANGUAGE sql IMMUTABLE SET search_path TO 'public', 'pg_temp' AS $$
  SELECT CASE WHEN p_date IS NULL THEN NULL ELSE
    to_char(p_date,'FMYYYY年FMMM月FMDD日')||'('||(ARRAY['日','月','火','水','木','金','土'])[extract(dow FROM p_date)::int+1]||')'
    ||coalesce(' '||to_char(p_time,'HH24:MI'),'') END
$$;

-- 予約名から作品名（【貸切希望】などの頭書きを外す）
CREATE OR REPLACE FUNCTION public.customer_notice_work_title(p_title text)
 RETURNS text LANGUAGE sql IMMUTABLE SET search_path TO 'public', 'pg_temp' AS $$
  SELECT coalesce(nullif(btrim(regexp_replace(coalesce(p_title,''),'^【貸切希望】|^【貸切】','')),''),'公演')
$$;

-- 通知ベルを 1 件作る（同じ dedupe_key は 1 回だけ）
CREATE OR REPLACE FUNCTION public.customer_notice_bell(p_user uuid, p_customer uuid, p_org uuid, p_type text, p_kind text,
  p_dedupe text, p_title text, p_message text, p_link text, p_reservation uuid DEFAULT NULL, p_event uuid DEFAULT NULL,
  p_extra jsonb DEFAULT '{}'::jsonb)
 RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $function$
DECLARE v_id uuid;
BEGIN
 IF (p_user IS NULL AND p_customer IS NULL) OR p_dedupe IS NULL THEN RETURN NULL; END IF;
 INSERT INTO public.user_notifications(user_id,customer_id,organization_id,type,title,message,link,related_reservation_id,related_event_id,metadata)
 VALUES(p_user,p_customer,p_org,p_type,p_title,p_message,p_link,p_reservation,p_event,
  coalesce(p_extra,'{}'::jsonb)||jsonb_build_object('kind',p_kind,'dedupe_key',p_dedupe))
 ON CONFLICT ((metadata->>'dedupe_key')) WHERE (metadata ? 'dedupe_key') DO NOTHING
 RETURNING id INTO v_id;
 RETURN v_id;
END $function$;

-- 会員の宛先（ログインのメール → 顧客のメール）と宛名（氏名 → ニックネーム）
CREATE OR REPLACE FUNCTION public.customer_notice_user_contact(p_user uuid, OUT email text, OUT name text)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $$
  SELECT coalesce(nullif(btrim(au.email),''),
           (SELECT nullif(btrim(c.email),'') FROM public.customers c WHERE c.user_id=p_user AND nullif(btrim(c.email),'') IS NOT NULL
             ORDER BY c.organization_id NULLS FIRST, c.created_at LIMIT 1)),
         (SELECT coalesce(nullif(btrim(c.name),''),nullif(btrim(c.nickname),'')) FROM public.customers c WHERE c.user_id=p_user
           ORDER BY c.organization_id NULLS FIRST, c.created_at LIMIT 1)
    FROM (SELECT p_user AS id) x LEFT JOIN auth.users au ON au.id=x.id
$$;

-- メールを送信待ちに積む。文面は既存のお客様向けメール（アンケートのリマインドなど）と同じ型。
CREATE OR REPLACE FUNCTION public.customer_notice_enqueue_email(p_org uuid, p_kind text, p_dedupe text, p_email_type text,
  p_to_email text, p_to_name text, p_subject text, p_lines text[], p_link text, p_footer text DEFAULT NULL,
  p_guest boolean DEFAULT false, p_notification uuid DEFAULT NULL, p_store uuid DEFAULT NULL)
 RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $function$
DECLARE v_company text; v_reply text; v_parts text[]; v_id uuid;
BEGIN
 IF p_org IS NULL OR p_dedupe IS NULL OR p_subject IS NULL
  OR p_to_email IS NULL OR btrim(p_to_email) !~ '^[^[:space:]@<>]+@[^[:space:]@<>]+\.[^[:space:]@<>]+$' THEN RETURN NULL; END IF;
 SELECT coalesce(nullif(btrim(es.company_name),''), nullif(btrim(eo.company_name),''), 'クインズワルツ'),
        -- 返信先: 組織の返信先 → 店舗の連絡先 → 組織共通の連絡先（アンケートのリマインドと同じ順）
        coalesce(nullif(btrim(os.reply_to_email),''), nullif(btrim(es.company_email),''), nullif(btrim(eo.company_email),''))
   INTO v_company, v_reply
   FROM (SELECT 1) x
   LEFT JOIN LATERAL (SELECT * FROM public.email_settings s WHERE s.organization_id=p_org AND p_store IS NOT NULL AND s.store_id=p_store LIMIT 1) es ON true
   LEFT JOIN LATERAL (SELECT * FROM public.email_settings s WHERE s.organization_id=p_org AND s.store_id IS NULL LIMIT 1) eo ON true
   LEFT JOIN public.organization_settings os ON os.organization_id=p_org;
 v_parts := ARRAY[coalesce(nullif(btrim(p_to_name),''),'お客')||' 様', ''] || coalesce(p_lines,'{}'::text[]) || ARRAY[''];
 IF p_link IS NOT NULL THEN v_parts := v_parts || ARRAY['▼ 詳しくはこちら', '{{SITE_URL}}'||p_link, '']; END IF;
 IF p_guest THEN
  v_parts := v_parts || ARRAY['アカウントを作らずにご参加の方は、ご参加時にお送りしたメールに記載の4桁のPINでお入りください。',
   'PINがお分かりにならない場合は、上の画面の「PINを忘れた方」から再送できます。', ''];
 END IF;
 v_parts := v_parts || ARRAY[coalesce(p_footer,'ご不明な点は、ご予約の店舗までお問い合わせください。'), '', v_company];
 INSERT INTO public.customer_notice_emails(organization_id,kind,dedupe_key,notification_id,email_type,to_email,to_name,subject,body_text,reply_to,sender_name)
 VALUES(p_org,p_kind,p_dedupe,p_notification,coalesce(p_email_type,'other'),btrim(p_to_email),nullif(btrim(p_to_name),''),
  p_subject||' | '||v_company,array_to_string(v_parts,chr(10)),v_reply,v_company)
 ON CONFLICT (dedupe_key) DO NOTHING
 RETURNING id INTO v_id;
 RETURN v_id;
END $function$;

-- 貸切グループの参加中メンバーへ（会員はベル、p_mail なら会員・ゲストともメール）
CREATE OR REPLACE FUNCTION public.customer_notice_group_members(p_group uuid, p_kind text, p_key text, p_bell_type text,
  p_title text, p_message text, p_link text, p_exclude uuid[] DEFAULT '{}'::uuid[], p_mail boolean DEFAULT false,
  p_subject text DEFAULT NULL, p_lines text[] DEFAULT NULL, p_email_type text DEFAULT 'other', p_mail_skip_organizer boolean DEFAULT false)
 RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $function$
DECLARE g public.private_groups%ROWTYPE; m record; v_email text; v_name text; v_bell uuid; n integer:=0;
BEGIN
 SELECT * INTO g FROM public.private_groups WHERE id=p_group;
 IF NOT FOUND THEN RETURN 0; END IF;
 FOR m IN SELECT gm.id, gm.user_id, gm.is_organizer,
    coalesce(nullif(btrim(pii.guest_email),''),nullif(btrim(gm.guest_email),'')) AS guest_email,
    coalesce(nullif(btrim(pii.guest_name),''),nullif(btrim(gm.guest_name),'')) AS guest_name
   FROM public.private_group_members gm LEFT JOIN public.private_group_members_pii pii ON pii.member_id=gm.id
  WHERE gm.group_id=p_group AND gm.status='joined' ORDER BY gm.created_at, gm.id
 LOOP
  IF m.user_id IS NOT NULL AND m.user_id = ANY(coalesce(p_exclude,'{}'::uuid[])) THEN CONTINUE; END IF;
  v_bell := NULL;
  IF m.user_id IS NOT NULL THEN
   v_bell := public.customer_notice_bell(m.user_id,NULL,g.organization_id,p_bell_type,p_kind,p_key||':'||m.user_id::text,
    p_title,p_message,p_link,NULL,NULL,jsonb_build_object('group_id',g.id));
  END IF;
  IF p_mail AND NOT (p_mail_skip_organizer AND (m.is_organizer OR m.user_id IS NOT DISTINCT FROM g.organizer_id)) THEN
   IF m.user_id IS NOT NULL THEN
    SELECT c.email, c.name INTO v_email, v_name FROM public.customer_notice_user_contact(m.user_id) c;
   ELSE
    v_email := m.guest_email; v_name := m.guest_name;
   END IF;
   PERFORM public.customer_notice_enqueue_email(g.organization_id,p_kind,p_key||':mail:'||m.id::text,p_email_type,v_email,v_name,
    p_subject,p_lines,p_link,'ご不明な点は、グループ画面の歯車マークから「店舗へのお問い合わせ」をご利用ください。',m.user_id IS NULL,v_bell);
  END IF;
  n := n+1;
 END LOOP;
 RETURN n;
END $function$;

REVOKE ALL ON FUNCTION public.customer_notice_bell(uuid,uuid,uuid,text,text,text,text,text,text,uuid,uuid,jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.customer_notice_user_contact(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.customer_notice_enqueue_email(uuid,text,text,text,text,text,text,text[],text,text,boolean,uuid,uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.customer_notice_group_members(uuid,text,text,text,text,text,text,uuid[],boolean,text,text[],text,boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.customer_notice_bell(uuid,uuid,uuid,text,text,text,text,text,text,uuid,uuid,jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.customer_notice_enqueue_email(uuid,text,text,text,text,text,text,text[],text,text,boolean,uuid,uuid) TO service_role;

-- 4) 貸切グループのお知らせ（チャットのシステムお知らせ）からベル・メール --------------------------
-- 段階 2 の方針「知らせる＝チャットに記録を残す」を、ベル・メールでも本人へ届ける。
-- コミット時に動かす（承認でお知らせのあとにアンケートの締切を固める、取消で予約とグループを続けて閉じる、などの順番に左右されないため）。
-- 状態（グループが確定・閉じた など）を確かめてから出すので、お知らせの形だけを真似た書き込みでは出ない。
CREATE OR REPLACE FUNCTION public.customer_notice_on_group_message()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $function$
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
    v_lines := v_lines || ARRAY['','■ 公演前アンケート','当日の準備のため、グループ画面の「アンケート」からご回答をお願いします。',
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
     'アンケートに回答してください',
     format('「%s」の貸切の公演前アンケートにご回答ください。%s',v_work,coalesce('回答期限は'||v_deadline||'です。','')),
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
END $function$;
REVOKE ALL ON FUNCTION public.customer_notice_on_group_message() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS customer_notice_on_group_message ON public.private_group_messages;
CREATE CONSTRAINT TRIGGER customer_notice_on_group_message AFTER INSERT ON public.private_group_messages
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW WHEN (NEW.message ~ '^\s*\{')
 EXECUTE FUNCTION public.customer_notice_on_group_message();

-- 5) 予約の出来事からベル ------------------------------------------------------------
-- 予約の行き先: 貸切グループがあればグループページ、無ければ予約詳細
CREATE OR REPLACE FUNCTION public.customer_notice_reservation_link(p_reservation public.reservations)
 RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $$
  SELECT coalesce((SELECT '/group/invite/'||g.invite_code FROM public.private_groups g
                    WHERE g.id=p_reservation.private_group_id AND g.organization_id=p_reservation.organization_id),
                  '/mypage/reservation/'||p_reservation.id::text)
$$;
REVOKE ALL ON FUNCTION public.customer_notice_reservation_link(public.reservations) FROM PUBLIC, anon, authenticated;

-- 貸切リクエストを受け付けた → 申込者（ベル。メールは既存の受付メール）
CREATE OR REPLACE FUNCTION public.customer_notice_on_private_request()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $function$
DECLARE v_user uuid; v_count integer;
BEGIN
 BEGIN
  SELECT user_id INTO v_user FROM public.customers WHERE id=NEW.customer_id;
  v_count := CASE WHEN jsonb_typeof(NEW.candidate_datetimes->'candidates')='array' THEN jsonb_array_length(NEW.candidate_datetimes->'candidates') END;
  PERFORM public.customer_notice_bell(v_user,NEW.customer_id,NEW.organization_id,'system','private_request_received','private_request_received:'||NEW.id::text,
   '貸切リクエストを受け付けました',
   format('「%s」の貸切リクエストを受け付けました%s。店舗が日程を確定するとお知らせします。',public.customer_notice_work_title(NEW.title),
    coalesce('（候補日 '||v_count||'件）','')),
   public.customer_notice_reservation_link(NEW),NEW.id,NULL,jsonb_build_object('reservation_number',NEW.reservation_number));
 EXCEPTION WHEN others THEN
  RAISE WARNING 'customer_notice_on_private_request failed: %', SQLERRM;
 END;
 RETURN NULL;
END $function$;
REVOKE ALL ON FUNCTION public.customer_notice_on_private_request() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS customer_notice_on_private_request ON public.reservations;
CREATE TRIGGER customer_notice_on_private_request AFTER INSERT ON public.reservations
 FOR EACH ROW WHEN (NEW.customer_id IS NOT NULL AND (NEW.private_group_id IS NOT NULL OR NEW.reservation_source='web_private'))
 EXECUTE FUNCTION public.customer_notice_on_private_request();

-- 予約が取り消された → 予約者（ベル）。貸切の取り下げは控えのメールも（取り下げにはメールが無かった）
CREATE OR REPLACE FUNCTION public.customer_notice_on_reservation_cancelled()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $function$
DECLARE v_user uuid; v_work text; v_when text; v_event_cancelled boolean; v_private boolean; v_link text; v_key text;
 v_title text; v_msg text; v_kind text; v_bell uuid; v_email text; v_name text; v_count integer; v_group boolean;
BEGIN
 BEGIN
  SELECT user_id INTO v_user FROM public.customers WHERE id=NEW.customer_id;
  v_work := public.customer_notice_work_title(NEW.title);
  SELECT public.customer_notice_when(e.date,e.start_time), coalesce(e.is_cancelled,false) INTO v_when, v_event_cancelled
    FROM public.schedule_events e WHERE e.id=NEW.schedule_event_id;
  v_private := NEW.private_group_id IS NOT NULL OR NEW.reservation_source='web_private';
  v_link := public.customer_notice_reservation_link(NEW);
  v_key := 'reservation_cancelled:'||NEW.id::text||':'||coalesce(floor(extract(epoch FROM NEW.cancelled_at))::bigint::text,'0');
  IF NOT v_private THEN
   IF coalesce(NEW.cancellation_reason,'') LIKE '%公演中止%' OR coalesce(v_event_cancelled,false) THEN
    v_kind := 'performance_cancelled'; v_title := '公演が中止になりました';
    v_msg := format('「%s」%sの公演は中止になりました。',v_work,coalesce(' '||v_when,''));
   ELSE
    v_kind := 'reservation_cancelled'; v_title := '予約がキャンセルされました';
    v_msg := format('「%s」%sのご予約はキャンセルされました。',v_work,coalesce(' '||v_when,''));
   END IF;
  ELSIF NEW.cancellation_reason='お客様による貸切申込の取り下げ' THEN
   v_kind := 'private_withdrawn'; v_title := '貸切の申込を取り下げました';
   v_msg := format('「%s」の貸切の申込を取り下げました（予約番号 %s）。',v_work,coalesce(NEW.reservation_number,'-'));
  ELSIF NEW.cancellation_reason='貸切リクエストを却下しました' THEN
   v_kind := 'private_rejected'; v_title := '店舗が貸切の申込をお断りしました';
   v_msg := format('「%s」の貸切の申込は、店舗の都合によりお受けできませんでした。詳しくはお送りしたメール・グループのお知らせをご確認ください。',v_work);
  ELSE
   v_kind := 'private_cancelled'; v_title := '貸切のご予約がキャンセルされました';
   v_msg := format('「%s」の貸切%sはキャンセルされました。',v_work,coalesce('（'||v_when||'）',''));
  END IF;
  v_bell := public.customer_notice_bell(v_user,NEW.customer_id,NEW.organization_id,'reservation_cancelled',v_kind,v_key,v_title,v_msg,v_link,
   NEW.id,NEW.schedule_event_id,jsonb_build_object('reservation_number',NEW.reservation_number,'cancellation_reason',NEW.cancellation_reason));
  IF v_kind='private_withdrawn' THEN
   -- 控えのメール（申込者）
   SELECT c.email, c.name INTO v_email, v_name FROM public.customer_notice_user_contact(v_user) c WHERE v_user IS NOT NULL;
   v_email := coalesce(nullif(btrim(NEW.customer_email),''),(SELECT nullif(btrim(email),'') FROM public.customers WHERE id=NEW.customer_id),v_email);
   v_name := coalesce(nullif(btrim(NEW.customer_name),''),v_name);
   v_count := CASE WHEN jsonb_typeof(NEW.candidate_datetimes->'candidates')='array' THEN jsonb_array_length(NEW.candidate_datetimes->'candidates') END;
   v_group := NEW.private_group_id IS NOT NULL;
   PERFORM public.customer_notice_enqueue_email(NEW.organization_id,'private_withdrawn',v_key||':mail','reservation_cancelled',v_email,v_name,
    '【申込の取り下げ】'||v_work,
    ARRAY[format('「%s」の貸切の申込を取り下げました。控えとしてお送りします。',v_work),'','■ 取り下げた申込','作品: '||v_work,
     CASE WHEN NEW.reservation_number IS NOT NULL THEN '予約番号: '||NEW.reservation_number END,
     CASE WHEN v_count IS NOT NULL THEN '候補日: '||v_count||'件（申込中だったもの）' END,
     CASE WHEN NEW.participant_count IS NOT NULL THEN '参加人数: '||NEW.participant_count||'名' END,
     CASE WHEN v_group THEN '' END,
     CASE WHEN v_group THEN 'グループは閉じられ、メンバーの皆さまにもお知らせしました。' END],
    v_link,
    CASE WHEN v_group THEN 'ご不明な点は、グループ画面の歯車マークから「店舗へのお問い合わせ」をご利用ください。' END,
    false,v_bell);
  END IF;
 EXCEPTION WHEN others THEN
  RAISE WARNING 'customer_notice_on_reservation_cancelled failed: %', SQLERRM;
 END;
 RETURN NULL;
END $function$;
REVOKE ALL ON FUNCTION public.customer_notice_on_reservation_cancelled() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS customer_notice_on_reservation_cancelled ON public.reservations;
CREATE TRIGGER customer_notice_on_reservation_cancelled AFTER UPDATE OF status ON public.reservations
 FOR EACH ROW WHEN (NEW.status='cancelled' AND OLD.status IS DISTINCT FROM 'cancelled' AND NEW.customer_id IS NOT NULL)
 EXECUTE FUNCTION public.customer_notice_on_reservation_cancelled();

-- 人数を変更した → 予約者（ベル。メールは既存の変更確認メール）。一般公演だけ（貸切の人数はグループで扱う）
CREATE OR REPLACE FUNCTION public.customer_notice_on_participants_changed()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $function$
DECLARE v_user uuid; v_when text;
BEGIN
 BEGIN
  SELECT user_id INTO v_user FROM public.customers WHERE id=NEW.customer_id;
  SELECT public.customer_notice_when(e.date,e.start_time) INTO v_when FROM public.schedule_events e WHERE e.id=NEW.schedule_event_id;
  PERFORM public.customer_notice_bell(v_user,NEW.customer_id,NEW.organization_id,'reservation_changed','participants_changed',
   'participants_changed:'||NEW.id::text||':'||txid_current()::text||':'||NEW.participant_count::text,
   '参加人数を変更しました',
   format('「%s」%sの参加人数を%s名から%s名に変更しました。',public.customer_notice_work_title(NEW.title),coalesce(' '||v_when,''),
    OLD.participant_count,NEW.participant_count),
   public.customer_notice_reservation_link(NEW),NEW.id,NEW.schedule_event_id,
   jsonb_build_object('reservation_number',NEW.reservation_number,'from',OLD.participant_count,'to',NEW.participant_count));
 EXCEPTION WHEN others THEN
  RAISE WARNING 'customer_notice_on_participants_changed failed: %', SQLERRM;
 END;
 RETURN NULL;
END $function$;
REVOKE ALL ON FUNCTION public.customer_notice_on_participants_changed() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS customer_notice_on_participants_changed ON public.reservations;
CREATE TRIGGER customer_notice_on_participants_changed AFTER UPDATE OF participant_count ON public.reservations
 FOR EACH ROW WHEN (NEW.participant_count IS DISTINCT FROM OLD.participant_count AND OLD.participant_count IS NOT NULL
  AND NEW.participant_count IS NOT NULL AND NEW.status=OLD.status AND NEW.status IN ('pending','confirmed','gm_confirmed')
  AND NEW.customer_id IS NOT NULL AND NEW.private_group_id IS NULL AND NEW.reservation_source IS DISTINCT FROM 'web_private')
 EXECUTE FUNCTION public.customer_notice_on_participants_changed();

-- 既存の「予約が確定しました」ベル: 押した先を予約詳細に。貸切グループの予約は 4) の「日程が確定しました」で出すので出さない
CREATE OR REPLACE FUNCTION public.notify_on_reservation_confirmed()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_customer_user_id UUID;
  v_existing_notification_id UUID;
BEGIN
  -- customer_id が NULL の場合はスキップ（スタッフ予約など）
  IF NEW.customer_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- 貸切グループの予約はグループのお知らせ（日程が確定しました）で全員に出す（段階 4）
  IF NEW.private_group_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  -- 予約がconfirmedまたはgm_confirmedになった場合
  IF NEW.status IN ('confirmed', 'gm_confirmed') AND
     (OLD.status IS NULL OR OLD.status NOT IN ('confirmed', 'gm_confirmed')) THEN

    -- 既に同じ予約に対する確定通知が存在するかチェック（重複防止）
    SELECT id INTO v_existing_notification_id
    FROM user_notifications
    WHERE related_reservation_id = NEW.id
      AND type = 'reservation_confirmed'
    LIMIT 1;

    -- 既存の通知がある場合はスキップ
    IF v_existing_notification_id IS NOT NULL THEN
      RETURN NEW;
    END IF;

    -- 顧客のuser_idを取得
    SELECT user_id INTO v_customer_user_id
    FROM customers
    WHERE id = NEW.customer_id;

    -- user_id も customer_id も NULL の場合はスキップ
    IF v_customer_user_id IS NULL AND NEW.customer_id IS NULL THEN
      RETURN NEW;
    END IF;

    -- 通知を作成（押した先は予約詳細）
    PERFORM create_notification(
      v_customer_user_id,
      NEW.customer_id,
      NEW.organization_id,
      'reservation_confirmed',
      '予約が確定しました',
      '「' || COALESCE(NEW.title, '公演') || '」のご予約を承りました',
      '/mypage/reservation/' || NEW.id::text,
      NEW.id,
      NEW.schedule_event_id,
      NULL,
      jsonb_build_object('reservation_number', NEW.reservation_number)
    );
  END IF;

  RETURN NEW;
END;
$function$;

-- 6) 開催決定・前日のご案内・クーポン・アンケートのリマインド -----------------------------
-- 開催が決定した（メールが送れたとき） → 予約者（ベル）
CREATE OR REPLACE FUNCTION public.customer_notice_on_performance_confirmed()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $function$
DECLARE r public.reservations%ROWTYPE; v_user uuid; v_when text;
BEGIN
 BEGIN
  SELECT * INTO r FROM public.reservations WHERE id=NEW.reservation_id AND organization_id=NEW.organization_id;
  IF NOT FOUND OR r.customer_id IS NULL THEN RETURN NULL; END IF;
  SELECT user_id INTO v_user FROM public.customers WHERE id=r.customer_id;
  SELECT public.customer_notice_when(e.date,e.start_time) INTO v_when FROM public.schedule_events e WHERE e.id=NEW.schedule_event_id;
  PERFORM public.customer_notice_bell(v_user,r.customer_id,r.organization_id,'reservation_confirmed','performance_confirmed',
   'performance_confirmed:'||NEW.id::text,'公演の開催が決定しました',
   format('「%s」%sの公演は開催が決定しました。当日のご来店をお待ちしております。',public.customer_notice_work_title(r.title),coalesce(' '||v_when,'')),
   public.customer_notice_reservation_link(r),r.id,NEW.schedule_event_id,jsonb_build_object('reservation_number',r.reservation_number));
 EXCEPTION WHEN others THEN
  RAISE WARNING 'customer_notice_on_performance_confirmed failed: %', SQLERRM;
 END;
 RETURN NULL;
END $function$;
REVOKE ALL ON FUNCTION public.customer_notice_on_performance_confirmed() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS customer_notice_on_performance_confirmed ON public.performance_recruitment_notices;
CREATE TRIGGER customer_notice_on_performance_confirmed AFTER UPDATE OF status ON public.performance_recruitment_notices
 FOR EACH ROW WHEN (NEW.status='sent' AND OLD.status IS DISTINCT FROM 'sent' AND NEW.kind='confirmed')
 EXECUTE FUNCTION public.customer_notice_on_performance_confirmed();

-- 前日のご案内などのリマインド（メールが送れたとき） → 予約者（ベル）
CREATE OR REPLACE FUNCTION public.customer_notice_on_reminder_sent()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $function$
DECLARE r public.reservations%ROWTYPE; e record; v_user uuid; v_title text;
BEGIN
 BEGIN
  SELECT * INTO r FROM public.reservations WHERE id=NEW.reservation_id AND organization_id=NEW.organization_id;
  IF NOT FOUND OR r.customer_id IS NULL THEN RETURN NULL; END IF;
  SELECT user_id INTO v_user FROM public.customers WHERE id=r.customer_id;
  SELECT ev.date, ev.start_time, coalesce(st.name, ev.venue) AS venue INTO e
    FROM public.schedule_events ev LEFT JOIN public.stores st ON st.id=ev.store_id WHERE ev.id=NEW.schedule_event_id;
  v_title := CASE NEW.days_before WHEN 0 THEN '本日の公演のご案内' WHEN 1 THEN '明日の公演のご案内' ELSE NEW.days_before||'日後の公演のご案内' END;
  PERFORM public.customer_notice_bell(v_user,r.customer_id,r.organization_id,'reservation_reminder','reminder','reminder:'||NEW.id::text,v_title,
   format('「%s」%s%s。ご来店をお待ちしております。',public.customer_notice_work_title(coalesce(r.title,'')),
    coalesce(' '||public.customer_notice_when(e.date,e.start_time)||'開演',''),coalesce('（'||e.venue||'）','')),
   public.customer_notice_reservation_link(r),r.id,NEW.schedule_event_id,
   jsonb_build_object('reservation_number',r.reservation_number,'days_before',NEW.days_before));
 EXCEPTION WHEN others THEN
  RAISE WARNING 'customer_notice_on_reminder_sent failed: %', SQLERRM;
 END;
 RETURN NULL;
END $function$;
REVOKE ALL ON FUNCTION public.customer_notice_on_reminder_sent() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS customer_notice_on_reminder_sent ON public.scheduled_reminder_deliveries;
CREATE TRIGGER customer_notice_on_reminder_sent AFTER UPDATE OF status ON public.scheduled_reminder_deliveries
 FOR EACH ROW WHEN (NEW.status='sent' AND OLD.status IS DISTINCT FROM 'sent')
 EXECUTE FUNCTION public.customer_notice_on_reminder_sent();

-- クーポンが付与された → 持ち主（ベル。付与のメールは既存の send-coupon-granted）
CREATE OR REPLACE FUNCTION public.customer_notice_on_coupon_granted()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $function$
DECLARE c record; v_user uuid;
BEGIN
 BEGIN
  SELECT user_id INTO v_user FROM public.customers WHERE id=NEW.customer_id;
  IF v_user IS NULL THEN RETURN NULL; END IF;
  SELECT name, discount_type, discount_amount INTO c FROM public.coupon_campaigns WHERE id=NEW.campaign_id;
  PERFORM public.customer_notice_bell(v_user,NEW.customer_id,NEW.organization_id,'system','coupon_granted','coupon_granted:'||NEW.id::text,
   'クーポンが付与されました',
   format('「%s」%sが使えるようになりました。%s',coalesce(nullif(btrim(c.name),''),'クーポン'),
    CASE c.discount_type WHEN 'fixed' THEN '（'||c.discount_amount||'円引き）' WHEN 'percentage' THEN '（'||c.discount_amount||'%引き）' ELSE '' END,
    coalesce('有効期限は'||to_char(NEW.expires_at AT TIME ZONE 'Asia/Tokyo','FMYYYY/FMMM/FMDD')||'までです。','')),
   '/mypage?tab=coupons',NULL,NULL,jsonb_build_object('customer_coupon_id',NEW.id));
 EXCEPTION WHEN others THEN
  RAISE WARNING 'customer_notice_on_coupon_granted failed: %', SQLERRM;
 END;
 RETURN NULL;
END $function$;
REVOKE ALL ON FUNCTION public.customer_notice_on_coupon_granted() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS customer_notice_on_coupon_granted ON public.customer_coupons;
CREATE TRIGGER customer_notice_on_coupon_granted AFTER INSERT ON public.customer_coupons
 FOR EACH ROW WHEN (NEW.status='active') EXECUTE FUNCTION public.customer_notice_on_coupon_granted();

-- アンケートのリマインドを積んだ → その会員（ベル。メールはリマインドそのもの）
CREATE OR REPLACE FUNCTION public.customer_notice_on_survey_reminder()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $function$
DECLARE g public.private_groups%ROWTYPE; v_user uuid;
BEGIN
 BEGIN
  SELECT user_id INTO v_user FROM public.private_group_members WHERE id=NEW.member_id AND group_id=NEW.group_id;
  IF v_user IS NULL THEN RETURN NULL; END IF;
  SELECT * INTO g FROM public.private_groups WHERE id=NEW.group_id;
  PERFORM public.customer_notice_bell(v_user,NULL,g.organization_id,'system','private_survey','private_survey_reminder:'||NEW.id::text,
   'アンケートに回答してください',
   format('「%s」の貸切の公演前アンケートにご回答ください。回答期限は%sです。',
    coalesce((SELECT s.title FROM public.scenario_masters s WHERE s.id=g.scenario_master_id),'貸切'),
    public.customer_notice_when((NEW.deadline_at AT TIME ZONE 'Asia/Tokyo')::date)),
   '/group/invite/'||g.invite_code||'?tab=survey',NULL,NULL,jsonb_build_object('group_id',g.id));
 EXCEPTION WHEN others THEN
  RAISE WARNING 'customer_notice_on_survey_reminder failed: %', SQLERRM;
 END;
 RETURN NULL;
END $function$;
REVOKE ALL ON FUNCTION public.customer_notice_on_survey_reminder() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS customer_notice_on_survey_reminder ON public.private_group_survey_reminders;
CREATE TRIGGER customer_notice_on_survey_reminder AFTER INSERT ON public.private_group_survey_reminders
 FOR EACH ROW WHEN (NEW.kind<>'preview') EXECUTE FUNCTION public.customer_notice_on_survey_reminder();

-- 7) 主催者の引き継ぎ（段階 3 のベル）にメールを添える：依頼が届いた（宛先）・成立した（両者）・期限切れ（両者）
CREATE OR REPLACE FUNCTION public.customer_notice_on_handover_bell()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $function$
DECLARE v_email text; v_name text;
BEGIN
 BEGIN
  IF NEW.user_id IS NULL OR NEW.organization_id IS NULL OR coalesce(NEW.metadata->>'status','') NOT IN ('requested','accepted','expired') THEN RETURN NULL; END IF;
  SELECT c.email, c.name INTO v_email, v_name FROM public.customer_notice_user_contact(NEW.user_id) c;
  PERFORM public.customer_notice_enqueue_email(NEW.organization_id,'private_group_handover','private_group_handover:'||NEW.id::text,'other',
   v_email,v_name,'【主催者の引き継ぎ】'||NEW.title,ARRAY[NEW.message],NEW.link,
   'ご不明な点は、グループ画面の歯車マークから「店舗へのお問い合わせ」をご利用ください。',false,NEW.id);
 EXCEPTION WHEN others THEN
  RAISE WARNING 'customer_notice_on_handover_bell failed: %', SQLERRM;
 END;
 RETURN NULL;
END $function$;
REVOKE ALL ON FUNCTION public.customer_notice_on_handover_bell() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS customer_notice_on_handover_bell ON public.user_notifications;
CREATE TRIGGER customer_notice_on_handover_bell AFTER INSERT ON public.user_notifications
 FOR EACH ROW WHEN (NEW.metadata->>'kind'='private_group_handover')
 EXECUTE FUNCTION public.customer_notice_on_handover_bell();

-- 8) メンバーから外された本人へ（段階 2 の積み残し。外された本人はチャットを読めなくなるのでメール必須）
CREATE OR REPLACE FUNCTION public.private_group_remove_member_with_notice(p_member_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE target public.private_group_members%ROWTYPE; g public.private_groups%ROWTYPE; r public.reservations%ROWTYPE;
 v_name text; v_before integer; v_channel text; v_body text; v_store boolean:=false;
 v_to_email text; v_to_name text; v_work text; v_bell uuid;
BEGIN
 SELECT * INTO target FROM public.private_group_members WHERE id=p_member_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'メンバーを削除できません' USING ERRCODE='42501'; END IF;
 SELECT * INTO g FROM public.private_groups WHERE id=target.group_id;
 SELECT count(*) INTO v_before FROM public.private_group_members WHERE group_id=g.id AND status='joined';
 v_name:=CASE WHEN target.user_id IS NULL THEN nullif(btrim(target.guest_name),'') ELSE coalesce(
   (SELECT coalesce(nullif(c.nickname,''),nullif(c.name,'')) FROM public.customers c WHERE c.user_id=target.user_id ORDER BY c.id LIMIT 1),
   nullif(btrim(target.guest_name),'')) END;
 -- 外された本人の宛先（削除で個人情報の行も消えるので先に読む）
 IF target.user_id IS NOT NULL THEN
  SELECT c.email, c.name INTO v_to_email, v_to_name FROM public.customer_notice_user_contact(target.user_id) c;
 ELSE
  SELECT coalesce(nullif(btrim(p.guest_email),''),nullif(btrim(target.guest_email),'')), coalesce(nullif(btrim(p.guest_name),''),nullif(btrim(target.guest_name),''))
    INTO v_to_email, v_to_name FROM (SELECT 1) x LEFT JOIN public.private_group_members_pii p ON p.member_id=target.id;
 END IF;
 -- 権限確認・クーポン解放・削除は既存の関数に任せる（主催者・スタッフのみ）
 PERFORM public.private_group_remove_member(p_member_id);
 IF EXISTS(SELECT 1 FROM public.private_group_members WHERE id=p_member_id) THEN
  RAISE EXCEPTION 'メンバーを外せませんでした' USING ERRCODE='P0001';
 END IF;
 IF target.status IS DISTINCT FROM 'joined' THEN RETURN jsonb_build_object('store_notified',false); END IF;
 INSERT INTO public.private_group_messages(group_id,sender_type,message) VALUES(g.id,'system',
  jsonb_build_object('type','system','action','member_removed','memberName',coalesce(v_name,'メンバー'))::text);
 -- 外された本人へ（会員はベル＋メール、ゲストはメール）。知らせの失敗で外す処理は止めない
 BEGIN
  v_work := coalesce((SELECT s.title FROM public.scenario_masters s WHERE s.id=g.scenario_master_id),'貸切');
  IF target.user_id IS NOT NULL THEN
   v_bell := public.customer_notice_bell(target.user_id,NULL,g.organization_id,'system','private_member_removed',
    'private_member_removed:'||p_member_id::text,'貸切グループから外れました',
    format('「%s」の貸切グループから、主催者（または店舗）の操作により外れました。',v_work),'/mypage?tab=reservations&sub=private',NULL,NULL,
    jsonb_build_object('group_id',g.id));
  END IF;
  PERFORM public.customer_notice_enqueue_email(g.organization_id,'private_member_removed','private_member_removed:'||p_member_id::text,'other',
   v_to_email,v_to_name,'【お知らせ】「'||v_work||'」の貸切グループから外れました',
   ARRAY[format('「%s」の貸切グループから、主催者（または店舗）の操作により外れました。',v_work),
    'このグループのチャットや日程の回答は見られなくなります。'],
   NULL,'お心当たりがない場合は、主催者の方か店舗へお問い合わせください。',false,v_bell);
 EXCEPTION WHEN others THEN
  RAISE WARNING 'private_group_remove_member_with_notice notice failed: %', SQLERRM;
 END;
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

-- 9) プロフィールの登録が未完了（ニックネーム無しの会員に 1 回だけ）。画面が通知を読む前に呼ぶ
CREATE OR REPLACE FUNCTION public.ensure_profile_incomplete_notice()
 RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $function$
DECLARE v_uid uuid := auth.uid(); c public.customers%ROWTYPE;
BEGIN
 IF v_uid IS NULL THEN RETURN false; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.users u WHERE u.id=v_uid AND u.role='customer') THEN RETURN false; END IF;
 IF EXISTS(SELECT 1 FROM public.user_notifications WHERE metadata->>'dedupe_key'='profile_incomplete:'||v_uid::text) THEN RETURN false; END IF;
 SELECT * INTO c FROM public.customers WHERE user_id=v_uid ORDER BY organization_id NULLS FIRST, created_at, id LIMIT 1;
 IF NOT FOUND OR nullif(btrim(c.nickname),'') IS NOT NULL THEN RETURN false; END IF;
 RETURN public.customer_notice_bell(v_uid,NULL,NULL,'system','profile_incomplete','profile_incomplete:'||v_uid::text,
  'プロフィールの登録をお願いします',
  'ニックネームを登録すると、貸切グループのメンバー一覧やチャットに表示されます。マイページの「設定」から登録できます。',
  '/mypage?tab=settings') IS NOT NULL;
END $function$;
REVOKE ALL ON FUNCTION public.ensure_profile_incomplete_notice() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ensure_profile_incomplete_notice() TO authenticated, service_role;

-- 10) 送信処理が使う（取り出し・結果の記録）。app_config の customer_notice_email が 'on' の環境だけ取り出す
CREATE OR REPLACE FUNCTION public.claim_customer_notice_emails(p_limit integer DEFAULT 20)
 RETURNS TABLE(id uuid, organization_id uuid, kind text, email_type text, to_email text, to_name text, subject text, body_text text,
  reply_to text, sender_name text)
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $function$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.app_config WHERE key='customer_notice_email' AND value='on') THEN RETURN; END IF;
 RETURN QUERY
 WITH picked AS (
  SELECT q.id FROM public.customer_notice_emails q
   WHERE (q.status='pending' OR (q.status='sending' AND q.lease_until<clock_timestamp())) AND q.next_attempt_at<=clock_timestamp() AND q.attempt_count<5
   ORDER BY q.next_attempt_at, q.id LIMIT LEAST(GREATEST(coalesce(p_limit,20),1),50) FOR UPDATE SKIP LOCKED
 ), leased AS (
  UPDATE public.customer_notice_emails q SET status='sending', attempt_count=q.attempt_count+1, lease_until=clock_timestamp()+interval '10 minutes'
    FROM picked WHERE q.id=picked.id RETURNING q.*
 )
 SELECT l.id, l.organization_id, l.kind, l.email_type, l.to_email, l.to_name, l.subject, l.body_text, l.reply_to, l.sender_name FROM leased l;
END $function$;
REVOKE ALL ON FUNCTION public.claim_customer_notice_emails(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_customer_notice_emails(integer) TO service_role;

CREATE OR REPLACE FUNCTION public.finish_customer_notice_email(p_id uuid, p_ok boolean, p_provider_message_id text DEFAULT NULL,
  p_error text DEFAULT NULL, p_email_log_id uuid DEFAULT NULL, p_retry boolean DEFAULT true)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $function$
BEGIN
 UPDATE public.customer_notice_emails q
    SET status = CASE WHEN p_ok THEN 'sent' WHEN p_retry AND q.attempt_count<5 THEN 'pending' ELSE 'failed' END,
        sent_at = CASE WHEN p_ok THEN clock_timestamp() ELSE q.sent_at END,
        provider_message_id = coalesce(p_provider_message_id, q.provider_message_id),
        email_log_id = coalesce(p_email_log_id, q.email_log_id),
        last_error = CASE WHEN p_ok THEN NULL ELSE left(p_error, 500) END,
        next_attempt_at = CASE WHEN p_ok THEN q.next_attempt_at ELSE clock_timestamp() + make_interval(mins => 5 * q.attempt_count) END,
        lease_until = NULL
  WHERE q.id=p_id AND q.status='sending';
END $function$;
REVOKE ALL ON FUNCTION public.finish_customer_notice_email(uuid,boolean,text,text,uuid,boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finish_customer_notice_email(uuid,boolean,text,text,uuid,boolean) TO service_role;

-- 11) 5 分ごとに送信処理を呼ぶ（送信待ちがあり、送信が有効な環境だけ）
DO $$
BEGIN
  IF to_regclass('cron.job') IS NULL THEN RAISE NOTICE 'pg_cron is not available; skipped'; RETURN; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.app_config WHERE key='supabase_url' AND value ~ '^https://[a-z0-9]+\.supabase\.co/?$')
    OR NOT EXISTS(SELECT 1 FROM public.app_config WHERE key='supabase_anon_key' AND length(value)>0)
    OR NOT EXISTS(SELECT 1 FROM public.app_config WHERE key='trigger_secret' AND length(value)>0)
    THEN
    RAISE NOTICE 'customer notice cron configuration missing; skipped'; RETURN;
  END IF;
  PERFORM cron.schedule('process-customer-notice-emails','*/5 * * * *',$job$
    SELECT net.http_post(
      url := rtrim((SELECT value FROM public.app_config WHERE key='supabase_url'),'/') || '/functions/v1/process-customer-notice-emails',
      headers := jsonb_build_object('Content-Type','application/json',
        'Authorization','Bearer ' || (SELECT value FROM public.app_config WHERE key='supabase_anon_key'),
        'x-cron-secret',(SELECT value FROM public.app_config WHERE key='trigger_secret')),
      body := '{}'::jsonb,timeout_milliseconds := 60000
    )
    WHERE EXISTS (SELECT 1 FROM public.app_config WHERE key='customer_notice_email' AND value='on')
      AND EXISTS (SELECT 1 FROM public.customer_notice_emails WHERE status IN ('pending','sending') AND next_attempt_at<=clock_timestamp());
  $job$);
END $$;

-- 12) お知らせ「マイページが新しくなりました」（本番反映の直後に 1 回だけ流す。何度呼んでも 1 人 1 件）
-- 対象: 貸切グループの主催者またはメンバーだったことがある会員。組織は関わったグループの組織（複数なら最近のもの 1 件）
-- 呼び方: SELECT public.announce_mypage_update_2026_10();  （戻り値 = 今回新しく積んだ件数）
CREATE OR REPLACE FUNCTION public.announce_mypage_update_2026_10()
 RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $function$
DECLARE n integer;
BEGIN
 WITH targets AS (
  SELECT DISTINCT ON (x.user_id) x.user_id, x.organization_id
    FROM (SELECT g.organizer_id AS user_id, g.organization_id, g.created_at FROM public.private_groups g
          UNION ALL
          SELECT m.user_id, g.organization_id, coalesce(m.joined_at,m.created_at) FROM public.private_group_members m
            JOIN public.private_groups g ON g.id=m.group_id WHERE m.user_id IS NOT NULL) x
    JOIN auth.users au ON au.id=x.user_id
   ORDER BY x.user_id, x.created_at DESC
 ), ins AS (
  INSERT INTO public.user_notifications(user_id,organization_id,type,title,message,link,metadata)
  SELECT t.user_id,t.organization_id,'system','マイページが新しくなりました',
   '貸切の予約が「貸切」タブに 1 件ずつ並ぶようになりました。カード右上の「操作」から、申込の取り下げやメンバーの管理、店舗への問い合わせができます。主催者の引き継ぎもここから行えます。',
   '/mypage?tab=reservations&sub=private',
   jsonb_build_object('kind','release_note','key','mypage-2026-10','dedupe_key','release_note:mypage-2026-10:'||t.user_id::text)
  FROM targets t
  ON CONFLICT ((metadata->>'dedupe_key')) WHERE (metadata ? 'dedupe_key') DO NOTHING
  RETURNING 1
 )
 SELECT count(*) INTO n FROM ins;
 RETURN n;
END $function$;
REVOKE ALL ON FUNCTION public.announce_mypage_update_2026_10() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.announce_mypage_update_2026_10() TO service_role;
