-- キャンセル待ち全員通知用のRPC
-- 従来は空き人数分だけ通知していたが、全員に一斉通知するように変更

CREATE OR REPLACE FUNCTION notify_all_waitlist_entries(
  p_schedule_event_id UUID
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
  v_expires_at TIMESTAMPTZ;
BEGIN
  v_expires_at := NOW() + INTERVAL '24 hours';

  -- 全員のステータスを更新して返す
  RETURN QUERY
  UPDATE waitlist w
  SET 
    status = 'notified',
    notified_at = NOW(),
    expires_at = v_expires_at
  WHERE w.schedule_event_id = p_schedule_event_id
    AND w.status = 'waiting'
  RETURNING w.id, w.customer_name, w.customer_email, w.participant_count, w.status, w.created_at;
END;
$$;

GRANT EXECUTE ON FUNCTION notify_all_waitlist_entries TO authenticated;
GRANT EXECUTE ON FUNCTION notify_all_waitlist_entries TO service_role;

COMMENT ON FUNCTION notify_all_waitlist_entries IS
'キャンセル待ちエントリ全員に通知する。先着順ではなく一斉通知。';
