-- 貸切グループページ刷新 段階 2「チャット強化と写真」（2026-10-10、社長と決定。方針書 docs/product-spec/グループページ刷新_2026-10.md）
--
-- 1. 発言に「返信先」「削除した時刻」「ピン留め」を足す（private_group_messages の列）
-- 2. 既読: 会員・ゲストごとに「最後に読んだ時刻」をグループに 1 行（private_group_read_states）。端末をまたいで既読がそろう
-- 3. リアクション: 1 発言 1 人 1 種類（private_group_message_reactions）
-- 4. 写真: 非公開バケット private-group-photos と、発言ごとの写真の記録（private_group_message_photos）
-- 5. 読み書きは参加者本人を確かめる SECURITY DEFINER RPC だけ（private_group_chat_action / private_group_chat_state）。
--    新しい表はブラウザの役割（anon / authenticated）に一切の権限を付けない（既存の貸切グループの表と同じ決まり）。
--    これにより「本人だけ更新」「グループの人だけ読める」は RPC の本人確認で守られ、表を直接読むことはできない。
-- 6. 写真のファイルはブラウザから直接読めない。Storage のポリシーを作らない（＝service_role 以外は読み書き不可）。
--    API（/api/private-group-photos）が上の RPC で参加者本人を確かめてから、期限付きの署名付き URL を発行する。スタッフには発行しない。

