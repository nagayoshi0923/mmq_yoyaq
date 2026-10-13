-- 正規定義（migration 20261010160000_private_group_memories.sql）。公演後の思い出（段階 4）: 公演の記録・感想・次の貸切のお知らせ・アルバムの代表写真・翌日の通知
-- 確定した公演（日時・店舗・人数）と、終わったか（終了時刻を過ぎた、または予約が完了扱い）。確定していなければ NULL
CREATE OR REPLACE FUNCTION public.private_group_performance_info(p_group uuid, p_now timestamptz DEFAULT clock_timestamp())
 RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $$
  SELECT jsonb_build_object('reservation_id', r.id, 'date', e.date, 'start_time', e.start_time, 'end_time', e.end_time,
    'store_name', coalesce(s.name, e.venue), 'participant_count', r.participant_count,
    'ended', (r.status = 'completed' OR ((e.date + coalesce(e.end_time, e.start_time, time '23:59')) AT TIME ZONE 'Asia/Tokyo') <= p_now))
  FROM public.private_groups g
  JOIN public.reservations r ON r.id = g.reservation_id AND r.organization_id = g.organization_id
  JOIN public.schedule_events e ON e.id = r.schedule_event_id AND e.organization_id = g.organization_id
  LEFT JOIN public.stores s ON s.id = e.store_id AND s.organization_id = g.organization_id
  WHERE g.id = p_group AND g.status <> 'cancelled' AND r.status IN ('confirmed', 'checked_in', 'completed')
    AND NOT coalesce(e.is_cancelled, false)
