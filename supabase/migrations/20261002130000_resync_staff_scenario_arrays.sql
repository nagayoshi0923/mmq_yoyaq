-- QW-20261002-006 Phase 1-4（B01）: 旧GM配列（staff.special_scenarios / available_scenarios）を担当表
-- （staff_scenario_assignments）から全員分を再計算して揃える。
-- 配列は既に担当表からの派生値で、直接変更はトリガー sync_staff_to_assignments が拒否する。担当表に変更があった
-- スタッフだけ再計算されるため、変更が無いスタッフには古い要素が残っていた（2026-10-02 本番: 51人中39人、
-- GM 165要素・体験済み 108要素が配列にだけ存在、担当表にだけ存在する要素は 0）。
-- 判断: 担当表が正。配列の古い要素は取り込まない（計画 第5節 5-1）。元の配列は退避表に保存し、rollback で戻せる。

CREATE SCHEMA IF NOT EXISTS archive;

CREATE TABLE IF NOT EXISTS archive.staff_scenario_arrays_backup_20261002 AS
SELECT s.id, s.name, s.special_scenarios, s.available_scenarios, now() AS backed_up_at
FROM public.staff s
WHERE coalesce(s.special_scenarios,'{}'::text[]) IS DISTINCT FROM coalesce((
        SELECT array_agg(DISTINCT a.scenario_master_id::text ORDER BY a.scenario_master_id::text)
        FROM public.staff_scenario_assignments a WHERE a.staff_id = s.id AND (a.can_main_gm OR a.can_sub_gm)), '{}'::text[])
   OR coalesce(s.available_scenarios,'{}'::text[]) IS DISTINCT FROM coalesce((
        SELECT array_agg(DISTINCT a.scenario_master_id::text ORDER BY a.scenario_master_id::text)
        FROM public.staff_scenario_assignments a WHERE a.staff_id = s.id AND a.is_experienced), '{}'::text[]);
-- 退避表は RLS を有効にしポリシーを置かない（service_role と所有者以外は読めない）。
ALTER TABLE archive.staff_scenario_arrays_backup_20261002 ENABLE ROW LEVEL SECURITY;


-- 派生値そのものを書くので、sync_staff_to_assignments の照合（配列 = 担当表）を通る。
UPDATE public.staff s
SET special_scenarios = coalesce((
      SELECT array_agg(DISTINCT a.scenario_master_id::text ORDER BY a.scenario_master_id::text)
      FROM public.staff_scenario_assignments a WHERE a.staff_id = s.id AND (a.can_main_gm OR a.can_sub_gm)), '{}'::text[]),
    available_scenarios = coalesce((
      SELECT array_agg(DISTINCT a.scenario_master_id::text ORDER BY a.scenario_master_id::text)
      FROM public.staff_scenario_assignments a WHERE a.staff_id = s.id AND a.is_experienced), '{}'::text[])
WHERE s.id IN (SELECT id FROM archive.staff_scenario_arrays_backup_20261002);
