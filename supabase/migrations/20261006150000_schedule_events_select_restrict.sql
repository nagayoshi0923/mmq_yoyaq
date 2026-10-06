-- 公演の一覧（schedule_events）を、ログインしたお客様から他人の貸切が見えないようにする（2026-10-06 の権限調査で発覚）。
-- これまでは「ログインしていれば全公演を読める」決まりがあり、貸切の公演 1,762 件分の予約名（お客様の名前）・メモなどが読めた。
-- ログインした利用者だけに当てる（未ログインは予約の表を読む権限が無く、確認の中で誤りになる。2026-10-06 に一度未ログインの公演一覧が数分止まった）。
-- 今ある決まりはそのままにし、読む条件に追加の制限（RESTRICTIVE）をかぶせる:
--   スタッフ・管理者は自分の組織の公演（本部の管理者は全組織）／それ以外は一般公開の公演と、自分が予約した公演だけ。
CREATE POLICY schedule_events_select_restrict ON public.schedule_events AS RESTRICTIVE FOR SELECT TO authenticated
USING (
  (public.is_staff_or_admin() AND (organization_id = public.get_user_organization_id() OR public.is_license_admin()))
  OR category = ANY (ARRAY['open'::text, 'offsite'::text])
  OR EXISTS (
    SELECT 1 FROM public.reservations r JOIN public.customers c ON c.id = r.customer_id
     WHERE r.schedule_event_id = schedule_events.id AND c.user_id = auth.uid()
  )
);
