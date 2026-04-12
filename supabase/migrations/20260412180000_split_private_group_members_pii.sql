-- ====================================================================
-- PII保護: private_group_members から機密カラムを分離
--
-- 問題: guest_name, guest_email, guest_phone, access_pin が
--       誰でも取得できる状態だった
--
-- 解決: 機密データを別テーブル private_group_members_pii に分離
--       管理者のみアクセス可能にする
-- ====================================================================

-- ============================================================
-- 1. PIIテーブル作成
-- ============================================================
CREATE TABLE IF NOT EXISTS public.private_group_members_pii (
  member_id UUID PRIMARY KEY REFERENCES public.private_group_members(id) ON DELETE CASCADE,
  guest_name TEXT,
  guest_email TEXT,
  guest_phone TEXT,
  access_pin TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE public.private_group_members_pii IS 'グループメンバーの個人情報（管理者のみアクセス可）';

-- インデックス
CREATE INDEX IF NOT EXISTS idx_private_group_members_pii_email ON public.private_group_members_pii(guest_email);

-- ============================================================
-- 2. 既存データを移行
-- ============================================================
INSERT INTO public.private_group_members_pii (member_id, guest_name, guest_email, guest_phone, access_pin, created_at, updated_at)
SELECT id, guest_name, guest_email, guest_phone, access_pin, created_at, NOW()
FROM public.private_group_members
WHERE guest_name IS NOT NULL 
   OR guest_email IS NOT NULL 
   OR guest_phone IS NOT NULL 
   OR access_pin IS NOT NULL
ON CONFLICT (member_id) DO UPDATE SET
  guest_name = EXCLUDED.guest_name,
  guest_email = EXCLUDED.guest_email,
  guest_phone = EXCLUDED.guest_phone,
  access_pin = EXCLUDED.access_pin,
  updated_at = NOW();

-- ============================================================
-- 3. RLS を有効化（管理者のみアクセス可能）
-- ============================================================
ALTER TABLE public.private_group_members_pii ENABLE ROW LEVEL SECURITY;

-- anon: アクセス不可
CREATE POLICY "private_group_members_pii_select_anon" ON public.private_group_members_pii
  FOR SELECT
  TO anon
  USING (false);

-- authenticated: 管理者のみ
CREATE POLICY "private_group_members_pii_select_authenticated" ON public.private_group_members_pii
  FOR SELECT
  TO authenticated
  USING (public.is_staff_or_admin());

-- INSERT/UPDATE/DELETE: 全ロール許可（ゲスト登録用）
CREATE POLICY "private_group_members_pii_insert" ON public.private_group_members_pii
  FOR INSERT
  WITH CHECK (true);

CREATE POLICY "private_group_members_pii_update" ON public.private_group_members_pii
  FOR UPDATE
  USING (true);

CREATE POLICY "private_group_members_pii_delete" ON public.private_group_members_pii
  FOR DELETE
  USING (true);

-- GRANT
GRANT SELECT, INSERT, UPDATE, DELETE ON public.private_group_members_pii TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.private_group_members_pii TO authenticated;

-- ============================================================
-- 4. 管理者用ビュー作成（JOINを簡略化）
-- ============================================================
CREATE OR REPLACE VIEW public.private_group_members_full AS
SELECT
  m.id,
  m.group_id,
  m.user_id,
  m.is_organizer,
  m.status,
  m.joined_at,
  m.created_at,
  pii.guest_name,
  pii.guest_email,
  pii.guest_phone,
  pii.access_pin
FROM public.private_group_members m
LEFT JOIN public.private_group_members_pii pii ON pii.member_id = m.id;

GRANT SELECT ON public.private_group_members_full TO authenticated;

-- ============================================================
-- 5. 招待ページ用 RPC を更新（PIIテーブルから取得）
-- ============================================================
DROP FUNCTION IF EXISTS public.get_group_members_by_invite_code(TEXT);
CREATE OR REPLACE FUNCTION public.get_group_members_by_invite_code(
  p_invite_code TEXT
)
RETURNS TABLE (
  id UUID,
  group_id UUID,
  user_id UUID,
  guest_name TEXT,
  is_organizer BOOLEAN,
  status TEXT,
  joined_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT
    m.id, m.group_id, m.user_id, pii.guest_name,
    m.is_organizer, m.status, m.joined_at, m.created_at
  FROM private_group_members m
  JOIN private_groups g ON g.id = m.group_id
  LEFT JOIN private_group_members_pii pii ON pii.member_id = m.id
  WHERE g.invite_code = p_invite_code;
$$;

GRANT EXECUTE ON FUNCTION public.get_group_members_by_invite_code(TEXT) TO anon;
GRANT EXECUTE ON FUNCTION public.get_group_members_by_invite_code(TEXT) TO authenticated;

-- ============================================================
-- 6. ゲスト登録時にPIIも同時に保存するトリガー
-- ============================================================
CREATE OR REPLACE FUNCTION public.sync_private_group_member_pii()
RETURNS TRIGGER AS $$
BEGIN
  -- INSERT または UPDATE 時に PII テーブルに同期
  INSERT INTO public.private_group_members_pii (member_id, guest_name, guest_email, guest_phone, access_pin, updated_at)
  VALUES (NEW.id, NEW.guest_name, NEW.guest_email, NEW.guest_phone, NEW.access_pin, NOW())
  ON CONFLICT (member_id) DO UPDATE SET
    guest_name = EXCLUDED.guest_name,
    guest_email = EXCLUDED.guest_email,
    guest_phone = EXCLUDED.guest_phone,
    access_pin = EXCLUDED.access_pin,
    updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_sync_private_group_member_pii ON public.private_group_members;
CREATE TRIGGER trg_sync_private_group_member_pii
  AFTER INSERT OR UPDATE ON public.private_group_members
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_private_group_member_pii();

-- ============================================================
-- 完了通知
-- ============================================================
DO $$
BEGIN
  RAISE NOTICE '✅ PII分離完了:';
  RAISE NOTICE '  - private_group_members_pii テーブル作成';
  RAISE NOTICE '  - 既存データ移行完了';
  RAISE NOTICE '  - RLS: 管理者のみアクセス可能';
  RAISE NOTICE '  - private_group_members_full ビュー作成';
  RAISE NOTICE '  - get_group_members_by_invite_code RPC 更新';
  RAISE NOTICE '  - 同期トリガー作成';
  RAISE NOTICE '';
  RAISE NOTICE '⚠️ 次のステップ: private_group_members から機密カラムを削除';
END $$;
