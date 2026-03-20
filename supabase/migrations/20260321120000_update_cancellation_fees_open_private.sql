-- キャンセルポリシー: オープン / 貸切の料率・期限を運用ルールに合わせる
-- オープン: 1日前より50%、当日100%（24時間前より前は無料）
-- 貸切: 7日前より公演価格全額の50%、3日前より100%（7日より前は無料）
-- 当日100%を許容するため、キャンセル受付期限は開演時刻まで（0）

UPDATE public.reservation_settings
SET
  cancellation_fees = '[
    {"hours_before": 24, "fee_percentage": 0, "description": "公演開始24時間前まで無料（1日より前）"},
    {"hours_before": 0, "fee_percentage": 50, "description": "1日前より50%"},
    {"hours_before": -1, "fee_percentage": 100, "description": "当日・公演開始後・無断100%"}
  ]'::jsonb,
  private_cancellation_fees = '[
    {"hours_before": 168, "fee_percentage": 0, "description": "7日より前は無料"},
    {"hours_before": 72, "fee_percentage": 50, "description": "7日前より公演価格全額の50%"},
    {"hours_before": 0, "fee_percentage": 100, "description": "3日前より公演価格全額の100%"},
    {"hours_before": -1, "fee_percentage": 100, "description": "公演開始後・無断キャンセル100%"}
  ]'::jsonb,
  cancellation_deadline_hours = 0,
  private_cancellation_deadline_hours = 0
WHERE true;
