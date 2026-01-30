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

#### `NO_ELIGIBLE_PRIVATE_REQUEST` が出た場合（必須対応）

テスト対象となる「未承認の貸切リクエスト」が本番DBに存在しない。

1. `docs/deployment/sql/SEC_P0_04_ts0_5_check_private_request_inventory.sql` を実行して、`reservation_source='web_private'` の件数とステータス分布を確認
2. 0件だった場合は、**運用上の検証用に1件だけ** 貸切リクエストを作成してから再実行する
   - 例: 管理画面/貸切申請導線から、テスト用メールアドレスで `web_private` を1件作成（承認前の状態で止める）

### トラブルシュート

- `Success. No rows returned`:
  - 最後が `ROLLBACK` だけだと結果が表示されないことがあるため、Step A/Step B に分割している。
- `UNAUTHORIZED (P0010)`:
  - 対象組織のスタッフユーザーの `staff.user_id` が取れない可能性。SQL内の選択ロジックを満たすデータがあるか確認。
- `SLOT_ALREADY_OCCUPIED (P0019)`:
  - 選んだ候補枠に既存公演がある。別の `web_private` リクエスト/候補を選ぶ必要がある（SQLの選択条件を調整）。

