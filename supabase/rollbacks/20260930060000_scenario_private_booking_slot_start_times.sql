-- 20260930060000 を戻す: 列とビューの列を追加しただけなので、画面を戻せば未使用になる。
-- ビューの列は CREATE OR REPLACE では削れず、ビューを作り直すと依存するビューや権限に影響するため、ここでは消さない。
-- 設定値だけを無効にしたい場合は次を実行する。
UPDATE public.organization_scenarios SET private_booking_slot_start_times = NULL
WHERE private_booking_slot_start_times IS NOT NULL;
