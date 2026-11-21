-- 20261122030000 の戻し: キャンセルでクーポンを戻すトリガーを外し、予約番号の日付を世界標準時に戻す。
-- 注意: すでに戻したクーポン（利用履歴の削除・残り回数）は元に戻らない。
DROP TRIGGER IF EXISTS restore_coupons_on_reservation_cancel ON public.reservations;
DROP FUNCTION IF EXISTS public.restore_coupons_on_reservation_cancel();

DO $$
DECLARE
  fn regprocedure;
  def text;
  fixed text;
BEGIN
  FOR fn IN
    SELECT p.oid::regprocedure FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN ('create_reservation_with_lock_v2', 'create_private_booking_request', 'generate_reservation_number')
  LOOP
    def := pg_get_functiondef(fn);
    fixed := def;
    fixed := replace(fixed, 'to_char(now() AT TIME ZONE ''Asia/Tokyo'', ''YYMMDD'')', 'to_char(now(), ''YYMMDD'')');
    fixed := replace(fixed, 'to_char(NOW() AT TIME ZONE ''Asia/Tokyo'', ''YYYYMMDD'')', 'to_char(NOW(), ''YYYYMMDD'')');
    fixed := replace(fixed, 'TO_CHAR((now() AT TIME ZONE ''Asia/Tokyo'')::date, ''YYYYMMDD'')', 'TO_CHAR(CURRENT_DATE, ''YYYYMMDD'')');
    IF fixed <> def THEN
      EXECUTE fixed;
    END IF;
  END LOOP;
END
$$;
