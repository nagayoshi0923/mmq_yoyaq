-- platform customer (role='customer' で auth ユーザー紐付け済み) の
-- customers.organization_id を NULL に統一する。
--
-- 背景:
--   customers.organization_id が org に張り付いた行があると、
--   その customer 本人が別組織のイベントに予約しようとした際に
--   api/reservations.ts の境界チェックで「他組織の customer は指定できません」と拒否される。
--   予約は customer 側の所属組織と独立であるべき (platform customer モデル)。
--
-- 対象: user_id IS NOT NULL かつ organization_id IS NOT NULL かつ users.role = 'customer'
-- staff/admin が自分用に作った customer 行 (users.role != 'customer') は影響を受けない。

UPDATE public.customers AS c
SET organization_id = NULL,
    updated_at = NOW()
FROM public.users AS u
WHERE c.user_id = u.id
  AND c.user_id IS NOT NULL
  AND c.organization_id IS NOT NULL
  AND u.role = 'customer';
