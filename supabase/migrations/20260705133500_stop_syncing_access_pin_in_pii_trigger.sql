-- ====================================================================
-- #281/#283 対策 (members.access_pin 封鎖 ステップ1/2)
--
-- 同期トリガー sync_private_group_member_pii を修正し、access_pin を
-- PII同期の対象から除外する。
--
-- 目的: 次ステップで members.access_pin を NULL 化する際、旧トリガーだと
--       pii.access_pin まで NULL で上書きされ全ゲストのPINログインが不能に
--       なる。これを防ぐため、先にトリガーから access_pin 同期を外す。
--
-- PIN の唯一の正規書き込み経路は save_guest_access_pin RPC（pii側にのみ書く）。
-- このステップは関数定義の入れ替えのみで、既存データは変更しない。
--
-- 切り戻し: 旧定義（access_pin を EXCLUDED に含む版）を再適用する。
-- ====================================================================
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