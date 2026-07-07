-- [#320 復旧] 2026-07-05 本番適用済み変更の再構成(詳細は 20260705130528 のヘッダ参照)。
--
-- 内容: 廃止予定の members.access_pin に残る平文PINを無効化(NULL化)する。
-- PIN の正は private_group_members_pii.access_pin_hash (bcrypt)。冪等。

UPDATE public.private_group_members
SET access_pin = NULL
WHERE access_pin IS NOT NULL;
