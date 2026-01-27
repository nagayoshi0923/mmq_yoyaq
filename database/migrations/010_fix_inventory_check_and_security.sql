-- =============================================================================
-- マイグレーション 010: 在庫整合性チェック関数の修正とセキュリティ強化
-- =============================================================================
-- 
-- 作成日: 2026-01-28
-- 
-- 修正内容:
--   1. check_and_fix_inventory_consistency() のステータス条件を統一
--      - 'gm_confirmed' を追加（他のRPC関数と一致）
--      - is_cancelled = false を追加（中止済み公演を除外）
--   2. inventory_consistency_logs テーブルにRLSを設定
--   3. notify-waitlist用の認証チェックヘルパー関数追加
-- 
-- ロールバック: 末尾のロールバックSQLを実行
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 事前チェック: 関数とテーブルの存在確認
-- -----------------------------------------------------------------------------
DO $$ 
BEGIN
  -- is_org_admin 関数の存在確認
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'is_org_admin') THEN
    RAISE NOTICE '⚠️ is_org_admin 関数が存在しません。先に基本関数を作成してください。';
  END IF;
  
  -- inventory_consistency_logs テーブルの存在確認
  IF NOT EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'inventory_consistency_logs') THEN
    RAISE NOTICE '⚠️ inventory_consistency_logs テーブルが存在しません。先に 009 マイグレーションを実行してください。';
  END IF;
END $$;

-- -----------------------------------------------------------------------------
-- 1. check_and_fix_inventory_consistency() 関数の修正
-- -----------------------------------------------------------------------------
-- 
-- 変更点:
--   - ステータス条件: ('confirmed', 'pending') → ('pending', 'confirmed', 'gm_confirmed')
--   - WHERE条件: is_cancelled = false を追加
-- 
-- ※ 既存の拡張機能（定員チェック、オーバーブッキング検出）は維持
-- 
-- これにより、他のRPC関数（create_reservation_with_lock, cancel_reservation_with_lock）と
-- ステータス判定が一致し、誤った不整合検出を防ぎます。
-- -----------------------------------------------------------------------------

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
  v_max_capacity INTEGER;
  v_corrected_count INTEGER;
BEGIN
  -- 過去30日〜未来90日のイベントをチェック
  FOR v_event_record IN
    SELECT 
      se.id,
      se.date,
      se.start_time,
      se.current_participants,
      se.max_participants,
      se.capacity,
      se.organization_id,
      s.title as scenario_title,
      st.name as store_name
    FROM schedule_events se
    LEFT JOIN scenarios s ON se.scenario_id = s.id
    LEFT JOIN stores st ON se.store_id = st.id
    WHERE se.date >= CURRENT_DATE - INTERVAL '30 days'
      AND se.date <= CURRENT_DATE + INTERVAL '90 days'
      AND se.is_cancelled = false  -- ✅ 追加: 中止済み公演を除外
    ORDER BY se.date DESC
  LOOP
    v_total_checked := v_total_checked + 1;
    
    -- ✅ 修正: 'gm_confirmed' を追加
    -- create_reservation_with_lock, cancel_reservation_with_lock と同じ条件
    SELECT COALESCE(SUM(participant_count), 0)
    INTO v_actual_count
    FROM reservations
    WHERE schedule_event_id = v_event_record.id
      AND status IN ('pending', 'confirmed', 'gm_confirmed');  -- ✅ 修正
    
    v_stored_count := COALESCE(v_event_record.current_participants, 0);
    v_difference := v_stored_count - v_actual_count;
    
    -- 定員を取得（max_participants優先、なければcapacity）
    v_max_capacity := COALESCE(v_event_record.max_participants, v_event_record.capacity);
    
    -- 実際の予約数が定員を超えている場合は定員に制限
    v_corrected_count := LEAST(v_actual_count, v_max_capacity);
    
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
        'corrected_count', v_corrected_count,
        'max_capacity', v_max_capacity,
        'difference', v_difference,
        'is_overbooked', v_actual_count > v_max_capacity,
        'organization_id', v_event_record.organization_id
      );
      
      -- 自動修正（定員を超えない範囲で）
      UPDATE schedule_events
      SET current_participants = v_corrected_count,
          updated_at = NOW()
      WHERE id = v_event_record.id;
      
      v_auto_fixed := v_auto_fixed + 1;
      
      IF v_actual_count > v_max_capacity THEN
        RAISE NOTICE 'オーバーブッキング検出: event_id=%, actual=%, max=%, corrected=%',
          v_event_record.id, v_actual_count, v_max_capacity, v_corrected_count;
      ELSE
        RAISE NOTICE '不整合を修正: event_id=%, stored=%, actual=%, diff=%',
          v_event_record.id, v_stored_count, v_actual_count, v_difference;
      END IF;
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
'在庫整合性をチェックし、不整合があれば自動修正する関数。
過去30日から未来90日の非キャンセル公演を対象とする。
ステータス条件: pending, confirmed, gm_confirmed（他RPC関数と統一）
定員チェック・オーバーブッキング検出機能付き。';

