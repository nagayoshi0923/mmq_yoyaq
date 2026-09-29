# supabase/schemas/ — テーブルスキーマの正規定義

## 概要

> **テーブル定義（カラム・型・制約）の正本**はこのディレクトリの `.sql` です（現在 **56テーブル + 1ビュー = 57ファイル**）。
> 本番全体（165表）の構造・関連・画面対応の俯瞰は **MMQ 構造アトラス**（https://github.com/nagayoshi0923/mmq-model-atlas 、2026-09-28 版）を参照してください（アトラスは俯瞰資料であり、テーブル定義の正本ではありません）。

このディレクトリには、各テーブルの **現在の正規定義** が格納されています。
305+のマイグレーションファイルを探し回る代わりに、ここを見ればテーブルの全カラム・型・制約が分かります。

## ルール

- **カラム追加・変更時**: マイグレーション作成と同時に、該当する `.sql` ファイルも更新すること
- **新テーブル作成時**: `schemas/` にも定義ファイルを追加すること
- **schemas/ のみの更新は禁止**: 実際のDB変更は必ずマイグレーションで行う（schemas/ は参照用）

## 管理対象（56テーブル + 1ビュー）

| ファイル | テーブル | 備考 |
|----------|---------|------|
| `business_hours_settings.sql` | business_hours_settings | 営業時間 |
| `cancellation_billing.sql` | cancellation_billing | |
| `coupon_calendar_months.sql` | coupon_calendar_months | |
| `coupon_murder_mystery_scope.sql` | coupon_murder_mystery_scope | |
| `coupon_rules.sql` | coupon_rules | |
| `customers.sql` | customers | 顧客管理 |
| `email_settings_private_reminder.sql` | email_settings_private_reminder | |
| `event_staff_participations.sql` | event_staff_participations | |
| `global_settings.sql` | global_settings | 全体設定 |
| `gm_availability_responses.sql` | gm_availability_responses | GM確認 |
| `kit_transfer_identity.sql` | kit_transfer_identity | |
| `license_partner_contracts.sql` | license_partner_contracts | |
| `license_partner_monthly_reports.sql` | license_partner_monthly_reports | |
| `license_partner_stores.sql` | license_partner_stores | |
| `license_performance_summary.sql` | license_performance_summary | |
| `operating_setting_overrides.sql` | operating_setting_overrides | |
| `organization_recruitment_settings.sql` | organization_recruitment_settings | |
| `organization_scenarios.sql` | organization_scenarios | カラム追加が多い重要テーブル |
| `organization_scenarios_with_master.sql` | （ビュー） | ビュー定義 |
| `organization_signup_claims.sql` | organization_signup_claims | |
| `performance_judgment_deadlines.sql` | performance_judgment_deadlines | |
| `performance_recruitment_deadlines.sql` | performance_recruitment_deadlines | |
| `performance_recruitment_notices.sql` | performance_recruitment_notices | |
| `performance_recruitment_withdrawals.sql` | performance_recruitment_withdrawals | |
| `private_booking_approval_deliveries.sql` | private_booking_approval_deliveries | |
| `private_booking_approval_requests.sql` | private_booking_approval_requests | |
| `private_booking_discord_rooms.sql` | private_booking_discord_rooms | |
| `private_booking_pricing_snapshots.sql` | private_booking_pricing_snapshots | |
| `private_booking_rejection_deliveries.sql` | private_booking_rejection_deliveries | |
| `private_coupon_claim_links.sql` | private_coupon_claim_links | |
| `private_delivery_resolutions.sql` | private_delivery_resolutions | |
| `private_group_browser_access.sql` | private_group_browser_access | |
| `private_group_candidate_add_requests.sql` | private_group_candidate_add_requests | |
| `private_group_candidate_dates.sql` | private_group_candidate_dates | 候補日 |
| `private_group_guest_sessions.sql` | private_group_guest_sessions | |
| `private_group_members.sql` | private_group_members | グループメンバー |
| `private_group_members_pii.sql` | private_group_members_pii | |
| `private_group_survey_deadlines.sql` | private_group_survey_deadlines | |
| `private_group_survey_deliveries.sql` | private_group_survey_deliveries | |
| `private_groups.sql` | private_groups | 貸切グループ |
| `public_scenarios.sql` | public_scenarios | |
| `recruitment_x_posts.sql` | recruitment_x_posts | |
| `reservation_settings.sql` | reservation_settings | |
| `reservations.sql` | reservations | 予約データ |
| `scenario_masters.sql` | scenario_masters | マスターデータ |
| `scenario_recruitment_setting_history.sql` | scenario_recruitment_setting_history | |
| `schedule_event_staff_assignments.sql` | schedule_event_staff_assignments | |
| `schedule_events.sql` | schedule_events | 空き判定の根幹 |
| `scheduled_reminder_deliveries.sql` | scheduled_reminder_deliveries | |
| `staff.sql` | staff | スタッフ管理 |
| `staff_account_access.sql` | staff_account_access | |
| `staff_checkins.sql` | staff_checkins | |
| `staff_scenario_assignment_history.sql` | staff_scenario_assignment_history | |
| `staff_scenario_assignments.sql` | staff_scenario_assignments | GM割当 |
| `store_scenario_license_contracts.sql` | store_scenario_license_contracts | |
| `store_travel_times.sql` | store_travel_times | 店舗間移動時間マスタ |
| `stores.sql` | stores | 店舗管理 |

## フロントエンド未使用テーブル（バックエンドのみ使用）

以下のテーブルは `src/` からの直接参照がなく、Edge Functions・トリガー・RPC等バックエンドでのみ使用されています。
削除は不要ですが、`schemas/` での管理対象外としています。

| テーブル | 用途 |
|---------|------|
| `store_basic_settings` | マイグレーションで定義・トリガーのみ（DDL/RLS/trigger） |
| `reservations_history` | `reservations` テーブルの変更履歴トリガーで書き込み |
| `rate_limit_log` | Edge Functions (`_shared/security.ts`) でレート制限に使用 |
| `audit_logs` | Edge Functions + 監査トリガーで各テーブルの変更を記録 |
| `discord_interaction_dedupe` | Discord Bot Edge Functions で重複排除に使用 |
| `sentry_github_issues` | Sentry→GitHub連携 Edge Function で使用 |
