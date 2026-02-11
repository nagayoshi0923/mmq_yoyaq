-- ============================================================
-- シナリオテーブルにキット数カラムを追加
-- 2026-01-07
-- ============================================================

-- kit_countカラムが存在しない場合のみ追加
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'scenarios' 
      AND column_name = 'kit_count'
  ) THEN
    ALTER TABLE public.scenarios
    ADD COLUMN kit_count integer DEFAULT 1;
    
    COMMENT ON COLUMN public.scenarios.kit_count IS 'キット数（制作費自動計算用）';
    
    RAISE NOTICE 'kit_count column added to scenarios table';
  ELSE
    RAISE NOTICE 'kit_count column already exists in scenarios table';
  END IF;
END $$;

-- 既存データの更新: production_costsからキット数を計算（production_costs カラムが存在する場合のみ）
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'scenarios' AND column_name = 'production_costs'
  ) THEN
    UPDATE public.scenarios
    SET kit_count = GREATEST(1, (
      SELECT COALESCE(
        (elem->>'amount')::integer / 30000,
        1
      )
      FROM jsonb_array_elements(production_costs::jsonb) AS elem
      WHERE elem->>'item' = 'キット'
      LIMIT 1
    ))
    WHERE kit_count IS NULL OR kit_count = 1;
  END IF;
END $$;

