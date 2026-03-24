-- ブログ記事カバー画像用ストレージ（公開読取・組織管理者のみ自組織フォルダへ書込）

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'blog-covers',
  'blog-covers',
  true,
  5242880,
  ARRAY['image/jpeg', 'image/png', 'image/gif', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

-- 公開ページでカバー画像を表示するため誰でも読取可
DROP POLICY IF EXISTS "blog_covers_public_read" ON storage.objects;
CREATE POLICY "blog_covers_public_read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'blog-covers');

-- パス先頭セグメント = organization_id（UUID）、かつ組織管理者のみ
DROP POLICY IF EXISTS "blog_covers_org_admin_insert" ON storage.objects;
CREATE POLICY "blog_covers_org_admin_insert"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'blog-covers'
    AND (storage.foldername(name))[1] = (SELECT get_user_organization_id()::text)
    AND is_org_admin()
  );

DROP POLICY IF EXISTS "blog_covers_org_admin_update" ON storage.objects;
CREATE POLICY "blog_covers_org_admin_update"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'blog-covers'
    AND (storage.foldername(name))[1] = (SELECT get_user_organization_id()::text)
    AND is_org_admin()
  )
  WITH CHECK (
    bucket_id = 'blog-covers'
    AND (storage.foldername(name))[1] = (SELECT get_user_organization_id()::text)
    AND is_org_admin()
  );

DROP POLICY IF EXISTS "blog_covers_org_admin_delete" ON storage.objects;
CREATE POLICY "blog_covers_org_admin_delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'blog-covers'
    AND (storage.foldername(name))[1] = (SELECT get_user_organization_id()::text)
    AND is_org_admin()
  );

-- COMMENT ON POLICY は storage.objects の所有権が必要なため省略
