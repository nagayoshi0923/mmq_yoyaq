-- manual_play_history のRLSポリシーを修正
-- スタッフも顧客のプレイ履歴を追加できるようにする

-- 既存のINSERTポリシーを削除して再作成
DROP POLICY IF EXISTS "Customers can insert own manual play history" ON public.manual_play_history;

-- 顧客自身またはスタッフが挿入可能
CREATE POLICY "Customers or staff can insert manual play history"
  ON public.manual_play_history FOR INSERT
  WITH CHECK (
    -- 顧客自身の場合
    customer_id IN (
      SELECT id FROM public.customers WHERE user_id = auth.uid()
    )
    OR
    -- スタッフの場合（staffテーブルにuser_idが存在する）
    EXISTS (
      SELECT 1 FROM public.staff WHERE user_id = auth.uid()
    )
  );

-- SELECTポリシーも修正（スタッフも閲覧可能に）
DROP POLICY IF EXISTS "Customers can view own manual play history" ON public.manual_play_history;

CREATE POLICY "Customers or staff can view manual play history"
  ON public.manual_play_history FOR SELECT
  USING (
    customer_id IN (
      SELECT id FROM public.customers WHERE user_id = auth.uid()
    )
    OR
    EXISTS (
      SELECT 1 FROM public.staff WHERE user_id = auth.uid()
    )
  );

-- UPDATEポリシーも修正
DROP POLICY IF EXISTS "Customers can update own manual play history" ON public.manual_play_history;

CREATE POLICY "Customers or staff can update manual play history"
  ON public.manual_play_history FOR UPDATE
  USING (
    customer_id IN (
      SELECT id FROM public.customers WHERE user_id = auth.uid()
    )
    OR
    EXISTS (
      SELECT 1 FROM public.staff WHERE user_id = auth.uid()
    )
  );

-- DELETEポリシーも修正
DROP POLICY IF EXISTS "Customers can delete own manual play history" ON public.manual_play_history;

CREATE POLICY "Customers or staff can delete manual play history"
  ON public.manual_play_history FOR DELETE
  USING (
    customer_id IN (
      SELECT id FROM public.customers WHERE user_id = auth.uid()
    )
    OR
    EXISTS (
      SELECT 1 FROM public.staff WHERE user_id = auth.uid()
    )
  );
