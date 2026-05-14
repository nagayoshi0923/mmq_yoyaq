-- performance_cancellation_logs の二重処理防止
-- GitHub Actions 遅延による重複実行で既に重複データがあるため、先に削除してから制約を追加する

-- 重複行を削除（同一 schedule_event_id + check_type の中で最古の行を残す）
DELETE FROM public.performance_cancellation_logs
WHERE id NOT IN (
  SELECT DISTINCT ON (schedule_event_id, check_type) id
  FROM public.performance_cancellation_logs
  ORDER BY schedule_event_id, check_type, created_at ASC
);

-- UNIQUE 制約を追加
ALTER TABLE public.performance_cancellation_logs
  ADD CONSTRAINT performance_cancellation_logs_event_check_type_unique
  UNIQUE (schedule_event_id, check_type);
