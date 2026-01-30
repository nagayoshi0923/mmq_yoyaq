## SEC-P1-02（必須）: 在庫整合性（current_participants）検証 Runbook

目的: 予約の作成/変更/キャンセル/日程変更など複数経路があっても、`schedule_events.current_participants` が `reservations` の集計値に追従することを確認する。

### 対象

- 関数: `public.recalc_current_participants_for_event`
- トリガ: `trigger_recalc_participants`（`public.reservations`）

### 1) 存在確認（必須）

Supabase SQL Editor で `docs/deployment/sql/SEC_P1_02_ts0_check_trigger.sql` を実行する。

- **期待結果**: `trigger_exists=true`

### 2) 実地確認（推奨）

予約の作成/キャンセル/人数変更/日程変更を1件ずつ行い、直後に該当公演の `current_participants` と `reservations` 集計が一致することを確認する。
（運用負荷が高い場合は、既存の `check_and_fix_inventory_consistency()` の結果を併用）

