-- 予約台帳化 Step5（DB）: 顧客単位・社内専用メモの upsert RPC
--
-- ・customer_memos は (customer_id, organization_id) で1件（Step4 で UNIQUE 制約済）。
--   詳細パネルからの保存は「自組織分を upsert」する必要がある。
-- ・直 UPDATE/INSERT をクライアントから投げる代わりに RPC に寄せる理由:
--     1. organization_id をサーバー側（get_user_organization_id()）で導出し、
--        クライアントが他組織 id を渡せないようにする（cross-org 事故の遮断）。
--     2. created_by を「初回 INSERT のみ」記録し、以後の更新で上書きしない監査保持。
--        supabase-js の upsert は ON CONFLICT 時も全列を更新するため created_by が壊れる。
--     3. updated_by / updated_at を毎回サーバー側で確定。
-- ・SECURITY INVOKER のままにして customer_memos の RLS（自組織 かつ is_staff_or_admin()）を
--   そのまま効かせる。先頭の明示ガードは「クリーンな例外メッセージ」と多層防御のため。
--   顧客ロール・匿名は is_staff_or_admin()=false で弾かれる（Step4 RLS と同じ防御）。

CREATE OR REPLACE FUNCTION public.upsert_customer_memo(
  p_customer_id uuid,
  p_memo        text
)
RETURNS public.customer_memos
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_uid    uuid := auth.uid();
  v_org_id uuid := public.get_user_organization_id();
  v_row    public.customer_memos;
BEGIN
  IF v_org_id IS NULL OR NOT public.is_staff_or_admin() THEN
    RAISE EXCEPTION 'not authorized to write customer memos';
  END IF;

  INSERT INTO public.customer_memos (customer_id, organization_id, memo, created_by, updated_by)
  VALUES (p_customer_id, v_org_id, COALESCE(p_memo, ''), v_uid, v_uid)
  ON CONFLICT (customer_id, organization_id)
  DO UPDATE SET
    memo       = EXCLUDED.memo,
    updated_by = v_uid,
    updated_at = now()
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

COMMENT ON FUNCTION public.upsert_customer_memo(uuid, text) IS
  '顧客単位の社内メモを自組織分で upsert。org_id はサーバー側導出、created_by は初回のみ保持。RLS(自組織+staff)を SECURITY INVOKER で適用';

-- authenticated にのみ EXECUTE 付与。顧客ロールは RLS / 先頭ガードで弾かれる。
-- Postgres は関数作成時に PUBLIC へ EXECUTE を自動付与するため、まず PUBLIC から剥がす
-- （これをしないと anon が PUBLIC 経由で EXECUTE を継承し、anon への REVOKE が無効化される）。
REVOKE EXECUTE ON FUNCTION public.upsert_customer_memo(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.upsert_customer_memo(uuid, text) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.upsert_customer_memo(uuid, text) FROM anon;
