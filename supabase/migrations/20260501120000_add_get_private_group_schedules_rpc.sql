-- =============================================================================
-- get_private_group_schedules: 貸切グループの確定スケジュール情報を取得
-- 正規ソース: supabase/rpcs/get_private_group_schedules.sql
-- 用途: マイページで参加者が貸切グループの確定日時・会場を表示するために使用
--       reservations テーブルの RLS を回避し、グループメンバーが自分のグループの
--       予約情報（日時・店舗）のみ取得できるようにする。
-- =============================================================================

CREATE OR REPLACE FUNCTION get_private_group_schedules(p_group_ids uuid[])
RETURNS TABLE (
  group_id uuid,
  requested_datetime text,
  store_id uuid,
  store_name text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    pg.id::uuid AS group_id,
    r.requested_datetime::text,
    r.store_id::uuid,
    s.name::text AS store_name
  FROM private_groups pg
  JOIN reservations r ON r.id = pg.reservation_id
  LEFT JOIN stores s ON s.id = r.store_id
  WHERE pg.id = ANY(p_group_ids)
    AND (
      -- グループメンバー（参加済み）
      EXISTS (
        SELECT 1 FROM private_group_members pgm
        WHERE pgm.group_id = pg.id
          AND pgm.user_id = auth.uid()
          AND pgm.status = 'joined'
      )
      -- スタッフ・管理者
      OR pg.organization_id = get_user_organization_id()
      OR is_org_admin()
    );
END;
$$;

COMMENT ON FUNCTION get_private_group_schedules(uuid[]) IS
  '貸切グループの確定スケジュール（requested_datetime, store_id, store_name）を返す。'
  'グループメンバーが主催者の reservation を直接参照できない RLS 制約を回避するための SECURITY DEFINER 関数。';

-- 認証済みユーザーのみ実行可能
REVOKE EXECUTE ON FUNCTION public.get_private_group_schedules(uuid[]) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_private_group_schedules(uuid[]) TO authenticated;
