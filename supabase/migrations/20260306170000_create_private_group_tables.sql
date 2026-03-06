-- private_groups 関連テーブルを作成
-- 貸切グループ機能: 友達を誘って日程調整し、貸切予約を申し込む
-- 作成日: 2026-03-06

-- =============================================================================
-- 1. private_groups テーブル（グループ本体）
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.private_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  scenario_id UUID REFERENCES public.scenario_masters(id) ON DELETE SET NULL,
  organizer_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT,
  invite_code TEXT UNIQUE NOT NULL,
  status TEXT NOT NULL DEFAULT 'gathering' CHECK (status IN ('gathering', 'booking_requested', 'confirmed', 'cancelled')),
  reservation_id UUID REFERENCES public.reservations(id) ON DELETE SET NULL,
  target_participant_count INTEGER,
  preferred_store_ids UUID[] DEFAULT '{}',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.private_groups IS '貸切グループ: 友達を誘って日程調整し、貸切予約を申し込む';
COMMENT ON COLUMN public.private_groups.invite_code IS '招待用の8文字英数字コード';
COMMENT ON COLUMN public.private_groups.status IS 'グループ状態: gathering=募集中, booking_requested=予約申込済, confirmed=確定, cancelled=キャンセル';
COMMENT ON COLUMN public.private_groups.target_participant_count IS '目標人数';
COMMENT ON COLUMN public.private_groups.preferred_store_ids IS '希望店舗IDの配列';

CREATE INDEX IF NOT EXISTS idx_private_groups_organization_id ON public.private_groups(organization_id);
CREATE INDEX IF NOT EXISTS idx_private_groups_organizer_id ON public.private_groups(organizer_id);
CREATE INDEX IF NOT EXISTS idx_private_groups_invite_code ON public.private_groups(invite_code);
CREATE INDEX IF NOT EXISTS idx_private_groups_scenario_id ON public.private_groups(scenario_id);
CREATE INDEX IF NOT EXISTS idx_private_groups_status ON public.private_groups(status);

-- =============================================================================
-- 2. private_group_members テーブル（グループメンバー）
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.private_group_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES public.private_groups(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  guest_name TEXT,
  guest_email TEXT,
  guest_phone TEXT,
  is_organizer BOOLEAN NOT NULL DEFAULT FALSE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'joined', 'declined')),
  joined_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.private_group_members IS 'グループメンバー: ログインユーザーまたはゲスト';
COMMENT ON COLUMN public.private_group_members.user_id IS 'ログインユーザーの場合のみ設定';
COMMENT ON COLUMN public.private_group_members.guest_name IS 'ゲスト参加者の名前';
COMMENT ON COLUMN public.private_group_members.is_organizer IS '主催者かどうか';
COMMENT ON COLUMN public.private_group_members.status IS 'pending=招待中, joined=参加, declined=辞退';

CREATE INDEX IF NOT EXISTS idx_private_group_members_group_id ON public.private_group_members(group_id);
CREATE INDEX IF NOT EXISTS idx_private_group_members_user_id ON public.private_group_members(user_id);

