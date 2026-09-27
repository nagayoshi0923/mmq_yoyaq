-- 新フロントを戻してから適用する。招待履歴・既存権限を保持する。
DROP FUNCTION public.private_group_manage_invitation(uuid,text,uuid,uuid,text);
DROP FUNCTION public.private_group_search_invitee(uuid,text);
DROP FUNCTION public.private_group_read_invitations(uuid,uuid,integer);
