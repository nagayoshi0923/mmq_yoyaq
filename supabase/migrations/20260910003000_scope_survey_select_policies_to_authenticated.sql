-- These policies require auth.uid(), so they are only meaningful for authenticated users.
-- Avoid evaluating their private-table subqueries as anon. Keep their existing USING clauses.
ALTER POLICY org_scenario_survey_questions_select_staff
  ON public.org_scenario_survey_questions TO authenticated;
ALTER POLICY org_scenario_survey_questions_select_customer
  ON public.org_scenario_survey_questions TO authenticated;
