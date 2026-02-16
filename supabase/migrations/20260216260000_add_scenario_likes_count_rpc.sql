-- scenario_likesの件数をシナリオIDごとに集計するRPC
-- パフォーマンス最適化: 全件取得ではなくサーバー側で集計

CREATE OR REPLACE FUNCTION get_scenario_likes_count()
RETURNS TABLE (
  scenario_id UUID,
  likes_count BIGINT
)
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT 
    scenario_id,
    COUNT(*) as likes_count
  FROM scenario_likes
  GROUP BY scenario_id;
$$;

-- 匿名ユーザーからも呼び出し可能にする（公開トップページ用）
GRANT EXECUTE ON FUNCTION get_scenario_likes_count() TO anon;
GRANT EXECUTE ON FUNCTION get_scenario_likes_count() TO authenticated;

COMMENT ON FUNCTION get_scenario_likes_count() IS 'シナリオごとの遊びたいリスト登録数を集計して返す';
