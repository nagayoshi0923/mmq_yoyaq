-- Roll frontend back before removing its RPCs. No table/data changes to undo.
DROP FUNCTION IF EXISTS public.list_survey_question_sources(uuid);
DROP FUNCTION IF EXISTS public.save_survey_question_settings(uuid,jsonb,text);
DROP FUNCTION IF EXISTS public.read_survey_question_settings(uuid);
DROP FUNCTION IF EXISTS public.require_survey_question_staff(uuid);
