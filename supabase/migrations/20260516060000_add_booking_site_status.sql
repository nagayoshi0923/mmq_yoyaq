-- =============================================================================
-- 予約サイト公開申請・承認フロー
-- =============================================================================
-- 管理機能は誰でも即利用可能（plan='free'）。
-- 予約サイト公開（plan='pro'）は MMQ 運営の承認が必要。
-- organizations テーブルに booking_site_status カラムを追加し
-- 申請 → 承認 の状態管理を行う。
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. booking_site_status カラムを追加
-- ---------------------------------------------------------------------------
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS booking_site_status TEXT
    NOT NULL DEFAULT 'none'
    CHECK (booking_site_status IN ('none', 'pending', 'approved'));

-- ---------------------------------------------------------------------------
-- 2. 既存の pro/basic プランは承認済みとして扱う
-- ---------------------------------------------------------------------------
UPDATE public.organizations
  SET booking_site_status = 'approved'
  WHERE plan IN ('pro', 'basic')
    AND booking_site_status = 'none';

-- ---------------------------------------------------------------------------
-- 3. 予約サイト公開を申請する RPC（組織管理者が呼び出す）
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.apply_for_booking_site()
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id UUID;
  v_status TEXT;
BEGIN
  -- 呼び出し元の組織を取得
  SELECT organization_id INTO v_org_id
  FROM public.users
  WHERE id = auth.uid();

  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'org_not_found: 組織に所属していません';
  END IF;

  -- 現在のステータスを確認
  SELECT booking_site_status INTO v_status
  FROM public.organizations
  WHERE id = v_org_id;

  IF v_status = 'approved' THEN
    RAISE EXCEPTION 'already_approved: 既に承認済みです';
  END IF;

  IF v_status = 'pending' THEN
    RAISE EXCEPTION 'already_pending: 既に申請中です';
  END IF;

  -- 申請中に更新
  UPDATE public.organizations
    SET booking_site_status = 'pending',
        updated_at = NOW()
  WHERE id = v_org_id;

  RETURN json_build_object('status', 'pending', 'org_id', v_org_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.apply_for_booking_site() TO authenticated;

-- ---------------------------------------------------------------------------
-- 4. 申請を承認する RPC（ライセンス管理者のみ呼び出せる）
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.approve_booking_site(p_org_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- ライセンス管理者チェック
  IF NOT public.is_license_admin() THEN
    RAISE EXCEPTION 'forbidden: ライセンス管理者のみ実行できます';
  END IF;

  UPDATE public.organizations
    SET booking_site_status = 'approved',
        plan = 'pro',
        updated_at = NOW()
  WHERE id = p_org_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'org_not_found: 組織が見つかりません';
  END IF;

  RETURN json_build_object('status', 'approved', 'org_id', p_org_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.approve_booking_site(UUID) TO authenticated;

-- ---------------------------------------------------------------------------
-- 5. 申請中の組織一覧を返す RPC（ライセンス管理者のみ）
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_pending_booking_site_applications()
RETURNS TABLE (
  id UUID, name TEXT, slug TEXT, contact_email TEXT,
  created_at TIMESTAMPTZ, updated_at TIMESTAMPTZ
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id, name, slug, contact_email, created_at, updated_at
  FROM public.organizations
  WHERE booking_site_status = 'pending'
    AND is_active = true
  ORDER BY updated_at DESC;
$$;

GRANT EXECUTE ON FUNCTION public.get_pending_booking_site_applications() TO authenticated;

-- ---------------------------------------------------------------------------
-- 完了通知
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  RAISE NOTICE '✅ booking_site_status カラムを追加しました';
  RAISE NOTICE '✅ apply_for_booking_site RPC を作成しました（組織管理者用）';
  RAISE NOTICE '✅ approve_booking_site RPC を作成しました（ライセンス管理者用）';
  RAISE NOTICE '✅ get_pending_booking_site_applications RPC を作成しました';
END $$;
