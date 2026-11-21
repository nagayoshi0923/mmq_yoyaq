-- 2026-11-22 えいきち判断（QW-20261114-001 お客様画面の全機能点検）
-- 1) お客様の予約がキャンセルになったら、使ったクーポンを戻す（まだ店舗で使用済みにしていないものだけ）
-- 2) 予約番号の日付を日本時間に統一する（これまでは世界標準時で、朝9時前の予約が前日の日付になっていた）

-- 1) キャンセルでクーポンを戻す -------------------------------------------------
CREATE OR REPLACE FUNCTION public.restore_coupons_on_reservation_cancel()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE u public.coupon_usages;
BEGIN
  FOR u IN
    SELECT * FROM public.coupon_usages
    WHERE reservation_id = NEW.id AND redeemed_at IS NULL
    FOR UPDATE
  LOOP
    PERFORM 1 FROM public.customer_coupons WHERE id = u.customer_coupon_id FOR UPDATE;
    -- 利用履歴を消す（貸切メンバーのひも付け・請求反映の記録は外部キーで一緒に消える）。
    -- 予約の金額（discount_amount・final_price）はキャンセル時点の記録として残す。
    DELETE FROM public.coupon_usages WHERE id = u.id;
    UPDATE public.customer_coupons
      SET uses_remaining = uses_remaining + 1,
          status = CASE WHEN status = 'fully_used' THEN 'active' ELSE status END
      WHERE id = u.customer_coupon_id;
  END LOOP;
  RETURN NULL;
END
$function$;

REVOKE ALL ON FUNCTION public.restore_coupons_on_reservation_cancel() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE TRIGGER restore_coupons_on_reservation_cancel
  AFTER UPDATE OF status ON public.reservations
  FOR EACH ROW
  WHEN (NEW.status = 'cancelled' AND OLD.status IS DISTINCT FROM 'cancelled')
  EXECUTE FUNCTION public.restore_coupons_on_reservation_cancel();

-- 2) 予約番号の日付を日本時間に -------------------------------------------------
-- 関数本体は環境ごとに少しずつ違う可能性があるため、いまの定義の日付部分だけを置き換える。
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
    fixed := replace(fixed, 'to_char(now(), ''YYMMDD'')', 'to_char(now() AT TIME ZONE ''Asia/Tokyo'', ''YYMMDD'')');
    fixed := replace(fixed, 'to_char(NOW(), ''YYYYMMDD'')', 'to_char(NOW() AT TIME ZONE ''Asia/Tokyo'', ''YYYYMMDD'')');
    fixed := replace(fixed, 'TO_CHAR(CURRENT_DATE, ''YYYYMMDD'')', 'TO_CHAR((now() AT TIME ZONE ''Asia/Tokyo'')::date, ''YYYYMMDD'')');
    IF fixed <> def THEN
      EXECUTE fixed;
      RAISE NOTICE '予約番号の日付を日本時間に: %', fn;
    END IF;
  END LOOP;
END
$$;
