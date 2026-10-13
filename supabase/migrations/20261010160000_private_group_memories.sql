-- 貸切グループページ刷新 段階 4「公演後の思い出」（docs/product-spec/グループページ刷新_2026-10.md の「段階 4」）
-- 1. 写真のサムネイル（長辺 400px の小さい版 {n}_thumb.jpg）。private_group_message_photos.thumb_path と private_group_chat_action の写真まわり
-- 2. 公演の記録（private_group_performance_info）・公演後の感想（表 private_group_feedback と RPC private_group_after_action）
--    感想は店舗（スタッフ）だけが読める（private_group_feedback_staff）。メンバー同士では見えない（本人は自分の分だけ）
-- 3. 「同じメンバーで次の貸切」: 新しいグループの招待をもとのグループのチャットにお知らせとして流す（private_group_after_action の announce_next_group）
-- 4. マイページのアルバム用の代表写真（private_group_album_covers。署名付き URL は /api/private-group-photos が発行）
-- 5. 公演の翌日 10 時（JST）に「写真を共有しませんか」をベル＋プッシュで会員に 1 回（private_group_memories_notice・定期実行）

-- ---------------------------------------------------------------------------
-- 1. サムネイル
-- ---------------------------------------------------------------------------
ALTER TABLE public.private_group_message_photos ADD COLUMN IF NOT EXISTS thumb_path text;
ALTER TABLE public.private_group_message_photos DROP CONSTRAINT IF EXISTS private_group_message_photos_thumb_path_check;
ALTER TABLE public.private_group_message_photos ADD CONSTRAINT private_group_message_photos_thumb_path_check
  CHECK (thumb_path IS NULL OR thumb_path = regexp_replace(storage_path, '\.jpg$', '_thumb.jpg'));
COMMENT ON COLUMN public.private_group_message_photos.thumb_path IS '一覧・格子・アルバム用の小さい版（長辺 400px、{n}_thumb.jpg）。段階 4 より前の写真は NULL（元画像を縮めて出す）';

