-- manual_external_performances のユニーク制約を再作成
-- 既存の制約を削除して明示的な名前で再作成

-- 既存のユニーク制約を全て削除
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN (
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'public.manual_external_performances'::regclass
      AND contype = 'u'
  )
  LOOP
    EXECUTE format('ALTER TABLE public.manual_external_performances DROP CONSTRAINT IF EXISTS %I', r.conname);
    RAISE NOTICE 'Dropped constraint: %', r.conname;
  END LOOP;
END $$;

-- 明示的な名前でユニーク制約を作成
ALTER TABLE public.manual_external_performances 
ADD CONSTRAINT manual_external_performances_unique_key 
UNIQUE (organization_id, scenario_id, year, month);

COMMENT ON CONSTRAINT manual_external_performances_unique_key ON public.manual_external_performances 
IS '組織・シナリオ・年月の組み合わせでユニーク';

DO $$ 
BEGIN
  RAISE NOTICE '✅ manual_external_performances のユニーク制約を再作成しました';
END $$;
