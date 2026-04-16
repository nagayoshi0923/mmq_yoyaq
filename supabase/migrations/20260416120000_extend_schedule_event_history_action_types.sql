-- schedule_event_history の action_type CHECK制約を拡張
-- 移動（move_out/move_in）・複製（copy）・参加者操作（add_participant/remove_participant）を追加

ALTER TABLE public.schedule_event_history
  DROP CONSTRAINT IF EXISTS schedule_event_history_action_type_check;

ALTER TABLE public.schedule_event_history
  ADD CONSTRAINT schedule_event_history_action_type_check
  CHECK (action_type = ANY (ARRAY[
    'create'::text,
    'update'::text,
    'delete'::text,
    'cancel'::text,
    'restore'::text,
    'publish'::text,
    'unpublish'::text,
    'add_participant'::text,
    'remove_participant'::text,
    'move_out'::text,
    'move_in'::text,
    'copy'::text
  ]));

COMMENT ON COLUMN public.schedule_event_history.action_type IS
  '変更種別（create/update/delete/cancel/restore/publish/unpublish/add_participant/remove_participant/move_out/move_in/copy）';
