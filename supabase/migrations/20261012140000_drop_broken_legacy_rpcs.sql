-- 動かない古い関数を 2 つ消す（npm run test:rpcs で以前から失敗していた 2 件）。
--
-- 1) calculate_cancellation_fee(uuid)
--    reservations に無い列 is_private_booking（この列は schedule_events 側）を読むため、
--    作られた 20260404100000 から一度も正しく動いていない（呼ぶと必ず 42703 で失敗）。
--    中身も現行のキャンセル規定と違う（通常公演の既定が「24時間前50%・開演100%」、
--    貸切でも参加者合計で計算、予約時に固定した規定ではなく今の店舗設定を読む）。
--    画面・サーバー・定期処理のどこからも呼んでおらず（20261006170000 で service_role 限定）、
--    キャンセル料の計算は src/lib/cancellationPolicy.ts（calculateCancellation）と
--    予約時に固定した規定（reservations.cancellation_policy_*）が正。直さずに消す。
--
-- 2) admin_recalculate_reservation_prices(uuid)（引数 1 つの版）
--    20260201210000 で、既にあった (uuid, text[] DEFAULT NULL) 版と並べて作られたため、
--    引数 1 つで呼ぶと「どちらの版か決められない」(42725) になり、呼べない状態だった。
--    サーバー（api/_lib/reservations/update.ts）は引数 2 つの版を呼んでいる。
--    消すと、引数 1 つの呼び出しも 2 つの版（組織の確認つき、20261006180000）に届く。
DROP FUNCTION IF EXISTS public.calculate_cancellation_fee(uuid);
DROP FUNCTION IF EXISTS public.admin_recalculate_reservation_prices(uuid);
