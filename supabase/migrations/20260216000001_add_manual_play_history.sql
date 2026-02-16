-- 手動プレイ履歴テーブル（顧客が過去に遊んだシナリオを手動登録）
CREATE TABLE IF NOT EXISTS public.manual_play_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  scenario_id UUID REFERENCES public.scenarios(id) ON DELETE SET NULL,
  scenario_title TEXT NOT NULL, -- シナリオが削除されても履歴は残す
  played_at DATE NOT NULL,
  venue TEXT, -- 店舗名（自由入力）
  notes TEXT, -- メモ
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- インデックス
CREATE INDEX IF NOT EXISTS idx_manual_play_history_customer_id ON public.manual_play_history(customer_id);
CREATE INDEX IF NOT EXISTS idx_manual_play_history_scenario_id ON public.manual_play_history(scenario_id);

-- RLS有効化
ALTER TABLE public.manual_play_history ENABLE ROW LEVEL SECURITY;

-- ポリシー: 自分の履歴のみ操作可能（既存の場合はスキップ）
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'manual_play_history' 
    AND policyname = 'Customers can view own manual play history'
  ) THEN
    CREATE POLICY "Customers can view own manual play history"
      ON public.manual_play_history FOR SELECT
      USING (customer_id IN (
        SELECT id FROM public.customers WHERE user_id = auth.uid()
      ));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'manual_play_history' 
    AND policyname = 'Customers can insert own manual play history'
  ) THEN
    CREATE POLICY "Customers can insert own manual play history"
      ON public.manual_play_history FOR INSERT
      WITH CHECK (customer_id IN (
        SELECT id FROM public.customers WHERE user_id = auth.uid()
      ));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'manual_play_history' 
    AND policyname = 'Customers can update own manual play history'
  ) THEN
    CREATE POLICY "Customers can update own manual play history"
      ON public.manual_play_history FOR UPDATE
      USING (customer_id IN (
        SELECT id FROM public.customers WHERE user_id = auth.uid()
      ));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'manual_play_history' 
    AND policyname = 'Customers can delete own manual play history'
  ) THEN
    CREATE POLICY "Customers can delete own manual play history"
      ON public.manual_play_history FOR DELETE
      USING (customer_id IN (
        SELECT id FROM public.customers WHERE user_id = auth.uid()
      ));
  END IF;
END $$;

-- コメント
COMMENT ON TABLE public.manual_play_history IS '顧客が手動で登録した過去のプレイ履歴';
COMMENT ON COLUMN public.manual_play_history.scenario_title IS 'シナリオ名（手入力または選択）';
COMMENT ON COLUMN public.manual_play_history.played_at IS 'プレイした日付';
COMMENT ON COLUMN public.manual_play_history.venue IS '店舗名（自由入力）';
