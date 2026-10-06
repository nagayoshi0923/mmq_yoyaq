-- rollback: 判定を元（組織を確かめない）に戻す。試験用の組織の管理者がクインズワルツのデータに届く状態に戻るので、戻すのは業務が止まった場合だけ
CREATE OR REPLACE FUNCTION public.is_org_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE
AS $function$
  SELECT COALESCE(
    (SELECT role = 'admin' FROM public.users WHERE id = auth.uid() LIMIT 1),
    false
  );
$function$;
