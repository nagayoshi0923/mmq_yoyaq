-- シナリオ別の貸切受付不可時間帯を追加
-- organization_scenarios テーブルに追加

ALTER TABLE public.organization_scenarios 
ADD COLUMN IF NOT EXISTS private_booking_blocked_slots text[] DEFAULT NULL;

COMMENT ON COLUMN public.organization_scenarios.private_booking_blocked_slots IS '貸切受付不可時間帯（午前、午後、夜間）';
