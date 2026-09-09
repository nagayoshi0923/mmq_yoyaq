-- スタッフ×シナリオ紐付けの二重管理を解消するための一度きりのバックフィル
--
-- 背景（本番実測 2026-08-02）:
--   紐付けは2箇所に分かれて保存されている。
--     - staff.special_scenarios / staff.available_scenarios（scenario_masters.id の UUID 配列）
--     - staff_scenario_assignments（結合テーブル）
--   画面の表示元は **結合テーブルのみ**（src/pages/StaffManagement/hooks/useStaffQuery.ts が
--   staff.special_scenarios を結合テーブル由来の値で上書きする）。
--   そのため配列側にしか無い紐付けは画面から見えず、GM候補にも出てこない。
--
--   実測: 結合テーブル 3,050行 / レガシー配列 3,990ペア。
--         配列にあって結合テーブルに無い = 940件。
--         結合テーブルにあって配列に無い = 0件（結合テーブルは配列の完全な部分集合）。
--         影響スタッフ 44名。
--
-- 方針（PO決定 2026-08-02）:
--   「片方になくても片方があれば採用」= 和集合を取る。**削除は一切しない。**
--   対応関係（同期済みスタッフの実データで確認済み）:
--     staff.special_scenarios   -> can_main_gm = true   （画面の「GM可能」）
--     staff.available_scenarios -> is_experienced = true（画面の「体験済み」）
--   gm_experienced_check 制約により両フラグは排他のため、special を先に入れて
--   重複は ON CONFLICT DO NOTHING で既存優先とする。
--
-- 安全性:
--   INSERT のみ。既存行の削除・更新は行わない。
--   投入行は notes で識別でき、必要なら個別に取り消せる。

BEGIN;

-- ① special_scenarios -> GM可能
INSERT INTO public.staff_scenario_assignments
  (staff_id, scenario_id, scenario_master_id, can_main_gm, can_sub_gm, is_experienced,
   assigned_at, organization_id, notes)
SELECT s.id, x.u, x.u, true, false, false, now(), s.organization_id,
       '2026-08-02 二重管理統合バックフィル(special_scenarios)'
FROM public.staff s
CROSS JOIN LATERAL (SELECT unnest(s.special_scenarios)::uuid AS u) x
WHERE s.special_scenarios IS NOT NULL
  AND EXISTS (SELECT 1 FROM public.scenario_masters m WHERE m.id = x.u)
ON CONFLICT (staff_id, scenario_master_id) DO NOTHING;

-- ② available_scenarios -> 体験済み（①で入った分は重複せずスキップされる）
INSERT INTO public.staff_scenario_assignments
  (staff_id, scenario_id, scenario_master_id, can_main_gm, can_sub_gm, is_experienced,
   assigned_at, organization_id, notes)
SELECT s.id, x.u, x.u, false, false, true, now(), s.organization_id,
       '2026-08-02 二重管理統合バックフィル(available_scenarios)'
FROM public.staff s
CROSS JOIN LATERAL (SELECT unnest(s.available_scenarios)::uuid AS u) x
WHERE s.available_scenarios IS NOT NULL
  AND EXISTS (SELECT 1 FROM public.scenario_masters m WHERE m.id = x.u)
ON CONFLICT (staff_id, scenario_master_id) DO NOTHING;

COMMIT;