CREATE OR REPLACE FUNCTION public.private_group_chat_action(p_group_id uuid, p_member_id uuid, p_action text, p_payload jsonb DEFAULT '{}'::jsonb, p_guest_token text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_me public.private_group_members%ROWTYPE;
  v_group public.private_groups%ROWTYPE;
  v_msg public.private_group_messages%ROWTYPE;
  v_text text; v_reply uuid; v_id uuid; v_count integer; v_emoji text; v_at timestamptz; v_paths text[]; v_path text;
  v_names text[]; v_ids uuid[]; i integer; v_size jsonb;
BEGIN
  -- 参加中の本人（会員はログイン、ゲストは PIN で発行した印）だけ。スタッフ・招待リンクを開いただけの人は通らない
  PERFORM public.require_private_group_member(p_group_id, p_member_id, p_guest_token);
  IF p_payload IS NULL OR jsonb_typeof(p_payload) <> 'object' OR octet_length(p_payload::text) > 65536 THEN
    RAISE EXCEPTION '入力が正しくありません' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_me FROM public.private_group_members WHERE id = p_member_id AND group_id = p_group_id;
  SELECT * INTO v_group FROM public.private_groups WHERE id = p_group_id;

  -- 対象の発言（同じグループ・削除されていない・参加者の発言）
  IF p_action IN ('react', 'pin', 'delete_message') THEN
    SELECT * INTO v_msg FROM public.private_group_messages
     WHERE id = nullif(p_payload->>'message_id', '')::uuid AND group_id = p_group_id FOR UPDATE;
    IF NOT FOUND OR v_msg.deleted_at IS NOT NULL OR v_msg.member_id IS NULL OR public.private_group_message_is_system(v_msg.message) THEN
      RAISE EXCEPTION '対象のメッセージが見つかりません' USING ERRCODE = '22023';
    END IF;
  END IF;

  -- 返信先（同じグループ・削除されていない）
  IF p_action IN ('message', 'photo_message') AND nullif(p_payload->>'reply_to', '') IS NOT NULL THEN
    v_reply := (p_payload->>'reply_to')::uuid;
    IF NOT EXISTS (SELECT 1 FROM public.private_group_messages WHERE id = v_reply AND group_id = p_group_id AND deleted_at IS NULL) THEN
      RAISE EXCEPTION '返信先のメッセージが見つかりません' USING ERRCODE = '22023';
    END IF;
  END IF;

  CASE p_action
  WHEN 'message' THEN
    v_text := btrim(p_payload->>'message');
    IF v_text IS NULL OR length(v_text) = 0 OR length(v_text) > 5000 THEN
      RAISE EXCEPTION 'メッセージは1〜5000文字で入力してください' USING ERRCODE = '22023';
    END IF;
    IF public.private_group_message_is_system(v_text) THEN
      RAISE EXCEPTION 'システム通知として送信できません' USING ERRCODE = '42501';
    END IF;
    INSERT INTO public.private_group_messages(group_id, member_id, message, reply_to_message_id)
    VALUES (p_group_id, p_member_id, v_text, v_reply) RETURNING id INTO v_id;
    RETURN jsonb_build_object('id', v_id);

  WHEN 'read' THEN
    v_at := least(coalesce(nullif(p_payload->>'at', '')::timestamptz, clock_timestamp()), clock_timestamp());
    INSERT INTO public.private_group_read_states(group_id, member_id, last_read_at, updated_at)
    VALUES (p_group_id, p_member_id, v_at, clock_timestamp())
    ON CONFLICT (group_id, member_id) DO UPDATE
      SET last_read_at = greatest(public.private_group_read_states.last_read_at, EXCLUDED.last_read_at), updated_at = clock_timestamp()
    RETURNING last_read_at INTO v_at;
    RETURN jsonb_build_object('last_read_at', v_at);

  WHEN 'react' THEN
    v_emoji := btrim(p_payload->>'emoji');
    IF v_emoji IS NULL OR char_length(v_emoji) NOT BETWEEN 1 AND 16 OR v_emoji ~ '[[:alnum:][:space:][:punct:]]' THEN
      RAISE EXCEPTION 'リアクションが正しくありません' USING ERRCODE = '22023';
    END IF;
    -- 同じ絵文字をもう一度押したら外す。別の絵文字なら付け替える（1 人 1 種類）
    DELETE FROM public.private_group_message_reactions WHERE message_id = v_msg.id AND member_id = p_member_id AND emoji = v_emoji;
    IF FOUND THEN RETURN jsonb_build_object('emoji', NULL); END IF;
    INSERT INTO public.private_group_message_reactions(message_id, member_id, group_id, emoji)
    VALUES (v_msg.id, p_member_id, p_group_id, v_emoji)
    ON CONFLICT (message_id, member_id) DO UPDATE SET emoji = EXCLUDED.emoji, created_at = now();
    RETURN jsonb_build_object('emoji', v_emoji);

  WHEN 'pin' THEN
    IF NOT v_me.is_organizer THEN RAISE EXCEPTION 'ピン留めは主催者だけができます' USING ERRCODE = '42501'; END IF;
    IF coalesce((p_payload->>'pinned')::boolean, true) THEN
      UPDATE public.private_group_messages SET pinned_at = clock_timestamp(), pinned_by_member_id = p_member_id WHERE id = v_msg.id;
    ELSE
      UPDATE public.private_group_messages SET pinned_at = NULL, pinned_by_member_id = NULL WHERE id = v_msg.id;
    END IF;
    RETURN 'true'::jsonb;

  WHEN 'delete_message' THEN
    IF v_msg.member_id IS DISTINCT FROM p_member_id THEN RAISE EXCEPTION '自分の発言だけ削除できます' USING ERRCODE = '42501'; END IF;
    UPDATE public.private_group_messages SET deleted_at = clock_timestamp(), message = '', pinned_at = NULL, pinned_by_member_id = NULL
     WHERE id = v_msg.id;
    DELETE FROM public.private_group_message_reactions WHERE message_id = v_msg.id;
    -- 写真の記録を消し、ファイルの場所を返す（呼び出した API が Storage の実体を消す）
    -- 小さい版（サムネイル）があればそれも返す
    WITH removed AS (DELETE FROM public.private_group_message_photos WHERE message_id = v_msg.id RETURNING storage_path, thumb_path)
    SELECT coalesce(array_agg(x.path), '{}') INTO v_paths FROM removed r, unnest(ARRAY[r.storage_path, r.thumb_path]) AS x(path) WHERE x.path IS NOT NULL;
    RETURN jsonb_build_object('photo_paths', to_jsonb(v_paths));

  WHEN 'photo_prepare' THEN
    v_count := nullif(p_payload->>'count', '')::integer;
    IF v_count IS NULL OR v_count NOT BETWEEN 1 AND 10 THEN RAISE EXCEPTION '写真は1回10枚までです' USING ERRCODE = '22023'; END IF;
    v_id := gen_random_uuid();
    SELECT array_agg(format('%s/%s/%s/%s.jpg', v_group.organization_id, p_group_id, v_id, n)) INTO v_paths FROM generate_series(1, v_count) n;
    -- 一覧・格子・アルバム用の小さい版（長辺 400px）の場所（段階 4）。上げなかった写真は元画像を縮めて出す
    RETURN jsonb_build_object('message_id', v_id, 'paths', to_jsonb(v_paths),
      'thumb_paths', (SELECT to_jsonb(array_agg(format('%s/%s/%s/%s_thumb.jpg', v_group.organization_id, p_group_id, v_id, n) ORDER BY n)) FROM generate_series(1, v_count) n));

  WHEN 'photo_message' THEN
    v_id := nullif(p_payload->>'message_id', '')::uuid;
    v_count := nullif(p_payload->>'count', '')::integer;
    v_text := coalesce(btrim(p_payload->>'message'), '');
    IF v_id IS NULL OR v_count IS NULL OR v_count NOT BETWEEN 1 AND 10 OR length(v_text) > 5000 THEN
      RAISE EXCEPTION '写真の送信内容が正しくありません' USING ERRCODE = '22023';
    END IF;
    IF public.private_group_message_is_system(v_text) THEN RAISE EXCEPTION 'システム通知として送信できません' USING ERRCODE = '42501'; END IF;
    IF EXISTS (SELECT 1 FROM public.private_group_messages WHERE id = v_id) THEN RAISE EXCEPTION 'この写真は送信済みです' USING ERRCODE = '23505'; END IF;
    INSERT INTO public.private_group_messages(id, group_id, member_id, message, reply_to_message_id)
    VALUES (v_id, p_group_id, p_member_id, v_text, v_reply);
    FOR i IN 1..v_count LOOP
      v_path := format('%s/%s/%s/%s.jpg', v_group.organization_id, p_group_id, v_id, i);
      -- 実体がこのグループの場所に上がっていること（API が発行した署名付きアップロード先にだけ置ける）
      IF NOT EXISTS (SELECT 1 FROM storage.objects WHERE bucket_id = 'private-group-photos' AND name = v_path) THEN
        RAISE EXCEPTION '写真のアップロードが終わっていません' USING ERRCODE = '22023';
      END IF;
      v_size := p_payload->'sizes'->(i - 1);
      INSERT INTO public.private_group_message_photos(message_id, position, group_id, organization_id, storage_path, width, height, thumb_path)
      VALUES (v_id, i, p_group_id, v_group.organization_id, v_path,
        CASE WHEN jsonb_typeof(v_size->'w') = 'number' THEN least(greatest((v_size->>'w')::integer, 1), 10000) END,
        CASE WHEN jsonb_typeof(v_size->'h') = 'number' THEN least(greatest((v_size->>'h')::integer, 1), 10000) END,
        -- 小さい版は上がっていれば記録する（無くても送れる）
        (SELECT o.name FROM storage.objects o WHERE o.bucket_id = 'private-group-photos'
          AND o.name = format('%s/%s/%s/%s_thumb.jpg', v_group.organization_id, p_group_id, v_id, i)));
    END LOOP;
    RETURN jsonb_build_object('id', v_id);

  WHEN 'photo_paths' THEN
    -- 写真の場所（署名付き URL の発行元 API だけが使う）。指定が無ければこのグループの新しい順に 500 枚まで
    IF jsonb_typeof(p_payload->'message_ids') = 'array' THEN
      IF jsonb_array_length(p_payload->'message_ids') > 200 THEN RAISE EXCEPTION '一度に読める数を超えています' USING ERRCODE = '22023'; END IF;
      SELECT array_agg(value::uuid) INTO v_ids FROM jsonb_array_elements_text(p_payload->'message_ids');
    END IF;
    RETURN coalesce((SELECT jsonb_agg(jsonb_build_object('message_id', x.message_id, 'position', x.position, 'path', x.storage_path,
        'created_at', x.created_at, 'member_id', x.member_id, 'width', x.width, 'height', x.height, 'thumb_path', x.thumb_path) ORDER BY x.created_at DESC, x.position)
      FROM (SELECT p.message_id, p.position, p.storage_path, p.created_at, p.width, p.height, p.thumb_path, m.member_id
        FROM public.private_group_message_photos p JOIN public.private_group_messages m ON m.id = p.message_id
        WHERE p.group_id = p_group_id AND m.deleted_at IS NULL AND (v_ids IS NULL OR p.message_id = ANY(v_ids))
        ORDER BY p.created_at DESC, p.position LIMIT 500) x), '[]'::jsonb);

  WHEN 'remind_unanswered' THEN
    -- 「未回答の人に知らせる」: 主催者だけ。押した人の発言ではなく、灰色の 1 行（システムのお知らせ）にする
    IF NOT v_me.is_organizer THEN RAISE EXCEPTION '主催者だけが知らせられます' USING ERRCODE = '42501'; END IF;
    IF jsonb_typeof(p_payload->'member_ids') <> 'array' OR jsonb_array_length(p_payload->'member_ids') NOT BETWEEN 1 AND 50 THEN
      RAISE EXCEPTION '知らせる相手が正しくありません' USING ERRCODE = '22023';
    END IF;
    SELECT array_agg(m.id ORDER BY m.joined_at, m.id), array_agg(public.private_group_member_display_name(m.id) ORDER BY m.joined_at, m.id)
      INTO v_ids, v_names
      FROM public.private_group_members m
     WHERE m.group_id = p_group_id AND m.status = 'joined' AND m.id <> p_member_id
       AND m.id::text IN (SELECT jsonb_array_elements_text(p_payload->'member_ids'));
    IF v_ids IS NULL THEN RAISE EXCEPTION '知らせる相手が見つかりません' USING ERRCODE = '22023'; END IF;
    INSERT INTO public.private_group_messages(group_id, member_id, message)
    VALUES (p_group_id, p_member_id, jsonb_build_object('type', 'system', 'action', 'date_answer_reminder',
      'memberIds', to_jsonb(v_ids), 'names', to_jsonb(v_names),
      'message', array_to_string(ARRAY(SELECT n || 'さん' FROM unnest(v_names) n), '、') || ' 日程の回答をお願いします')::text)
    RETURNING id INTO v_id;
    RETURN jsonb_build_object('id', v_id);

  ELSE
    RAISE EXCEPTION '未対応の操作です' USING ERRCODE = '22023';
  END CASE;
END $function$;
REVOKE ALL ON FUNCTION public.private_group_chat_action(uuid, uuid, text, jsonb, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.private_group_chat_action(uuid, uuid, text, jsonb, text) TO anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2. 公演の記録・感想
-- ---------------------------------------------------------------------------
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

CREATE TABLE IF NOT EXISTS public.private_group_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES public.private_groups(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  member_id uuid NOT NULL REFERENCES public.private_group_members(id) ON DELETE CASCADE,
  reservation_id uuid REFERENCES public.reservations(id) ON DELETE SET NULL,
  rating smallint NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment text NOT NULL DEFAULT '' CHECK (char_length(comment) <= 2000),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (group_id, member_id)
);
ALTER TABLE public.private_group_feedback ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.private_group_feedback FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.private_group_feedback TO service_role;
CREATE INDEX IF NOT EXISTS idx_private_group_feedback_org ON public.private_group_feedback(organization_id, created_at DESC);
COMMENT ON TABLE public.private_group_feedback IS '公演後の感想（5 段階＋自由記述）。書くのは参加者本人（RPC private_group_after_action）、読むのは店舗のスタッフだけ（private_group_feedback_staff）。メンバー同士では見えない';

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
