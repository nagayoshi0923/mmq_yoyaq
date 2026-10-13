-- 20261010160000 の取り消し: 貸切グループページ刷新 段階 4（公演後の思い出・サムネイル）を外す
-- 注意: 書かれた感想（private_group_feedback）は消える。作られたベル（写真を共有しませんか）と、チャットに流した「次の貸切のお誘い」は残る。
-- サムネイルの実体（{n}_thumb.jpg）は Storage に残る（バケットは非公開のまま。誰も読めない）。
BEGIN;
DO $$
BEGIN
  IF to_regclass('cron.job') IS NOT NULL THEN
    PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'private-group-memories-notice';
  END IF;
END $$;
DROP TRIGGER IF EXISTS web_push_on_user_notification ON public.user_notifications;
CREATE TRIGGER web_push_on_user_notification AFTER INSERT ON public.user_notifications
 FOR EACH ROW WHEN (NEW.metadata->>'kind' IN ('private_confirmed', 'private_rejected', 'private_group_handover', 'private_dates_aligned'))
 EXECUTE FUNCTION public.web_push_on_user_notification();
DROP FUNCTION IF EXISTS public.private_group_memories_notice(timestamptz);
DROP FUNCTION IF EXISTS public.private_group_album_covers();
DROP FUNCTION IF EXISTS public.private_group_feedback_staff(uuid[], boolean);
DROP FUNCTION IF EXISTS public.private_group_after_action(uuid, uuid, text, jsonb, text);
DROP TABLE IF EXISTS public.private_group_feedback;
DROP FUNCTION IF EXISTS public.private_group_performance_info(uuid, timestamptz);
-- 段階 2〜3 の private_group_chat_action に戻す（サムネイルを扱う前）
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
    WITH removed AS (DELETE FROM public.private_group_message_photos WHERE message_id = v_msg.id RETURNING storage_path)
    SELECT coalesce(array_agg(storage_path), '{}') INTO v_paths FROM removed;
    RETURN jsonb_build_object('photo_paths', to_jsonb(v_paths));

  WHEN 'photo_prepare' THEN
    v_count := nullif(p_payload->>'count', '')::integer;
    IF v_count IS NULL OR v_count NOT BETWEEN 1 AND 10 THEN RAISE EXCEPTION '写真は1回10枚までです' USING ERRCODE = '22023'; END IF;
    v_id := gen_random_uuid();
    SELECT array_agg(format('%s/%s/%s/%s.jpg', v_group.organization_id, p_group_id, v_id, n)) INTO v_paths FROM generate_series(1, v_count) n;
    RETURN jsonb_build_object('message_id', v_id, 'paths', to_jsonb(v_paths));

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
      INSERT INTO public.private_group_message_photos(message_id, position, group_id, organization_id, storage_path, width, height)
      VALUES (v_id, i, p_group_id, v_group.organization_id, v_path,
        CASE WHEN jsonb_typeof(v_size->'w') = 'number' THEN least(greatest((v_size->>'w')::integer, 1), 10000) END,
        CASE WHEN jsonb_typeof(v_size->'h') = 'number' THEN least(greatest((v_size->>'h')::integer, 1), 10000) END);
    END LOOP;
    RETURN jsonb_build_object('id', v_id);

  WHEN 'photo_paths' THEN
    -- 写真の場所（署名付き URL の発行元 API だけが使う）。指定が無ければこのグループの新しい順に 500 枚まで
    IF jsonb_typeof(p_payload->'message_ids') = 'array' THEN
      IF jsonb_array_length(p_payload->'message_ids') > 200 THEN RAISE EXCEPTION '一度に読める数を超えています' USING ERRCODE = '22023'; END IF;
      SELECT array_agg(value::uuid) INTO v_ids FROM jsonb_array_elements_text(p_payload->'message_ids');
    END IF;
    RETURN coalesce((SELECT jsonb_agg(jsonb_build_object('message_id', x.message_id, 'position', x.position, 'path', x.storage_path,
        'created_at', x.created_at, 'member_id', x.member_id, 'width', x.width, 'height', x.height) ORDER BY x.created_at DESC, x.position)
      FROM (SELECT p.message_id, p.position, p.storage_path, p.created_at, p.width, p.height, m.member_id
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
ALTER TABLE public.private_group_message_photos DROP CONSTRAINT IF EXISTS private_group_message_photos_thumb_path_check;
ALTER TABLE public.private_group_message_photos DROP COLUMN IF EXISTS thumb_path;
COMMIT;
