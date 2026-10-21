-- 日程がそろった通知（主催者にベル＋メール、会員のメンバーにベル）。
-- 2026-10-20 staging 点検: メンバーが候補日を 1 つずつ回答するたびに通知が飛んでいた（候補日ごとに別の通知として数えていたため）。
-- 送る条件: 店舗への申込前で、参加中の全員（2 名以上）が有効な全候補日に回答し終え、全員が「参加できる」の候補日があるとき。
-- 1 回だけ: 「回」はグループの候補日がいちばん最後に追加された時刻で区切る。同じ回では 1 回だけ（重複防止の鍵に回を入れる）。
--   新しい候補日が追加されると回が変わり、未回答が生じるので、全員がそろい直したらもう一度だけ送る（取り下げでは回は変わらない）。
-- 時間帯の表記は「午前」「午後」「夜」（保存値の「夜間」は「夜」にする）。
CREATE OR REPLACE FUNCTION public.private_group_notice_dates_aligned(p_group uuid)
 RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $function$
DECLARE g public.private_groups%ROWTYPE; c public.private_group_candidate_dates%ROWTYPE; n integer; v_round text; v_slot text;
 v_work text; v_when text; v_when_long text; v_link text; v_bell uuid; v_email text; v_name text; mem record;
BEGIN
 SELECT * INTO g FROM public.private_groups WHERE id = p_group;
 IF NOT FOUND OR g.status NOT IN ('gathering', 'date_adjusting') THEN RETURN false; END IF;
 IF g.reservation_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.reservations WHERE id = g.reservation_id AND status <> 'cancelled') THEN RETURN false; END IF;
 SELECT count(*) INTO n FROM public.private_group_members WHERE group_id = g.id AND status = 'joined';
 IF n < 2 THEN RETURN false; END IF;
 -- 有効な候補日が 1 件以上あり、参加中の全員がそのすべてに回答している（○△× のどれでもよい）
 IF NOT EXISTS (SELECT 1 FROM public.private_group_candidate_dates cd
   WHERE cd.group_id = g.id AND coalesce(cd.status, 'active') <> 'rejected' AND cd.withdrawn_at IS NULL) THEN RETURN false; END IF;
 IF EXISTS (SELECT 1 FROM public.private_group_candidate_dates cd
   CROSS JOIN public.private_group_members m
   WHERE cd.group_id = g.id AND coalesce(cd.status, 'active') <> 'rejected' AND cd.withdrawn_at IS NULL
     AND m.group_id = g.id AND m.status = 'joined'
     AND NOT EXISTS (SELECT 1 FROM public.private_group_date_responses r WHERE r.candidate_date_id = cd.id AND r.member_id = m.id)) THEN
  RETURN false;
 END IF;
 -- 全員が「参加できる」の候補日（複数あれば日付・開始の早い方）
 SELECT cd.* INTO c FROM public.private_group_candidate_dates cd
  WHERE cd.group_id = g.id AND coalesce(cd.status, 'active') <> 'rejected' AND cd.withdrawn_at IS NULL
    AND (SELECT count(*) FROM public.private_group_date_responses r JOIN public.private_group_members jm ON jm.id = r.member_id AND jm.status = 'joined'
          WHERE r.candidate_date_id = cd.id AND r.response = 'ok') >= n
  ORDER BY cd.date, cd.start_time, cd.id LIMIT 1;
 IF NOT FOUND THEN RETURN false; END IF;
 -- 回: 候補日がいちばん最後に追加された時刻（取り下げ・不採用の候補日も含めて数える）
 SELECT to_char(max(cd.created_at) AT TIME ZONE 'UTC', 'YYYYMMDDHH24MISSUS') INTO v_round
  FROM public.private_group_candidate_dates cd WHERE cd.group_id = g.id;
 v_slot := CASE WHEN c.time_slot IN ('morning', '午前', '朝') THEN '午前' WHEN c.time_slot IN ('afternoon', '午後', '昼') THEN '午後'
  WHEN c.time_slot IN ('evening', '夜', '夜間') THEN '夜' ELSE c.time_slot END;
 v_work := public.web_push_group_title(g.id);
 v_when := concat_ws(' ', public.customer_notice_when(c.date), v_slot);
 v_when_long := concat_ws(' ', public.customer_notice_when_long(c.date), v_slot);
 v_link := '/group/invite/' || g.invite_code || '?tab=dates';
 v_bell := public.customer_notice_bell(g.organizer_id, NULL, g.organization_id, 'system', 'private_dates_aligned',
  'private_dates_aligned:' || g.id::text || ':' || v_round || ':' || g.organizer_id::text, '日程がそろいました',
  format('「%s」の貸切は %s なら全員が参加できます。店舗に申し込みましょう。', v_work, v_when), v_link, NULL, NULL,
  jsonb_build_object('group_id', g.id, 'candidate_date_id', c.id));
 -- この回はもう送った（主催者のベルが重複で入らなかった）なら、メール・メンバーへのベルも送らない
 IF v_bell IS NULL THEN RETURN false; END IF;
 SELECT x.email, x.name INTO v_email, v_name FROM public.customer_notice_user_contact(g.organizer_id) x;
 PERFORM public.customer_notice_enqueue_email(g.organization_id, 'private_dates_aligned', 'private_dates_aligned:' || g.id::text || ':' || v_round || ':mail', 'other',
  v_email, v_name, '【日程がそろいました】' || v_work,
  ARRAY[format('「%s」の貸切の日程調整で、参加中の %s 名全員が全候補日に回答し、全員が「参加できる」候補日ができました。', v_work, n), '',
   '候補日: ' || v_when_long, '', 'グループ画面の「日程」から、この日で店舗に申し込めます。'],
  v_link, 'ご不明な点は、グループ画面の歯車マークから「店舗へのお問い合わせ」をご利用ください。', false, v_bell);
 FOR mem IN SELECT gm.user_id FROM public.private_group_members gm
   WHERE gm.group_id = g.id AND gm.status = 'joined' AND gm.user_id IS NOT NULL AND gm.user_id <> g.organizer_id AND NOT gm.is_organizer
 LOOP
  PERFORM public.customer_notice_bell(mem.user_id, NULL, g.organization_id, 'system', 'private_dates_aligned',
   'private_dates_aligned:' || g.id::text || ':' || v_round || ':' || mem.user_id::text, '日程がそろいました',
   format('「%s」の貸切は %s なら全員が参加できます。主催者の申込をお待ちください。', v_work, v_when), v_link, NULL, NULL,
   jsonb_build_object('group_id', g.id, 'candidate_date_id', c.id));
 END LOOP;
 RETURN true;
END $function$;
REVOKE ALL ON FUNCTION public.private_group_notice_dates_aligned(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.private_group_notice_dates_aligned(uuid) TO service_role;

-- 回答のたび（○ に限らず △・× でも）確かめる。最後の 1 件が × でも、全員 ○ の日があればそろった通知を送る。
CREATE OR REPLACE FUNCTION public.private_group_on_date_response()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $function$
BEGIN
 BEGIN
  PERFORM public.private_group_notice_dates_aligned(NEW.group_id);
 EXCEPTION WHEN others THEN
  RAISE WARNING 'private_group_on_date_response failed: %', SQLERRM;
 END;
 RETURN NULL;
END $function$;
REVOKE ALL ON FUNCTION public.private_group_on_date_response() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS private_group_on_date_response ON public.private_group_date_responses;
CREATE CONSTRAINT TRIGGER private_group_on_date_response AFTER INSERT OR UPDATE OF response ON public.private_group_date_responses
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
 EXECUTE FUNCTION public.private_group_on_date_response();
