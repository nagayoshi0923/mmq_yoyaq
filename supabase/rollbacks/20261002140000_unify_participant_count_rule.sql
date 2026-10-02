-- rollback: demo 予約の人数と表示人数を退避表から戻し、制約を NOT VALID で再追加する。退避表は残す。
UPDATE public.reservations r SET participant_count = b.participant_count_before
FROM archive.demo_reservations_capped_20261002 b WHERE b.reservation_id = r.id;
UPDATE public.schedule_events e SET current_participants = b.current_participants
FROM archive.schedule_events_participants_backup_20261002b b WHERE b.id = e.id;
ALTER TABLE public.schedule_events ADD CONSTRAINT schedule_events_participants_check
  CHECK (current_participants <= COALESCE(max_participants, capacity)) NOT VALID;
