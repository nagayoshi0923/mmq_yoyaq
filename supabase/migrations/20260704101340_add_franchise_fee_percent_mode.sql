-- F-4: FC料金（フランチャイズ手数料）に「売上に対する％」方式を追加する。
--
-- 背景:
-- ・従来 stores.franchise_fee は「FC店舗の公演1件ごとに計上される定額（円）」のみ。
-- ・オーナー要望「売上に対する%にする場合もあるから設定できるようにしてほしい」に対応し、
--   料金方式（定額 / 売上の％）を店舗ごとに選べるようにする。
-- ・franchise_fee_type='fixed'（既定）は従来どおり franchise_fee（円）を使う＝既存行は挙動不変。
-- ・franchise_fee_type='percent' は franchise_fee_percent（%）を公演売上に掛けて算出する。
-- ・冪等（IF NOT EXISTS）。CHECK は名前付き制約にして再実行時の重複を防ぐ。

ALTER TABLE public.stores
  ADD COLUMN IF NOT EXISTS franchise_fee_type text NOT NULL DEFAULT 'fixed';

ALTER TABLE public.stores
  ADD COLUMN IF NOT EXISTS franchise_fee_percent numeric(5, 2);

-- CHECK 制約は IF NOT EXISTS が使えないため、既存を落としてから貼り直す（冪等化）。
ALTER TABLE public.stores
  DROP CONSTRAINT IF EXISTS stores_franchise_fee_type_check;

ALTER TABLE public.stores
  ADD CONSTRAINT stores_franchise_fee_type_check
  CHECK (franchise_fee_type IN ('fixed', 'percent'));

COMMENT ON COLUMN public.stores.franchise_fee_type IS
  'FC料金の方式。fixed=公演1件ごとの定額（franchise_fee 円）、percent=公演売上に対する割合（franchise_fee_percent %）。既定 fixed';
COMMENT ON COLUMN public.stores.franchise_fee_percent IS
  'FC料金が percent 方式のときの割合（%）。例 10.00 = 公演売上の10%。fixed 方式では未使用';
