-- rollback: 公演の一覧の読む条件の追加の制限を外す（お客様から他人の貸切が見える状態に戻るので、戻すのは業務が止まった場合だけ）
DROP POLICY IF EXISTS schedule_events_select_restrict ON public.schedule_events;
