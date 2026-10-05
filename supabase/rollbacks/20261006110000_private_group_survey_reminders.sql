-- rollback: アンケートのリマインドメールの仕組みを取り除く（定期実行の登録は別 migration の rollback で外す）
DROP FUNCTION IF EXISTS public.finish_private_group_survey_reminder(uuid,boolean,text,text,uuid,boolean);
DROP FUNCTION IF EXISTS public.claim_private_group_survey_reminders(integer);
DROP FUNCTION IF EXISTS public.enqueue_private_group_survey_reminder_preview(uuid,text);
DROP FUNCTION IF EXISTS public.enqueue_private_group_survey_reminders(text);
DROP FUNCTION IF EXISTS public.private_group_survey_reminder_targets();
DROP TABLE IF EXISTS public.private_group_survey_reminders;
