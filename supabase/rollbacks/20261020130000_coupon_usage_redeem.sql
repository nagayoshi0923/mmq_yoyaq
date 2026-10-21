-- 20261020130000_coupon_usage_redeem の巻き戻し。
-- 「もぎる（来店確認）」の関数と、使用履歴の来店確認の列（時刻・押した会員・経路）を消す。
-- クーポンの使用履歴そのもの（割引額・残り回数）は変わらない。
-- 来店確認の印は、消す前に非公開スキーマ rollback_backup へ退避する（2026-10-21、Codex レビュー指摘 2）。
--   退避先: rollback_backup.coupon_usages_redeem_backup_<JST の日付>
--           （usage_id, redeemed_at, redeemed_by_member, redeemed_source, backed_up_at。印のある行だけ）
--   ブラウザの役割（anon / authenticated）からは読めない。同じ日の退避が既にあれば止まり、何も消さない。
--   当て直した後の書き戻しは docs/ops/本番公開の戻し方_2026-10.md の (b)。
-- 退避を読む前に coupon_usages を ACCESS EXCLUSIVE で押さえ、列を消して COMMIT するまで離さない（2026-10-21、Codex 第 2 回再レビュー R2）。
--   押さえないと、退避を読んだ後に確定した来店確認（実行中の「もぎる」）が退避されずに列ごと消える。
--   実行中の更新があれば、それが確定するのを待ってから退避する。10 秒待っても押さえられなければ失敗し、何も変えない
--   （そのときは時間をおいて流し直す）。押さえている間は使用履歴の読み書きが待たされる（退避と列の削除の数秒だけ）。
BEGIN;
SET LOCAL lock_timeout = '10s';
LOCK TABLE public.coupon_usages IN ACCESS EXCLUSIVE MODE;
CREATE SCHEMA IF NOT EXISTS rollback_backup;
REVOKE ALL ON SCHEMA rollback_backup FROM PUBLIC, anon, authenticated;
DO $backup$
DECLARE v_dst text := 'coupon_usages_redeem_backup_' || to_char(now() AT TIME ZONE 'Asia/Tokyo', 'YYYYMMDD'); v_rows bigint;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'coupon_usages' AND column_name = 'redeemed_at') THEN
    RETURN;
  END IF;
  IF to_regclass(format('rollback_backup.%I', v_dst)) IS NOT NULL THEN
    RAISE EXCEPTION '退避先 rollback_backup.% が既にあります。中身を確かめて別名へ移してから流し直してください', v_dst;
  END IF;
  EXECUTE format('CREATE TABLE rollback_backup.%I AS SELECT id AS usage_id, redeemed_at, redeemed_by_member, redeemed_source, now() AS backed_up_at FROM public.coupon_usages WHERE redeemed_at IS NOT NULL OR redeemed_by_member IS NOT NULL OR redeemed_source IS NOT NULL', v_dst);
  EXECUTE format('REVOKE ALL ON rollback_backup.%I FROM PUBLIC, anon, authenticated', v_dst);
  EXECUTE format('SELECT count(*) FROM rollback_backup.%I', v_dst) INTO v_rows;
  RAISE NOTICE '退避しました: coupon_usages の来店確認の列 → rollback_backup.% (% 行)', v_dst, v_rows;
END $backup$;
DROP FUNCTION IF EXISTS public.redeem_coupon_usage(uuid, uuid, text);
ALTER TABLE public.coupon_usages DROP CONSTRAINT IF EXISTS coupon_usages_redeemed_source_check;
ALTER TABLE public.coupon_usages
  DROP COLUMN IF EXISTS redeemed_source,
  DROP COLUMN IF EXISTS redeemed_by_member,
  DROP COLUMN IF EXISTS redeemed_at;
COMMIT;
