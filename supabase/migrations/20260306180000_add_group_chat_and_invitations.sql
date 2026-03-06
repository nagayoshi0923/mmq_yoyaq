-- =============================================================================
-- マイグレーション: グループチャット・招待機能テーブル追加
-- =============================================================================
-- 
-- 作成日: 2026-03-06
-- 
-- 追加内容:
--   1. private_group_messages - グループ内チャットメッセージ
--   2. private_group_invitations - ユーザー招待管理
--   3. RLSポリシー
--   4. Realtime有効化
-- 
-- =============================================================================

-- =============================================================================
-- 1. private_group_messages テーブル（チャットメッセージ）
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.private_group_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES public.private_groups(id) ON DELETE CASCADE,
  member_id UUID NOT NULL REFERENCES public.private_group_members(id) ON DELETE CASCADE,
  message TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.private_group_messages IS 'グループ内チャットメッセージ';
COMMENT ON COLUMN public.private_group_messages.member_id IS 'メッセージ送信者（グループメンバー）';
COMMENT ON COLUMN public.private_group_messages.message IS 'メッセージ本文';

CREATE INDEX IF NOT EXISTS idx_private_group_messages_group_id ON public.private_group_messages(group_id);
CREATE INDEX IF NOT EXISTS idx_private_group_messages_member_id ON public.private_group_messages(member_id);
CREATE INDEX IF NOT EXISTS idx_private_group_messages_created_at ON public.private_group_messages(created_at DESC);

-- =============================================================================
-- 2. private_group_invitations テーブル（ユーザー招待）
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.private_group_invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES public.private_groups(id) ON DELETE CASCADE,
  invited_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  invited_email TEXT NOT NULL,
  invited_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined', 'cancelled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  responded_at TIMESTAMPTZ,
  UNIQUE(group_id, invited_email)
);

COMMENT ON TABLE public.private_group_invitations IS 'グループへのユーザー招待';
COMMENT ON COLUMN public.private_group_invitations.invited_user_id IS '招待されたユーザー（存在する場合）';
COMMENT ON COLUMN public.private_group_invitations.invited_email IS '招待先メールアドレス';
COMMENT ON COLUMN public.private_group_invitations.invited_by IS '招待を送ったユーザー';
COMMENT ON COLUMN public.private_group_invitations.status IS 'pending=保留中, accepted=承諾, declined=辞退, cancelled=取消';

CREATE INDEX IF NOT EXISTS idx_private_group_invitations_group_id ON public.private_group_invitations(group_id);
CREATE INDEX IF NOT EXISTS idx_private_group_invitations_invited_user_id ON public.private_group_invitations(invited_user_id);
CREATE INDEX IF NOT EXISTS idx_private_group_invitations_invited_email ON public.private_group_invitations(invited_email);
CREATE INDEX IF NOT EXISTS idx_private_group_invitations_status ON public.private_group_invitations(status);

-- =============================================================================
-- 3. RLS ポリシー - private_group_messages
-- =============================================================================
ALTER TABLE public.private_group_messages ENABLE ROW LEVEL SECURITY;

-- SELECT: グループメンバーのみ閲覧可能
CREATE POLICY "private_group_messages_select_member" ON public.private_group_messages
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.private_group_members pgm
      WHERE pgm.group_id = private_group_messages.group_id
        AND pgm.user_id = auth.uid()
        AND pgm.status = 'joined'
    )
  );

-- INSERT: グループメンバーのみ投稿可能
CREATE POLICY "private_group_messages_insert_member" ON public.private_group_messages
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.private_group_members pgm
      WHERE pgm.id = member_id
        AND pgm.user_id = auth.uid()
        AND pgm.status = 'joined'
    )
  );

-- DELETE: 自分のメッセージまたは主催者のみ削除可能
CREATE POLICY "private_group_messages_delete" ON public.private_group_messages
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.private_group_members pgm
      WHERE pgm.id = member_id AND pgm.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.private_groups pg
      WHERE pg.id = group_id AND pg.organizer_id = auth.uid()
    )
  );

-- =============================================================================
-- 4. RLS ポリシー - private_group_invitations
-- =============================================================================
ALTER TABLE public.private_group_invitations ENABLE ROW LEVEL SECURITY;

-- SELECT: 主催者、招待者、被招待者が閲覧可能
CREATE POLICY "private_group_invitations_select" ON public.private_group_invitations
  FOR SELECT
  USING (
    invited_by = auth.uid()
    OR invited_user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.private_groups pg
      WHERE pg.id = group_id AND pg.organizer_id = auth.uid()
    )
  );

-- INSERT: グループメンバーのみ招待可能
CREATE POLICY "private_group_invitations_insert" ON public.private_group_invitations
  FOR INSERT
  WITH CHECK (
    invited_by = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.private_group_members pgm
      WHERE pgm.group_id = private_group_invitations.group_id
        AND pgm.user_id = auth.uid()
        AND pgm.status = 'joined'
    )
  );

-- UPDATE: 被招待者または主催者のみ更新可能
CREATE POLICY "private_group_invitations_update" ON public.private_group_invitations
  FOR UPDATE
  USING (
    invited_user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.private_groups pg
      WHERE pg.id = group_id AND pg.organizer_id = auth.uid()
    )
  );

-- DELETE: 主催者または招待者のみ削除可能
CREATE POLICY "private_group_invitations_delete" ON public.private_group_invitations
  FOR DELETE
  USING (
    invited_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.private_groups pg
      WHERE pg.id = group_id AND pg.organizer_id = auth.uid()
    )
  );

-- =============================================================================
-- 5. Supabase Realtime 有効化
-- =============================================================================
-- メッセージテーブルのRealtime購読を有効化
ALTER PUBLICATION supabase_realtime ADD TABLE public.private_group_messages;

-- =============================================================================
-- 6. 完了確認
-- =============================================================================
DO $$ 
BEGIN
  RAISE NOTICE '✅ マイグレーション完了: グループチャット・招待機能テーブル追加';
END $$;