-- ---------------------------------------------------------------------------
-- 1. 発言の列
-- ---------------------------------------------------------------------------
ALTER TABLE public.private_group_messages
  ADD COLUMN IF NOT EXISTS reply_to_message_id uuid REFERENCES public.private_group_messages(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz,
  ADD COLUMN IF NOT EXISTS pinned_at timestamptz,
  ADD COLUMN IF NOT EXISTS pinned_by_member_id uuid REFERENCES public.private_group_members(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_private_group_messages_pinned ON public.private_group_messages(group_id, pinned_at DESC) WHERE pinned_at IS NOT NULL;
COMMENT ON COLUMN public.private_group_messages.reply_to_message_id IS '返信先の発言（段階 2）';
COMMENT ON COLUMN public.private_group_messages.deleted_at IS '本人が削除した時刻。本文は空にし、画面は「メッセージを削除しました」を出す';
COMMENT ON COLUMN public.private_group_messages.pinned_at IS '主催者がピン留めした時刻（解除で NULL）';

-- ---------------------------------------------------------------------------
-- 2. 既読
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.private_group_read_states (
  group_id uuid NOT NULL REFERENCES public.private_groups(id) ON DELETE CASCADE,
  member_id uuid NOT NULL REFERENCES public.private_group_members(id) ON DELETE CASCADE,
  last_read_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (group_id, member_id)
);
ALTER TABLE public.private_group_read_states ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.private_group_read_states FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.private_group_read_states TO service_role;
CREATE INDEX IF NOT EXISTS idx_private_group_read_states_member ON public.private_group_read_states(member_id);
COMMENT ON TABLE public.private_group_read_states IS '貸切グループのチャットを最後に読んだ時刻（参加者ごとに 1 行）。本人だけ private_group_chat_action(read) で更新';

-- いま参加中の人は「ここまで読んだ」から始める（切り替えた日に過去の発言がすべて未読にならないように）
INSERT INTO public.private_group_read_states(group_id, member_id, last_read_at)
SELECT m.group_id, m.id, now() FROM public.private_group_members m WHERE m.status = 'joined'
ON CONFLICT (group_id, member_id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 3. リアクション
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.private_group_message_reactions (
  message_id uuid NOT NULL REFERENCES public.private_group_messages(id) ON DELETE CASCADE,
  member_id uuid NOT NULL REFERENCES public.private_group_members(id) ON DELETE CASCADE,
  group_id uuid NOT NULL REFERENCES public.private_groups(id) ON DELETE CASCADE,
  emoji text NOT NULL CHECK (char_length(emoji) BETWEEN 1 AND 16),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (message_id, member_id)
);
ALTER TABLE public.private_group_message_reactions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.private_group_message_reactions FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.private_group_message_reactions TO service_role;
CREATE INDEX IF NOT EXISTS idx_private_group_message_reactions_group ON public.private_group_message_reactions(group_id);
CREATE INDEX IF NOT EXISTS idx_private_group_message_reactions_member ON public.private_group_message_reactions(member_id);
COMMENT ON TABLE public.private_group_message_reactions IS '発言へのリアクション（1 人 1 種類）。読み書きは参加者本人だけ（RPC 経由）';

-- ---------------------------------------------------------------------------
-- 4. 写真
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.private_group_message_photos (
  message_id uuid NOT NULL REFERENCES public.private_group_messages(id) ON DELETE CASCADE,
  position smallint NOT NULL CHECK (position BETWEEN 1 AND 10),
  group_id uuid NOT NULL REFERENCES public.private_groups(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  storage_path text NOT NULL UNIQUE,
  width integer CHECK (width IS NULL OR width BETWEEN 1 AND 10000),
  height integer CHECK (height IS NULL OR height BETWEEN 1 AND 10000),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (message_id, position)
);
ALTER TABLE public.private_group_message_photos ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.private_group_message_photos FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.private_group_message_photos TO service_role;
CREATE INDEX IF NOT EXISTS idx_private_group_message_photos_group ON public.private_group_message_photos(group_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_private_group_message_photos_org ON public.private_group_message_photos(organization_id);
COMMENT ON TABLE public.private_group_message_photos IS 'チャットの写真（Storage private-group-photos の {organization_id}/{group_id}/{message_id}/{n}.jpg）。保存期間は無期限、本人の削除で実体も消す';

-- 非公開バケット。storage.objects にポリシーを作らないため、ブラウザの役割からは読み書きできない
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('private-group-photos', 'private-group-photos', false, 8388608, ARRAY['image/jpeg'])
ON CONFLICT (id) DO UPDATE SET public = false, file_size_limit = EXCLUDED.file_size_limit, allowed_mime_types = EXCLUDED.allowed_mime_types;

-- ---------------------------------------------------------------------------
-- 5. RPC
-- ---------------------------------------------------------------------------
-- 参加者の表示名（会員はニックネーム→氏名、ゲストは入力した名前）
CREATE OR REPLACE FUNCTION public.private_group_member_display_name(p_member_id uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT CASE WHEN m.user_id IS NULL THEN coalesce(nullif(btrim(m.guest_name), ''), 'ゲスト')
    ELSE coalesce((SELECT coalesce(nullif(c.nickname, ''), nullif(c.name, '')) FROM public.customers c WHERE c.user_id = m.user_id ORDER BY c.id LIMIT 1),
      nullif(btrim(m.guest_name), ''), 'メンバー') END
  FROM public.private_group_members m WHERE m.id = p_member_id
$$;
REVOKE ALL ON FUNCTION public.private_group_member_display_name(uuid) FROM PUBLIC, anon, authenticated;

-- 本文がシステムのお知らせ（JSON の type=system）か
CREATE OR REPLACE FUNCTION public.private_group_message_is_system(p_message text)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path = public, pg_temp AS $$
  SELECT coalesce(public.private_group_message_payload(p_message)->>'type' = 'system', false)
$$;
REVOKE ALL ON FUNCTION public.private_group_message_is_system(text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.private_group_chat_action(p_group_id uuid, p_member_id uuid, p_action text, p_payload jsonb DEFAULT '{}'::jsonb, p_guest_token text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
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
END $$;
REVOKE ALL ON FUNCTION public.private_group_chat_action(uuid, uuid, text, jsonb, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.private_group_chat_action(uuid, uuid, text, jsonb, text) TO anon, authenticated, service_role;

-- 既読の人数・リアクションの集計（参加中の本人だけ）。誰が読んだかは返さない（他の人の既読時刻だけ）
CREATE OR REPLACE FUNCTION public.private_group_chat_state(p_group_id uuid, p_member_id uuid, p_guest_token text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  PERFORM public.require_private_group_member(p_group_id, p_member_id, p_guest_token);
  RETURN jsonb_build_object(
    'my_last_read_at', (SELECT last_read_at FROM public.private_group_read_states WHERE group_id = p_group_id AND member_id = p_member_id),
    'read_times', coalesce((SELECT jsonb_agg(s.last_read_at ORDER BY s.last_read_at)
       FROM public.private_group_read_states s JOIN public.private_group_members m ON m.id = s.member_id AND m.status = 'joined'
       WHERE s.group_id = p_group_id AND s.member_id <> p_member_id), '[]'::jsonb),
    'reactions', coalesce((SELECT jsonb_agg(jsonb_build_object('message_id', r.message_id, 'emoji', r.emoji, 'count', r.n, 'mine', r.mine) ORDER BY r.message_id, r.first_at)
       FROM (SELECT message_id, emoji, count(*) AS n, bool_or(member_id = p_member_id) AS mine, min(created_at) AS first_at
         FROM public.private_group_message_reactions WHERE group_id = p_group_id GROUP BY message_id, emoji) r), '[]'::jsonb)
  );
END $$;
REVOKE ALL ON FUNCTION public.private_group_chat_state(uuid, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.private_group_chat_state(uuid, uuid, text) TO anon, authenticated, service_role;

-- 発言の読み取りに 返信先・削除・ピン留め・写真の枚数と縦横 を足す（staging の現物 2026-10-10 を基に変更。削除済みは本文を返さない）
CREATE OR REPLACE FUNCTION public.private_group_read_messages(p_group_id uuid, p_member_id uuid DEFAULT NULL::uuid, p_guest_token text DEFAULT NULL::text, p_before_created_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_before_id uuid DEFAULT NULL::uuid, p_limit integer DEFAULT 100)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE access_level text; own_members uuid[];
BEGIN
 access_level:=public.authorize_private_group_read(p_group_id,p_member_id,p_guest_token);
 SELECT coalesce(array_agg(id),'{}'::uuid[]) INTO own_members FROM public.private_group_members
 WHERE group_id=p_group_id AND user_id=auth.uid() AND status='joined';
 IF p_member_id IS NOT NULL AND NOT (p_member_id=ANY(own_members)) THEN
  BEGIN
   PERFORM public.require_private_group_member(p_group_id,p_member_id,p_guest_token);
   own_members:=array_append(own_members,p_member_id);
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
 END IF;
 IF p_limit IS NULL OR p_limit<1 OR p_limit>500 OR (p_before_created_at IS NULL)<>(p_before_id IS NULL) THEN
  RAISE EXCEPTION '履歴の取得条件が正しくありません' USING ERRCODE='22023';
 END IF;
 RETURN COALESCE((SELECT jsonb_agg(to_jsonb(m) ORDER BY m.created_at,m.id) FROM (
  SELECT id,group_id,member_id,CASE WHEN deleted_at IS NULL THEN message ELSE '' END AS message,created_at,sender_type,
   reply_to_message_id,deleted_at,pinned_at,
   CASE WHEN deleted_at IS NULL THEN (SELECT jsonb_agg(jsonb_build_object('position',p.position,'width',p.width,'height',p.height) ORDER BY p.position)
     FROM public.private_group_message_photos p WHERE p.message_id=m.id) END AS photos
  FROM public.private_group_messages m
  WHERE group_id=p_group_id
   AND (access_level='staff' OR coalesce(public.private_group_message_payload(m.message)->>'action','')<>'individual_notice'
    OR public.private_group_message_payload(m.message)->>'target_member_id'=ANY(own_members::text[])
    OR (auth.uid() IS NOT NULL AND public.private_group_message_payload(m.message)->>'target_user_id'=auth.uid()::text))
   AND (p_before_created_at IS NULL OR (created_at,id)<(p_before_created_at,p_before_id)) ORDER BY created_at DESC,id DESC LIMIT p_limit
 ) m),'[]'::jsonb);
END $function$;
REVOKE ALL ON FUNCTION public.private_group_read_messages(uuid,uuid,text,timestamptz,uuid,integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.private_group_read_messages(uuid,uuid,text,timestamptz,uuid,integer) TO anon,authenticated,service_role;
