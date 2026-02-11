-- RLS hardening: add WITH CHECK / tighten UPDATE policies (remaining tables)
-- Focus: prevent organization_id / role tampering while keeping existing flows working
-- Date: 2026-02-09

-- =============================================================================
-- 1) users: prevent self privilege escalation (role/org), allow only:
--    - service_role (Edge Functions) unrestricted
--    - admin unrestricted
--    - self: only if (a) no-op updates OR (b) promotion via accepted invitation OR (c) staff link exists
-- =============================================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'users'
  ) THEN
    RETURN;
  END IF;

  ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

  DROP POLICY IF EXISTS "users_update_self_or_admin" ON public.users;
  DROP POLICY IF EXISTS "users_update_self" ON public.users;
  DROP POLICY IF EXISTS "users_insert_self" ON public.users;

  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'organization_invitations'
  ) THEN
    -- Full policy: staff/admin insert requires accepted invitation
    CREATE POLICY "users_insert_self" ON public.users
      FOR INSERT
      WITH CHECK (
        id = auth.uid()
        AND (
          role = 'customer'::app_role
          OR (
            role IN ('staff'::app_role, 'admin'::app_role)
            AND EXISTS (
              SELECT 1
              FROM public.organization_invitations oi
              WHERE oi.email = auth.email()
                AND oi.accepted_at IS NOT NULL
            )
          )
        )
      );
  ELSE
    -- Fallback: allow self-insert (organization_invitations not yet present)
    CREATE POLICY "users_insert_self" ON public.users
      FOR INSERT
      WITH CHECK (id = auth.uid());
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'organization_invitations'
  ) THEN
    CREATE POLICY "users_update_self_or_admin" ON public.users
      FOR UPDATE
      USING (
        auth.role() = 'service_role'::text
        OR is_admin()
        OR id = auth.uid()
      )
      WITH CHECK (
        -- Service role / admin: OK
        auth.role() = 'service_role'::text
        OR is_admin()
        OR (
          id = auth.uid()
          AND email = (SELECT u2.email FROM public.users u2 WHERE u2.id = auth.uid())
          AND (
            -- (a) no-op: keep role/org unchanged
            (
              role = (SELECT u2.role FROM public.users u2 WHERE u2.id = auth.uid())
              AND organization_id = (SELECT u2.organization_id FROM public.users u2 WHERE u2.id = auth.uid())
            )
            OR
            -- (b) invitation-driven promotion (customer -> staff/admin) with org match
            (
              (SELECT u2.role FROM public.users u2 WHERE u2.id = auth.uid()) = 'customer'::app_role
              AND EXISTS (
                SELECT 1
                FROM public.organization_invitations oi
                WHERE oi.email = auth.email()
                  AND oi.accepted_at IS NOT NULL
                  AND oi.organization_id = users.organization_id
                  AND (
                    -- admin requires explicit admin-ish role in invitation.role
                    (users.role = 'admin'::app_role AND (('管理者' = ANY(oi.role)) OR ('admin' = ANY(oi.role))))
                    OR
                    -- staff is allowed for any accepted invitation
                    (users.role = 'staff'::app_role)
                  )
              )
            )
            OR
            -- (c) staff link repair (customer -> staff) if staff row exists and org matches
            (
              users.role = 'staff'::app_role
              AND EXISTS (SELECT 1 FROM public.staff s WHERE s.user_id = auth.uid())
              AND users.organization_id = (
                SELECT s.organization_id FROM public.staff s WHERE s.user_id = auth.uid() LIMIT 1
              )
            )
          )
        )
      );
  ELSE
    -- Fallback: simpler UPDATE policy when organization_invitations not present
    CREATE POLICY "users_update_self_or_admin" ON public.users
      FOR UPDATE
      USING (
        auth.role() = 'service_role'::text
        OR is_admin()
        OR id = auth.uid()
      )
      WITH CHECK (
        auth.role() = 'service_role'::text
        OR is_admin()
        OR id = auth.uid()
      );
  END IF;
END $$;

-- =============================================================================
-- 2) organization_invitations:
--    - SELECT must NOT be "any authenticated" (data leak)
--    - UPDATE must restrict invitee updates to link staff_id only (no org/token/role changes)
-- =============================================================================
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'organization_invitations'
  ) THEN
    ALTER TABLE public.organization_invitations ENABLE ROW LEVEL SECURITY;

    DROP POLICY IF EXISTS organization_invitations_select_policy ON public.organization_invitations;
    DROP POLICY IF EXISTS organization_invitations_update_policy ON public.organization_invitations;

    CREATE POLICY organization_invitations_select_policy ON public.organization_invitations
      FOR SELECT
      USING (
        is_admin()
        OR organization_id IN (SELECT organization_id FROM public.staff WHERE user_id = auth.uid())
      );

    CREATE POLICY organization_invitations_update_policy ON public.organization_invitations
      FOR UPDATE
      USING (
        -- org admin can manage invitations in their org
        organization_id IN (
          SELECT s.organization_id
          FROM public.staff s
          JOIN public.users u ON s.user_id = u.id
          WHERE s.user_id = auth.uid()
            AND u.role = 'admin'::app_role
        )
        OR
        -- invitee can update their own invitation (e.g., link staff_id)
        email = (SELECT au.email FROM auth.users au WHERE au.id = auth.uid())::text
      )
      WITH CHECK (
        -- org admin: no extra restriction (within their org)
        organization_id IN (
          SELECT s.organization_id
          FROM public.staff s
          JOIN public.users u ON s.user_id = u.id
          WHERE s.user_id = auth.uid()
            AND u.role = 'admin'::app_role
        )
        OR
        (
          -- invitee path: key fields must be immutable
          email = (SELECT au.email FROM auth.users au WHERE au.id = auth.uid())::text
          AND organization_id = (SELECT oi.organization_id FROM public.organization_invitations oi WHERE oi.id = organization_invitations.id)
          AND email = (SELECT oi.email FROM public.organization_invitations oi WHERE oi.id = organization_invitations.id)
          AND token = (SELECT oi.token FROM public.organization_invitations oi WHERE oi.id = organization_invitations.id)
          AND role = (SELECT oi.role FROM public.organization_invitations oi WHERE oi.id = organization_invitations.id)
          AND expires_at = (SELECT oi.expires_at FROM public.organization_invitations oi WHERE oi.id = organization_invitations.id)
        )
      );
  END IF;
