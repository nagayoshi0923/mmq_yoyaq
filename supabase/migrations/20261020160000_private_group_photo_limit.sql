-- 貸切グループのチャット写真を「グループ全体で 10 枚まで」にする（2026-10-20 社長決定。無期限保存の方針は変えない）。
-- 1. 設定 private_group_photo_limit を足す。MMQ の既定 10（get_operating_setting_default）、組織共通で上書き可
--    （operating_setting_overrides の組織行。resolve_operating_setting の chain。店舗・作品・公演の上書きは無し）。
-- 2. private_group_photo_quota / private_group_photo_check_limit: 上限・使った枚数・残り。削除した写真は数えない。
-- 3. private_group_chat_action: photo_prepare と photo_message で「今の枚数＋今回の枚数」が上限を超えたら断る
--    （文言「このグループの写真は 10 枚までです。残り N 枚です」、HINT photo_limit）。photo_quota を足す（画面の「あと N 枚」）。
-- 4. private_group_message_photos の追加時にもトリガーで確かめる（最後の守り）。
-- 1 回 10 枚の制限はそのまま。既に上限を超えているグループの写真は消さない（新しく送れなくなるだけ）。
BEGIN;

-- 1. MMQ の既定と許可リスト。get_operating_setting_default / resolve_operating_setting は 20261020150000
--    （private_booking_horizon_days）適用後の本文を基準に、全文を置き換えず今の本文にこのキーだけを足す（既存のキーは消さない）。
--    もう一度流しても結果は同じ（足し済みなら何もしない）。正本: supabase/rpcs/get_operating_setting_default.sql, resolve_operating_setting.sql
DO $patch$
DECLARE
  v_def text;
BEGIN
  v_def := pg_get_functiondef('public.get_operating_setting_default(text)'::regprocedure);
  IF position('"private_group_photo_limit"' IN v_def) = 0 THEN
    IF position('}''::jsonb->p_key' IN v_def) = 0 THEN RAISE EXCEPTION 'get_operating_setting_default の形が想定と違います'; END IF;
    EXECUTE replace(v_def, '}''::jsonb->p_key', ',"private_group_photo_limit":10}''::jsonb->p_key');
  END IF;

  v_def := pg_get_functiondef('public.resolve_operating_setting(uuid, text, jsonb, uuid, uuid, uuid)'::regprocedure);
  IF position('''private_group_photo_limit''' IN v_def) = 0 THEN
    IF v_def !~ 'v_keys constant text\[\] := ARRAY\[[^]]*\];' OR position(E'    v_legacy := NULL;\n' IN v_def) = 0 THEN
      RAISE EXCEPTION 'resolve_operating_setting の形が想定と違います';
    END IF;
    v_def := regexp_replace(v_def, '(v_keys constant text\[\] := ARRAY\[[^]]*)\];', '\1,''private_group_photo_limit''];');
    -- 貸切グループの写真の上限は組織共通だけ（店舗・作品・公演の上書きは無い）
    v_def := replace(v_def, E'    v_legacy := NULL;\n',
      E'    -- 貸切グループの写真の上限は組織共通だけ（店舗・作品・公演の上書きは無い）\n'
      || E'    IF p_key = ''private_group_photo_limit'' AND v_scope <> ''organization'' THEN CONTINUE; END IF;\n'
      || E'    v_legacy := NULL;\n');
    EXECUTE v_def;
  END IF;
END $patch$;

-- グループの写真の上限・使った枚数・残り。上限は設定 private_group_photo_limit（MMQ の既定 10、組織で上書き可）。
-- 削除した発言の写真は数えない（削除時に記録ごと消える。念のため削除済みの発言も除く）
CREATE OR REPLACE FUNCTION public.private_group_photo_quota(p_group_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_org uuid;
  v_raw jsonb;
  v_limit integer := 10;
  v_used integer;
BEGIN
  SELECT organization_id INTO v_org FROM public.private_groups WHERE id = p_group_id;
  IF v_org IS NULL THEN RAISE EXCEPTION 'グループが見つかりません' USING ERRCODE = '22023'; END IF;
  v_raw := public.resolve_operating_setting(v_org, 'private_group_photo_limit', '10'::jsonb)->'value';
  IF jsonb_typeof(v_raw) = 'number' AND (v_raw #>> '{}')::numeric BETWEEN 1 AND 1000 AND (v_raw #>> '{}')::numeric % 1 = 0 THEN
    v_limit := (v_raw #>> '{}')::integer;
  END IF;
  SELECT count(*) INTO v_used
    FROM public.private_group_message_photos p JOIN public.private_group_messages m ON m.id = p.message_id
   WHERE p.group_id = p_group_id AND m.deleted_at IS NULL;
  RETURN jsonb_build_object('limit', v_limit, 'used', v_used, 'remaining', greatest(v_limit - v_used, 0));
END $function$;
REVOKE ALL ON FUNCTION public.private_group_photo_quota(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.private_group_photo_quota(uuid) TO service_role;

-- 今回 p_adding 枚足すと上限を超えるなら断る（理由 photo_limit は HINT に入れる。API が見分けて 409 で返す）
CREATE OR REPLACE FUNCTION public.private_group_photo_check_limit(p_group_id uuid, p_adding integer)
 RETURNS void
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_quota jsonb := public.private_group_photo_quota(p_group_id);
BEGIN
  IF (v_quota->>'used')::integer + p_adding > (v_quota->>'limit')::integer THEN
    RAISE EXCEPTION 'このグループの写真は % 枚までです。残り % 枚です', v_quota->>'limit', v_quota->>'remaining'
      USING ERRCODE = '22023', HINT = 'photo_limit';
  END IF;
END $function$;
REVOKE ALL ON FUNCTION public.private_group_photo_check_limit(uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.private_group_photo_check_limit(uuid, integer) TO service_role;

-- 写真の記録を足すときの最後の守り（RPC 以外の経路で足されても上限を超えない）。1 枚ずつ確かめる
CREATE OR REPLACE FUNCTION public.private_group_message_photo_enforce_limit()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('private_group_photos:' || NEW.group_id::text, 0));
  PERFORM public.private_group_photo_check_limit(NEW.group_id, 1);
  RETURN NEW;
END $function$;
REVOKE ALL ON FUNCTION public.private_group_message_photo_enforce_limit() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS private_group_message_photo_enforce_limit ON public.private_group_message_photos;
CREATE TRIGGER private_group_message_photo_enforce_limit BEFORE INSERT ON public.private_group_message_photos
  FOR EACH ROW EXECUTE FUNCTION public.private_group_message_photo_enforce_limit();

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
    -- グループ全体の写真の上限（2026-10-20 社長決定。既定 10 枚、組織で上書き可）。送る時にもう一度確かめる
    PERFORM public.private_group_photo_check_limit(p_group_id, v_count);
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
    -- グループ全体の写真の上限。同時に送られても超えないよう、グループごとに順番に確かめる（取引の終わりまで）
    PERFORM pg_advisory_xact_lock(hashtextextended('private_group_photos:' || p_group_id::text, 0));
    PERFORM public.private_group_photo_check_limit(p_group_id, v_count);
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

  WHEN 'photo_quota' THEN
    -- 写真の上限・使った枚数・残り（画面の「あと N 枚」）
    RETURN public.private_group_photo_quota(p_group_id);

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
COMMIT;
