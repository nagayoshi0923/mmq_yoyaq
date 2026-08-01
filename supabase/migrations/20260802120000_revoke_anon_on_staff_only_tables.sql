-- スタッフ／管理画面専用テーブルから anon 権限を全剥奪する
--
-- 背景（本番実測 2026-08-02）:
--   Supabase の既定権限により、以下のテーブルへ anon が
--   SELECT / INSERT / UPDATE / DELETE を保持していた。
--   RLS は有効だが、GRANT が広いこと自体が事故の温床であり、
--   ポリシーを1つ書き間違えた時点で穴になる。
--
-- 使用箇所の全数確認（src/ の anon キークライアント経由）:
--   app_config                            … src 参照 0
--   album_character_records               … src 参照 0
--   manual_pages / manual_blocks          … src 参照 0
--   scenario_import_aliases               … src 参照 0
--   sentry_github_issues                  … src 参照 0
--   email_logs                            … 設定 > メールログ（admin）
--   manual_internal_performance_overrides … ライセンス管理（license_admin）
--   schedule_blocked_slots / _logs        … 貸切予約管理（staff・ADMIN_PATHS）
--   schedule_slot_memos                   … 公演スロットメモ（staff）
--   user_table_preferences                … テーブル列設定（ログイン済みユーザー）
--   → いずれも未ログインから到達する画面が無く、anon 権限は不要。
--
-- 対象外（anon の書き込みが業務上必要なため残す）:
--   contact_inquiries（問い合わせ投稿）
--   private_groups / private_group_members / _candidate_dates / _date_responses /
--   _messages / _survey_responses（ゲストの貸切フロー）
--   private_group_members_pii … ゲスト参加時にトリガー経由で書かれる可能性があるため
--                                本migrationでは触らない（別途トリガーの SECURITY 設定を確認する）
--
-- 影響:
--   authenticated 側の権限は変更しない。スタッフ・管理画面の動作に影響はない。

BEGIN;

REVOKE ALL ON public.app_config                            FROM anon;
REVOKE ALL ON public.album_character_records               FROM anon;
REVOKE ALL ON public.manual_pages                          FROM anon;
REVOKE ALL ON public.manual_blocks                         FROM anon;
REVOKE ALL ON public.manual_internal_performance_overrides FROM anon;
REVOKE ALL ON public.scenario_import_aliases               FROM anon;
REVOKE ALL ON public.sentry_github_issues                  FROM anon;
REVOKE ALL ON public.email_logs                            FROM anon;
REVOKE ALL ON public.schedule_blocked_slots                FROM anon;
REVOKE ALL ON public.schedule_blocked_slot_logs            FROM anon;
REVOKE ALL ON public.schedule_slot_memos                   FROM anon;
REVOKE ALL ON public.user_table_preferences                FROM anon;

COMMIT;
