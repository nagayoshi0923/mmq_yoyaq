-- manual_pages / manual_blocks へのアクセス権限付与
-- RLS ポリシーは既に設定済みのため、GRANT で authenticated ロールに権限を付与する

GRANT SELECT, INSERT, UPDATE, DELETE ON public.manual_pages  TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.manual_blocks TO authenticated;
