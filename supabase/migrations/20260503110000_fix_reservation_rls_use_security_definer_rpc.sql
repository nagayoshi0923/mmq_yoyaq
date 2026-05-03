-- セキュリティ修正: reservations の RLS ポリシーを削除し、SECURITY DEFINER RPC に差し替え
--
-- 問題: reservations_select_private_group_member ポリシーが行全体を公開してしまい、
--       staff_notes（内部メモ）・customer_email/phone（幹事の個人情報）・
--       total_price/payment_method（料金・支払い情報）等が参加者に漏洩するリスクがあった。
--
-- 修正: RLS ポリシーを削除し、クーポンもぎりに必要な最小限の
--       3カラム（reservation_id, schedule_event_id, status）のみを返す
--       SECURITY DEFINER 関数に置き換える。

-- 不安全な RLS ポリシーを削除
DROP POLICY IF EXISTS "reservations_select_private_group_member" ON public.reservations;

-- 貸切参加者向け: 最小限の予約情報のみ返す SECURITY DEFINER 関数
CREATE OR REPLACE FUNCTION public.get_private_group_reservation_info()
RETURNS TABLE(
  reservation_id   UUID,
  schedule_event_id UUID,
  reservation_status TEXT,
  group_status     TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    r.id                AS reservation_id,
    r.schedule_event_id,
    r.status            AS reservation_status,
    pg.status           AS group_status
  FROM public.private_group_members pgm
  JOIN public.private_groups        pg  ON pg.id          = pgm.group_id
  JOIN public.reservations          r   ON r.id           = pg.reservation_id
  WHERE pgm.user_id        = auth.uid()
    AND pgm.status         = 'joined'
    AND pg.reservation_id  IS NOT NULL;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_private_group_reservation_info() TO authenticated;
