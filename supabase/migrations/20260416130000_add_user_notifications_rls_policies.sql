-- user_notifications テーブルの RLS ポリシーをマイグレーションで管理
-- schema_snapshot.sql に存在するポリシーをマイグレーションとして追加
-- ステージング/本番で統一されるようにする

-- RLS を有効化（既に有効でも冪等）
ALTER TABLE public.user_notifications ENABLE ROW LEVEL SECURITY;

-- 既存ポリシーを一旦削除（冪等に）
DROP POLICY IF EXISTS "Block direct insert" ON public.user_notifications;
DROP POLICY IF EXISTS "Users can delete their own notifications" ON public.user_notifications;
DROP POLICY IF EXISTS "Users can update their own notifications" ON public.user_notifications;
DROP POLICY IF EXISTS "Users can view their own notifications" ON public.user_notifications;

-- 直接INSERT禁止（Edge Function の Service Role 経由のみ許可）
CREATE POLICY "Block direct insert"
  ON public.user_notifications
  FOR INSERT
  WITH CHECK (false);

-- 自分の通知のみ閲覧可能
CREATE POLICY "Users can view their own notifications"
  ON public.user_notifications
  FOR SELECT
  USING (
    (user_id = auth.uid())
    OR (customer_id IN (
      SELECT id FROM public.customers WHERE user_id = auth.uid()
    ))
  );

-- 自分の通知のみ更新可能（既読フラグ等）
CREATE POLICY "Users can update their own notifications"
  ON public.user_notifications
  FOR UPDATE
  USING (
    (user_id = auth.uid())
    OR (customer_id IN (
      SELECT id FROM public.customers WHERE user_id = auth.uid()
    ))
  )
  WITH CHECK (
    (user_id = auth.uid())
    OR (customer_id IN (
      SELECT id FROM public.customers WHERE user_id = auth.uid()
    ))
  );

-- 自分の通知のみ削除可能
CREATE POLICY "Users can delete their own notifications"
  ON public.user_notifications
  FOR DELETE
  USING (
    (user_id = auth.uid())
    OR (customer_id IN (
      SELECT id FROM public.customers WHERE user_id = auth.uid()
    ))
  );
