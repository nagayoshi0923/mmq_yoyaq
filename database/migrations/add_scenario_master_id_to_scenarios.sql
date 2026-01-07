-- ============================================================
-- scenariosテーブルにscenario_master_idカラムを追加
-- マスタから引用したシナリオの場合に、マスタとの紐付けを保持する
-- ============================================================

-- scenario_master_idカラムを追加（NULLを許可 - 既存シナリオはマスタ紐付けなし）
ALTER TABLE public.scenarios 
  ADD COLUMN IF NOT EXISTS scenario_master_id UUID REFERENCES public.scenario_masters(id) ON DELETE SET NULL;

-- インデックス追加
CREATE INDEX IF NOT EXISTS idx_scenarios_master_id 
  ON public.scenarios(scenario_master_id) 
  WHERE scenario_master_id IS NOT NULL;

-- コメント追加
COMMENT ON COLUMN public.scenarios.scenario_master_id IS 'マスタから引用した場合のマスタシナリオID（NULLの場合は独自作成）';

SELECT 'scenario_master_id column added to scenarios table' as result;


