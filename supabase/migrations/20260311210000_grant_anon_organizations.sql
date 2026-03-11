-- organizationsテーブルへのanon/authenticatedアクセス権限を追加

-- organizations テーブル
GRANT SELECT ON public.organizations TO anon;
GRANT SELECT ON public.organizations TO authenticated;

-- private_groups テーブル（念のため再追加）
GRANT SELECT ON public.private_groups TO anon;
GRANT SELECT ON public.private_groups TO authenticated;

-- 通知
DO $$
BEGIN
  RAISE NOTICE '✅ organizationsテーブルへのアクセス権限を付与しました';
END $$;
