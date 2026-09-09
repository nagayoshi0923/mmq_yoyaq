-- GMテストと通常の他社公演数を同じシナリオ・年月で保存できない問題の修正
--
-- 原因:
--   performance_type 追加時に unique_key は (..., performance_type) へ更新されたが、
--   旧制約 manual_external_perf_master_unique
--   (organization_id, scenario_master_id, year, month) が残っていた。
--   通常行がある状態で GMテスト行を INSERT すると duplicate key になる。
--
-- 修正:
--   master 側の UNIQUE にも performance_type を含める。

ALTER TABLE public.manual_external_performances
  DROP CONSTRAINT IF EXISTS manual_external_perf_master_unique;

ALTER TABLE public.manual_external_performances
  ADD CONSTRAINT manual_external_perf_master_unique
  UNIQUE (organization_id, scenario_master_id, year, month, performance_type);

COMMENT ON CONSTRAINT manual_external_perf_master_unique ON public.manual_external_performances
  IS '組織・シナリオマスタ・年月・公演種別の組み合わせでユニーク';
