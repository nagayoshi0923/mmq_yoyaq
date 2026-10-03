-- rollback: GM 担当解除の通知をやめる（予約表に積んだ未送信分は残る）
DROP TRIGGER IF EXISTS gm_assignment_released ON public.schedule_events;
DROP FUNCTION IF EXISTS public.gm_assignment_released_trigger();
DROP FUNCTION IF EXISTS public.enqueue_gm_assignment_released(public.schedule_events,text[],text,text);
