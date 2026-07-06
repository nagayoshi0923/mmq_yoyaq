-- link_current_user_to_customer RPC (#308 再発防止)
-- ログイン会員の customers 行が user_id 未紐付けのとき、本人の検証済みメールで一意に照合できる
-- 場合のみ user_id を紐付ける。クライアント直 UPDATE は RLS(user_id = auth.uid()) で弾かれて機能
-- しなかったため、SECURITY DEFINER RPC に置き換える。RLS ポリシー自体は変更しない。
--
-- マルチテナント安全性:
--   照合キーは「auth.users から取得した本人の検証済みメール」のみ。クライアント指定のメールは
--   信用しないため、他人の customers 行を掴むことはできない。プラットフォーム顧客モデルでは
--   email に全体ユニークインデックスがあり、1ユーザー=1顧客行に対応する。

CREATE OR REPLACE FUNCTION public.link_current_user_to_customer()
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid         uuid := auth.uid();
  v_email       text;
  v_customer_id uuid;
  v_match_count integer;
BEGIN
  IF v_uid IS NULL THEN
    RETURN NULL;  -- 未ログイン
  END IF;

  -- 既に本人の顧客行が紐付いていればそれを返す（冪等）
  SELECT id INTO v_customer_id
  FROM public.customers
  WHERE user_id = v_uid
  LIMIT 1;
  IF v_customer_id IS NOT NULL THEN
    RETURN v_customer_id;
  END IF;

  -- 本人の検証済みメールを auth.users から取得
  SELECT lower(email) INTO v_email
  FROM auth.users
  WHERE id = v_uid;

  IF v_email IS NULL THEN
    RETURN NULL;
  END IF;

  -- 未紐付けの候補が「ちょうど1件」のときのみ紐付ける（重複メールは曖昧なのでスキップ）
  SELECT count(*) INTO v_match_count
  FROM public.customers
  WHERE user_id IS NULL
    AND lower(email) = v_email;

  IF v_match_count = 1 THEN
    UPDATE public.customers
    SET user_id = v_uid,
        updated_at = NOW()
    WHERE user_id IS NULL
      AND lower(email) = v_email
    RETURNING id INTO v_customer_id;
  END IF;

  RETURN v_customer_id;  -- 照合不能・曖昧なら NULL
END;
$$;

GRANT EXECUTE ON FUNCTION public.link_current_user_to_customer() TO authenticated;
