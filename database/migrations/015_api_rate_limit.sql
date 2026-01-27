-- =============================================================================
-- マイグレーション 015: API レートリミット
-- =============================================================================
-- 
-- 🎯 解決する問題:
--   DoS攻撃（大量リクエスト）からAPIを保護
--   同一IP/ユーザーからの短時間連続リクエストを制限
--
-- 📋 仕組み:
--   1. リクエストごとにカウンターを記録
--   2. 制限を超えたら429エラーを返す
--   3. 古い記録は自動削除（Cronで）
--
-- =============================================================================

-- 1. レートリミット記録テーブル
CREATE TABLE IF NOT EXISTS rate_limit_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- 識別子（IPアドレスまたはユーザーID）
  identifier TEXT NOT NULL,
  
  -- エンドポイント（どのAPIか）
  endpoint TEXT NOT NULL,
  
  -- リクエスト回数
  request_count INTEGER NOT NULL DEFAULT 1,
  
  -- ウィンドウ開始時刻（この時刻から制限時間内のカウント）
  window_start TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- 識別子とエンドポイントの組み合わせで一意
  CONSTRAINT uq_rate_limit_identifier_endpoint UNIQUE (identifier, endpoint)
);

-- インデックス（高速な検索のため）
CREATE INDEX IF NOT EXISTS idx_rate_limit_window_start 
ON rate_limit_records (window_start);

CREATE INDEX IF NOT EXISTS idx_rate_limit_identifier 
ON rate_limit_records (identifier);

-- 2. レートリミットチェック関数
-- 戻り値: TRUE = 許可, FALSE = 制限中
CREATE OR REPLACE FUNCTION check_rate_limit(
  p_identifier TEXT,           -- IPアドレスまたはユーザーID
  p_endpoint TEXT,             -- エンドポイント名
  p_max_requests INTEGER DEFAULT 60,  -- 制限回数
  p_window_seconds INTEGER DEFAULT 60 -- ウィンドウ秒数
)
RETURNS TABLE(
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
  v_record RECORD;
  v_window_start TIMESTAMPTZ;
  v_now TIMESTAMPTZ := NOW();
  v_allowed BOOLEAN := TRUE;
  v_current_count INTEGER := 0;
  v_reset_at TIMESTAMPTZ;
  v_retry_after INTEGER := 0;
BEGIN
  -- 現在のウィンドウ開始時刻を計算
  v_window_start := v_now - (p_window_seconds || ' seconds')::INTERVAL;
  
  -- 既存のレコードを取得（行ロック）
  SELECT * INTO v_record
  FROM rate_limit_records
  WHERE identifier = p_identifier AND endpoint = p_endpoint
  FOR UPDATE;
  
  IF v_record IS NULL THEN
    -- 新規レコード作成
    INSERT INTO rate_limit_records (identifier, endpoint, request_count, window_start)
    VALUES (p_identifier, p_endpoint, 1, v_now);
    
    v_current_count := 1;
    v_reset_at := v_now + (p_window_seconds || ' seconds')::INTERVAL;
    
  ELSIF v_record.window_start < v_window_start THEN
    -- ウィンドウがリセットされた（古いウィンドウ）
    UPDATE rate_limit_records
    SET request_count = 1,
        window_start = v_now
    WHERE id = v_record.id;
    
    v_current_count := 1;
    v_reset_at := v_now + (p_window_seconds || ' seconds')::INTERVAL;
    
  ELSE
    -- 同じウィンドウ内
    v_current_count := v_record.request_count + 1;
    v_reset_at := v_record.window_start + (p_window_seconds || ' seconds')::INTERVAL;
    
    IF v_current_count > p_max_requests THEN
      -- 制限超過
      v_allowed := FALSE;
      v_retry_after := EXTRACT(EPOCH FROM (v_reset_at - v_now))::INTEGER;
      v_retry_after := GREATEST(v_retry_after, 1);  -- 最低1秒
    ELSE
      -- カウント増加
      UPDATE rate_limit_records
      SET request_count = v_current_count
      WHERE id = v_record.id;
    END IF;
  END IF;
  
  RETURN QUERY SELECT v_allowed, v_current_count, v_reset_at, v_retry_after;
END;
$$;

COMMENT ON FUNCTION check_rate_limit(TEXT, TEXT, INTEGER, INTEGER) IS
'APIレートリミットをチェック。制限内ならTRUE、超過ならFALSEを返す。
p_max_requests: ウィンドウ内の最大リクエスト数
p_window_seconds: ウィンドウの秒数（この期間内でカウント）';

-- 3. 古いレコード削除関数（Cron用）
CREATE OR REPLACE FUNCTION cleanup_rate_limit_records()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deleted INTEGER;
BEGIN
  -- 1時間以上前のレコードを削除
  DELETE FROM rate_limit_records
  WHERE window_start < NOW() - INTERVAL '1 hour';
  
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  
  IF v_deleted > 0 THEN
    RAISE NOTICE '🗑️ 削除したレートリミットレコード: %件', v_deleted;
  END IF;
  
  RETURN v_deleted;
END;
$$;

-- 4. RLS設定（管理者のみアクセス可能）
ALTER TABLE rate_limit_records ENABLE ROW LEVEL SECURITY;

-- Service Role用（Edge Functionsから使用）
CREATE POLICY rate_limit_service_role ON rate_limit_records
FOR ALL
USING (current_setting('role', true) = 'service_role');

-- 5. 権限付与
GRANT SELECT, INSERT, UPDATE, DELETE ON rate_limit_records TO service_role;
GRANT EXECUTE ON FUNCTION check_rate_limit(TEXT, TEXT, INTEGER, INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION cleanup_rate_limit_records() TO service_role;

-- 6. Cronジョブ設定（オプション - Supabase Dashboardでも設定可能）
-- SELECT cron.schedule(
--   'cleanup-rate-limit-records',
--   '0 * * * *',  -- 毎時0分
--   $$ SELECT cleanup_rate_limit_records(); $$
-- );

-- 完了確認
DO $$ 
BEGIN
  RAISE NOTICE '✅ マイグレーション 015 完了';
  RAISE NOTICE '  - rate_limit_records テーブル作成';
  RAISE NOTICE '  - check_rate_limit() 関数作成';
  RAISE NOTICE '  - cleanup_rate_limit_records() 関数作成';
  RAISE NOTICE '';
  RAISE NOTICE '📋 次のステップ:';
  RAISE NOTICE '  1. Supabase SQL Editorで実行';
  RAISE NOTICE '  2. Edge Functionsにレートリミットを追加';
  RAISE NOTICE '  3. Cronジョブを設定（オプション）';
END $$;

