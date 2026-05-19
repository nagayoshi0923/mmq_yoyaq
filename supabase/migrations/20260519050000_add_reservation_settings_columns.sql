-- CancellationSettings.tsx が SELECT している列が存在しないため 400 エラーになっていた問題を修正
ALTER TABLE public.reservation_settings
  ADD COLUMN IF NOT EXISTS auto_refund_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS refund_processing_days integer NOT NULL DEFAULT 7;
