-- 配役（決め方の選択・自分たちで決める・事前配役アンケート）を「いまの状態」の箱・概要タブ・マイページで出す（2026-10-11 社長要望）
-- 1. private_group_casting_status: 配役の決め方と確定済みか、事前配役アンケートの回答済み人数／対象人数／自分の回答の有無、
--    未回答の人の表示名（呼び出したのが主催者のときだけ）。参加中の本人（会員はログイン、ゲストは PIN の印）だけが呼べる。回答の中身は返さない。
--    確定済みかはチャットの配役カードと同じ判定（最後に決め方を選び直した後に「配役が確定しました」のお知らせがあるか）。
-- 2. private_group_chat_action の remind_unanswered に kind（'dates' 既定／'survey'／'casting'）を足す。
--    survey はアンケート未回答の人、casting はやりたいキャラクターを未選択の人だけに絞り、灰色 1 行（date_answer_reminder＋kind）を流す。

CREATE OR REPLACE FUNCTION public.private_group_casting_status(p_group_id uuid, p_member_id uuid, p_guest_token text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_me public.private_group_members%ROWTYPE;
  v_org uuid;
  v_settings jsonb;
  v_questions integer;
  v_target integer;
  v_answered integer;
  v_unanswered jsonb;
  v_group public.private_groups%ROWTYPE;
  v_last_casting text;
BEGIN
  PERFORM public.require_private_group_member(p_group_id, p_member_id, p_guest_token);
  SELECT * INTO v_me FROM public.private_group_members WHERE id = p_member_id AND group_id = p_group_id;
  SELECT * INTO v_group FROM public.private_groups WHERE id = p_group_id;
  v_org := v_group.organization_id;
  -- 配役の確定: 最後の「決め方の選択」「配役の確定」のお知らせ（どちらもシステムの発言、member_id は NULL）
  SELECT (m.message::jsonb)->>'action' INTO v_last_casting
    FROM public.private_group_messages m
   WHERE m.group_id = p_group_id AND m.member_id IS NULL AND m.deleted_at IS NULL
     AND m.message ~ '^\s*\{' AND m.message ~ '"action"\s*:\s*"(character_assignment|character_method_selected)"'
   ORDER BY m.created_at DESC, m.id DESC LIMIT 1;
  v_settings := public.get_private_group_survey_settings(v_org, p_group_id);
  IF NOT COALESCE((v_settings->>'survey_enabled')::boolean, false) THEN
    RETURN jsonb_build_object('survey_enabled', false, 'method', v_group.character_assignment_method,
      'casting_confirmed', COALESCE(v_last_casting = 'character_assignment', false), 'is_organizer', v_me.is_organizer);
  END IF;
  SELECT count(*) INTO v_questions FROM public.org_scenario_survey_questions q
   WHERE q.org_scenario_id = nullif(v_settings->>'org_scenario_id', '')::uuid;
  SELECT count(*), count(*) FILTER (WHERE EXISTS (
           SELECT 1 FROM public.private_group_survey_responses s WHERE s.group_id = p_group_id AND s.member_id = m.id))
    INTO v_target, v_answered
    FROM public.private_group_members m WHERE m.group_id = p_group_id AND m.status = 'joined';
  -- 未回答の人の名前は主催者にだけ返す（メンバー・ゲストには人数と自分の状態だけ）
  IF v_me.is_organizer THEN
    SELECT COALESCE(jsonb_agg(jsonb_build_object('member_id', m.id, 'name', public.private_group_member_display_name(m.id)) ORDER BY m.joined_at, m.id), '[]'::jsonb)
      INTO v_unanswered
      FROM public.private_group_members m
     WHERE m.group_id = p_group_id AND m.status = 'joined'
       AND NOT EXISTS (SELECT 1 FROM public.private_group_survey_responses s WHERE s.group_id = p_group_id AND s.member_id = m.id);
  END IF;
  RETURN jsonb_build_object(
    'survey_enabled', true,
    'method', v_group.character_assignment_method,
    'casting_confirmed', COALESCE(v_last_casting = 'character_assignment', false),
    'external', nullif(v_settings->>'survey_url', '') IS NOT NULL,
    'question_count', v_questions,
    'deadline_at', v_settings->'survey_deadline_at',
    'target_count', v_target,
    'answered_count', v_answered,
    'i_answered', EXISTS (SELECT 1 FROM public.private_group_survey_responses s WHERE s.group_id = p_group_id AND s.member_id = p_member_id),
    'is_organizer', v_me.is_organizer,
    'unanswered', v_unanswered
  );
END $function$;
REVOKE ALL ON FUNCTION public.private_group_casting_status(uuid, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.private_group_casting_status(uuid, uuid, text) TO anon, authenticated, service_role;

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
    -- kind: 'dates'（日程の回答・既定）／'survey'（事前配役アンケート。未回答の人だけ）／'casting'（やりたいキャラクター。未選択の人だけ）
    v_text := coalesce(nullif(p_payload->>'kind', ''), 'dates');
    IF v_text NOT IN ('dates', 'survey', 'casting') THEN RAISE EXCEPTION '知らせる内容が正しくありません' USING ERRCODE = '22023'; END IF;
    SELECT array_agg(m.id ORDER BY m.joined_at, m.id), array_agg(public.private_group_member_display_name(m.id) ORDER BY m.joined_at, m.id)
      INTO v_ids, v_names
      FROM public.private_group_members m
     WHERE m.group_id = p_group_id AND m.status = 'joined' AND m.id <> p_member_id
       AND m.id::text IN (SELECT jsonb_array_elements_text(p_payload->'member_ids'))
       AND (v_text = 'dates'
         OR (v_text = 'survey' AND NOT EXISTS (
           SELECT 1 FROM public.private_group_survey_responses s WHERE s.group_id = p_group_id AND s.member_id = m.id))
         OR (v_text = 'casting' AND v_group.character_assignment_method = 'self'
           AND NOT coalesce(v_group.character_assignments, '{}'::jsonb) ? m.id::text));
    IF v_ids IS NULL THEN RAISE EXCEPTION '知らせる相手が見つかりません' USING ERRCODE = '22023'; END IF;
    INSERT INTO public.private_group_messages(group_id, member_id, message)
    VALUES (p_group_id, p_member_id, CASE WHEN v_text IN ('survey', 'casting') THEN
      -- 表示は日程の回答依頼と同じ灰色の 1 行（kind で文面を切り替える）
      jsonb_build_object('type', 'system', 'action', 'date_answer_reminder', 'kind', v_text,
        'memberIds', to_jsonb(v_ids), 'names', to_jsonb(v_names),
        'message', array_to_string(ARRAY(SELECT n || 'さん' FROM unnest(v_names) n), '、')
          || CASE WHEN v_text = 'survey' THEN ' 事前配役アンケートの回答をお願いします' ELSE ' やりたいキャラクターを選んでください' END)::text
    ELSE
      jsonb_build_object('type', 'system', 'action', 'date_answer_reminder',
        'memberIds', to_jsonb(v_ids), 'names', to_jsonb(v_names),
        'message', array_to_string(ARRAY(SELECT n || 'さん' FROM unnest(v_names) n), '、') || ' 日程の回答をお願いします')::text
    END)
    RETURNING id INTO v_id;
    RETURN jsonb_build_object('id', v_id);

  ELSE
    RAISE EXCEPTION '未対応の操作です' USING ERRCODE = '22023';
  END CASE;
END $function$;

REVOKE ALL ON FUNCTION public.private_group_chat_action(uuid, uuid, text, jsonb, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.private_group_chat_action(uuid, uuid, text, jsonb, text) TO anon, authenticated, service_role;
