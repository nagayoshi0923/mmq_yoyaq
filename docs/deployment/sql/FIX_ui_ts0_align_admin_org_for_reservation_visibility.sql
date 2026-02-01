-- =============================================================================
-- FIX UI TS-0: 管理画面で「予約が0件」に見える問題の暫定対策
-- =============================================================================
--
-- 症状:
-- - スケジュール上は「予約者 2/7名」など人数が出ているのに、
--   公演ダイアログの「予約者」タブで「予約はありません」になる
--
-- 原因（典型）:
-- - 予約の取得が `getCurrentOrganizationId()` の組織でフィルタされ、
--   “表示中の公演の organization_id” と “ログインユーザーの organization_id” がズレている
--
-- これはフロント修正で恒久対応しますが、デプロイ前でも今すぐ直したい場合は
-- 管理ユーザーの organization_id を “表示したい組織” に合わせることで解消します。
--
-- 使い方（置換不要）:
-- 1) まずプレビュー: このファイルをそのまま実行
-- 2) 適用する場合:
--      SELECT set_config('app.do_apply', 'true', false);
--    そのあと、もう一度このファイルを実行
--
-- 対象ユーザー（必須・置換不要）:
--    SELECT set_config('app.target_email', 'YOUR_EMAIL_HERE', false);
--
-- 合わせたい組織（任意）:
--    SELECT set_config('app.target_org_id', 'a0000000-0000-0000-0000-000000000001', false); -- Queens
--
-- 変更内容:
-- - public.users.organization_id を更新
-- - staff レコードがある場合 staff.organization_id も同期
--
-- =============================================================================

-- 現在の設定（同じSQL Editorタブ内で set_config した値だけが見えます）
SELECT
  'SETTINGS' AS section,
  current_setting('app.target_email', true) AS target_email,
  current_setting('app.target_org_id', true) AS target_org_id,
  current_setting('app.do_apply', true) AS do_apply;

WITH params AS (
  SELECT
    NULLIF(current_setting('app.target_email', true), '') AS target_email,
    COALESCE(
      NULLIF(current_setting('app.target_org_id', true), '')::uuid,
      'a0000000-0000-0000-0000-000000000001'::uuid
    ) AS target_org_id,
    (COALESCE(NULLIF(current_setting('app.do_apply', true), ''), 'false') = 'true') AS do_apply
),
target_auth AS (
  -- public.users.email が空/不一致でも、auth.users から確実に user_id を引く
  SELECT au.id AS auth_user_id, au.email
  FROM auth.users au
  JOIN params p ON true
  WHERE p.target_email IS NOT NULL
    AND lower(au.email) = lower(p.target_email)
  LIMIT 1
),
target_user AS (
  SELECT
    u.id AS user_id,
    u.email,
    u.role,
    u.organization_id AS current_user_org_id,
    p.target_org_id AS next_org_id
  FROM public.users u
  JOIN params p ON true
  LEFT JOIN target_auth ta ON true
  WHERE p.target_email IS NOT NULL
    AND (
      -- 1) auth.users から引いた id で一致（最優先）
      (ta.auth_user_id IS NOT NULL AND u.id = ta.auth_user_id)
      -- 2) public.users.email で一致（フォールバック）
      OR lower(u.email) = lower(p.target_email)
    )
  LIMIT 1
),
target_staff AS (
  SELECT
    s.id AS staff_id,
    s.user_id,
    s.organization_id AS current_staff_org_id
  FROM public.staff s
  JOIN target_user tu ON tu.user_id = s.user_id
  LIMIT 1
)
SELECT
  'PREVIEW' AS section,
  COALESCE(tu.email, ta.email) AS email,
  tu.role,
  tu.current_user_org_id,
  tu.next_org_id,
  ts.staff_id,
  ts.current_staff_org_id
FROM target_user tu
LEFT JOIN target_auth ta ON true
LEFT JOIN target_staff ts ON true;

-- 対象ユーザーが見つからない場合のヒント（0件のときだけ確認用）
WITH params AS (
  SELECT
    NULLIF(current_setting('app.target_email', true), '') AS target_email
)
SELECT
  'HINT_auth_users_match' AS section,
  au.id AS auth_user_id,
  au.email
FROM auth.users au
JOIN params p ON true
WHERE p.target_email IS NOT NULL
  AND au.email ILIKE p.target_email
LIMIT 5;

-- ---------------------------------------------------------------------------
-- APPLY
-- ---------------------------------------------------------------------------
WITH params AS (
  SELECT
    NULLIF(current_setting('app.target_email', true), '') AS target_email,
    COALESCE(
      NULLIF(current_setting('app.target_org_id', true), '')::uuid,
      'a0000000-0000-0000-0000-000000000001'::uuid
    ) AS target_org_id,
    (COALESCE(NULLIF(current_setting('app.do_apply', true), ''), 'false') = 'true') AS do_apply
),
target_auth AS (
  SELECT
    au.id AS auth_user_id,
    au.email AS auth_email,
    au.created_at AS auth_created_at,
    au.raw_user_meta_data AS auth_meta
  FROM auth.users au
  JOIN params p ON true
  WHERE p.target_email IS NOT NULL
    AND lower(au.email) = lower(p.target_email)
  LIMIT 1
),
-- auth.users に居るなら、public.users が無くても作成してから organization_id を更新する
upserted_users AS (
  INSERT INTO public.users (id, email, role, organization_id, created_at, updated_at)
  SELECT
    ta.auth_user_id,
    ta.auth_email,
    CASE
      WHEN (ta.auth_meta->>'invited_as') = 'admin' THEN 'admin'::app_role
      WHEN (ta.auth_meta->>'invited_as') = 'staff' THEN 'staff'::app_role
      WHEN ta.auth_email ILIKE '%admin%' THEN 'admin'::app_role
      WHEN ta.auth_email ILIKE '%staff%' THEN 'staff'::app_role
      ELSE 'customer'::app_role
    END AS role,
    p.target_org_id,
    ta.auth_created_at,
    now()
  FROM params p
  JOIN target_auth ta ON true
  WHERE p.do_apply = true
  ON CONFLICT (id) DO UPDATE
    SET organization_id = EXCLUDED.organization_id,
        updated_at = now()
  RETURNING id
),
updated_staff AS (
  UPDATE public.staff s
  SET organization_id = p.target_org_id,
      updated_at = now()
  FROM params p, target_auth ta
  WHERE p.do_apply = true
    AND s.user_id = ta.auth_user_id
  RETURNING s.id
)
SELECT
  'APPLY_RESULT' AS section,
  (SELECT COUNT(*) FROM upserted_users) AS updated_users,
  (SELECT COUNT(*) FROM updated_staff) AS updated_staff,
  (SELECT target_org_id FROM params) AS target_org_id,
  (SELECT target_email FROM params) AS target_email,
  (SELECT auth_user_id FROM target_auth) AS auth_user_id;

