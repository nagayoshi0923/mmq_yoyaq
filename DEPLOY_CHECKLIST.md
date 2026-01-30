# PR #4 デプロイチェックリスト

**最終更新**: 2026-01-31

## 🚨 重要: この順序で実施してください

### ステップ1: データベースマイグレーション適用

#### Supabase Dashboard で実行

1. https://supabase.com/dashboard にアクセス
2. 本番プロジェクトを選択
3. SQL Editor を開く
4. 以下のファイルを順番に実行：

**① 007_fix_cancel_reservation_nullable_customer.sql**
- SQL: [`database/migrations/007_fix_cancel_reservation_nullable_customer.sql`](./database/migrations/007_fix_cancel_reservation_nullable_customer.sql)

**② 008_waitlist_notification_retry_queue.sql**
- SQL: [`database/migrations/008_waitlist_notification_retry_queue.sql`](./database/migrations/008_waitlist_notification_retry_queue.sql)

**③ SEC-P0-02（必須）: 予約作成RPCの安全化**
- SQL: [`supabase/migrations/20260130190000_harden_create_reservation_with_lock_server_pricing.sql`](./supabase/migrations/20260130190000_harden_create_reservation_with_lock_server_pricing.sql)

**④ SEC-P0-02（推奨）: v2 RPC 追加**
- SQL: [`supabase/migrations/20260130_create_reservation_with_lock_v2.sql`](./supabase/migrations/20260130_create_reservation_with_lock_v2.sql)

**⑤ SEC-P1-03（必須）: 監査証跡（reservations_history）追加**
- SQL: [`supabase/migrations/20260130243000_create_reservations_history.sql`](./supabase/migrations/20260130243000_create_reservations_history.sql)

**⑥ SEC-P1-01（必須）: 予約制限のDB強制（締切/上限/件数）**
- SQL: [`supabase/migrations/20260130233000_enforce_reservation_limits_server_side.sql`](./supabase/migrations/20260130233000_enforce_reservation_limits_server_side.sql)

**⑦ SEC-P1-02（必須）: 在庫整合性トリガ（current_participants再計算）**
- SQL: [`supabase/migrations/20260130260000_recalc_current_participants_trigger.sql`](./supabase/migrations/20260130260000_recalc_current_participants_trigger.sql)

**⑧ SEC-P1-XX（必須）: booking_email_queue 冪等性（UNIQUE INDEX）**
- SQL: [`supabase/migrations/20260131003000_booking_email_queue_idempotency.sql`](./supabase/migrations/20260131003000_booking_email_queue_idempotency.sql)

#### 実行確認

- SQL: [`docs/deployment/sql/DEPLOY_ts0_post_migration_checks.sql`](./docs/deployment/sql/DEPLOY_ts0_post_migration_checks.sql)

---

### ステップ2: プレビュー環境で動作確認

#### テスト項目

- [ ] 管理画面にログインできる
- [ ] 予約一覧が表示される
- [ ] スタッフ予約をキャンセル（customer_id = NULL のテスト）
  - エラーが出ないこと
  - 在庫が正しく返却されること
- [ ] 顧客予約をキャンセル
  - エラーが出ないこと
  - 在庫が正しく返却されること
  - キャンセル確認メールが送信されること
- [ ] コンソールエラーがないこと

#### 在庫確認SQL

- SQL: [`docs/deployment/sql/DEPLOY_ts1_inventory_diff_check.sql`](./docs/deployment/sql/DEPLOY_ts1_inventory_diff_check.sql)

---

### ステップ3: PRマージ

プレビュー環境で問題なければ：

```bash
# GitHub PR画面で "Merge pull request" をクリック
# → 本番環境に自動デプロイ
```

---

### ステップ4: 本番環境で最終確認

