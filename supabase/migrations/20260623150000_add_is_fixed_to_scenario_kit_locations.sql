-- キット移動計画: 「固定（移動させない）」をキット番号ごとに持つ
-- 仕様: docs/design/kit-transfer-planning.md
-- これまで stores.kit_fixed（店舗単位）だったが、シナリオのキット番号ごとに固定したいので
-- scenario_kit_locations 行ごとのフラグに変更する。
ALTER TABLE public.scenario_kit_locations
  ADD COLUMN IF NOT EXISTS is_fixed boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.scenario_kit_locations.is_fixed IS
  '移動計画で動かさない固定キット（キット番号ごと）。true=固定';
