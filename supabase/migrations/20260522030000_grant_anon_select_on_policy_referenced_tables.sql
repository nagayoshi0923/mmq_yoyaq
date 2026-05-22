-- anon が SELECT 可能なテーブルの RLS policy が、anon に GRANT のないテーブルを参照していると
-- planner が permission denied (42501) を投げて PostgREST が 401 を返す時限爆弾になる。
--
-- 該当監査結果 (2026-05-22):
--   anon触れる host                       | refs anon-blocked
--   ------------------------------------------------------------------
--   album_character_records              | customers
--   customer_org_stats                   | customers
--   email_logs                           | users
--   manual_internal_performance_overrides| users
--   private_group_messages               | staff      ← 同 Phase 2 由来
--   private_group_survey_responses       | staff
--   scenario_characters                  | online_scenarios
--   schedule_slot_memos                  | staff
--
-- 修正:
--   staff / users / customers / online_scenarios の SELECT を anon に GRANT する。
--   それぞれの RLS は anon を引き続き完全にブロックする（online_scenarios は設計通り
--   is_published=true のみ閲覧許可、これは元々 RLS でそう書かれている）。
--
--   各 RLS の anon 実効挙動:
--     - staff:    auth.uid() 系条件のみ → 0 行
--     - users:    is_admin / id=auth.uid() → 0 行
--     - customers: user_id=auth.uid() / staff_or_admin / license_admin → 0 行
--     - online_scenarios: is_published=true は anon でも参照可（公開済みのみ）
--
-- 関連事故: 20260522020000 (Phase 2 RLS が anon staff GRANT 不足で 401 を起こした件)
--           [[feedback-no-silent-scope-creep]]

GRANT SELECT ON public.staff TO anon;
GRANT SELECT ON public.users TO anon;
GRANT SELECT ON public.customers TO anon;
GRANT SELECT ON public.online_scenarios TO anon;
