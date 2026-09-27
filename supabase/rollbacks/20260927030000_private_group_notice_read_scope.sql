DROP FUNCTION IF EXISTS public.private_group_send_individual_notice(uuid,uuid,text,text,boolean);
CREATE OR REPLACE FUNCTION public.private_group_read_messages(p_group_id uuid,p_member_id uuid DEFAULT NULL,p_guest_token text DEFAULT NULL,p_before_created_at timestamptz DEFAULT NULL,p_before_id uuid DEFAULT NULL,p_limit integer DEFAULT 100)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 PERFORM public.authorize_private_group_read(p_group_id,p_member_id,p_guest_token);
 IF p_limit IS NULL OR p_limit<1 OR p_limit>500 OR (p_before_created_at IS NULL)<>(p_before_id IS NULL) THEN
  RAISE EXCEPTION '履歴の取得条件が正しくありません' USING ERRCODE='22023';
 END IF;
 RETURN COALESCE((SELECT jsonb_agg(to_jsonb(m) ORDER BY m.created_at,m.id) FROM (
  SELECT id,group_id,member_id,message,created_at,sender_type FROM public.private_group_messages WHERE group_id=p_group_id AND (p_before_created_at IS NULL OR (created_at,id)<(p_before_created_at,p_before_id)) ORDER BY created_at DESC,id DESC LIMIT p_limit
 ) m),'[]'::jsonb);
END $$;
REVOKE ALL ON FUNCTION public.private_group_read_messages(uuid,uuid,text,timestamptz,uuid,integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.private_group_read_messages(uuid,uuid,text,timestamptz,uuid,integer) TO anon,authenticated,service_role;

DROP FUNCTION IF EXISTS public.private_group_message_payload(text);
