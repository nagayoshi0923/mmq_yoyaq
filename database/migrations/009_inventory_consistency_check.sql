-- 在庫整合性チェック機能
-- current_participants と実際の予約数を比較し、不整合があれば自動修正

/**
 * 在庫整合性をチェックし、不整合があれば修正する関数
 * 
 * 戻り値:
 * - total_checked: チェックしたイベント数
 * - inconsistencies_found: 不整合が見つかったイベント数
 * - auto_fixed: 自動修正したイベント数
 * - details: 不整合の詳細（JSON配列）
 */
CREATE OR REPLACE FUNCTION check_and_fix_inventory_consistency()
RETURNS TABLE(
  total_checked INTEGER,
  inconsistencies_found INTEGER,
  auto_fixed INTEGER,
  details JSONB
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total_checked INTEGER := 0;
  v_inconsistencies_found INTEGER := 0;
  v_auto_fixed INTEGER := 0;
  v_details JSONB := '[]'::JSONB;
  v_event_record RECORD;
  v_actual_count INTEGER;
  v_stored_count INTEGER;
  v_difference INTEGER;
BEGIN
  -- 過去30日間のイベントをチェック
  FOR v_event_record IN
    SELECT 
      se.id,
      se.date,
      se.start_time,
      se.current_participants,
      se.organization_id,
      s.title as scenario_title,
      st.name as store_name
    FROM schedule_events se
    LEFT JOIN scenarios s ON se.scenario_id = s.id
    LEFT JOIN stores st ON se.store_id = st.id
    WHERE se.date >= CURRENT_DATE - INTERVAL '30 days'
      AND se.date <= CURRENT_DATE + INTERVAL '90 days'
    ORDER BY se.date DESC
  LOOP
    v_total_checked := v_total_checked + 1;
    
    -- 実際の予約数を計算（確定済みの予約のみ）
    SELECT COALESCE(SUM(participant_count), 0)
    INTO v_actual_count
    FROM reservations
    WHERE schedule_event_id = v_event_record.id
      AND status IN ('confirmed', 'pending');
    
    v_stored_count := COALESCE(v_event_record.current_participants, 0);
    v_difference := v_stored_count - v_actual_count;
    
    -- 不整合があれば記録
    IF v_difference <> 0 THEN
      v_inconsistencies_found := v_inconsistencies_found + 1;
      
      -- 詳細を記録
      v_details := v_details || jsonb_build_object(
        'event_id', v_event_record.id,
        'date', v_event_record.date,
        'start_time', v_event_record.start_time,
        'scenario_title', v_event_record.scenario_title,
        'store_name', v_event_record.store_name,
        'stored_count', v_stored_count,
        'actual_count', v_actual_count,
        'difference', v_difference,
        'organization_id', v_event_record.organization_id
      );
      
      -- 自動修正
      UPDATE schedule_events
      SET current_participants = v_actual_count,
          updated_at = NOW()
      WHERE id = v_event_record.id;
      
      v_auto_fixed := v_auto_fixed + 1;
      
      RAISE NOTICE '不整合を修正: event_id=%, stored=%, actual=%, diff=%',
        v_event_record.id, v_stored_count, v_actual_count, v_difference;
    END IF;
  END LOOP;
  
  -- 結果を返す
  RETURN QUERY SELECT 
    v_total_checked,
    v_inconsistencies_found,
    v_auto_fixed,
    v_details;
END;
$$;

COMMENT ON FUNCTION check_and_fix_inventory_consistency() IS 
'在庫整合性をチェックし、不整合があれば自動修正する関数。過去30日から未来90日のイベントを対象とする。';

/**
 * 在庫整合性チェックログテーブル
 * 実行履歴を記録
 */
CREATE TABLE IF NOT EXISTS inventory_consistency_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  checked_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  total_checked INTEGER NOT NULL,
  inconsistencies_found INTEGER NOT NULL,
  auto_fixed INTEGER NOT NULL,
  details JSONB,
  execution_time_ms INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_inventory_consistency_logs_checked_at 
  ON inventory_consistency_logs(checked_at DESC);

COMMENT ON TABLE inventory_consistency_logs IS 
'在庫整合性チェックの実行履歴。不整合の検出と修正を記録する。';

/**
 * 在庫整合性チェックを実行し、ログに記録する関数
 */
CREATE OR REPLACE FUNCTION run_inventory_consistency_check()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_start_time TIMESTAMPTZ;
  v_end_time TIMESTAMPTZ;
  v_result RECORD;
  v_execution_time_ms INTEGER;
  v_response JSONB;
BEGIN
  v_start_time := clock_timestamp();
  
  -- チェックと修正を実行
  SELECT * INTO v_result
  FROM check_and_fix_inventory_consistency();
  
  v_end_time := clock_timestamp();
  v_execution_time_ms := EXTRACT(MILLISECONDS FROM (v_end_time - v_start_time))::INTEGER;
  
  -- ログに記録
  INSERT INTO inventory_consistency_logs (
    total_checked,
    inconsistencies_found,
    auto_fixed,
    details,
    execution_time_ms
  ) VALUES (
    v_result.total_checked,
    v_result.inconsistencies_found,
    v_result.auto_fixed,
    v_result.details,
    v_execution_time_ms
  );
  
  -- レスポンスを構築
  v_response := jsonb_build_object(
    'success', true,
    'total_checked', v_result.total_checked,
    'inconsistencies_found', v_result.inconsistencies_found,
    'auto_fixed', v_result.auto_fixed,
    'execution_time_ms', v_execution_time_ms,
    'details', v_result.details
  );
  
  RETURN v_response;
END;
$$;

COMMENT ON FUNCTION run_inventory_consistency_check() IS 
'在庫整合性チェックを実行し、結果をログテーブルに記録する。Cron や Edge Function から呼び出される。';

/**
 * 古いログを削除する関数（90日以上前のログを削除）
 */
CREATE OR REPLACE FUNCTION cleanup_inventory_consistency_logs()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deleted_count INTEGER;
BEGIN
  DELETE FROM inventory_consistency_logs
  WHERE created_at < NOW() - INTERVAL '90 days';
  
  GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
  
  RAISE NOTICE '古いログを削除しました: % 件', v_deleted_count;
  
  RETURN v_deleted_count;
END;
$$;

COMMENT ON FUNCTION cleanup_inventory_consistency_logs() IS 
'90日以上前の在庫整合性チェックログを削除する。';

