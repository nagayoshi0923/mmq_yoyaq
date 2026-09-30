# supabase/schemas/ — テーブルスキーマの正規定義

## 概要

> 対象は下記の15テーブル＋1ビューのみです。本番全体（165表）の構造・関連・画面対応は **MMQ 構造アトラス**（https://github.com/nagayoshi0923/mmq-model-atlas 、2026-09-28 版）を参照してください。

このディレクトリには、各テーブルの **現在の正規定義** が格納されています。
ここはリポジトリで管理する参照定義です。全テーブルの網羅や実環境との一致は保証しません。変更前には対象環境の現行定義と適用履歴を照合してください。

## ルール

- **カラム追加・変更時**: マイグレーション作成と同時に、該当する `.sql` ファイルも更新すること
- **新テーブル作成時**: `schemas/` にも定義ファイルを追加すること
- **schemas/ のみの更新は禁止**: 実際のDB変更は必ずマイグレーションで行う（schemas/ は参照用）

## 管理対象テーブル（15テーブル + 1ビュー）

| ファイル | テーブル | 備考 |
|----------|---------|------|
| `organization_scenarios.sql` | organization_scenarios | カラム追加が多い重要テーブル |
| `schedule_events.sql` | schedule_events | 空き判定の根幹 |
| `reservations.sql` | reservations | 予約データ |
| `scenario_masters.sql` | scenario_masters | マスターデータ |
| `stores.sql` | stores | 店舗管理 |
| `store_travel_times.sql` | store_travel_times | 店舗間移動時間マスタ |
| `customers.sql` | customers | 顧客管理 |
| `private_groups.sql` | private_groups | 貸切グループ |
| `private_group_candidate_dates.sql` | private_group_candidate_dates | 候補日 |
| `private_group_members.sql` | private_group_members | グループメンバー |
| `staff.sql` | staff | スタッフ管理 |
| `staff_scenario_assignments.sql` | staff_scenario_assignments | GM割当 |
| `gm_availability_responses.sql` | gm_availability_responses | GM確認 |
| `global_settings.sql` | global_settings | 全体設定 |
| `business_hours_settings.sql` | business_hours_settings | 営業時間 |
| `organization_scenarios_with_master.sql` | ビュー | ビュー定義 |

## フロントエンド未使用テーブル（バックエンドのみ使用）

以下のテーブルは `src/` からの直接参照がなく、Edge Functions・トリガー・RPC等バックエンドでのみ使用されています。
フロントから直接使われないことは削除の根拠にしません。管理対象は上記の現在の一覧を参照してください。

| テーブル | 用途 |
|---------|------|
| `store_basic_settings` | マイグレーションで定義・トリガーのみ（DDL/RLS/trigger） |
| `reservations_history` | `reservations` テーブルの変更履歴トリガーで書き込み |
| `rate_limit_log` | Edge Functions (`_shared/security.ts`) でレート制限に使用 |
| `audit_logs` | Edge Functions + 監査トリガーで各テーブルの変更を記録 |
| `discord_interaction_dedupe` | Discord Bot Edge Functions で重複排除に使用 |
| `sentry_github_issues` | Sentry→GitHub連携 Edge Function で使用 |
