-- [#320 復旧] 本ファイルは 2026-07-05 にローカルから本番へ直接適用済みの変更を、
-- 2026-07-07 に本番DBの実装(pg_get_viewdef / reloptions)から再構成したもの。
-- 本番: schema_migrations に本バージョン登録済みのため再実行されない(ファイル配置は履歴照合のため)。
-- staging: 本ファイルにより初適用される。冪等に記述。
--
-- 内容: private_group_members_full ビューを security_invoker=true にし、
-- ビュー経由のアクセスでも呼び出し元の権限・RLSで評価されるようにする。

CREATE OR REPLACE VIEW public.private_group_members_full AS
 SELECT m.id,
    m.group_id,
    m.user_id,
    m.is_organizer,
    m.status,
    m.joined_at,
    m.created_at,
    pii.guest_name,
    pii.guest_email,
    pii.guest_phone,
    pii.access_pin
   FROM public.private_group_members m
     LEFT JOIN public.private_group_members_pii pii ON pii.member_id = m.id;

ALTER VIEW public.private_group_members_full SET (security_invoker = true);
