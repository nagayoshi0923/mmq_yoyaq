-- [#320 復旧] 2026-07-05 本番適用済み変更の再構成(詳細は 20260705130528 のヘッダ参照)。
--
-- 内容: PII を含む private_group_members_full ビューへの anon / authenticated の
-- 直接アクセスを剥奪し、service_role のみに限定する(本番の現行GRANT状態と一致)。

REVOKE ALL ON public.private_group_members_full FROM anon;
REVOKE ALL ON public.private_group_members_full FROM authenticated;
GRANT ALL ON public.private_group_members_full TO service_role;
