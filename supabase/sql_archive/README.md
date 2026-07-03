# supabase/sql_archive

`supabase/migrations/` に居たタイムスタンプ無し（`14桁_名前.sql` 命名に従わない）SQL の隔離場所。

これらは **supabase CLI に無視されており（`Skipping migration ...`）、DB には一度も適用されていない**。
2025-11〜2026-01 に作られた legacy な debug / repair スクリプトで、実装コード・CI・scripts・config.toml からの参照は無い。

実行する場合は **内容を精査してから手動で** 適用すること。特に ⚠️ 付きは UPDATE / DELETE / ALTER / DROP など破壊的操作を含むため、対象環境・データを確認のうえ慎重に。

## 一覧（19件）

| ファイル | 性質 | 危険操作 |
|----------|------|----------|
| add_cascade_delete_users.sql | ユーザー削除時のカスケード削除設定（孤立データ削除＋外部キー再定義） | ⚠️ |
| add_organization_rls_policies.sql | organization_id ベースのマルチテナント RLS ポリシー追加 | なし |
| add_temporary_venue_columns.sql | stores テーブルに臨時会場用カラムを追加 | なし |
| check_customers_foreign_key.sql | customers の外部キー制約を確認する SELECT 診断 | なし |
| complete_user_setup.sql | handle_new_user トリガー関数＋RLS の完全セットアップ | ⚠️ |
| create_auth_logs_table.sql | 認証イベントログテーブルの作成 | なし |
| debug_user_creation.sql | ユーザー作成問題のデバッグ用 SELECT | なし |
| diagnose_user_role.sql | ロールが customer になる原因の診断 SELECT | なし |
| enable_rls_all_tables.sql | 全テーブルへの RLS 有効化とポリシー設定 | なし |
| fix_customers_foreign_key_cascade.sql | customers.user_id 外部キーを CASCADE に修正 | ⚠️ |
| fix_data_and_foreign_keys.sql | データ不整合修正＋外部キー制約修正 | ⚠️ |
| fix_foreign_key_delete_rules.sql | 外部キーの削除動作（SET NULL 等）を修正 | ⚠️ |
| fix_handle_new_user_trigger.sql | 招待時ロール設定のためトリガー関数を修正 | なし |
| fix_staff_role_from_invited_as.sql | invited_as を参照する形にトリガー関数を修正 | なし |
| fix_users_update_policy.sql | users テーブルの UPDATE ポリシーを修正 | なし |
| manual_fix_staff_role.sql | 招待済みスタッフのロールを手動で staff に変更 | なし |
| refactor_temporary_venues.sql | 臨時会場システムのリファクタ（temporary_date→temporary_dates 移行） | ⚠️ |
| test_trigger_delete_and_reinvite.sql | 既存ユーザーを削除して再招待するトリガーテスト | ⚠️ |
| test_trigger_manually.sql | トリガーロジックを手動実行するテスト | なし |

## 削除済み（git 履歴参照）

以下は実質空だったため隔離せず削除した（git 履歴で復元可能）:

- add_scenario_slug.sql（0 行）
- safe_delete_user_for_testing.sql（0 行）
- force_recreate_user_trigger.sql（コメントのみ / 空行 2 行）
