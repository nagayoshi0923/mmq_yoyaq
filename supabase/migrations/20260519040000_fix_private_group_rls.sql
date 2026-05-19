-- private_group 系テーブルの RLS 修正
-- 現状: candidate_dates / date_responses / messages の SELECT が `true`（全認証ユーザーが全行見える）
-- 修正: グループメンバーまたは自組織の staff/admin のみに制限

-- ============================================================
-- private_group_candidate_dates
-- ============================================================
DROP POLICY IF EXISTS "private_group_candidate_dates_select" ON public.private_group_candidate_dates;

CREATE POLICY "private_group_candidate_dates_select"
ON public.private_group_candidate_dates FOR SELECT
USING (
  -- グループメンバー
  EXISTS (
    SELECT 1 FROM public.private_group_members pgm
    WHERE pgm.group_id = private_group_candidate_dates.group_id
      AND pgm.user_id = auth.uid()
  )
  OR
  -- 自組織の staff/admin
  EXISTS (
    SELECT 1 FROM public.private_groups pg
    JOIN public.staff s ON s.organization_id = pg.organization_id
    WHERE pg.id = private_group_candidate_dates.group_id
      AND s.user_id = auth.uid()
      AND s.status = 'active'
  )
  OR public.is_license_admin()
);

-- ============================================================
-- private_group_date_responses
-- ============================================================
DROP POLICY IF EXISTS "private_group_date_responses_select" ON public.private_group_date_responses;

CREATE POLICY "private_group_date_responses_select"
ON public.private_group_date_responses FOR SELECT
USING (
  -- 回答者本人
  member_id IN (
    SELECT id FROM public.private_group_members WHERE user_id = auth.uid()
  )
  OR
  -- グループメンバー（主催者等）
  EXISTS (
    SELECT 1 FROM public.private_group_candidate_dates pgcd
    JOIN public.private_group_members pgm ON pgm.group_id = pgcd.group_id
    WHERE pgcd.id = private_group_date_responses.candidate_date_id
      AND pgm.user_id = auth.uid()
  )
  OR
  -- 自組織の staff/admin
  EXISTS (
    SELECT 1 FROM public.private_group_candidate_dates pgcd
    JOIN public.private_groups pg ON pg.id = pgcd.group_id
    JOIN public.staff s ON s.organization_id = pg.organization_id
    WHERE pgcd.id = private_group_date_responses.candidate_date_id
      AND s.user_id = auth.uid()
      AND s.status = 'active'
  )
  OR public.is_license_admin()
);

-- ============================================================
-- private_group_messages
-- ============================================================
DROP POLICY IF EXISTS "private_group_messages_select" ON public.private_group_messages;

CREATE POLICY "private_group_messages_select"
ON public.private_group_messages FOR SELECT
USING (
  -- グループメンバー
  EXISTS (
    SELECT 1 FROM public.private_group_members pgm
    WHERE pgm.group_id = private_group_messages.group_id
      AND pgm.user_id = auth.uid()
  )
  OR
  -- 自組織の staff/admin
  EXISTS (
    SELECT 1 FROM public.private_groups pg
    JOIN public.staff s ON s.organization_id = pg.organization_id
    WHERE pg.id = private_group_messages.group_id
      AND s.user_id = auth.uid()
      AND s.status = 'active'
  )
  OR public.is_license_admin()
);
