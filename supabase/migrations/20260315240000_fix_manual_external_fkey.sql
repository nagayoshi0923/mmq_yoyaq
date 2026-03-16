-- manual_external_performances の scenario_id 外部キー制約を削除
-- 新システムでは scenario_masters を使用するため、古い scenarios テーブルへの参照を削除

-- 外部キー制約を削除
ALTER TABLE public.manual_external_performances 
DROP CONSTRAINT IF EXISTS manual_external_performances_scenario_id_fkey;

-- scenario_masters への外部キーは追加しない（scenario_id は UUID として自由に使用可能）
-- 理由: scenario_masters.id と scenarios.id が混在する可能性があるため

COMMENT ON COLUMN public.manual_external_performances.scenario_id IS 
'シナリオID（scenario_masters.id または scenarios.id）';

DO $$ 
BEGIN
  RAISE NOTICE '✅ manual_external_performances の scenario_id 外部キー制約を削除しました';
END $$;