$$;
REVOKE ALL ON FUNCTION public.private_group_performance_info(uuid, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.private_group_performance_info(uuid, timestamptz) TO service_role;


-- 参加者本人（会員はログイン、ゲストは PIN の印）が使う公演後の操作
--   read: 公演の記録・自分の感想・店舗の外部アンケート（設定があれば）
--   save_feedback: 感想を書く・直す（公演が終わってから）
--   announce_next_group: 自分が作った新しいグループの招待を、このグループのチャットにお知らせとして流す（会員だけ・同じ店舗）
CREATE OR REPLACE FUNCTION public.private_group_after_action(p_group_id uuid, p_member_id uuid, p_action text, p_payload jsonb DEFAULT '{}'::jsonb, p_guest_token text DEFAULT NULL)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $function$
DECLARE
  v_me public.private_group_members%ROWTYPE;
  v_group public.private_groups%ROWTYPE;
  v_new public.private_groups%ROWTYPE;
  v_info jsonb; v_rating integer; v_comment text; v_url text; v_id uuid; v_work text; v_name text;
BEGIN
  PERFORM public.require_private_group_member(p_group_id, p_member_id, p_guest_token);
  IF p_payload IS NULL OR jsonb_typeof(p_payload) <> 'object' OR octet_length(p_payload::text) > 16384 THEN
    RAISE EXCEPTION '入力が正しくありません' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_me FROM public.private_group_members WHERE id = p_member_id AND group_id = p_group_id;
  SELECT * INTO v_group FROM public.private_groups WHERE id = p_group_id;
  v_info := public.private_group_performance_info(p_group_id);

  CASE p_action
  WHEN 'read' THEN
    SELECT o.post_performance_survey_url INTO v_url FROM public.organizations o
     WHERE o.id = v_group.organization_id AND coalesce(o.post_performance_survey_enabled, false) AND o.post_performance_survey_url ~ '^https://';
    RETURN jsonb_build_object(
      'performance', CASE WHEN v_info IS NULL THEN NULL ELSE v_info - 'reservation_id' END,
      'joined_count', (SELECT count(*) FROM public.private_group_members WHERE group_id = p_group_id AND status = 'joined'),
      'my_feedback', (SELECT jsonb_build_object('rating', f.rating, 'comment', f.comment, 'updated_at', f.updated_at)
                        FROM public.private_group_feedback f WHERE f.group_id = p_group_id AND f.member_id = p_member_id),
      'post_survey_url', v_url);

  WHEN 'save_feedback' THEN
    IF v_info IS NULL OR NOT coalesce((v_info->>'ended')::boolean, false) THEN
      RAISE EXCEPTION '感想は公演が終わってから書けます' USING ERRCODE = '22023';
    END IF;
    IF coalesce(jsonb_typeof(p_payload->'rating'), '') <> 'number' THEN RAISE EXCEPTION '満足度を選んでください' USING ERRCODE = '22023'; END IF;
    v_rating := (p_payload->>'rating')::numeric::integer;
    v_comment := coalesce(btrim(p_payload->>'comment'), '');
    IF v_rating NOT BETWEEN 1 AND 5 OR char_length(v_comment) > 2000 THEN
      RAISE EXCEPTION '満足度は 1〜5、感想は 2000 文字までです' USING ERRCODE = '22023';
    END IF;
    INSERT INTO public.private_group_feedback(group_id, organization_id, member_id, reservation_id, rating, comment)
    VALUES (p_group_id, v_group.organization_id, p_member_id, (v_info->>'reservation_id')::uuid, v_rating, v_comment)
    ON CONFLICT (group_id, member_id) DO UPDATE SET rating = EXCLUDED.rating, comment = EXCLUDED.comment, updated_at = now();
    RETURN jsonb_build_object('saved', true);

  WHEN 'announce_next_group' THEN
    IF v_me.user_id IS NULL OR v_me.user_id IS DISTINCT FROM auth.uid() THEN
      RAISE EXCEPTION '次の貸切は会員だけが作れます' USING ERRCODE = '42501';
    END IF;
    SELECT * INTO v_new FROM public.private_groups
     WHERE id = nullif(p_payload->>'new_group_id', '')::uuid AND organizer_id = auth.uid() AND status <> 'cancelled';
    IF NOT FOUND OR v_new.id = p_group_id OR v_new.organization_id <> v_group.organization_id THEN
      RAISE EXCEPTION 'お知らせする貸切グループが見つかりません' USING ERRCODE = '22023';
    END IF;
    -- 同じ新しいグループは 1 回だけ
    SELECT id INTO v_id FROM public.private_group_messages
     WHERE group_id = p_group_id AND public.private_group_message_payload(message)->>'action' = 'next_group_created'
       AND public.private_group_message_payload(message)->>'newGroupId' = v_new.id::text
     LIMIT 1;
    IF v_id IS NOT NULL THEN RETURN jsonb_build_object('id', v_id, 'replayed', true); END IF;
    v_work := public.web_push_group_title(v_new.id);
    v_name := coalesce(public.private_group_member_display_name(p_member_id), 'メンバー');
    INSERT INTO public.private_group_messages(group_id, member_id, message)
    VALUES (p_group_id, p_member_id, jsonb_build_object('type', 'system', 'action', 'next_group_created',
      'newGroupId', v_new.id, 'inviteCode', v_new.invite_code, 'scenarioTitle', v_work,
      'title', '次の貸切のお誘い',
      'body', format('%sさんが「%s」の貸切グループを作りました。同じメンバーでまた遊びませんか。参加と日程の回答は下のボタンからできます。', v_name, v_work))::text)
    RETURNING id INTO v_id;
    RETURN jsonb_build_object('id', v_id, 'replayed', false);

  ELSE
    RAISE EXCEPTION '未対応の操作です' USING ERRCODE = '22023';
  END CASE;
END $function$;
REVOKE ALL ON FUNCTION public.private_group_after_action(uuid, uuid, text, jsonb, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.private_group_after_action(uuid, uuid, text, jsonb, text) TO anon, authenticated, service_role;

-- 店舗（その組織の管理者・在籍スタッフ）が読む感想。
--   p_detail=false: グループごとの件数と平均だけ（貸切予約管理のカード用）。p_group_ids が NULL なら読める組織のすべて
--   p_detail=true:  指定したグループの感想そのもの
CREATE OR REPLACE FUNCTION public.private_group_feedback_staff(p_group_ids uuid[] DEFAULT NULL, p_detail boolean DEFAULT false)
 RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $function$
DECLARE v_orgs uuid[];
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION '感想を表示する権限がありません' USING ERRCODE = '42501'; END IF;
  IF p_detail AND (p_group_ids IS NULL OR cardinality(p_group_ids) = 0) THEN RETURN '[]'::jsonb; END IF;
  IF cardinality(p_group_ids) > 500 THEN RAISE EXCEPTION '一度に読める数を超えています' USING ERRCODE = '22023'; END IF;
  -- 読める組織: 管理者は自分の組織、スタッフは在籍している組織
  SELECT array_agg(DISTINCT o) INTO v_orgs FROM (
    SELECT public.get_user_organization_id() AS o WHERE coalesce(public.is_org_admin(), false)
    UNION SELECT s.organization_id FROM public.staff s WHERE s.user_id = auth.uid() AND s.status = 'active') x WHERE o IS NOT NULL;
  IF v_orgs IS NULL THEN RAISE EXCEPTION '感想を表示する権限がありません' USING ERRCODE = '42501'; END IF;
  IF NOT p_detail THEN
    RETURN coalesce((SELECT jsonb_agg(jsonb_build_object('group_id', c.group_id, 'count', c.n, 'average', c.average))
      FROM (SELECT f.group_id, count(*) AS n, round(avg(f.rating)::numeric, 1) AS average
              FROM public.private_group_feedback f WHERE (p_group_ids IS NULL OR f.group_id = ANY(p_group_ids)) AND f.organization_id = ANY(v_orgs)
             GROUP BY f.group_id) c), '[]'::jsonb);
  END IF;
  RETURN coalesce((SELECT jsonb_agg(jsonb_build_object('group_id', f.group_id, 'rating', f.rating, 'comment', f.comment,
      'member_name', public.private_group_member_display_name(f.member_id), 'is_guest', m.user_id IS NULL,
      'created_at', f.created_at, 'updated_at', f.updated_at) ORDER BY f.updated_at DESC)
    FROM public.private_group_feedback f JOIN public.private_group_members m ON m.id = f.member_id
    WHERE f.group_id = ANY(p_group_ids) AND f.organization_id = ANY(v_orgs)), '[]'::jsonb);
END $function$;
REVOKE ALL ON FUNCTION public.private_group_feedback_staff(uuid[], boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.private_group_feedback_staff(uuid[], boolean) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4. マイページのアルバム用の代表写真（参加中のグループごとに最新の 1 枚）
--    場所だけを返す。表示 URL は /api/private-group-photos（action=covers）がこの RPC を呼んだ人の資格のまま確かめて署名する
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.private_group_album_covers()
 RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $function$
DECLARE v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'ログインしてください' USING ERRCODE = '42501'; END IF;
  RETURN coalesce((SELECT jsonb_agg(jsonb_build_object('group_id', x.group_id, 'invite_code', x.invite_code, 'reservation_id', x.reservation_id,
      'scenario_master_id', x.scenario_master_id, 'performance_date', public.private_group_performance_info(x.group_id)->>'date',
      'path', x.storage_path, 'thumb_path', x.thumb_path, 'photo_count', x.photo_count))
    FROM (SELECT DISTINCT ON (g.id) g.id AS group_id, g.invite_code, g.reservation_id, g.scenario_master_id, p.storage_path, p.thumb_path,
            count(*) OVER (PARTITION BY g.id) AS photo_count
          FROM public.private_group_members m
          JOIN public.private_groups g ON g.id = m.group_id AND g.status <> 'cancelled'
          JOIN public.private_group_message_photos p ON p.group_id = g.id
          JOIN public.private_group_messages msg ON msg.id = p.message_id AND msg.deleted_at IS NULL
          WHERE m.user_id = v_uid AND m.status = 'joined'
          ORDER BY g.id, p.created_at DESC, p.position
          LIMIT 200) x), '[]'::jsonb);
END $function$;
REVOKE ALL ON FUNCTION public.private_group_album_covers() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.private_group_album_covers() TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 5. 公演の翌日 10 時（JST）に「写真を共有しませんか」（会員だけ。ベル → プッシュ。1 グループ 1 人 1 回）
--    取りこぼしを拾うため、3 日前までの公演を見る（同じ dedupe_key は 2 回作らない）
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.private_group_memories_notice(p_now timestamptz DEFAULT clock_timestamp())
 RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $function$
DECLARE v_today date := (p_now AT TIME ZONE 'Asia/Tokyo')::date; g record; m record; n integer := 0; v_work text; v_link text; v_bell uuid;
BEGIN
  FOR g IN SELECT pg.id, pg.organization_id, pg.invite_code
     FROM public.private_groups pg
     JOIN public.reservations r ON r.id = pg.reservation_id AND r.organization_id = pg.organization_id
     JOIN public.schedule_events e ON e.id = r.schedule_event_id AND e.organization_id = pg.organization_id
    WHERE pg.status <> 'cancelled' AND r.status IN ('confirmed', 'checked_in', 'completed') AND NOT coalesce(e.is_cancelled, false)
      AND e.date BETWEEN v_today - 3 AND v_today - 1
      AND p_now >= ((e.date + 1) + time '10:00') AT TIME ZONE 'Asia/Tokyo'
  LOOP
    v_work := public.web_push_group_title(g.id);
    v_link := '/group/invite/' || g.invite_code || '?tab=memories';
    FOR m IN SELECT DISTINCT gm.user_id FROM public.private_group_members gm
       WHERE gm.group_id = g.id AND gm.status = 'joined' AND gm.user_id IS NOT NULL
    LOOP
      v_bell := public.customer_notice_bell(m.user_id, NULL, g.organization_id, 'system', 'private_group_memories',
        'private_group_memories:' || g.id::text || ':' || m.user_id::text, '写真を共有しませんか',
        format('「%s」の貸切、ご参加ありがとうございました。記念写真をグループに残すと、メンバー全員のアルバムにも入ります。', v_work),
        v_link, NULL, NULL, jsonb_build_object('group_id', g.id));
      IF v_bell IS NOT NULL THEN n := n + 1; END IF;
    END LOOP;
  END LOOP;
  RETURN n;
END $function$;
REVOKE ALL ON FUNCTION public.private_group_memories_notice(timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.private_group_memories_notice(timestamptz) TO service_role;

-- ベル → プッシュの対象に「写真を共有しませんか」を足す（関数は段階 3 のまま）
DROP TRIGGER IF EXISTS web_push_on_user_notification ON public.user_notifications;
CREATE TRIGGER web_push_on_user_notification AFTER INSERT ON public.user_notifications
 FOR EACH ROW WHEN (NEW.metadata->>'kind' IN ('private_confirmed', 'private_rejected', 'private_group_handover', 'private_dates_aligned', 'private_group_memories'))
 EXECUTE FUNCTION public.web_push_on_user_notification();

DO $$
BEGIN
  IF to_regclass('cron.job') IS NULL THEN RAISE NOTICE 'pg_cron is not available; skipped'; RETURN; END IF;
  -- 毎日 1:00 UTC = 10:00 JST
  PERFORM cron.schedule('private-group-memories-notice', '0 1 * * *', $job$SELECT public.private_group_memories_notice()$job$);
END $$;