-- -----------------------------------------------------------------------------
-- 2. inventory_consistency_logs テーブルのRLS設定
-- -----------------------------------------------------------------------------
-- 
-- ポリシー:
--   - 管理者（is_org_admin() = true）のみ全操作可能
--   - Service Role は全アクセス可能（Cron実行用）
--   - 一般ユーザーはアクセス不可
-- 
-- 影響:
--   - 既存データには影響なし（ポリシー追加のみ）
--   - Edge Function からは Service Role で呼び出すため影響なし
-- -----------------------------------------------------------------------------

-- RLSを有効化（既に有効な場合はスキップ）
ALTER TABLE inventory_consistency_logs ENABLE ROW LEVEL SECURITY;

-- 既存ポリシーを安全に削除
DO $$ 
BEGIN
  DROP POLICY IF EXISTS inventory_consistency_logs_admin_only ON inventory_consistency_logs;
  DROP POLICY IF EXISTS inventory_consistency_logs_service ON inventory_consistency_logs;
EXCEPTION WHEN undefined_table THEN 
  RAISE NOTICE 'テーブルが存在しません。009マイグレーションを先に実行してください。';
END $$;

-- 管理者のみ全操作可能
CREATE POLICY inventory_consistency_logs_admin_only 
ON inventory_consistency_logs
FOR ALL
USING (
  -- is_org_admin() が true の場合のみアクセス可能
  is_org_admin()
);

-- 補足: Service Role Key での呼び出しはRLSをバイパスするため、
-- Edge Function からの呼び出しには影響しません。

COMMENT ON POLICY inventory_consistency_logs_admin_only 
ON inventory_consistency_logs IS 
'管理者のみ在庫整合性ログにアクセス可能';

