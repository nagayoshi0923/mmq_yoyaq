-- rollback: 再計算した公演（action = 'recalc'）の current_participants を退避表の値へ戻す。退避表は監査用に残す。
UPDATE public.schedule_events e
SET current_participants = b.current_participants
FROM archive.schedule_events_participants_backup_20261002 b
WHERE b.id = e.id AND b.action = 'recalc';
