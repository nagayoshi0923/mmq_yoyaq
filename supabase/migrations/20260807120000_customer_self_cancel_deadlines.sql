-- 顧客セルフキャンセル受付期限を運用に合わせる
-- 通常: 48時間前まで（キャンセル料が発生する期間はマイページ不可）
-- 貸切: 720時間（30日）前まで
--
-- 破壊的変更: なし（既存 0 の行だけ上書き。非0の店舗カスタム値は維持）
-- 影響: reservation_settings の受付期限 / マイページ・顧客 cancel API の可否判定

UPDATE public.reservation_settings
SET
  cancellation_deadline_hours = 48
WHERE cancellation_deadline_hours IS NULL
   OR cancellation_deadline_hours = 0;

UPDATE public.reservation_settings
SET
  private_cancellation_deadline_hours = 720
WHERE private_cancellation_deadline_hours IS NULL
   OR private_cancellation_deadline_hours = 0;

ALTER TABLE public.reservation_settings
  ALTER COLUMN cancellation_deadline_hours SET DEFAULT 48;

ALTER TABLE public.reservation_settings
  ALTER COLUMN private_cancellation_deadline_hours SET DEFAULT 720;