-- -----------------------------------------------------------------------------
-- 3. 組織メンバーシップ確認関数（Edge Function認証用）
-- -----------------------------------------------------------------------------
-- 
-- 用途: notify-waitlist 等のEdge Functionで、呼び出し元ユーザーが
--       指定した organization_id の組織に所属しているかを確認
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION is_organization_member(p_organization_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_member BOOLEAN;
BEGIN
  -- 管理者は全組織にアクセス可能
  IF is_org_admin() THEN
    RETURN TRUE;
  END IF;
  
  -- スタッフテーブルで組織メンバーシップを確認
  SELECT EXISTS (
    SELECT 1 FROM staff
    WHERE user_id = auth.uid()
      AND organization_id = p_organization_id
      AND status = 'active'
  ) INTO v_is_member;
  
  RETURN v_is_member;
END;
$$;

COMMENT ON FUNCTION is_organization_member(UUID) IS 
'指定した組織のメンバーかどうかを確認する。管理者は常にtrue。';

-- 認証済みユーザーに実行権限を付与
GRANT EXECUTE ON FUNCTION is_organization_member(UUID) TO authenticated;

-- -----------------------------------------------------------------------------
-- マイグレーション完了確認
-- -----------------------------------------------------------------------------
DO $$ 
BEGIN
  RAISE NOTICE '✅ マイグレーション 010 完了';
  RAISE NOTICE '  - check_and_fix_inventory_consistency() を修正';
  RAISE NOTICE '  - inventory_consistency_logs にRLS設定';
  RAISE NOTICE '  - is_organization_member() 関数を追加';
END $$;

-- =============================================================================
-- ロールバックSQL（必要な場合のみ実行）
-- =============================================================================
/*
-- 以下のSQLを実行すると、このマイグレーションの変更を元に戻せます
-- ※ 現在DBにある拡張版（定員チェック・オーバーブッキング検出機能付き）に戻す

-- 1. 関数を元のバージョンに戻す（is_cancelled条件なし、gm_confirmedなし）
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
  v_max_capacity INTEGER;
  v_corrected_count INTEGER;
BEGIN
  FOR v_event_record IN
    SELECT 
      se.id,
      se.date,
      se.start_time,
      se.current_participants,
      se.max_participants,
      se.capacity,
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
    
    SELECT COALESCE(SUM(participant_count), 0)
    INTO v_actual_count
    FROM reservations
    WHERE schedule_event_id = v_event_record.id
      AND status IN ('confirmed', 'pending');  -- 元の条件（gm_confirmedなし）
    
    v_stored_count := COALESCE(v_event_record.current_participants, 0);
    v_difference := v_stored_count - v_actual_count;
    
    v_max_capacity := COALESCE(v_event_record.max_participants, v_event_record.capacity);
    v_corrected_count := LEAST(v_actual_count, v_max_capacity);
    
    IF v_difference <> 0 THEN
      v_inconsistencies_found := v_inconsistencies_found + 1;
      
      v_details := v_details || jsonb_build_object(
        'event_id', v_event_record.id,
        'date', v_event_record.date,
        'start_time', v_event_record.start_time,
        'scenario_title', v_event_record.scenario_title,
        'store_name', v_event_record.store_name,
        'stored_count', v_stored_count,
        'actual_count', v_actual_count,
        'corrected_count', v_corrected_count,
        'max_capacity', v_max_capacity,
        'difference', v_difference,
        'is_overbooked', v_actual_count > v_max_capacity,
        'organization_id', v_event_record.organization_id
      );
      
      UPDATE schedule_events
      SET current_participants = v_corrected_count,
          updated_at = NOW()
      WHERE id = v_event_record.id;
      
      v_auto_fixed := v_auto_fixed + 1;
      
      IF v_actual_count > v_max_capacity THEN
        RAISE NOTICE 'オーバーブッキング検出: event_id=%, actual=%, max=%, corrected=%',
          v_event_record.id, v_actual_count, v_max_capacity, v_corrected_count;
      ELSE
        RAISE NOTICE '不整合を修正: event_id=%, stored=%, actual=%, diff=%',
          v_event_record.id, v_stored_count, v_actual_count, v_difference;
      END IF;
    END IF;
  END LOOP;
  
  RETURN QUERY SELECT 
    v_total_checked,
    v_inconsistencies_found,
    v_auto_fixed,
    v_details;
END;
$$;

-- 2. RLSポリシーを削除
DROP POLICY IF EXISTS inventory_consistency_logs_admin_only ON inventory_consistency_logs;

-- 3. 追加した関数を削除
DROP FUNCTION IF EXISTS is_organization_member(UUID);

-- 4. RLSを無効化（元の状態に戻す）
ALTER TABLE inventory_consistency_logs DISABLE ROW LEVEL SECURITY;

RAISE NOTICE '✅ ロールバック完了';
*/

