## SEC-P0-04（必須）: 貸切承認のアトミック性検証 Runbook

目的: 貸切承認が **1RPCでアトミックに完結**し、途中失敗で不整合（confirmedだが公演なし等）が残らないことを本番DBで確認する。

### 前提

- 対象RPC: `approve_private_booking`
- 対象データ: `reservations.reservation_source = 'web_private'`

### 1) RPCの存在とシグネチャ確認（必須）

Supabase SQL Editor で `docs/deployment/sql/SEC_P0_04_ts0_check_rpc.sql` を実行する。

- **期待結果**: `approve_private_booking` の `regprocedure` が1行以上返り、引数に `p_candidate_datetimes jsonb` が含まれる

### 2) ROLLBACK付きアトミック動作テスト（必須）

Supabase SQL Editor で以下を **順番に** 実行する。

1. `docs/deployment/sql/SEC_P0_04_test_approve_ts1_stepA.sql`（結果表示）
2. `docs/deployment/sql/SEC_P0_04_test_approve_ts1_stepB_rollback.sql`（ロールバック）

- **期待結果**: `pass = true` が返る
- **副作用**: なし（トランザクション内で `ROLLBACK`）

### トラブルシュート

- `Success. No rows returned`:
  - 最後が `ROLLBACK` だけだと結果が表示されないことがあるため、Step A/Step B に分割している。
- `UNAUTHORIZED (P0010)`:
  - 対象組織のスタッフユーザーの `staff.user_id` が取れない可能性。SQL内の選択ロジックを満たすデータがあるか確認。
- `SLOT_ALREADY_OCCUPIED (P0019)`:
  - 選んだ候補枠に既存公演がある。別の `web_private` リクエスト/候補を選ぶ必要がある（SQLの選択条件を調整）。

