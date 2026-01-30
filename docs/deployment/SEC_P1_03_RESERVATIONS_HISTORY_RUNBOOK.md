## SEC-P1-03（必須）: reservations_history（監査証跡）検証 Runbook

目的: `reservations` の変更が **必ず監査ログに残る**こと、かつ **不正な直接書き込みができない**ことを確認する。

### 対象

- テーブル: `public.reservations_history`
- トリガ: `trg_reservations_history`（`public.reservations` に付与）
- トリガ関数: `public.log_reservation_change()`

### 1) 存在確認（必須）

Supabase SQL Editor で `docs/deployment/sql/SEC_P1_03_ts0_check_objects.sql` を実行する。

- **期待結果**:
  - `reservations_history` が存在する
  - `trg_reservations_history` が `public.reservations` に付いている

### 2) ROLLBACK付き動作確認（必須）

Supabase SQL Editor で以下を **順番に** 実行する。

1. `docs/deployment/sql/SEC_P1_03_test_update_ts1_stepA.sql`（UPDATE→履歴が1件増えることを確認）
2. `docs/deployment/sql/SEC_P1_03_test_update_ts1_stepB_rollback.sql`（ロールバック）

- **期待結果**: Step A の `pass=true`
- **副作用**: なし（ROLLBACK）

