-- QW-20260917-001: 検証環境で追加した未使用RPCを取り消す。
-- 旧管理画面は統合画面へ転送済みで、メール招待コンポーネントは到達不能だった。
-- 本番には3関数とも未配備。IF EXISTSで両環境の最終状態を一致させる。
-- 招待履歴テーブル・既存の権限/RLS・現行の招待リンク機能には変更を加えない。
DROP FUNCTION IF EXISTS public.private_group_manage_invitation(uuid,text,uuid,uuid,text);
DROP FUNCTION IF EXISTS public.private_group_search_invitee(uuid,text);
DROP FUNCTION IF EXISTS public.private_group_read_invitations(uuid,uuid,integer);
