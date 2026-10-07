-- 注意:旧定義には初回QAで検出した不具合がある。切戻しは明示レビュー後のみ。
CREATE OR REPLACE FUNCTION public.notify_all_waitlist_entries(p_schedule_event_id uuid)
 RETURNS TABLE(id uuid, customer_name text, customer_email text, participant_count integer, status text, created_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$
;

-- 元の公開実行権限へ戻るため、本番での自動rollbackには使わない。
GRANT EXECUTE ON FUNCTION public.notify_all_waitlist_entries(uuid) TO PUBLIC,anon,authenticated,service_role;
