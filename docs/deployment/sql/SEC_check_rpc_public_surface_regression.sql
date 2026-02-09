-- =============================================================================
-- Security Check: detect unexpected PUBLIC/anon EXECUTE on risky functions
-- =============================================================================
-- Purpose:
-- - Detect regressions where new (SECURITY DEFINER or row_security=off) functions
--   become executable by anon/PUBLIC.
-- - Uses an allowlist for functions that are intentionally callable from anon.
--
-- How to run:
-- - Supabase SQL Editor
--
-- Output:
-- - unexpected_count
-- - unexpected rows (if any)
-- =============================================================================

-- NOTE:
-- CTEs (WITH ...) are scoped to a single SQL statement.
-- This file intentionally runs TWO statements:
--   1) Count unexpected exposures
--   2) List unexpected rows

-- -----------------------------------------------------------------------------
-- 1) unexpected_count
-- -----------------------------------------------------------------------------
with allowlist as (
  -- Baseline allowlist as of 2026-02-02 (review if you intentionally change it)
  -- These are intentionally callable by anon in this product.
  select 'accept_invitation_atomic'::text as function_name, 'p_token text, p_user_id uuid'::text as identity_args
  union all select 'check_rate_limit', 'p_identifier text, p_endpoint text, p_max_requests integer, p_window_seconds integer'
  union all select 'create_reservation_with_lock_v2', 'p_schedule_event_id uuid, p_participant_count integer, p_customer_id uuid, p_customer_name text, p_customer_email text, p_customer_phone text, p_notes text, p_how_found text, p_reservation_number text'
  union all select 'update_reservation_participants', 'p_reservation_id uuid, p_new_count integer, p_customer_id uuid'

  -- Helper-style functions currently exposed to anon (keep unless you confirm nothing depends on them)
  union all select 'current_organization_id', ''
  union all select 'get_user_organization_id', ''
  union all select 'get_user_role', ''
  union all select 'is_admin', ''
  union all select 'is_license_admin', ''
  union all select 'is_license_manager', ''
  union all select 'is_org_admin', ''
  union all select 'is_organization_member', 'p_organization_id uuid'
  union all select 'is_staff_or_admin', ''
),
funcs as (
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
risky_anon as (
  select *
  from privs
  where (security_definer or row_security_off)
    and privilege_type = 'EXECUTE'
    and grantee_name in ('PUBLIC', 'anon')
),
unexpected as (
  select r.*
  from risky_anon r
  where not exists (
    select 1
    from allowlist a
    where a.function_name = r.function_name
      and a.identity_args = r.identity_args
  )
)
select
  count(*) as unexpected_count
from unexpected;

-- -----------------------------------------------------------------------------
-- 2) unexpected rows
-- -----------------------------------------------------------------------------
with allowlist as (
  select 'accept_invitation_atomic'::text as function_name, 'p_token text, p_user_id uuid'::text as identity_args
  union all select 'check_rate_limit', 'p_identifier text, p_endpoint text, p_max_requests integer, p_window_seconds integer'
  union all select 'create_reservation_with_lock_v2', 'p_schedule_event_id uuid, p_participant_count integer, p_customer_id uuid, p_customer_name text, p_customer_email text, p_customer_phone text, p_notes text, p_how_found text, p_reservation_number text'
  union all select 'current_organization_id', ''
  union all select 'get_user_organization_id', ''
  union all select 'get_user_role', ''
  union all select 'is_admin', ''
  union all select 'is_license_admin', ''
  union all select 'is_license_manager', ''
  union all select 'is_org_admin', ''
  union all select 'is_organization_member', 'p_organization_id uuid'
  union all select 'is_staff_or_admin', ''
  union all select 'update_reservation_participants', 'p_reservation_id uuid, p_new_count integer, p_customer_id uuid'
),
funcs as (
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
risky_anon as (
  select *
  from privs
  where (security_definer or row_security_off)
    and privilege_type = 'EXECUTE'
    and grantee_name in ('PUBLIC', 'anon')
),
unexpected as (
  select r.*
  from risky_anon r
  where not exists (
    select 1
    from allowlist a
    where a.function_name = r.function_name
      and a.identity_args = r.identity_args
  )
)
select
  schema,
  function_name,
  identity_args,
  result_type,
  security_definer,
  row_security_off,
  grantee_name,
  privilege_type
from unexpected
order by row_security_off desc, security_definer desc, function_name, identity_args, grantee_name;

