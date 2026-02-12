-- kit_transfer_completions テーブルに staff への外部キー制約を追加
-- PostgREST がリレーションシップを解決できるようにする
-- エラー: "Could not find a relationship between 'kit_transfer_completions' and 'staff'"

-- picked_up_by → staff(id) の外部キー
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'kit_transfer_completions_picked_up_by_fkey'
    AND table_name = 'kit_transfer_completions'
  ) THEN
    ALTER TABLE public.kit_transfer_completions 
      ADD CONSTRAINT kit_transfer_completions_picked_up_by_fkey 
      FOREIGN KEY (picked_up_by) REFERENCES public.staff(id) ON DELETE SET NULL;
    RAISE NOTICE 'picked_up_by FK制約を追加しました';
  ELSE
    RAISE NOTICE 'picked_up_by FK制約は既に存在します';
  END IF;
END $$;

-- delivered_by → staff(id) の外部キー
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'kit_transfer_completions_delivered_by_fkey'
    AND table_name = 'kit_transfer_completions'
  ) THEN
    ALTER TABLE public.kit_transfer_completions 
      ADD CONSTRAINT kit_transfer_completions_delivered_by_fkey 
      FOREIGN KEY (delivered_by) REFERENCES public.staff(id) ON DELETE SET NULL;
    RAISE NOTICE 'delivered_by FK制約を追加しました';
  ELSE
    RAISE NOTICE 'delivered_by FK制約は既に存在します';
  END IF;
END $$;

-- PostgREST のスキーマキャッシュをリロードするため、pg_notify を送信
NOTIFY pgrst, 'reload schema';
