-- 20261021190000_announce_release_2026_10 の巻き戻し: 告知を積む関数を消す。
-- 注意: すでに積んだ通知（user_notifications の metadata->>'key'='release-2026-10' の行）は残る。
--   消す必要があるときは、別に確認してから
--   DELETE FROM public.user_notifications WHERE metadata->>'kind'='release_note' AND metadata->>'key'='release-2026-10';
--   を実行する（この rollback では消さない）。
BEGIN;
DROP FUNCTION IF EXISTS public.announce_release_2026_10(text, boolean);
COMMIT;