END $$;

-- =============================================================================
-- 3) waitlist: UPDATE needs WITH CHECK so org_id stays consistent with schedule_event
-- =============================================================================
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'waitlist'
  ) THEN
    ALTER TABLE public.waitlist ENABLE ROW LEVEL SECURITY;

    DROP POLICY IF EXISTS "Users can update own or org waitlist" ON public.waitlist;
    DROP POLICY IF EXISTS "Organization members can update waitlist" ON public.waitlist;

    CREATE POLICY "Users can update own or org waitlist" ON public.waitlist
      FOR UPDATE
      USING (
        customer_email = auth.email()
        OR organization_id IN (SELECT organization_id FROM public.staff WHERE user_id = auth.uid())
        OR is_org_admin()
        OR is_admin()
      )
      WITH CHECK (
        -- prevent tampering: organization_id must match schedule_event.organization_id
        organization_id = (
          SELECT se.organization_id
          FROM public.schedule_events se
          WHERE se.id = waitlist.schedule_event_id
        )
        AND (
          customer_email = auth.email()
          OR organization_id IN (SELECT organization_id FROM public.staff WHERE user_id = auth.uid())
          OR is_org_admin()
          OR is_admin()
        )
      );
  END IF;
END $$;

-- =============================================================================
-- 4) shift_submissions: enforce organization_id matches staff.organization_id on INSERT/UPDATE
-- =============================================================================
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'shift_submissions'
  ) THEN
    ALTER TABLE public.shift_submissions ENABLE ROW LEVEL SECURITY;

    DROP POLICY IF EXISTS "shift_submissions_insert_self_or_admin" ON public.shift_submissions;
    DROP POLICY IF EXISTS "shift_submissions_update_self_or_admin" ON public.shift_submissions;

    CREATE POLICY "shift_submissions_insert_self_or_admin" ON public.shift_submissions
      FOR INSERT
      WITH CHECK (
        is_admin()
        OR staff_id IN (SELECT id FROM public.staff WHERE user_id = auth.uid())
        AND organization_id = (SELECT s.organization_id FROM public.staff s WHERE s.id = shift_submissions.staff_id)
      );

    CREATE POLICY "shift_submissions_update_self_or_admin" ON public.shift_submissions
      FOR UPDATE
      USING (
        is_admin()
        OR staff_id IN (SELECT id FROM public.staff WHERE user_id = auth.uid())
      )
      WITH CHECK (
        is_admin()
        OR (
          staff_id IN (SELECT id FROM public.staff WHERE user_id = auth.uid())
          AND organization_id = (SELECT s.organization_id FROM public.staff s WHERE s.id = shift_submissions.staff_id)
        )
      );
  END IF;
END $$;

-- =============================================================================
-- 5) shift_button_states: remove "authenticated can update all" policy
--    (table may exist outside supabase migrations; apply only if column organization_id exists)
-- =============================================================================
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'shift_button_states'
      AND column_name = 'organization_id'
  ) THEN
    ALTER TABLE public.shift_button_states ENABLE ROW LEVEL SECURITY;

    DROP POLICY IF EXISTS "Enable read access for authenticated users" ON public.shift_button_states;
    DROP POLICY IF EXISTS "Enable insert for authenticated users" ON public.shift_button_states;
    DROP POLICY IF EXISTS "Enable update for authenticated users" ON public.shift_button_states;

    CREATE POLICY "shift_button_states_select_strict" ON public.shift_button_states
      FOR SELECT
      USING (
        is_admin()
        OR is_org_admin()
        OR staff_id IN (SELECT id FROM public.staff WHERE user_id = auth.uid())
      );

    CREATE POLICY "shift_button_states_insert_strict" ON public.shift_button_states
      FOR INSERT
      WITH CHECK (
        is_admin()
        OR is_org_admin()
        OR (
          staff_id IN (SELECT id FROM public.staff WHERE user_id = auth.uid())
          AND organization_id = (SELECT s.organization_id FROM public.staff s WHERE s.id = shift_button_states.staff_id)
        )
      );

    CREATE POLICY "shift_button_states_update_strict" ON public.shift_button_states
      FOR UPDATE
      USING (
        is_admin()
        OR is_org_admin()
        OR staff_id IN (SELECT id FROM public.staff WHERE user_id = auth.uid())
      )
      WITH CHECK (
        is_admin()
        OR is_org_admin()
        OR (
          staff_id IN (SELECT id FROM public.staff WHERE user_id = auth.uid())
          AND organization_id = (SELECT s.organization_id FROM public.staff s WHERE s.id = shift_button_states.staff_id)
        )
      );
  END IF;
END $$;

