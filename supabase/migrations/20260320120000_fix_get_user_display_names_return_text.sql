-- get_user_display_names: COALESCE が varchar 列由来で character varying になり、
-- RETURNS TABLE の display_name TEXT と 42804 で不一致になる問題を修正（::text で統一）

CREATE OR REPLACE FUNCTION get_user_display_names(user_ids UUID[])
RETURNS TABLE (
  user_id UUID,
  display_name TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    u.id AS user_id,
    (COALESCE(
      c.nickname::text,
      c.name::text,
      u.display_name::text,
      split_part(u.email, '@', 1)
    )) AS display_name
  FROM users u
  LEFT JOIN customers c ON c.user_id = u.id
  WHERE u.id = ANY(user_ids);
END;
$$;

COMMENT ON FUNCTION get_user_display_names(UUID[]) IS
  '複数 user_id の表示名を一括取得（customers.nickname / name を優先）。戻りは TEXT で統一。';