-- =============================================================================
-- 3. private_group_candidate_dates テーブル（候補日時）
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.private_group_candidate_dates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES public.private_groups(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  time_slot TEXT NOT NULL CHECK (time_slot IN ('午前', '午後', '夜間')),
  start_time TEXT NOT NULL,
  end_time TEXT NOT NULL,
  order_num INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.private_group_candidate_dates IS '主催者が設定する候補日時（最大6件）';
COMMENT ON COLUMN public.private_group_candidate_dates.time_slot IS '時間帯: 午前/午後/夜間';
COMMENT ON COLUMN public.private_group_candidate_dates.order_num IS '候補の優先順位';

CREATE INDEX IF NOT EXISTS idx_private_group_candidate_dates_group_id ON public.private_group_candidate_dates(group_id);

-- =============================================================================
-- 4. private_group_date_responses テーブル（日程回答）
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.private_group_date_responses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES public.private_groups(id) ON DELETE CASCADE,
  member_id UUID NOT NULL REFERENCES public.private_group_members(id) ON DELETE CASCADE,
  candidate_date_id UUID NOT NULL REFERENCES public.private_group_candidate_dates(id) ON DELETE CASCADE,
  response TEXT NOT NULL CHECK (response IN ('ok', 'ng', 'maybe')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(member_id, candidate_date_id)
);

COMMENT ON TABLE public.private_group_date_responses IS 'メンバーの候補日時への回答';
COMMENT ON COLUMN public.private_group_date_responses.response IS 'ok=参加可能, ng=参加不可, maybe=未定';

CREATE INDEX IF NOT EXISTS idx_private_group_date_responses_group_id ON public.private_group_date_responses(group_id);
CREATE INDEX IF NOT EXISTS idx_private_group_date_responses_member_id ON public.private_group_date_responses(member_id);
CREATE INDEX IF NOT EXISTS idx_private_group_date_responses_candidate_date_id ON public.private_group_date_responses(candidate_date_id);

-- =============================================================================
-- 5. RLS ポリシー
-- =============================================================================

-- private_groups
ALTER TABLE public.private_groups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "private_groups_select_by_invite_code" ON public.private_groups
  FOR SELECT
  USING (true);

CREATE POLICY "private_groups_insert_authenticated" ON public.private_groups
  FOR INSERT
  WITH CHECK (auth.uid() = organizer_id);

CREATE POLICY "private_groups_update_by_organizer" ON public.private_groups
  FOR UPDATE
  USING (auth.uid() = organizer_id);

CREATE POLICY "private_groups_delete_by_organizer" ON public.private_groups
  FOR DELETE
  USING (auth.uid() = organizer_id);

-- private_group_members
ALTER TABLE public.private_group_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "private_group_members_select" ON public.private_group_members
  FOR SELECT
  USING (true);

CREATE POLICY "private_group_members_insert" ON public.private_group_members
  FOR INSERT
  WITH CHECK (true);

CREATE POLICY "private_group_members_update" ON public.private_group_members
  FOR UPDATE
  USING (
    auth.uid() = user_id 
    OR EXISTS (
      SELECT 1 FROM public.private_groups pg 
      WHERE pg.id = group_id AND pg.organizer_id = auth.uid()
    )
  );

CREATE POLICY "private_group_members_delete" ON public.private_group_members
  FOR DELETE
  USING (
    auth.uid() = user_id 
    OR EXISTS (
      SELECT 1 FROM public.private_groups pg 
      WHERE pg.id = group_id AND pg.organizer_id = auth.uid()
    )
  );

-- private_group_candidate_dates
ALTER TABLE public.private_group_candidate_dates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "private_group_candidate_dates_select" ON public.private_group_candidate_dates
  FOR SELECT
  USING (true);

CREATE POLICY "private_group_candidate_dates_insert" ON public.private_group_candidate_dates
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.private_groups pg 
      WHERE pg.id = group_id AND pg.organizer_id = auth.uid()
    )
  );

CREATE POLICY "private_group_candidate_dates_update" ON public.private_group_candidate_dates
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.private_groups pg 
      WHERE pg.id = group_id AND pg.organizer_id = auth.uid()
    )
  );

CREATE POLICY "private_group_candidate_dates_delete" ON public.private_group_candidate_dates
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.private_groups pg 
      WHERE pg.id = group_id AND pg.organizer_id = auth.uid()
    )
  );

-- private_group_date_responses
ALTER TABLE public.private_group_date_responses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "private_group_date_responses_select" ON public.private_group_date_responses
  FOR SELECT
  USING (true);

CREATE POLICY "private_group_date_responses_insert" ON public.private_group_date_responses
  FOR INSERT
  WITH CHECK (true);

CREATE POLICY "private_group_date_responses_update" ON public.private_group_date_responses
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.private_group_members pgm 
      WHERE pgm.id = member_id AND (pgm.user_id = auth.uid() OR pgm.user_id IS NULL)
    )
  );

CREATE POLICY "private_group_date_responses_delete" ON public.private_group_date_responses
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.private_group_members pgm 
      WHERE pgm.id = member_id AND (pgm.user_id = auth.uid() OR pgm.user_id IS NULL)
    )
    OR EXISTS (
      SELECT 1 FROM public.private_groups pg
      JOIN public.private_group_candidate_dates pgcd ON pgcd.group_id = pg.id
      WHERE pgcd.id = candidate_date_id AND pg.organizer_id = auth.uid()
    )
  );

-- =============================================================================
-- 6. updated_at トリガー
-- =============================================================================
CREATE OR REPLACE FUNCTION public.update_private_groups_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_private_groups_updated_at
  BEFORE UPDATE ON public.private_groups
  FOR EACH ROW
  EXECUTE FUNCTION public.update_private_groups_updated_at();

CREATE OR REPLACE FUNCTION public.update_private_group_date_responses_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_private_group_date_responses_updated_at
  BEFORE UPDATE ON public.private_group_date_responses
  FOR EACH ROW
  EXECUTE FUNCTION public.update_private_group_date_responses_updated_at();

-- =============================================================================
-- 7. 招待コード生成関数
-- =============================================================================
CREATE OR REPLACE FUNCTION public.generate_invite_code()
RETURNS TEXT AS $$
DECLARE
  chars TEXT := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  result TEXT := '';
  i INTEGER;
BEGIN
  FOR i IN 1..8 LOOP
    result := result || substr(chars, floor(random() * length(chars) + 1)::INTEGER, 1);
  END LOOP;
  RETURN result;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION public.generate_invite_code() IS '8文字の招待コードを生成（紛らわしい文字を除外: 0,O,1,I,L）';
