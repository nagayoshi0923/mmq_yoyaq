CREATE OR REPLACE FUNCTION public.reservation_actor_is_org_operator(p_organization_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  -- 対象組織を必須にする。退職・停止・解除は既存の所属判定を使う。
  SELECT auth.uid() IS NOT NULL
    AND p_organization_id IS NOT NULL
    AND public.get_user_organization_id() = p_organization_id
    AND (
      public.is_org_admin()
      OR EXISTS (
        SELECT 1 FROM public.staff
        WHERE user_id = auth.uid()
          AND organization_id = p_organization_id
          AND status = 'active'
      )
    );
$function$;

-- RPC内部専用。利用者向けAPIとして公開しない。
REVOKE ALL ON FUNCTION public.reservation_actor_is_org_operator(uuid) FROM PUBLIC, anon, authenticated, service_role;
