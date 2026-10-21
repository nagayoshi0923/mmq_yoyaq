-- 20261020110000_private_group_dates_aligned_once の巻き戻し。
-- 日程がそろった通知は 20261010130000_private_group_web_push の定義（全員 ○ の候補日ごとに 1 回、○ の回答のときだけ確かめる）へ戻し、
-- 作品一覧用の関数 private_booking_scenario_date_reasons を消す。作られた通知ベル・積まれたメールは残る。
BEGIN;
DROP FUNCTION IF EXISTS public.private_booking_scenario_date_reasons(uuid, date, uuid[]);
CREATE OR REPLACE FUNCTION public.private_group_notice_dates_aligned(p_group uuid)
 RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $function$
DECLARE g public.private_groups%ROWTYPE; c public.private_group_candidate_dates%ROWTYPE; n integer; v_work text; v_when text; v_when_long text;
 v_link text; v_bell uuid; v_email text; v_name text; mem record;
BEGIN
 SELECT * INTO g FROM public.private_groups WHERE id = p_group;
 IF NOT FOUND OR g.status NOT IN ('gathering', 'date_adjusting') THEN RETURN false; END IF;
 IF g.reservation_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.reservations WHERE id = g.reservation_id AND status <> 'cancelled') THEN RETURN false; END IF;
 SELECT count(*) INTO n FROM public.private_group_members WHERE group_id = g.id AND status = 'joined';
 IF n < 2 THEN RETURN false; END IF;
 SELECT cd.* INTO c FROM public.private_group_candidate_dates cd
  WHERE cd.group_id = g.id AND coalesce(cd.status, 'active') <> 'rejected' AND cd.withdrawn_at IS NULL
    AND (SELECT count(*) FROM public.private_group_date_responses r JOIN public.private_group_members jm ON jm.id = r.member_id AND jm.status = 'joined'
          WHERE r.candidate_date_id = cd.id AND r.response = 'ok') >= n
  ORDER BY cd.date, cd.start_time, cd.id LIMIT 1;
 IF NOT FOUND THEN RETURN false; END IF;
 v_work := public.web_push_group_title(g.id);
 v_when := concat_ws(' ', public.customer_notice_when(c.date), c.time_slot);
 v_when_long := concat_ws(' ', public.customer_notice_when_long(c.date), c.time_slot);
 v_link := '/group/invite/' || g.invite_code || '?tab=dates';
 v_bell := public.customer_notice_bell(g.organizer_id, NULL, g.organization_id, 'system', 'private_dates_aligned',
  'private_dates_aligned:' || c.id::text || ':' || g.organizer_id::text, '日程がそろいました',
  format('「%s」の貸切は %s なら全員が参加できます。店舗に申し込みましょう。', v_work, v_when), v_link, NULL, NULL,
  jsonb_build_object('group_id', g.id, 'candidate_date_id', c.id));
 SELECT x.email, x.name INTO v_email, v_name FROM public.customer_notice_user_contact(g.organizer_id) x;
 PERFORM public.customer_notice_enqueue_email(g.organization_id, 'private_dates_aligned', 'private_dates_aligned:' || c.id::text || ':mail', 'other',
  v_email, v_name, '【日程がそろいました】' || v_work,
  ARRAY[format('「%s」の貸切の日程調整で、参加中の %s 名全員が「参加できる」と答えた候補日ができました。', v_work, n), '',
   '候補日: ' || v_when_long, '', 'グループ画面の「日程」から、この日で店舗に申し込めます。'],
  v_link, 'ご不明な点は、グループ画面の歯車マークから「店舗へのお問い合わせ」をご利用ください。', false, v_bell);
 FOR mem IN SELECT gm.user_id FROM public.private_group_members gm
   WHERE gm.group_id = g.id AND gm.status = 'joined' AND gm.user_id IS NOT NULL AND gm.user_id <> g.organizer_id AND NOT gm.is_organizer
 LOOP
  PERFORM public.customer_notice_bell(mem.user_id, NULL, g.organization_id, 'system', 'private_dates_aligned',
   'private_dates_aligned:' || c.id::text || ':' || mem.user_id::text, '日程がそろいました',
   format('「%s」の貸切は %s なら全員が参加できます。主催者の申込をお待ちください。', v_work, v_when), v_link, NULL, NULL,
   jsonb_build_object('group_id', g.id, 'candidate_date_id', c.id));
 END LOOP;
 RETURN true;
END $function$;
REVOKE ALL ON FUNCTION public.private_group_notice_dates_aligned(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.private_group_notice_dates_aligned(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.private_group_on_date_response()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $function$
BEGIN
 BEGIN
  IF NEW.response = 'ok' THEN PERFORM public.private_group_notice_dates_aligned(NEW.group_id); END IF;
 EXCEPTION WHEN others THEN
  RAISE WARNING 'private_group_on_date_response failed: %', SQLERRM;
 END;
 RETURN NULL;
END $function$;
REVOKE ALL ON FUNCTION public.private_group_on_date_response() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS private_group_on_date_response ON public.private_group_date_responses;
CREATE CONSTRAINT TRIGGER private_group_on_date_response AFTER INSERT OR UPDATE OF response ON public.private_group_date_responses
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW WHEN (NEW.response = 'ok')
 EXECUTE FUNCTION public.private_group_on_date_response();
COMMIT;