- [ ] 本番環境でログイン
- [ ] 予約キャンセルが正常に動作
- [ ] **【こっちで必ず確認（手動）】SEC-P0-02 改ざんテスト（ROLLBACK付き）を実施**（Runbook）
  - [ ] `docs/deployment/SEC_P0_02_PROD_DB_CHECK_RUNBOOK.md` の「ポストデプロイ検証」をSQL Editorで実行
  - [ ] （代替）SQL Editor都合で予約行の参照が成立しない場合は **TS-2（定義チェック）** を実行
    - [ ] `./docs/deployment/sql/SEC_P0_02_ts2_check_rpc_def_server_pricing.sql`（期待: 両方 `pass=true`）
- [ ] **【こっちで必ず確認（手動）】SEC-P1-01 予約制限（TS-0）を確認**（Runbook）
  - [ ] `docs/deployment/sql/SEC_P1_01_ts0_check_rpc_defs.sql` を実行
    - **期待結果**: 関数定義に例外コード `P0033`〜`P0038` が含まれる
- [ ] **【こっちで必ず確認（手動）】SEC-P1-02 在庫整合性トリガを確認**（Runbook）
  - [ ] `docs/deployment/sql/SEC_P1_02_ts0_check_trigger.sql` を実行
    - **期待結果**: `trigger_exists=true`
- [ ] **【こっちで必ず確認（手動）】SEC-P1-03 監査証跡を確認**（Runbook）
  - [ ] `docs/deployment/sql/SEC_P1_03_ts0_check_objects.sql` を実行
    - **期待結果**: `reservations_history` と `trg_reservations_history` が存在する
  - [ ] `docs/deployment/sql/SEC_P1_03_test_update_ts1_stepA.sql` → `docs/deployment/sql/SEC_P1_03_test_update_ts1_stepB_rollback.sql` を順に実行
    - **期待結果**: StepA の `pass=true`（かつ StepB で ROLLBACK）
- [ ] **【こっちで必ず確認（手動）】SEC-P1-XX メール送信キューの冪等性を確認**（Runbook）
  - [ ] `docs/deployment/sql/SEC_P1_XX_ts0_check_booking_email_queue_unique.sql` を実行
    - **期待結果**: `unique_index_exists=true`
- [ ] エラーログを確認（Supabase Dashboard → Logs）

---

---

### ステップ5: 在庫整合性チェックの定期実行設定

在庫データ（`current_participants`）の不整合を自動検出・修正するために、定期実行を設定します。

#### オプション A: pg_cron を使用（推奨）

Supabase Dashboard で SQL Editor を開き、以下を実行：

- SQL: [`docs/deployment/sql/DEPLOY_ts2_pg_cron_setup_inventory_consistency.sql`](./docs/deployment/sql/DEPLOY_ts2_pg_cron_setup_inventory_consistency.sql)

#### オプション B: Vercel Cron Jobs を使用

`vercel.json` に以下を追加：

```json
{
  "crons": [
    {
      "path": "/api/check-inventory-consistency",
      "schedule": "0 5 * * *"
    }
  ]
}
```

#### 動作確認

- SQL: [`docs/deployment/sql/DEPLOY_ts2_run_inventory_consistency_check.sql`](./docs/deployment/sql/DEPLOY_ts2_run_inventory_consistency_check.sql)

不整合が見つかった場合はDiscord通知が飛びます。

---

## ⚠️ ロールバック手順（問題が発生した場合）

### データベースのロールバック

- SQL: [`docs/deployment/sql/DEPLOY_ROLLBACK_cancel_reservation_and_waitlist_queue.sql`](./docs/deployment/sql/DEPLOY_ROLLBACK_cancel_reservation_and_waitlist_queue.sql)

### フロントエンドのロールバック

```bash
# mainブランチを前のコミットに戻す
git revert HEAD~7..HEAD
git push origin main
```

---

## 📞 問題発生時の連絡先

- Supabase エラーログ: https://supabase.com/dashboard/project/_/logs
- Vercel デプロイログ: https://vercel.com/nagayoshi0923s-projects/mmq-yoyaq/deployments

