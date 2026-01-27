-- =============================================================================
-- マイグレーション 018: 公演中止判定機能
-- =============================================================================
-- 
-- 機能概要:
-- 1. 前日23:59チェック: 満席でなければ過半数以上なら延長、未満なら中止
-- 2. 4時間前チェック: 延長された公演で満席でなければ中止
-- 3. 中止時は予約者にメール + Discordに通知（GMメンション付き）
-- =============================================================================

-- 1. 延長フラグ用カラムを追加
ALTER TABLE schedule_events 
ADD COLUMN IF NOT EXISTS is_recruitment_extended BOOLEAN DEFAULT FALSE;

COMMENT ON COLUMN schedule_events.is_recruitment_extended IS 
'前日チェックで過半数達成し、募集延長された公演かどうか';

-- 2. 中止判定結果を記録するテーブル
CREATE TABLE IF NOT EXISTS performance_cancellation_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  schedule_event_id UUID NOT NULL REFERENCES schedule_events(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id),
  check_type TEXT NOT NULL, -- 'day_before' or 'four_hours_before'
  current_participants INTEGER NOT NULL,
  max_participants INTEGER NOT NULL,
  result TEXT NOT NULL, -- 'confirmed', 'extended', 'cancelled'
  notified_customers INTEGER DEFAULT 0,
  notified_gms TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE performance_cancellation_logs IS 
'公演中止判定の実行ログ';

-- インデックス
CREATE INDEX IF NOT EXISTS idx_cancellation_logs_event 
ON performance_cancellation_logs(schedule_event_id);

CREATE INDEX IF NOT EXISTS idx_cancellation_logs_created 
ON performance_cancellation_logs(created_at DESC);

