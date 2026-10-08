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
  RETURNING w.id, w.customer_name::text, w.customer_email::text, w.participant_count, w.status::text, w.created_at;
END;
$function$
;
-- 有効化後の正本: 旧送信前消費RPCはアプリ/Edgeから実行しない。
REVOKE ALL ON FUNCTION public.notify_all_waitlist_entries(uuid) FROM PUBLIC,anon,authenticated,service_role;
