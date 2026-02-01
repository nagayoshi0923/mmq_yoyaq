-- =============================================================================
-- 🔒 セキュリティ強化: レート制限インフラストラクチャ
-- 
-- 目的: Edge Functionへの過剰なリクエストを制限し、DoS攻撃を防止
-- =============================================================================

-- レート制限テーブル（存在しない場合のみ作成）
CREATE TABLE IF NOT EXISTS public.rate_limit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  identifier TEXT NOT NULL,  -- IPアドレスまたはユーザーID
  endpoint TEXT NOT NULL,    -- エンドポイント名
  requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- インデックス（高速な検索のため）
CREATE INDEX IF NOT EXISTS idx_rate_limit_lookup 
ON public.rate_limit_log (identifier, endpoint, requested_at DESC);

-- 古いログの自動削除（1時間以上前のログは削除）
CREATE INDEX IF NOT EXISTS idx_rate_limit_cleanup 
ON public.rate_limit_log (requested_at);

-- レート制限チェック関数
CREATE OR REPLACE FUNCTION public.check_rate_limit(
  p_identifier TEXT,
  p_endpoint TEXT,
  p_max_requests INTEGER DEFAULT 60,
  p_window_seconds INTEGER DEFAULT 60
)
RETURNS TABLE (
  allowed BOOLEAN,
  current_count INTEGER,
  reset_at TIMESTAMPTZ,
  retry_after INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_window_start TIMESTAMPTZ;
  v_current_count INTEGER;
  v_reset_at TIMESTAMPTZ;
BEGIN
  v_window_start := NOW() - (p_window_seconds || ' seconds')::INTERVAL;
  v_reset_at := NOW() + (p_window_seconds || ' seconds')::INTERVAL;

  -- 現在のウィンドウ内のリクエスト数をカウント
  SELECT COUNT(*)
  INTO v_current_count
  FROM rate_limit_log
  WHERE identifier = p_identifier
    AND endpoint = p_endpoint
    AND requested_at > v_window_start;

  -- 制限内の場合はログを記録
  IF v_current_count < p_max_requests THEN
    INSERT INTO rate_limit_log (identifier, endpoint, requested_at)
    VALUES (p_identifier, p_endpoint, NOW());
    
    RETURN QUERY SELECT 
      true AS allowed,
      (v_current_count + 1)::INTEGER AS current_count,
      v_reset_at AS reset_at,
      0 AS retry_after;
  ELSE
    -- 制限超過
    -- 最も古いリクエストからリトライまでの時間を計算
    SELECT EXTRACT(EPOCH FROM (requested_at + (p_window_seconds || ' seconds')::INTERVAL - NOW()))::INTEGER
    INTO retry_after
    FROM rate_limit_log
    WHERE identifier = p_identifier
      AND endpoint = p_endpoint
      AND requested_at > v_window_start
    ORDER BY requested_at ASC
    LIMIT 1;

    RETURN QUERY SELECT 
      false AS allowed,
      v_current_count::INTEGER AS current_count,
      v_reset_at AS reset_at,
      COALESCE(retry_after, p_window_seconds) AS retry_after;
  END IF;
END;
$$;

-- 古いログを定期的に削除するための関数
CREATE OR REPLACE FUNCTION public.cleanup_rate_limit_log()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deleted_count INTEGER;
BEGIN
  DELETE FROM rate_limit_log
  WHERE requested_at < NOW() - INTERVAL '1 hour';
  
  GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
  RETURN v_deleted_count;
END;
$$;

-- RLSを有効化（サービスロールのみアクセス可能）
ALTER TABLE public.rate_limit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "rate_limit_service_role_only" ON public.rate_limit_log;
CREATE POLICY "rate_limit_service_role_only" ON public.rate_limit_log
  FOR ALL
  USING (auth.role() = 'service_role');

-- 匿名/認証ユーザーからのRPC呼び出しを許可
GRANT EXECUTE ON FUNCTION public.check_rate_limit TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_rate_limit_log TO service_role;

COMMENT ON TABLE public.rate_limit_log IS 'APIレート制限のためのリクエストログ';
COMMENT ON FUNCTION public.check_rate_limit IS 'レート制限をチェックし、許可/拒否を返す';
COMMENT ON FUNCTION public.cleanup_rate_limit_log IS '古いレート制限ログを削除';

-- 確認
DO $$
BEGIN
  RAISE NOTICE '✅ レート制限インフラストラクチャを作成しました';
  RAISE NOTICE '   - rate_limit_log テーブル: リクエストログ';
  RAISE NOTICE '   - check_rate_limit 関数: レート制限チェック';
  RAISE NOTICE '   - cleanup_rate_limit_log 関数: 古いログ削除';
  RAISE NOTICE '';
  RAISE NOTICE '📋 使用方法:';
  RAISE NOTICE '   Edge Function から checkRateLimit() を呼び出す';
  RAISE NOTICE '   デフォルト: 60秒間に60リクエストまで';
END $$;
