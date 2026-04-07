-- =============================================================================
-- マイグレーション: 予約ステータスに checked_in を追加
-- =============================================================================
--
-- 目的:
--   来店確認（チェックイン）機能の追加。
--   スタッフが来店したお客様をチェックインできるようにする。
--
-- ステータス遷移:
--   confirmed / gm_confirmed / pending → checked_in
--   checked_in → completed / cancelled / no_show
-- =============================================================================

-- 1. CHECK制約を更新して checked_in を追加
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'reservations_status_check'
  ) THEN
    ALTER TABLE reservations DROP CONSTRAINT reservations_status_check;
  END IF;
END $$;

ALTER TABLE reservations
ADD CONSTRAINT reservations_status_check
CHECK (status IN (
  'pending',           -- 予約申込
  'confirmed',         -- 確定
  'checked_in',        -- チェックイン（来店確認済み）
  'completed',         -- 完了
  'cancelled',         -- キャンセル
  'no_show',           -- ノーショー
  'gm_confirmed',      -- GM確定（貸切用）
  'pending_gm',        -- GM確認待ち（貸切用）
  'pending_store'      -- 店舗確認待ち（貸切用）
));

-- 2. ステータス遷移検証関数を更新
CREATE OR REPLACE FUNCTION public.validate_reservation_status_transition(
  p_old_status TEXT,
  p_new_status TEXT
) RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- 同じステータスへの遷移は常に許可
  IF p_old_status = p_new_status THEN
    RETURN TRUE;
  END IF;

  -- キャンセル済みからの復活は禁止
  IF p_old_status = 'cancelled' THEN
    RETURN FALSE;
  END IF;

  -- 完了済みからの変更は限定的
  IF p_old_status = 'completed' THEN
    IF p_new_status IN ('cancelled', 'no_show') THEN
      RETURN TRUE;
    ELSE
      RETURN FALSE;
    END IF;
  END IF;

  -- ノーショーからの変更は禁止
  IF p_old_status = 'no_show' THEN
    RETURN FALSE;
  END IF;

  -- pending → confirmed, cancelled, pending_gm, gm_confirmed, checked_in
  IF p_old_status = 'pending' THEN
    IF p_new_status IN ('confirmed', 'cancelled', 'pending_gm', 'gm_confirmed', 'checked_in') THEN
      RETURN TRUE;
    END IF;
  END IF;

  -- pending_gm → gm_confirmed, cancelled
  IF p_old_status = 'pending_gm' THEN
    IF p_new_status IN ('gm_confirmed', 'cancelled') THEN
      RETURN TRUE;
    END IF;
  END IF;

  -- pending_store → confirmed, cancelled
  IF p_old_status = 'pending_store' THEN
    IF p_new_status IN ('confirmed', 'cancelled') THEN
      RETURN TRUE;
    END IF;
  END IF;

  -- gm_confirmed → confirmed, cancelled, pending_store, checked_in
  IF p_old_status = 'gm_confirmed' THEN
    IF p_new_status IN ('confirmed', 'cancelled', 'pending_store', 'checked_in') THEN
      RETURN TRUE;
    END IF;
  END IF;

  -- confirmed → completed, cancelled, no_show, checked_in
  IF p_old_status = 'confirmed' THEN
    IF p_new_status IN ('completed', 'cancelled', 'no_show', 'checked_in') THEN
      RETURN TRUE;
    END IF;
  END IF;

  -- checked_in → completed, cancelled, no_show
  IF p_old_status = 'checked_in' THEN
    IF p_new_status IN ('completed', 'cancelled', 'no_show') THEN
      RETURN TRUE;
    END IF;
  END IF;

  -- その他は禁止
  RETURN FALSE;
END;
$$;

DO $$
BEGIN
  RAISE NOTICE '✅ checked_in ステータスを追加しました';
  RAISE NOTICE '   遷移: confirmed/gm_confirmed/pending → checked_in → completed/cancelled/no_show';
END $$;
