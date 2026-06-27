-- 予約者タブのステータスUX刷新 Step1（DB）
--   1) reservations.arrived_late カラム追加（遅刻トグル用・遅刻=arrived_late フラグ方式）
--   2) validate_reservation_status_transition に「取消」遷移を2本だけ追加
--      - checked_in -> confirmed（チェックイン解除）
--      - no_show   -> confirmed（欠席の取消。現状 no_show は凍結で戻せない）
--   ※ 関数は本番 live 定義（pg_get_functiondef 取得・20260626130000 の checked_in 復活込み）を
--     土台にし、上記2分岐の追加のみ。他分岐は live と完全一致で保持。CHECK制約は変更しない。

-- 1) 遅刻フラグ
ALTER TABLE public.reservations
  ADD COLUMN IF NOT EXISTS arrived_late boolean NOT NULL DEFAULT false;
COMMENT ON COLUMN public.reservations.arrived_late IS '遅刻して来店したか（checked_in時のみ意味を持つ。参加者数には含める）';

-- 2) 遷移バリデーション関数（live 土台＋取消2遷移を追加）
CREATE OR REPLACE FUNCTION public.validate_reservation_status_transition(p_old_status text, p_new_status text)
  RETURNS boolean
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $function$
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

  -- ★追加: ノーショーからの取消（→ confirmed）を許可。それ以外は禁止
  IF p_old_status = 'no_show' THEN
    IF p_new_status = 'confirmed' THEN
      RETURN TRUE;
    END IF;
    RETURN FALSE;
  END IF;

  -- pending → confirmed, cancelled, pending_gm, gm_confirmed, checked_in
  IF p_old_status = 'pending' THEN
    IF p_new_status IN ('confirmed', 'cancelled', 'pending_gm', 'gm_confirmed', 'checked_in') THEN
      RETURN TRUE;
    END IF;
  END IF;

  -- pending_gm → confirmed, gm_confirmed, cancelled
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

  -- checked_in → completed, cancelled, no_show, confirmed（★confirmed=チェックイン解除を追加）
  IF p_old_status = 'checked_in' THEN
    IF p_new_status IN ('completed', 'cancelled', 'no_show', 'confirmed') THEN
      RETURN TRUE;
    END IF;
  END IF;

  -- その他は禁止
  RETURN FALSE;
END;
$function$;
