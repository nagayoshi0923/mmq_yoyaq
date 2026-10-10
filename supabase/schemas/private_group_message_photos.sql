-- 正規定義（migration 20261010100000_private_group_chat_phase2.sql）。ブラウザの役割には権限を付けない（RPC private_group_chat_action / private_group_chat_state 経由）
CREATE TABLE IF NOT EXISTS public.private_group_message_photos (
  message_id uuid NOT NULL REFERENCES public.private_group_messages(id) ON DELETE CASCADE,
  position smallint NOT NULL CHECK (position BETWEEN 1 AND 10),
  group_id uuid NOT NULL REFERENCES public.private_groups(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  storage_path text NOT NULL UNIQUE,
  width integer CHECK (width IS NULL OR width BETWEEN 1 AND 10000),
  height integer CHECK (height IS NULL OR height BETWEEN 1 AND 10000),
  created_at timestamptz NOT NULL DEFAULT now(),
  -- 段階 4（migration 20261010160000）: 一覧・格子・アルバム用の小さい版（長辺 400px）
  thumb_path text CHECK (thumb_path IS NULL OR thumb_path = regexp_replace(storage_path, '\.jpg$', '_thumb.jpg')),
  PRIMARY KEY (message_id, position)
);
ALTER TABLE public.private_group_message_photos ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.private_group_message_photos FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.private_group_message_photos TO service_role;
CREATE INDEX IF NOT EXISTS idx_private_group_message_photos_group ON public.private_group_message_photos(group_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_private_group_message_photos_org ON public.private_group_message_photos(organization_id);
COMMENT ON TABLE public.private_group_message_photos IS 'チャットの写真（Storage private-group-photos の {organization_id}/{group_id}/{message_id}/{n}.jpg）。保存期間は無期限、本人の削除で実体も消す';


-- 写真の実体: Storage バケット private-group-photos（非公開・storage.objects にポリシー無し。署名付き URL は /api/private-group-photos が発行）
