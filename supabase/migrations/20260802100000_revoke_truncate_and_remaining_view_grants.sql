-- 🚨 anon / authenticated から TRUNCATE を全面剥奪する
--
-- 【重要】PostgreSQL の行レベルセキュリティ(RLS)は **TRUNCATE には適用されない**。
-- そのため RLS が有効なテーブルであっても、TRUNCATE 権限を持つロールは
-- そのテーブルを**全件削除できる**。
--
-- 本番実測（2026-08-02）で、anon が以下のテーブルに TRUNCATE を保持していた:
--   app_config / email_logs / manual_pages / manual_blocks /
--   manual_internal_performance_overrides / schedule_blocked_slots /
--   schedule_blocked_slot_logs / schedule_slot_memos / scenario_import_aliases /
--   sentry_github_issues / user_table_preferences / album_character_records /
--   private_group_members_pii
-- いずれも Supabase の既定権限で自動付与されたもので、アプリは TRUNCATE を一切使わない
-- （PostgREST は TRUNCATE を発行できないが、GRANT が残っていること自体が事故の温床）。
--
-- 加えて、RLS 非対象のビュー2件に残っていた過剰権限も整理する:
--   - schedule_events_for_availability … 貸切申込・グループ招待（未ログイン到達）が読む
--     → anon の SELECT は維持し、書き込みのみ剥奪
--   - schedule_events_staff_view … スタッフ画面専用（authenticated のみ）
--     → anon から全剥奪

BEGIN;

-- ① TRUNCATE の全面剥奪（アプリは一切使用しない）
REVOKE TRUNCATE ON ALL TABLES IN SCHEMA public FROM anon, authenticated;

-- ② 今後作られるオブジェクトに TRUNCATE を自動付与させない
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE TRUNCATE ON TABLES FROM anon, authenticated;

-- ③ RLS 非対象ビューの整理
REVOKE INSERT, UPDATE, DELETE, REFERENCES, TRIGGER
  ON public.schedule_events_for_availability FROM anon, authenticated;
GRANT SELECT ON public.schedule_events_for_availability TO anon, authenticated;

REVOKE ALL ON public.schedule_events_staff_view FROM anon;
REVOKE INSERT, UPDATE, DELETE, REFERENCES, TRIGGER
  ON public.schedule_events_staff_view FROM authenticated;
GRANT SELECT ON public.schedule_events_staff_view TO authenticated;

COMMIT;
