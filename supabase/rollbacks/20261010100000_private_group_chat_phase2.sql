-- 20261010100000 の取り消し: 貸切グループページ刷新 段階 2（チャット強化と写真）を外す
-- 注意: 既読・リアクション・ピン留め・返信先・写真の記録が消える。削除済みの発言の本文は戻らない（空のまま普通の発言に見える）。
-- 写真のファイルとバケット（Storage private-group-photos）は SQL から消せない（Storage は API 経由の削除だけ受け付ける。
-- 手元で確認済み: "Direct deletion from storage tables is not allowed"）。非公開のまま残っても誰も読めないので害はない。
-- 消すときは Supabase の管理画面か Storage API で中身を空にしてからバケットを消す。最後の DO ブロックは消せる環境でだけ消す。
BEGIN;
DROP FUNCTION IF EXISTS public.private_group_chat_state(uuid, uuid, text);
DROP FUNCTION IF EXISTS public.private_group_chat_action(uuid, uuid, text, jsonb, text);
DROP FUNCTION IF EXISTS public.private_group_message_is_system(text);
DROP FUNCTION IF EXISTS public.private_group_member_display_name(uuid);

-- 発言の読み取りを段階 1 の形に戻す（20260927030000 / staging の現物 2026-10-10 と同じ）
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
  SELECT id,group_id,member_id,message,created_at,sender_type FROM public.private_group_messages m
  WHERE group_id=p_group_id
   AND (access_level='staff' OR coalesce(public.private_group_message_payload(m.message)->>'action','')<>'individual_notice'
    OR public.private_group_message_payload(m.message)->>'target_member_id'=ANY(own_members::text[])
    OR (auth.uid() IS NOT NULL AND public.private_group_message_payload(m.message)->>'target_user_id'=auth.uid()::text))
   AND (p_before_created_at IS NULL OR (created_at,id)<(p_before_created_at,p_before_id)) ORDER BY created_at DESC,id DESC LIMIT p_limit
 ) m),'[]'::jsonb);
END $function$;
REVOKE ALL ON FUNCTION public.private_group_read_messages(uuid,uuid,text,timestamptz,uuid,integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.private_group_read_messages(uuid,uuid,text,timestamptz,uuid,integer) TO anon,authenticated,service_role;

DROP TABLE IF EXISTS public.private_group_message_photos;
DROP TABLE IF EXISTS public.private_group_message_reactions;
DROP TABLE IF EXISTS public.private_group_read_states;
DROP INDEX IF EXISTS public.idx_private_group_messages_pinned;
ALTER TABLE public.private_group_messages
  DROP COLUMN IF EXISTS pinned_by_member_id,
  DROP COLUMN IF EXISTS pinned_at,
  DROP COLUMN IF EXISTS deleted_at,
  DROP COLUMN IF EXISTS reply_to_message_id;
COMMIT;

-- バケットは中身が空のときだけ消す（失敗してもここまでの取り消しは確定済み）
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM storage.objects WHERE bucket_id = 'private-group-photos') THEN
    DELETE FROM storage.buckets WHERE id = 'private-group-photos';
  ELSE
    RAISE NOTICE 'private-group-photos に写真が残っているためバケットは残しました';
  END IF;
EXCEPTION WHEN others THEN
  RAISE NOTICE 'バケットを消せませんでした: %', SQLERRM;
END $$;
