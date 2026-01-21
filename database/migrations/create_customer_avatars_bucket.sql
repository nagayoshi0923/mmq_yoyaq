-- 顧客アバター用Storageバケットの作成
-- Supabase SQL Editorで実行

-- 1. バケットを作成（公開バケット）
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'customer-avatars',
  'customer-avatars',
  true,  -- 公開バケット（URLで誰でもアクセス可能）
  5242880,  -- 5MB制限
  ARRAY['image/jpeg', 'image/png', 'image/gif', 'image/webp']
)
ON CONFLICT (id) DO UPDATE SET
  public = true,
  file_size_limit = 5242880,
  allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/gif', 'image/webp'];

-- 2. 既存のポリシーを削除
DROP POLICY IF EXISTS "Users can upload their own avatar" ON storage.objects;
DROP POLICY IF EXISTS "Users can update their own avatar" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their own avatar" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can view avatars" ON storage.objects;

-- 3. アップロードポリシー: 認証済みユーザーは自分のIDで始まるパスにアップロード可能
CREATE POLICY "Users can upload their own avatar"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'customer-avatars'
  AND (storage.foldername(name))[1] = 'avatars'
  AND name LIKE auth.uid()::text || '_%'
);

-- 4. 更新ポリシー: 自分のファイルのみ更新可能
CREATE POLICY "Users can update their own avatar"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'customer-avatars'
  AND name LIKE auth.uid()::text || '_%'
);

-- 5. 削除ポリシー: 自分のファイルのみ削除可能
CREATE POLICY "Users can delete their own avatar"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'customer-avatars'
  AND name LIKE auth.uid()::text || '_%'
);

-- 6. 閲覧ポリシー: 公開バケットなので誰でも閲覧可能（バケット設定でpublic=trueにしているため、このポリシーは不要だが明示的に追加）
CREATE POLICY "Anyone can view avatars"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'customer-avatars');

-- 確認
SELECT id, name, public FROM storage.buckets WHERE id = 'customer-avatars';

