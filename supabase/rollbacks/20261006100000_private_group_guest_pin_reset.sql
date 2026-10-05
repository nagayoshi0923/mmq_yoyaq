-- rollback: PIN の再発行を取り除く（再発行済みの PIN はそのまま有効。画面側の「PINを忘れた方」は送信が失敗しても同じ案内を出す）
DROP FUNCTION IF EXISTS public.reset_private_group_guest_pin(text,text);
DROP TABLE IF EXISTS public.private_group_guest_pin_resets;
