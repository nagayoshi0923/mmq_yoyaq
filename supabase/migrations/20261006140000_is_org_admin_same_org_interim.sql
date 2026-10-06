-- 応急の措置（2026-10-06）: 「組織の管理者か」の判定 is_org_admin() が組織を確かめておらず、
-- 「自分の組織のデータ、または（どこかの組織の）管理者なら可」という決まり（21 件）や関数から、
-- 試験用の組織（QQ・そしき・mmmq）の管理者がクインズワルツのデータに届く状態だった。
-- 本格的な直し（決まり・関数ごとに「自分の組織」か「マスター」に直す。#943）までの間、
-- 判定をクインズワルツの管理者だけに当てはまるようにする。クインズワルツの管理者の動きは変わらない。
-- 試験用の組織の管理者は、自分の組織の管理操作の一部ができなくなる（直近 90 日の予約 0 件で使われていない）。
CREATE OR REPLACE FUNCTION public.is_org_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE
AS $function$
  SELECT COALESCE(
    (SELECT role = 'admin' AND organization_id = 'a0000000-0000-0000-0000-000000000001'::uuid FROM public.users WHERE id = auth.uid() LIMIT 1),
    false
  );
$function$;