-- 3. 前日チェック用RPC関数
CREATE OR REPLACE FUNCTION check_performances_day_before()
RETURNS TABLE(
  events_checked INTEGER,
  events_confirmed INTEGER,
  events_extended INTEGER,
  events_cancelled INTEGER,
  details JSONB
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_events_checked INTEGER := 0;
  v_events_confirmed INTEGER := 0;
  v_events_extended INTEGER := 0;
  v_events_cancelled INTEGER := 0;
  v_details JSONB := '[]'::JSONB;
  v_event RECORD;
  v_current INTEGER;
  v_max INTEGER;
  v_half INTEGER;
  v_result TEXT;
BEGIN
  -- 明日開催の公演を取得（中止済み・既にチェック済みを除く）
  FOR v_event IN
    SELECT 
      se.id,
      se.date,
      se.start_time,
      se.scenario,
      se.current_participants,
      COALESCE(se.max_participants, s.player_count_max, 8) as max_participants,
      se.organization_id,
      se.gms,
      se.store_id,
      st.name as store_name
    FROM schedule_events se
    LEFT JOIN scenarios s ON se.scenario_id = s.id
    LEFT JOIN stores st ON se.store_id = st.id
    WHERE se.date = CURRENT_DATE + INTERVAL '1 day'
      AND se.is_cancelled = false
      AND se.is_recruitment_extended IS NOT TRUE
      AND se.category IN ('open', 'private')
    ORDER BY se.start_time
  LOOP
    v_events_checked := v_events_checked + 1;
    v_current := COALESCE(v_event.current_participants, 0);
    v_max := v_event.max_participants;
    v_half := CEIL(v_max::NUMERIC / 2);
    
    IF v_current >= v_max THEN
      -- 満席 → 公演確定
      v_result := 'confirmed';
      v_events_confirmed := v_events_confirmed + 1;
    ELSIF v_current >= v_half THEN
      -- 過半数以上 → 募集延長
      v_result := 'extended';
      v_events_extended := v_events_extended + 1;
      
      -- 延長フラグを設定
      UPDATE schedule_events
      SET is_recruitment_extended = TRUE,
          updated_at = NOW()
      WHERE id = v_event.id;
    ELSE
      -- 過半数未満 → 公演中止
      v_result := 'cancelled';
      v_events_cancelled := v_events_cancelled + 1;
      
      -- 公演を中止に設定
      UPDATE schedule_events
      SET is_cancelled = TRUE,
          updated_at = NOW()
      WHERE id = v_event.id;
    END IF;
    
    -- ログに記録
    INSERT INTO performance_cancellation_logs (
      schedule_event_id,
      organization_id,
      check_type,
      current_participants,
      max_participants,
      result
    ) VALUES (
      v_event.id,
      v_event.organization_id,
      'day_before',
      v_current,
      v_max,
      v_result
    );
    
    -- 詳細情報を追加
    v_details := v_details || jsonb_build_object(
      'event_id', v_event.id,
      'date', v_event.date,
      'start_time', v_event.start_time,
      'scenario', v_event.scenario,
      'store_name', v_event.store_name,
      'current_participants', v_current,
      'max_participants', v_max,
      'half_required', v_half,
      'result', v_result,
      'organization_id', v_event.organization_id,
      'gms', v_event.gms
    );
  END LOOP;
  
  RETURN QUERY SELECT 
    v_events_checked,
    v_events_confirmed,
    v_events_extended,
    v_events_cancelled,
    v_details;
END;
$$;

COMMENT ON FUNCTION check_performances_day_before() IS 
'前日23:59に実行する公演中止判定。満席→確定、過半数→延長、未満→中止';

-- 4. 4時間前チェック用RPC関数
CREATE OR REPLACE FUNCTION check_performances_four_hours_before()
RETURNS TABLE(
  events_checked INTEGER,
  events_confirmed INTEGER,
  events_cancelled INTEGER,
  details JSONB
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_events_checked INTEGER := 0;
  v_events_confirmed INTEGER := 0;
  v_events_cancelled INTEGER := 0;
  v_details JSONB := '[]'::JSONB;
  v_event RECORD;
  v_current INTEGER;
  v_max INTEGER;
  v_result TEXT;
  v_check_time TIMESTAMPTZ;
BEGIN
  -- 現在時刻から4時間後
  v_check_time := NOW() + INTERVAL '4 hours';
  
  -- 延長された公演で、4時間以内に開始するものを取得
  FOR v_event IN
    SELECT 
      se.id,
      se.date,
      se.start_time,
      se.scenario,
      se.current_participants,
      COALESCE(se.max_participants, s.player_count_max, 8) as max_participants,
      se.organization_id,
      se.gms,
      se.store_id,
      st.name as store_name,
      (se.date + se.start_time::time) as event_datetime
    FROM schedule_events se
    LEFT JOIN scenarios s ON se.scenario_id = s.id
    LEFT JOIN stores st ON se.store_id = st.id
    WHERE se.is_recruitment_extended = TRUE
      AND se.is_cancelled = false
      AND (se.date + se.start_time::time) <= v_check_time
      AND (se.date + se.start_time::time) > NOW()
      AND se.category IN ('open', 'private')
      -- 既に4時間前チェック済みを除外
      AND NOT EXISTS (
        SELECT 1 FROM performance_cancellation_logs pcl
        WHERE pcl.schedule_event_id = se.id
        AND pcl.check_type = 'four_hours_before'
      )
    ORDER BY se.date, se.start_time
  LOOP
    v_events_checked := v_events_checked + 1;
    v_current := COALESCE(v_event.current_participants, 0);
    v_max := v_event.max_participants;
    
    IF v_current >= v_max THEN
      -- 満席 → 公演確定
      v_result := 'confirmed';
      v_events_confirmed := v_events_confirmed + 1;
      
      -- 延長フラグをクリア
      UPDATE schedule_events
      SET is_recruitment_extended = FALSE,
          updated_at = NOW()
      WHERE id = v_event.id;
    ELSE
      -- 満席でない → 公演中止
      v_result := 'cancelled';
      v_events_cancelled := v_events_cancelled + 1;
      
      -- 公演を中止に設定
      UPDATE schedule_events
      SET is_cancelled = TRUE,
          is_recruitment_extended = FALSE,
          updated_at = NOW()
      WHERE id = v_event.id;
    END IF;
    
    -- ログに記録
    INSERT INTO performance_cancellation_logs (
      schedule_event_id,
      organization_id,
      check_type,
      current_participants,
      max_participants,
      result
    ) VALUES (
      v_event.id,
      v_event.organization_id,
      'four_hours_before',
      v_current,
      v_max,
      v_result
    );
    
    -- 詳細情報を追加
    v_details := v_details || jsonb_build_object(
      'event_id', v_event.id,
      'date', v_event.date,
      'start_time', v_event.start_time,
      'scenario', v_event.scenario,
      'store_name', v_event.store_name,
      'current_participants', v_current,
      'max_participants', v_max,
      'result', v_result,
      'organization_id', v_event.organization_id,
      'gms', v_event.gms
    );
  END LOOP;
  
  RETURN QUERY SELECT 
    v_events_checked,
    v_events_confirmed,
    v_events_cancelled,
    v_details;
END;
$$;

COMMENT ON FUNCTION check_performances_four_hours_before() IS 
'4時間前に実行する公演中止判定（延長された公演のみ）。満席→確定、それ以外→中止';

-- 5. RLSポリシー
ALTER TABLE performance_cancellation_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS performance_cancellation_logs_admin ON performance_cancellation_logs;
CREATE POLICY performance_cancellation_logs_admin
ON performance_cancellation_logs
FOR ALL
USING (is_org_admin());

COMMENT ON POLICY performance_cancellation_logs_admin ON performance_cancellation_logs IS 
'管理者のみ公演中止ログにアクセス可能';

-- 6. 実行権限
GRANT EXECUTE ON FUNCTION check_performances_day_before() TO authenticated;
GRANT EXECUTE ON FUNCTION check_performances_four_hours_before() TO authenticated;

-- 7. Cronジョブ設定（Supabase Dashboardで設定することを推奨）
-- 以下はpg_cronが有効な場合のみ実行可能
-- 
-- 前日23:59チェック（毎日23:59 JST = 14:59 UTC）
-- SELECT cron.schedule(
--   'check-performances-day-before',
--   '59 14 * * *',
--   $$ SELECT net.http_post(
--     url := 'https://cznpcewciwywcqcxktba.supabase.co/functions/v1/check-performance-cancellation',
--     headers := '{"Authorization": "Bearer ' || current_setting('app.settings.service_role_key') || '", "Content-Type": "application/json"}'::jsonb,
--     body := '{"check_type": "day_before"}'::jsonb
--   ); $$
-- );
-- 
-- 4時間前チェック（毎時0分に実行）
-- SELECT cron.schedule(
--   'check-performances-four-hours',
--   '0 * * * *',
--   $$ SELECT net.http_post(
--     url := 'https://cznpcewciwywcqcxktba.supabase.co/functions/v1/check-performance-cancellation',
--     headers := '{"Authorization": "Bearer ' || current_setting('app.settings.service_role_key') || '", "Content-Type": "application/json"}'::jsonb,
--     body := '{"check_type": "four_hours_before"}'::jsonb
--   ); $$
-- );

DO $$
BEGIN
  RAISE NOTICE '✅ マイグレーション 018 完了: 公演中止判定機能を追加しました。';
  RAISE NOTICE '  - schedule_events に is_recruitment_extended カラムを追加';
  RAISE NOTICE '  - performance_cancellation_logs テーブルを作成';
  RAISE NOTICE '  - check_performances_day_before() 関数を作成';
  RAISE NOTICE '  - check_performances_four_hours_before() 関数を作成';
  RAISE NOTICE '';
  RAISE NOTICE '⚠️ Cronジョブは Supabase Dashboard で手動設定してください:';
  RAISE NOTICE '  - 前日チェック: 毎日 23:59 JST';
  RAISE NOTICE '  - 4時間前チェック: 毎時 0分';
END $$;

