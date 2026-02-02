-- =============================================================================
-- Security Snapshot: PUBLIC/anon EXECUTE surface for risky functions
-- =============================================================================
-- Purpose:
-- - List functions that are (SECURITY DEFINER or row_security=off) AND executable by anon/PUBLIC
-- - Persist a snapshot into audit_logs via log_audit() (if available)
--
-- How to run:
-- - Supabase SQL Editor (logged in as admin is fine)
--
-- Output:
-- - A table of current risky-exposed functions
-- - Inserts one audit_logs record with metadata.risky_functions = JSON array
-- =============================================================================

with funcs as (
  select
    p.oid,
    n.nspname as schema,
    p.proname as function_name,
    pg_get_function_identity_arguments(p.oid) as identity_args,
    pg_get_function_result(p.oid) as result_type,
    p.prosecdef as security_definer,
    p.proacl as proacl,
    p.proowner as proowner,
    exists (
      select 1
      from unnest(coalesce(p.proconfig, array[]::text[])) c
      where c ilike 'row_security=off%'
    ) as row_security_off
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
),
privs as (
  select
    f.schema,
    f.function_name,
    f.identity_args,
    f.result_type,
    f.security_definer,
    f.row_security_off,
    coalesce(pg_get_userbyid(ax.grantee), 'PUBLIC') as grantee_name,
    ax.privilege_type
  from funcs f
  cross join lateral aclexplode(coalesce(f.proacl, acldefault('f', f.proowner))) ax
),
risky as (
  select
    schema,
    function_name,
    identity_args,
    result_type,
    security_definer,
    row_security_off,
    grantee_name,
    privilege_type
  from privs
  where (security_definer or row_security_off)
    and privilege_type = 'EXECUTE'
    and grantee_name in ('PUBLIC', 'anon')
)
select *
from risky
order by row_security_off desc, security_definer desc, function_name, identity_args, grantee_name;

do $$
declare
  v_payload jsonb;
  v_count int;
  v_log_id uuid;
begin
  -- Build snapshot payload (JSON array)
  with funcs as (
    select
      p.oid,
      n.nspname as schema,
      p.proname as function_name,
      pg_get_function_identity_arguments(p.oid) as identity_args,
      pg_get_function_result(p.oid) as result_type,
      p.prosecdef as security_definer,
      p.proacl as proacl,
      p.proowner as proowner,
      exists (
        select 1
        from unnest(coalesce(p.proconfig, array[]::text[])) c
        where c ilike 'row_security=off%'
      ) as row_security_off
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
  ),
  privs as (
    select
      f.schema,
      f.function_name,
      f.identity_args,
      f.result_type,
      f.security_definer,
      f.row_security_off,
      coalesce(pg_get_userbyid(ax.grantee), 'PUBLIC') as grantee_name,
      ax.privilege_type
    from funcs f
    cross join lateral aclexplode(coalesce(f.proacl, acldefault('f', f.proowner))) ax
  ),
  risky as (
    select *
    from privs
    where (security_definer or row_security_off)
      and privilege_type = 'EXECUTE'
      and grantee_name in ('PUBLIC', 'anon')
  )
  select
    coalesce(jsonb_agg(jsonb_build_object(
      'schema', schema,
      'function_name', function_name,
      'identity_args', identity_args,
      'result_type', result_type,
      'security_definer', security_definer,
      'row_security_off', row_security_off,
      'grantee', grantee_name,
      'privilege', privilege_type
    ) order by function_name, identity_args, grantee_name), '[]'::jsonb),
    count(*)
  into v_payload, v_count
  from risky;

  -- Write to audit_logs via log_audit if it exists (safe/no-op otherwise)
  if exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'log_audit'
  ) then
    v_log_id := public.log_audit(
      'SECURITY_SNAPSHOT',
      'db_function_privileges',
      null,
      null,
      null,
      jsonb_build_object(
        'snapshot_name', 'risky_function_execute_surface',
        'risky_count', v_count,
        'risky_functions', v_payload
      ),
      null,
      null
    );
    raise notice '✅ SECURITY_SNAPSHOT logged: audit_logs.id=%', v_log_id;
  else
    raise notice '⚠️ log_audit() not found; snapshot not persisted to audit_logs.';
  end if;
end $$;

