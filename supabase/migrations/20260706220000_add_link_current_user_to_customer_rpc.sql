-- link_current_user_to_customer RPC (#308 再発防止)
-- ログイン会員の customers 行が user_id 未紐付けのとき、本人の検証済みメールで一意に照合できる
-- 場合のみ user_id を紐付ける。クライアント直 UPDATE は RLS(user_id = auth.uid()) で弾かれて機能
-- しなかったため、SECURITY DEFINER RPC に置き換える。RLS ポリシー自体は変更しない。
--
-- マルチテナント安全性:
--   照合キーは「auth.users から取得した本人の検証済みメール」のみ。クライアント指定のメールは
--   信用しないため、他人の customers 行を掴むことはできない。プラットフォーム顧客モデルでは
--   email に全体ユニークインデックスがあり、1ユーザー=1顧客行に対応する。
--
-- organization_id のリセット:
--   紐付け対象の行は元々ゲスト顧客（organization_id が特定の組織を指す）。
--   20260519000000_platform_customers_phase1.sql の不変条件「ログイン済み顧客
--   (user_id IS NOT NULL) は organization_id = NULL」を保つため、user_id と同時に
--   organization_id も NULL にする（20260521030000_backfill_platform_customers_org_null.sql
--   と同じ理由）。ただしリセットするのは呼び出しユーザーの public.users.role = 'customer'
--   のときのみ。20260521030000 と同じガードで、staff/admin/license_admin が自分用に持つ
--   customer 行の organization_id は変更しない。
--
-- 組織横断のゲスト重複について:
--   未紐付け候補の一意性チェック（下記 v_match_count）は organization_id を問わずグローバルに
--   行っている。同一人物が複数組織にゲストとして重複登録されている場合は v_match_count > 1 と
--   なり意図的にスキップする（NULL を返す＝紐付けない）。誤って別組織の顧客行を紐付けるリスクを
--   避けるための安全側の判断であり、該当ユーザーは自動では救済されない。

CREATE OR REPLACE FUNCTION public.link_current_user_to_customer()
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid         uuid := auth.uid();
  v_email       text;
  v_role        app_role;
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

  -- 呼び出しユーザー自身の role（staff/admin/license_admin が自分用の customer 行を
  -- 誤って組織から外さないためのガード。20260521030000 と同じ条件）
  SELECT role INTO v_role
  FROM public.users
  WHERE id = v_uid;

  -- 未紐付けの候補が「ちょうど1件」のときのみ紐付ける（組織横断でグローバルにチェック。
  -- 重複メール・複数組織ゲスト重複は曖昧とみなしスキップ）
  SELECT count(*) INTO v_match_count
  FROM public.customers
  WHERE user_id IS NULL
    AND lower(email) = v_email;

  IF v_match_count = 1 THEN
    UPDATE public.customers
    SET user_id = v_uid,
        organization_id = CASE WHEN v_role = 'customer' THEN NULL ELSE organization_id END,
        updated_at = NOW()
    WHERE user_id IS NULL
      AND lower(email) = v_email
    RETURNING id INTO v_customer_id;
  END IF;

  RETURN v_customer_id;  -- 照合不能・曖昧なら NULL
END;
$$;

GRANT EXECUTE ON FUNCTION public.link_current_user_to_customer() TO authenticated;
