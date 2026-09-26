BEGIN;
CREATE OR REPLACE FUNCTION public.dispatch_performance_recruitment_checks()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE p record; base_url text; cron_key text;
BEGIN
 SELECT value INTO base_url FROM app_config WHERE key='supabase_url';
 SELECT value INTO cron_key FROM app_config WHERE key='trigger_secret';
 IF base_url IS NULL OR cron_key IS NULL THEN RAISE EXCEPTION '募集判定の接続設定がありません'; END IF;
 FOR p IN SELECT id AS organization_id FROM organizations pol WHERE is_active
   AND (EXISTS(SELECT 1 FROM schedule_events e WHERE e.organization_id=pol.id
     AND NOT e.is_cancelled AND e.category='open'
     AND (EXISTS(SELECT 1 FROM performance_recruitment_deadlines active_deadline
       WHERE active_deadline.schedule_event_id=e.id AND active_deadline.organization_id=e.organization_id AND active_deadline.status='active')
       OR (public.get_performance_judgment_deadline(e.organization_id,e.id) <= now() AND NOT EXISTS(SELECT 1 FROM performance_cancellation_logs l WHERE l.schedule_event_id=e.id AND (l.check_type='four_hours_before' OR l.result='confirmed'))))
     AND ((e.date+e.start_time) AT TIME ZONE 'Asia/Tokyo'>now()
       OR EXISTS(SELECT 1 FROM performance_recruitment_deadlines d WHERE d.schedule_event_id=e.id AND d.status='active')))
     OR EXISTS(SELECT 1 FROM performance_recruitment_notices n WHERE n.organization_id=pol.id
       AND n.status IN ('pending','failed','sending') AND n.attempts<10 AND n.created_at>now()-interval '1 day')
     OR EXISTS(SELECT 1 FROM recruitment_x_posts x WHERE x.organization_id=pol.id AND x.status IN ('pending','failed','sending') AND x.attempts<10 AND x.created_at>now()-interval '1 day'))
 LOOP
   PERFORM net.http_post(url:=rtrim(base_url,'/')||'/functions/v1/check-performance-cancellation',
     headers:=jsonb_build_object('Content-Type','application/json','x-recruitment-cron-secret',cron_key,'x-cron-secret',cron_key),
     body:=jsonb_build_object('check_type','recruitment_deadline','organization_id',p.organization_id), timeout_milliseconds:=30000);
 END LOOP;
END;
$function$
;


NOTIFY pgrst, 'reload schema';
COMMIT;
