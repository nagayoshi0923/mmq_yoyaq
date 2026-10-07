-- 注意:旧定義には初回QAで検出した不具合がある。切戻しは明示レビュー後のみ。
CREATE OR REPLACE FUNCTION public.apply_coupon_to_group_member(p_member_id uuid, p_coupon_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_member RECORD;
  v_coupon RECORD;
  v_group RECORD;
  v_discount INTEGER;
  v_final_amount INTEGER;
BEGIN
  -- メンバー情報を取得
  SELECT * INTO v_member FROM public.private_group_members WHERE id = p_member_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'メンバーが見つかりません');
  END IF;

  -- グループ情報を取得
  SELECT * INTO v_group FROM public.private_groups WHERE id = v_member.group_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'グループが見つかりません');
  END IF;

  -- クーポン情報を取得・検証
  SELECT * INTO v_coupon FROM public.coupons WHERE id = p_coupon_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'クーポンが見つかりません');
  END IF;

  -- クーポンの有効性チェック
  IF v_coupon.status != 'active' THEN
    RETURN jsonb_build_object('success', false, 'error', 'このクーポンは使用できません');
  END IF;

  IF v_coupon.expires_at IS NOT NULL AND v_coupon.expires_at < NOW() THEN
    RETURN jsonb_build_object('success', false, 'error', 'クーポンの有効期限が切れています');
  END IF;

  -- 所有者チェック（ログインユーザーのクーポンか）
  IF v_coupon.customer_id IS NOT NULL AND v_member.user_id IS NOT NULL THEN
    DECLARE
      v_customer_user_id UUID;
    BEGIN
      SELECT user_id INTO v_customer_user_id FROM public.customers WHERE id = v_coupon.customer_id;
      IF v_customer_user_id != v_member.user_id THEN
        RETURN jsonb_build_object('success', false, 'error', 'このクーポンは使用できません');
      END IF;
    END;
  END IF;

  -- 割引額を計算
  v_discount := LEAST(v_coupon.discount_amount, COALESCE(v_member.payment_amount, v_group.per_person_price, 0));
  v_final_amount := GREATEST(0, COALESCE(v_member.payment_amount, v_group.per_person_price, 0) - v_discount);

  -- メンバーのクーポン情報を更新
  UPDATE public.private_group_members
  SET
    coupon_id = p_coupon_id,
    coupon_discount = v_discount,
    final_amount = v_final_amount,
    payment_amount = COALESCE(payment_amount, v_group.per_person_price)
  WHERE id = p_member_id;

  RETURN jsonb_build_object(
    'success', true,
    'discount', v_discount,
    'final_amount', v_final_amount,
    'coupon_code', v_coupon.code
  );
END;
$function$
;
CREATE OR REPLACE FUNCTION public.remove_coupon_from_group_member(p_member_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_member RECORD;
  v_group RECORD;
BEGIN
  -- メンバー情報を取得
  SELECT * INTO v_member FROM public.private_group_members WHERE id = p_member_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'メンバーが見つかりません');
  END IF;

  -- グループ情報を取得
  SELECT * INTO v_group FROM public.private_groups WHERE id = v_member.group_id;

  -- クーポン情報をクリア
  UPDATE public.private_group_members
  SET
    coupon_id = NULL,
    coupon_discount = 0,
    final_amount = COALESCE(payment_amount, v_group.per_person_price, 0)
  WHERE id = p_member_id;

  RETURN jsonb_build_object('success', true);
END;
$function$
;

GRANT EXECUTE ON FUNCTION public.apply_coupon_to_group_member(uuid,uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.remove_coupon_from_group_member(uuid) TO anon;
