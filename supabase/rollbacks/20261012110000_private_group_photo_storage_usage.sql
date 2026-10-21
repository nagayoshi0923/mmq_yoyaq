-- 20261012110000 の取り消し: 写真の容量の集計・大きさの記録をやめる（写真そのものは消さない）。
BEGIN;
DROP FUNCTION IF EXISTS public.private_group_photo_storage_usage();
DROP TRIGGER IF EXISTS private_group_message_photo_set_size ON public.private_group_message_photos;
DROP FUNCTION IF EXISTS public.private_group_message_photo_set_size();
ALTER TABLE public.private_group_message_photos DROP COLUMN IF EXISTS byte_size;
COMMIT;
