-- =============================================================================
-- バグ修正: checked_in へのステータス遷移を validate 関数へ復活
-- =============================================================================
--
-- 問題:
--   2026-04-05 (20260405100000_add_checked_in_status.sql) で
--   confirmed/gm_confirmed/pending → checked_in、checked_in → completed/cancelled/no_show
--   の遷移を validate_reservation_status_transition に追加した。
--   しかし 2026-04-11 (20260411125223_allow_cancelled_to_confirmed_transition.sql) が
--   cancelled→confirmed を足す際に 2026-02-01 版を土台に関数を再定義してしまい、
--   4/05 で足した checked_in 遷移を巻き戻した（回帰）。
--
-- 症状:
--   予約者タブで「チェックイン」しても admin_update_reservation_fields RPC が
--   遷移検証で {success:false} を返し（confirmed→checked_in が無効扱い）、checked_in が
--   DB に永続化されない。楽観UIで一旦 ✓ 来店済 になるが、別タブへ行って戻る（=再取得）と
--   旧ステータスに戻り「チェックインが外れる」ように見える。
--   ※ サーバー(api/reservations.ts handleUpdate)が RPC の success:false を握り潰すため
--     エラーも表示されない（こちらは別途フロント側で堅牢化）。
--
-- 修正:
--   現行 live の全遷移（cancelled→confirmed / pending_gm→confirmed 等）を保持したまま、
--   checked_in 遷移を復活させて validate_reservation_status_transition を再定義する。
--   トリガー check_reservation_status_transition も同関数を参照するため同時に直る。
--   データは変更しない（許可遷移を増やすのみ）。
-- =============================================================================

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

  -- cancelled → confirmed のみ許可（復活運用）
  IF p_old_status = 'cancelled' THEN
    IF p_new_status = 'confirmed' THEN
      RETURN TRUE;
    END IF;
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

  -- pending_gm → confirmed, gm_confirmed, cancelled
  -- （confirmed は管理者が直接承認する approve_private_booking RPC 用）
  IF p_old_status = 'pending_gm' THEN
    IF p_new_status IN ('confirmed', 'gm_confirmed', 'cancelled') THEN
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
  RAISE NOTICE '✅ checked_in 遷移を validate_reservation_status_transition へ復活しました';
  RAISE NOTICE '   confirmed/gm_confirmed/pending → checked_in → completed/cancelled/no_show';
END $$;
