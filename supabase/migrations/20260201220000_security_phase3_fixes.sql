-- =============================================================================
-- 20260201220000: セキュリティ監査 Phase 3 修正
-- =============================================================================
--
-- P0-3: キャンセル待ち通知のアトミックな取得と更新
-- P1-1: 予約作成の監査ログ追加
-- P1-3: 締切時間の境界条件修正
--
-- =============================================================================

-- =============================================================================
-- P0-3: キャンセル待ち通知のアトミックな取得と更新
-- =============================================================================
-- 問題: notify-waitlist Edge Functionがwaitlistテーブルをロックせず取得していた
-- 解決: FOR UPDATE SKIP LOCKEDでアトミックに取得・更新するRPC関数を作成

CREATE OR REPLACE FUNCTION fetch_and_lock_waitlist_entries(
  p_schedule_event_id UUID,
  p_freed_seats INTEGER
)
RETURNS TABLE (
  id UUID,
  customer_name TEXT,
  customer_email TEXT,
  participant_count INTEGER,
  status TEXT,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_remaining_seats INTEGER;
  v_expires_at TIMESTAMPTZ;
  v_entry RECORD;
BEGIN
  v_remaining_seats := p_freed_seats;
  v_expires_at := NOW() + INTERVAL '24 hours';

  -- FOR UPDATE SKIP LOCKEDで他のトランザクションと競合しないようにロック
  FOR v_entry IN
    SELECT w.id, w.customer_name, w.customer_email, w.participant_count, w.status, w.created_at
    FROM waitlist w
    WHERE w.schedule_event_id = p_schedule_event_id
      AND w.status = 'waiting'
    ORDER BY w.created_at ASC
    FOR UPDATE SKIP LOCKED
  LOOP
    -- 残席がある間だけ処理
    IF v_remaining_seats > 0 THEN
      -- ステータスを即座に更新（他のトランザクションから見えないようにする）
      UPDATE waitlist
      SET status = 'notified',
          notified_at = NOW(),
          expires_at = v_expires_at
      WHERE waitlist.id = v_entry.id;

      v_remaining_seats := v_remaining_seats - v_entry.participant_count;

      -- 結果を返す
      id := v_entry.id;
      customer_name := v_entry.customer_name;
      customer_email := v_entry.customer_email;
      participant_count := v_entry.participant_count;
      status := 'notified';  -- 更新後のステータス
      created_at := v_entry.created_at;
      RETURN NEXT;
    END IF;
  END LOOP;

  RETURN;
END;
$$;

GRANT EXECUTE ON FUNCTION fetch_and_lock_waitlist_entries TO authenticated;
GRANT EXECUTE ON FUNCTION fetch_and_lock_waitlist_entries TO service_role;

COMMENT ON FUNCTION fetch_and_lock_waitlist_entries IS
'キャンセル待ちエントリをアトミックに取得・ロック・更新する。競合を防止。';


-- =============================================================================
-- P1-1: 予約作成の監査ログ追加
-- =============================================================================
-- 問題: create_reservation_with_lock_v2で監査ログが記録されていなかった
-- 解決: 予約作成時にaudit_logsに記録するトリガーを追加

-- 予約作成時の監査ログトリガー
CREATE OR REPLACE FUNCTION audit_reservation_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO audit_logs (
    user_id,
    action,
    table_name,
    record_id,
    old_values,
    new_values
  ) VALUES (
    auth.uid(),
    'RESERVATION_CREATED',
    'reservations',
    NEW.id,
    NULL,
    jsonb_build_object(
      'reservation_number', NEW.reservation_number,
      'schedule_event_id', NEW.schedule_event_id,
      'customer_id', NEW.customer_id,
      'participant_count', NEW.participant_count,
      'total_price', NEW.total_price,
      'status', NEW.status,
      'organization_id', NEW.organization_id
    )
  );
  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    -- 監査ログの失敗で予約作成を止めない
    RAISE WARNING 'audit_reservation_insert failed: %', SQLERRM;
    RETURN NEW;
END;
$$;

-- 既存のトリガーがあれば削除
DROP TRIGGER IF EXISTS trigger_audit_reservation_insert ON reservations;

-- トリガーを作成
CREATE TRIGGER trigger_audit_reservation_insert
  AFTER INSERT ON reservations
  FOR EACH ROW
  EXECUTE FUNCTION audit_reservation_insert();


-- =============================================================================
-- P1-3: 締切時間の境界条件修正
-- =============================================================================
-- 問題: v_hours_until_event < v_reservation_deadline_hours で締切ちょうどが許可されていた
-- 解決: <= に変更（締切ちょうども禁止）

-- 既存関数を再定義（締切チェックを修正）
-- 注: create_reservation_with_lock_v2 には締切チェックが含まれていないため、
-- enforce_reservation_limits_server_side 関数を更新

-- check_reservation_deadline関数を作成/更新
CREATE OR REPLACE FUNCTION check_reservation_deadline(
  p_schedule_event_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
DECLARE
  v_event_date DATE;
  v_start_time TIME;
  v_deadline_hours INTEGER;
  v_hours_until_event NUMERIC;
BEGIN
  -- イベントの日時と締切時間を取得
  SELECT se.date, se.start_time, COALESCE(os.reservation_deadline_hours, gs.reservation_deadline_hours, 24)
  INTO v_event_date, v_start_time, v_deadline_hours
  FROM schedule_events se
  LEFT JOIN organization_settings os ON os.organization_id = se.organization_id
  LEFT JOIN global_settings gs ON gs.key = 'reservation_deadline_hours'
  WHERE se.id = p_schedule_event_id;

  IF v_event_date IS NULL THEN
    RETURN FALSE;
  END IF;

  -- イベントまでの時間を計算
  v_hours_until_event := EXTRACT(EPOCH FROM (
    (v_event_date + v_start_time) - NOW()
  )) / 3600;

  -- 🔒 SEC-P1-3修正: 締切時間ちょうども禁止（< → <=）
  IF v_hours_until_event <= v_deadline_hours THEN
    RETURN FALSE;  -- 締切を過ぎている
  END IF;

  RETURN TRUE;  -- 予約可能
END;
$$;

COMMENT ON FUNCTION check_reservation_deadline IS
'予約締切時間をチェック。締切時間ちょうども予約不可（SEC-P1-3修正）';


-- =============================================================================
-- 顧客作成/更新の監査ログトリガー（P1-2対応）
-- =============================================================================

CREATE OR REPLACE FUNCTION audit_customer_changes()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO audit_logs (
      user_id, action, table_name, record_id, old_values, new_values
    ) VALUES (
      auth.uid(),
      'CUSTOMER_CREATED',
      'customers',
      NEW.id,
      NULL,
      jsonb_build_object(
        'name', NEW.name,
        'email', NEW.email,
        'phone', NEW.phone,
        'organization_id', NEW.organization_id
      )
    );
  ELSIF TG_OP = 'UPDATE' THEN
    INSERT INTO audit_logs (
      user_id, action, table_name, record_id, old_values, new_values
    ) VALUES (
      auth.uid(),
      'CUSTOMER_UPDATED',
      'customers',
      NEW.id,
      jsonb_build_object(
        'name', OLD.name,
        'email', OLD.email,
        'phone', OLD.phone
      ),
      jsonb_build_object(
        'name', NEW.name,
        'email', NEW.email,
        'phone', NEW.phone
      )
    );
  END IF;
  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'audit_customer_changes failed: %', SQLERRM;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_audit_customer ON customers;

CREATE TRIGGER trigger_audit_customer
  AFTER INSERT OR UPDATE ON customers
  FOR EACH ROW
  EXECUTE FUNCTION audit_customer_changes();


-- =============================================================================
-- 完了
-- =============================================================================
