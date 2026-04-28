-- オープン公演のキャンセル規定を変更
-- 旧: 1日前より50%、当日100%
-- 新: 2日前まで無料、前日（48〜24時間前）より50%、当日（24時間前以内）より100%

UPDATE public.reservation_settings
SET
  cancellation_fees = '[
    {"hours_before": 48, "fee_percentage": 50,  "description": "前日より50%"},
    {"hours_before": 24, "fee_percentage": 100, "description": "当日より100%"},
    {"hours_before": -1, "fee_percentage": 100, "description": "公演開始後・無断100%"}
  ]'::jsonb
WHERE true;
