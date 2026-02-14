-- customers テーブルに生年月日カラムを追加
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'customers' AND column_name = 'birth_date'
  ) THEN
    ALTER TABLE public.customers
      ADD COLUMN birth_date DATE;
    
    COMMENT ON COLUMN public.customers.birth_date IS '生年月日';
  END IF;
END $$;
