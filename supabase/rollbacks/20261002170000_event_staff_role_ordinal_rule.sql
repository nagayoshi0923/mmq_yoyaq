-- rollback: 付け直した役割を退避表から戻し、トリガー関数を supabase/migrations/20260927009000_event_staff_lock_order.sql の定義に戻す。
UPDATE public.schedule_event_staff_assignments a SET role = b.role_before
FROM archive.event_staff_roles_backup_20261002 b WHERE b.event_id = a.event_id AND b.ordinal = a.ordinal;
