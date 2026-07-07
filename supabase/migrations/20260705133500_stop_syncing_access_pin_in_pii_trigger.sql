-- [#320 復旧] 2026-07-05 本番適用済み変更の再構成(詳細は 20260705130528 のヘッダ参照)。
--
-- 内容: PII同期トリガーから access_pin の同期を除去する。
-- (members.access_pin は廃止予定の遺物。UPDATE のたびに NEW.access_pin(NULL) で
--  pii 側の PIN を消してしまう潜在バグもこれで解消)

CREATE OR REPLACE FUNCTION public.sync_private_group_member_pii()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  -- INSERT または UPDATE 時に PII テーブルへ個人情報を同期する。
  -- access_pin はこのトリガーでは同期しない（members.access_pin は廃止予定の遺物）。
  INSERT INTO public.private_group_members_pii (member_id, guest_name, guest_email, guest_phone, updated_at)
  VALUES (NEW.id, NEW.guest_name, NEW.guest_email, NEW.guest_phone, NOW())
  ON CONFLICT (member_id) DO UPDATE SET
    guest_name = EXCLUDED.guest_name,
    guest_email = EXCLUDED.guest_email,
    guest_phone = EXCLUDED.guest_phone,
    updated_at = NOW();
  RETURN NEW;
END;
$function$;
