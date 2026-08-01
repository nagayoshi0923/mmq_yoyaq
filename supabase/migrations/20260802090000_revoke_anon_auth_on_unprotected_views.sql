-- RLS の効かないビューに付いた anon / authenticated の過剰権限を剥奪する
--
-- 背景（本番実測 2026-08-02）:
--   Supabase の既定権限により、後から作られたビューには anon / authenticated へ
--   ALL（SELECT/INSERT/UPDATE/DELETE/TRUNCATE...）が自動的に付く。
--   ビューは RLS の対象外（owner=postgres 実行）のため、GRANT がそのまま可視範囲になる。
--
--   実測での露出:
--     - customer_reservation_history … anon から 3,530 行。customer_name / email / phone /
--       reservation_number / final_price を含む顧客PIIの全件ダンプ。アプリからの参照は 0 箇所。
--     - reservation_summary … anon から 14,152 行。参照は api/reservations.ts（service_role）のみ。
--     - license_performance_summary … license_amount / total_license_fee。
--       参照は api/external-reports.ts（service_role）のみ。
--     - scenarios_v2 … アプリからの参照 0 箇所。
--     - customer_org_stats … notes / total_spent / visit_count。anon が使う経路なし。
--
-- 方針:
--   顧客向け公開ページが実際に読んでいる schedule_events_public / stores_public だけは
--   anon の SELECT を残し、書き込み権限のみ剥奪する。
--   それ以外は anon を全剥奪し、参照が service_role API だけのものは authenticated からも剥奪する。
--
-- 影響:
--   剥奪対象はいずれもアプリの anon / authenticated 経路から参照されていないため、
--   顧客・スタッフ画面への影響はない。service_role（api/）からのアクセスは GRANT の対象外で不変。

BEGIN;

-- ── 参照ゼロ、または service_role API 専用のビュー ──
REVOKE ALL ON public.customer_reservation_history  FROM anon, authenticated;
REVOKE ALL ON public.reservation_summary           FROM anon, authenticated;
REVOKE ALL ON public.license_performance_summary   FROM anon, authenticated;
REVOKE ALL ON public.scenarios_v2                  FROM anon, authenticated;

-- ── anon が使う経路の無いテーブル（RLS は有効だが GRANT が過剰） ──
REVOKE ALL ON public.customer_org_stats FROM anon;

-- ── 顧客向け公開ページが読むビュー: SELECT は残し、書き込みだけ剥奪 ──
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON public.schedule_events_public, public.stores_public
  FROM anon, authenticated;
GRANT SELECT ON public.schedule_events_public, public.stores_public TO anon, authenticated;

COMMIT;
