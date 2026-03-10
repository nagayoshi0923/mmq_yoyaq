-- キャラクター画像用ストレージバケットを作成
-- 作成日: 2026-03-11

-- character-images バケットを作成（存在しない場合）
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'character-images',
  'character-images',
  true,
  5242880, -- 5MB
  ARRAY['image/jpeg', 'image/png', 'image/gif', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

-- RLSポリシー: 誰でも閲覧可能
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'character_images_public_read' AND tablename = 'objects') THEN
    CREATE POLICY "character_images_public_read" ON storage.objects FOR SELECT USING (bucket_id = 'character-images');
  END IF;
END $$;

-- RLSポリシー: 認証ユーザーがアップロード可能
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'character_images_auth_insert' AND tablename = 'objects') THEN
    CREATE POLICY "character_images_auth_insert" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'character-images');
  END IF;
END $$;

-- RLSポリシー: 認証ユーザーが更新可能
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'character_images_auth_update' AND tablename = 'objects') THEN
    CREATE POLICY "character_images_auth_update" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'character-images');
  END IF;
END $$;

-- RLSポリシー: 認証ユーザーが削除可能
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'character_images_auth_delete' AND tablename = 'objects') THEN
    CREATE POLICY "character_images_auth_delete" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'character-images');
  END IF;
END $$;

DO $$
BEGIN
  RAISE NOTICE '✅ マイグレーション完了: character-images バケットを作成';
END $$;
