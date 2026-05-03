-- 貸切参加者が自分のグループの予約を参照できるようRLSポリシーを追加
--
-- 問題: reservations テーブルの SELECT ポリシーは「自分の customer_id を持つ予約のみ」を許可しているが、
--       貸切グループの招待参加者（private_group_members）は幹事の予約に customer_id がないため閲覧できない。
--       その結果、getCurrentReservations() でグループ予約が取得できず、クーポンもぎりダイアログに
--       公演が表示されず「もぎる」ボタンが押せない状態になる。
--
-- 修正: private_group_members で status='joined' かつ、そのグループが持つ reservation_id に一致する
--       予約行を参照できるポリシーを追加する。

CREATE POLICY "reservations_select_private_group_member"
  ON public.reservations
  FOR SELECT
  USING (
    id IN (
      SELECT pg.reservation_id
      FROM public.private_groups pg
      JOIN public.private_group_members pgm ON pgm.group_id = pg.id
      WHERE pgm.user_id = auth.uid()
        AND pgm.status = 'joined'
        AND pg.reservation_id IS NOT NULL
    )
  );
