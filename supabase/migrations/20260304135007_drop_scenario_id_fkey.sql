-- schedule_events から scenarios テーブルへの外部キー制約を削除
-- scenarios テーブルを廃止し、scenario_masters を使用するため
-- 作成日: 2026-03-04

-- schedule_events の scenario_id 外部キー制約を削除
ALTER TABLE public.schedule_events 
  DROP CONSTRAINT IF EXISTS schedule_events_scenario_id_fkey;

-- reservations の scenario_id 外部キー制約も削除（存在する場合）
ALTER TABLE public.reservations 
  DROP CONSTRAINT IF EXISTS reservations_scenario_id_fkey;

-- performance_kits の scenario_id 外部キー制約も削除（存在する場合）
ALTER TABLE public.performance_kits 
  DROP CONSTRAINT IF EXISTS performance_kits_scenario_id_fkey;

-- private_booking_requests の scenario_id 外部キー制約も削除（存在する場合）
ALTER TABLE public.private_booking_requests 
  DROP CONSTRAINT IF EXISTS private_booking_requests_scenario_id_fkey;

COMMENT ON COLUMN public.schedule_events.scenario_id IS 
  '旧シナリオID（廃止予定）。scenario_master_id を使用してください';
