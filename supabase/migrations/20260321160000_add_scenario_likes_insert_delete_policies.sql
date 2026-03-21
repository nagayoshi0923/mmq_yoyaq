-- scenario_likes テーブルに INSERT/DELETE ポリシーを追加
-- ログインユーザーが自分の customer_id でのみ追加・削除可能

-- INSERT ポリシー: ログインユーザーは自分の customer_id で追加可能
DROP POLICY IF EXISTS "scenario_likes_insert_auth" ON public.scenario_likes;
CREATE POLICY "scenario_likes_insert_auth" ON public.scenario_likes
  FOR INSERT
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND customer_id IN (
      SELECT id FROM public.customers WHERE user_id = auth.uid()
    )
  );

-- DELETE ポリシー: ログインユーザーは自分の customer_id のレコードのみ削除可能
DROP POLICY IF EXISTS "scenario_likes_delete_auth" ON public.scenario_likes;
CREATE POLICY "scenario_likes_delete_auth" ON public.scenario_likes
  FOR DELETE
  USING (
    auth.uid() IS NOT NULL
    AND customer_id IN (
      SELECT id FROM public.customers WHERE user_id = auth.uid()
    )
  );

-- 確認用コメント
COMMENT ON POLICY "scenario_likes_insert_auth" ON public.scenario_likes IS 'ログインユーザーが自分のcustomer_idでお気に入り追加可能';
COMMENT ON POLICY "scenario_likes_delete_auth" ON public.scenario_likes IS 'ログインユーザーが自分のcustomer_idでお気に入り削除可能';
