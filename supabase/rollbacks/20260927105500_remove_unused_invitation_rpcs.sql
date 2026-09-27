-- 検証用追加を適用した環境だけ、取得済みlive定義と実行権限を復元する。
-- 本番は20260927105000未適用のため何もしない。業務データは変更しない。
DO $rollback$
BEGIN
 IF EXISTS(SELECT 1 FROM supabase_migrations.schema_migrations WHERE version='20260927105000') THEN
  EXECUTE $definition$CREATE OR REPLACE FUNCTION public.private_group_manage_invitation(p_group_id uuid, p_action text, p_target_user_id uuid DEFAULT NULL::uuid, p_invitation_id uuid DEFAULT NULL::uuid, p_email text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE actor uuid:=auth.uid(); access_level text; g public.private_groups%ROWTYPE; invitation public.private_group_invitations%ROWTYPE; email_value text; matches integer;
BEGIN
 IF actor IS NULL THEN RAISE EXCEPTION 'ログインが必要です' USING ERRCODE='42501'; END IF;
 IF p_action IS NULL OR p_action NOT IN ('create','cancel') THEN RAISE EXCEPTION '操作が不正です' USING ERRCODE='22023'; END IF;
 SELECT * INTO g FROM public.private_groups WHERE id=p_group_id FOR UPDATE;
 access_level:=public.authorize_private_group_read(p_group_id);
 IF p_action='create' THEN
  IF g.status='cancelled' THEN RAISE EXCEPTION '取消済みのグループには招待できません' USING ERRCODE='23514'; END IF;
  IF p_target_user_id IS NULL OR p_target_user_id=actor OR p_invitation_id IS NOT NULL OR NULLIF(btrim(p_email),'') IS NULL THEN RAISE EXCEPTION '招待するユーザーを確認してください' USING ERRCODE='22023'; END IF;
  SELECT lower(btrim(email)) INTO email_value FROM public.users WHERE id=p_target_user_id AND lower(btrim(email))=lower(btrim(p_email));
  IF email_value IS NULL OR email_value='' THEN RAISE EXCEPTION '招待先を確認できません' USING ERRCODE='23514'; END IF;
  IF EXISTS(SELECT 1 FROM public.private_group_members WHERE group_id=p_group_id AND user_id=p_target_user_id AND status='joined') THEN RAISE EXCEPTION 'このユーザーは既にメンバーです' USING ERRCODE='23514'; END IF;
  SELECT count(*) INTO matches FROM public.users WHERE lower(btrim(email))=email_value;
  IF matches<>1 THEN RAISE EXCEPTION '招待先アカウントを一意に確認できません' USING ERRCODE='23514'; END IF;
  SELECT count(*) INTO matches FROM public.private_group_invitations WHERE group_id=p_group_id AND lower(btrim(invited_email))=email_value;
  IF matches>1 THEN RAISE EXCEPTION '既存の招待が重複しています。管理者に確認してください' USING ERRCODE='23514'; END IF;
  SELECT * INTO invitation FROM public.private_group_invitations WHERE group_id=p_group_id AND lower(btrim(invited_email))=email_value ORDER BY id LIMIT 1 FOR UPDATE;
  IF invitation.id IS NOT NULL THEN
   IF invitation.invited_user_id IS DISTINCT FROM p_target_user_id THEN RAISE EXCEPTION '既存の招待先を確認してください' USING ERRCODE='23514'; END IF;
   IF invitation.status='pending' THEN RETURN jsonb_build_object('id',invitation.id,'status',invitation.status); END IF;
   IF invitation.status IN ('accepted','declined') THEN RAISE EXCEPTION '回答済みの招待は再送できません' USING ERRCODE='23514'; END IF;
   UPDATE public.private_group_invitations SET status='pending',invited_by=actor,created_at=now(),responded_at=NULL WHERE id=invitation.id RETURNING * INTO invitation;
  ELSE
   INSERT INTO public.private_group_invitations(group_id,invited_user_id,invited_email,invited_by)
    VALUES(p_group_id,p_target_user_id,email_value,actor) RETURNING * INTO invitation;
  END IF;
 ELSE
  IF p_invitation_id IS NULL OR p_target_user_id IS NOT NULL OR p_email IS NOT NULL THEN RAISE EXCEPTION '取り消す招待を確認してください' USING ERRCODE='22023'; END IF;
  SELECT * INTO invitation FROM public.private_group_invitations WHERE id=p_invitation_id AND group_id=p_group_id FOR UPDATE;
  IF invitation.id IS NULL OR NOT (access_level IN ('organizer','staff') OR invitation.invited_by=actor) THEN RAISE EXCEPTION '招待を取り消す権限がありません' USING ERRCODE='42501'; END IF;
  IF invitation.status='cancelled' THEN RETURN jsonb_build_object('id',invitation.id,'status',invitation.status); END IF;
  IF invitation.status<>'pending' THEN RAISE EXCEPTION '回答済みの招待は取り消せません' USING ERRCODE='23514'; END IF;
  UPDATE public.private_group_invitations SET status='cancelled',responded_at=now() WHERE id=invitation.id RETURNING * INTO invitation;
 END IF;
 RETURN jsonb_build_object('id',invitation.id,'status',invitation.status);
END $function$$definition$;
  EXECUTE $definition$CREATE OR REPLACE FUNCTION public.private_group_read_invitations(p_group_id uuid, p_after_id uuid DEFAULT NULL::uuid, p_limit integer DEFAULT 100)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE actor uuid:=auth.uid(); access_level text;
BEGIN
 IF actor IS NULL THEN RAISE EXCEPTION 'ログインが必要です' USING ERRCODE='42501'; END IF;
 access_level:=public.authorize_private_group_read(p_group_id);
 IF p_limit IS NULL OR p_limit<1 OR p_limit>100 THEN RAISE EXCEPTION '取得件数が不正です' USING ERRCODE='22023'; END IF;
 RETURN COALESCE((SELECT jsonb_agg(to_jsonb(i) ORDER BY i.id) FROM (
  SELECT id,group_id,invited_user_id,invited_email,invited_by,status,created_at,responded_at
  FROM public.private_group_invitations
  WHERE group_id=p_group_id AND (p_after_id IS NULL OR id>p_after_id)
   AND (access_level IN ('organizer','staff') OR invited_by=actor OR invited_user_id=actor)
  ORDER BY id LIMIT p_limit
 ) i),'[]'::jsonb);
END $function$$definition$;
  EXECUTE $definition$CREATE OR REPLACE FUNCTION public.private_group_search_invitee(p_group_id uuid, p_email text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE actor uuid:=auth.uid(); email_value text:=lower(btrim(p_email)); target public.users%ROWTYPE; matches integer;
BEGIN
 IF actor IS NULL THEN RAISE EXCEPTION 'ログインが必要です' USING ERRCODE='42501'; END IF;
 PERFORM public.authorize_private_group_read(p_group_id);
 IF EXISTS(SELECT 1 FROM public.private_groups WHERE id=p_group_id AND status='cancelled') THEN RAISE EXCEPTION '取消済みのグループには招待できません' USING ERRCODE='23514'; END IF;
 IF email_value IS NULL OR length(email_value)>254 OR email_value !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' THEN RAISE EXCEPTION 'メールアドレスを確認してください' USING ERRCODE='22023'; END IF;
 -- ILIKEを使わず、%や_も文字そのものとして比較する。
 SELECT count(*) INTO matches FROM public.users WHERE lower(email)=email_value;
 IF matches=0 THEN RETURN NULL; END IF;
 IF matches>1 THEN RAISE EXCEPTION 'アカウントを一意に確認できません。招待リンクを共有してください' USING ERRCODE='23514'; END IF;
 SELECT * INTO target FROM public.users WHERE lower(email)=email_value;
 IF target.id=actor THEN RAISE EXCEPTION '自分自身を招待することはできません' USING ERRCODE='23514'; END IF;
 IF EXISTS(SELECT 1 FROM public.private_group_members WHERE group_id=p_group_id AND user_id=target.id AND status='joined') THEN RAISE EXCEPTION 'このユーザーは既にメンバーです' USING ERRCODE='23514'; END IF;
 RETURN jsonb_build_object('id',target.id,'email',email_value,'display_name',(SELECT NULLIF(c.nickname,'') FROM public.customers c WHERE c.user_id=target.id ORDER BY c.id LIMIT 1));
END $function$$definition$;
  REVOKE ALL ON FUNCTION public.private_group_read_invitations(uuid,uuid,integer),public.private_group_search_invitee(uuid,text),public.private_group_manage_invitation(uuid,text,uuid,uuid,text) FROM PUBLIC,anon;
  GRANT EXECUTE ON FUNCTION public.private_group_read_invitations(uuid,uuid,integer),public.private_group_search_invitee(uuid,text),public.private_group_manage_invitation(uuid,text,uuid,uuid,text) TO authenticated,service_role;
 END IF;
END $rollback$;
