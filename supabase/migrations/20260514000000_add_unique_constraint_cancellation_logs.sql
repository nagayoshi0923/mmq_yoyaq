-- performance_cancellation_logs の二重処理防止
-- cron-job.org から15分ごとに呼び出されるため、同一イベントへの重複実行を防ぐ
ALTER TABLE public.performance_cancellation_logs
  ADD CONSTRAINT performance_cancellation_logs_event_check_type_unique
  UNIQUE (schedule_event_id, check_type);
