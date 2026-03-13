-- private_group_candidate_dates テーブルに INSERT, UPDATE, DELETE 権限を付与
-- 貸切リクエスト作成時に候補日時を登録できるようにする

GRANT INSERT, UPDATE, DELETE ON public.private_group_candidate_dates TO authenticated;

-- 通知
DO $$
BEGIN
  RAISE NOTICE 'private_group_candidate_dates への INSERT/UPDATE/DELETE 権限を authenticated ロールに付与しました';
END $$;
