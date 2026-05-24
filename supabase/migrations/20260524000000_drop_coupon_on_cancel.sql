-- 20260524000000: coupon_campaigns.on_cancel カラム削除
--
-- on_cancel ('restore' | 'forfeit') は「予約キャンセル時にクーポンを返却するか失効させるか」
-- を表すために 20260523050000 で追加された。
-- しかし実際の仕様では：
--   - 予約作成時：customer_coupon_id を予約に紐付けるだけで消費しない
--   - 「もぎる」（顧客の能動操作・公演直前）で初めて coupon_usages を作成・消費
--   - キャンセル時：そもそも消費されていないので restore/forfeit の判定不要
-- となっており、本カラムは実質ダミー設定（理論上は「もぎった後にキャンセル」のエッジ
-- ケースで効くが、もぎり可能なのは公演 3 時間前〜終了 1 時間後で、その間にキャンセル
-- する運用は無いに等しい）。
-- 設定 UI に並んでいるだけで誤解を招くため、カラムごと削除する。

ALTER TABLE public.coupon_campaigns DROP COLUMN IF EXISTS on_cancel;

DO $$
BEGIN
  RAISE NOTICE '✅ coupon_campaigns.on_cancel を削除しました';
END $$;
