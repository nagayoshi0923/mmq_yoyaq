# リリース前チェックリスト

**作成日**: 2026-01-13  
**最終更新**: 2026-01-31  
**対象システム**: MMQ Yoyaq（マーダーミステリー店舗管理システム）

---

## 📋 チェックリストの使い方

このチェックリストは、本番環境へのリリース前に**必ず全ての項目を確認**してください。
各項目を確認したら `[ ]` を `[x]` にチェックしてください。

**重要**: チェックリストの項目は優先度順に並んでいます。🔴 高優先度項目は絶対にスキップしないでください。

---

## 🔴 高優先度（必須確認項目）

### 1. セキュリティチェック

#### 1.1 認証・認可
- [ ] Supabase認証情報が環境変数から取得されている（ハードコードされていない）
  - [ ] `src/lib/supabase.ts` でフォールバック値が削除されている
  - [ ] 環境変数未設定時にエラーが投げられる
- [ ] 全Edge Functionsで認証チェックが実装されている
  - [ ] `delete-user`: 管理者認証必須 ✅
  - [ ] `invite-staff`: 管理者認証必須 ✅
  - [ ] `send-email`: admin/staff認証必須 ✅
- [ ] CORS設定が適切（`Access-Control-Allow-Origin: *` が使用されていない）
  - [ ] 全20 Edge Functionsで `getCorsHeaders()` を使用 ✅
- [ ] セキュリティヘッダーが設定されている
  - [ ] HSTS ✅
  - [ ] X-Frame-Options ✅
  - [ ] X-Content-Type-Options ✅
  - [ ] Referrer-Policy ✅
  - [ ] Permissions-Policy ✅

#### 1.2 マルチテナント対応（organization_id）
- [ ] 全INSERT/UPSERT操作で `organization_id` が設定されている
  - [ ] 273箇所のorganization_idフィルタが実装済み ✅
- [ ] 全SELECT操作で `organization_id` フィルタが追加されている（推奨）
- [ ] RLS（Row Level Security）が全27テーブルで有効化されている ✅
- [ ] 他組織のデータが表示されないことを確認
  - [ ] テスト用の複数組織で動作確認済み

#### 1.3 機密情報の保護
- [ ] ログに機密情報が出力されていない
  - [ ] `maskEmail()`, `maskName()`, `maskPhone()` が使用されている ✅
- [ ] 環境変数がGitにコミットされていない
  - [ ] `.env.local` が `.gitignore` に含まれている
- [ ] Supabase Secretsが適切に設定されている
  - [ ] `RESEND_API_KEY` が設定されている
  - [ ] `GOOGLE_APPS_SCRIPT_URL` が設定されている（必要に応じて）

### 2. 型安全性チェック

- [ ] TypeScriptの型チェックが成功する
  ```bash
  npm run typecheck
  ```
- [ ] `as any` の使用が最小限である（53箇所 → 削減推奨）
  - [ ] 重要なAPIファイル（`src/lib/api.ts`）で型安全になっている
- [ ] 型定義が最新である
  - [ ] `src/types/index.ts` がデータベーススキーマと一致している
- [ ] Supabaseクエリの結果に適切な型アサーションが行われている

### 3. ビルド・検証チェック

- [ ] ビルドが成功する
  ```bash
  npm run build
  ```
- [ ] Lintが成功する（警告100件以内）
  ```bash
  npm run lint
  ```
- [ ] 検証スクリプトが全て成功する
  ```bash
  npm run verify
  ```
- [ ] 本番環境でのビルドが成功する
  - [ ] Vercelでのビルドログを確認

### 4. データベース整合性チェック

- [ ] マイグレーションが全て適用されている
  - [ ] `supabase/migrations/` の全ファイルが適用済み
- [ ] RLSポリシーが正しく設定されている
  - [ ] 全27テーブルでRLSが有効
  - [ ] ポリシーが期待通りに動作する
- [ ] 外部キー制約が正しく設定されている
  - [ ] `ON UPDATE RESTRICT / ON DELETE RESTRICT` が設定されている
- [ ] 一意制約が設定されている
  - [ ] `customers.user_id` UNIQUE
  - [ ] `customers.email` UNIQUE
  - [ ] `reservations.reservation_number` UNIQUE
  - [ ] `staff_scenario_assignments (staff_id, scenario_id)` PRIMARY KEY
- [ ] インデックスが適切に設定されている
  - [ ] `organization_id` カラムにインデックスがある

#### 4.1 SEC-P0-02（必須）: 予約作成RPCの本番検証（Runbook）

**目的**: 料金/日時の改ざん（API直叩き）を確実に防げていることを、毎回同じ手順で確認する。

- [ ] **【こっちで必ず確認（手動）】Runbookを実行した**（シグネチャ/定義/適用済みマイグレーション確認）
  - [ ] `docs/deployment/SEC_P0_02_PROD_DB_CHECK_RUNBOOK.md` の手順(1)〜(4)を実施
- [ ] **【こっちで必ず確認（手動）】改ざんテスト（ROLLBACK付き）を実行し、成功した**
  - [ ] Runbook末尾の「ポストデプロイ検証（必須）: 改ざんテスト（ROLLBACK付き）」を実施
  - [ ] 旧RPC（create_reservation_with_lock）が **サーバー計算値**で上書きしている
  - [ ] v2 RPC（create_reservation_with_lock_v2）が存在し、実行できる
  - [ ] （代替）SQL Editor都合で予約行の参照が成立しない場合は **TS-2（定義チェック）** を実行
    - [ ] `docs/deployment/sql/SEC_P0_02_ts2_check_rpc_def_server_pricing.sql`（期待: 両方 `pass=true`）

#### 4.2 SEC-P1-01（必須）: 予約制限（締切/上限/件数）検証（Runbook）

**目的**: 予約制限がフロント依存のfail-openにならず、DB/RPC側でfail-closedに強制されていることを確認する。

- [ ] **【こっちで必ず確認（手動）】Runbookを実行した**（本番DBの関数定義に制限強制が入っていることを確認）
  - [ ] `docs/deployment/SEC_P1_01_RESERVATION_LIMITS_RUNBOOK.md` の TS-0 を実施
  - [ ] `docs/deployment/sql/SEC_P1_01_ts0_check_rpc_defs.sql` を実行
    - **期待結果**: 関数定義に例外コード（`P0033`〜`P0038`）が含まれる（= DB側で制限を強制している）

#### 4.3 SEC-P1-02（必須）: 在庫整合性（current_participants）検証（Runbook）

**目的**: 予約の作成/変更/キャンセル/日程変更など複数経路があっても、`schedule_events.current_participants` が `reservations` の集計値に追従することを確認する。

- [ ] **【こっちで必ず確認（手動）】Runbookを実行した**（トリガ/関数の存在確認）
  - [ ] `docs/deployment/SEC_P1_02_INVENTORY_CONSISTENCY_RUNBOOK.md` の TS-0 を実施
  - [ ] `docs/deployment/sql/SEC_P1_02_ts0_check_trigger.sql` を実行
    - **期待結果**: `trigger_exists=true`
- [ ] 実地確認（推奨）
  - [ ] 予約作成/キャンセル/人数変更/日程変更を各1件実施し、直後に `current_participants` と集計値が一致することを確認

#### 4.4 SEC-P1-03（必須）: reservations_history（監査証跡）検証（Runbook）

**目的**: `reservations` の変更が **必ず監査ログに残る**こと、かつ **不正な直接書き込みができない**ことを確認する。

- [ ] **【こっちで必ず確認（手動）】Runbookを実行した**（存在確認 + ROLLBACK付き動作確認）
  - [ ] `docs/deployment/SEC_P1_03_RESERVATIONS_HISTORY_RUNBOOK.md` の TS-0/TS-1 を実施
  - [ ] `docs/deployment/sql/SEC_P1_03_ts0_check_objects.sql` を実行
    - **期待結果**: `reservations_history` と `trg_reservations_history` が存在する
  - [ ] `docs/deployment/sql/SEC_P1_03_test_update_ts1_stepA.sql` → `docs/deployment/sql/SEC_P1_03_test_update_ts1_stepB_rollback.sql` を順に実行
    - **期待結果**: StepA の `pass=true`（かつ StepB で ROLLBACK）

#### 4.5 SEC-P1-XX（必須）: 冪等性（予約作成/メール送信）検証（Runbook）

**目的**: 通信断・リトライ・二重クリックがあっても、予約作成/メール送信が二重にならないことを確認する。

- [ ] **【こっちで必ず確認（手動）】Runbookを実行した**（メール送信キューの一意制約確認）
  - [ ] `docs/deployment/SEC_P1_XX_IDEMPOTENCY_RUNBOOK.md` の手順を実施
  - [ ] `docs/deployment/sql/SEC_P1_XX_ts0_check_booking_email_queue_unique.sql` を実行
    - **期待結果**: `unique_index_exists=true`

### 5. 重要機能の動作確認

#### 5.1 スケジュール重複防止機能
- [ ] 同じ日付・店舗・時間帯に複数の公演が登録されない
  - [ ] `src/hooks/useEventOperations.ts` の `checkConflict` が動作する
  - [ ] `handleSavePerformance` で重複チェックが実行される
- [ ] 重複時の警告モーダルが表示される
- [ ] 編集モード時に編集中の公演自身が除外される

#### 5.2 貸切リクエスト承認時の競合チェック
- [ ] `schedule_events` テーブルをチェックしている ✅
- [ ] `reservations` テーブル（status='confirmed'）もチェックしている ✅
- [ ] 店舗とGMの両方で競合を検出できる
- [ ] 選択不可の店舗・GMに「予約済み」と表示される

#### 5.3 その他の重要機能
- [ ] 予約作成・更新・削除が正常に動作する
- [ ] スケジュール管理が正常に動作する
- [ ] スタッフ管理が正常に動作する
- [ ] シナリオ管理が正常に動作する
- [ ] 売上管理・分析機能が正常に動作する

---

## 🟡 中優先度（リリース前に確認推奨）

### 6. パフォーマンスチェック

- [ ] N+1クエリが修正されている
  - [ ] `src/lib/api.ts` の `scheduleApi.getByMonth()` でバッチクエリを使用
- [ ] setTimeoutのクリーンアップが実装されている（34箇所）
  - [ ] useEffect内のsetTimeoutに `clearTimeout` が設定されている
- [ ] 大量データでの動作確認
  - [ ] 100件以上の予約データで動作確認
  - [ ] 100件以上のスケジュールデータで動作確認
- [ ] ページ読み込み速度が許容範囲内
  - [ ] 主要ページの初回読み込みが3秒以内

### 7. エラーハンドリングチェック

- [ ] エラーハンドリングが統一されている
  - [ ] `ApiError` クラスが一貫して使用されている
  - [ ] エラーメッセージがユーザーフレンドリーである
- [ ] catchブロックでエラーが適切に処理されている
  - [ ] エラーが完全に無視されていない（最低限loggerで記録）
- [ ] エラーバウンダリーが設定されている
  - [ ] React ErrorBoundaryが実装されている

### 8. ログ・デバッグコードチェック

- [ ] console.log/console.errorが本番環境で出力されない
  - [ ] 208箇所のconsole.logを `logger` ユーティリティに置換（推奨）
  - [ ] 本番環境でloggerが適切に動作する
- [ ] デバッグコードが削除されている
  - [ ] alert()が残っていない（Toastに置換推奨）
  - [ ] テスト用のハードコードされた値が残っていない

### 9. 環境変数チェック

- [ ] 本番環境の環境変数が設定されている
  - [ ] `VITE_SUPABASE_URL` が設定されている
  - [ ] `VITE_SUPABASE_ANON_KEY` が設定されている
  - [ ] `VITE_APP_ENV=production` が設定されている（必要に応じて）
- [ ] Edge Functionsの環境変数が設定されている
  - [ ] `RESEND_API_KEY` がSupabase Secretsに設定されている
  - [ ] `GOOGLE_APPS_SCRIPT_URL` が設定されている（必要に応じて）
- [ ] 環境変数の説明が `env.example` に記載されている
  - [ ] 必要な環境変数が全て記載されている

### 10. ドキュメントチェック

- [ ] ページドキュメントが最新である
  - [ ] `docs/pages.md` が最新のページ構成と一致している
  - [ ] 各ページコンポーネントにJSDocコメントがある
- [ ] 重要機能のドキュメントが最新である
  - [ ] `docs/development/critical-features.md` が最新である
- [ ] セットアップドキュメントが最新である
  - [ ] `docs/setup/` の手順が正しい
- [ ] APIドキュメントが最新である（必要に応じて）

### 11. UI/UXチェック

- [ ] レスポンシブデザインが適切に動作する
  - [ ] モバイル（375px）で動作確認
  - [ ] タブレット（768px）で動作確認
  - [ ] デスクトップ（1920px）で動作確認
- [ ] アクセシビリティが確保されている
  - [ ] キーボードナビゲーションが動作する
  - [ ] スクリーンリーダーで読み上げ可能（推奨）
- [ ] ローディング状態が適切に表示される
- [ ] エラーメッセージが適切に表示される
- [ ] Toast通知が適切に動作する

### 12. ブラウザ互換性チェック

- [ ] Chrome（最新版）で動作確認
- [ ] Firefox（最新版）で動作確認
- [ ] Safari（最新版）で動作確認
- [ ] Edge（最新版）で動作確認
- [ ] モバイルブラウザ（iOS Safari、Chrome Mobile）で動作確認

---

## 🟢 低優先度（リリース後に対応可）

### 13. コード品質改善（継続的改善）

- [ ] 大きすぎるファイルの分割
  - [ ] `src/lib/api.ts` (1942行) を機能ごとに分割
  - [ ] `src/contexts/AuthContext.tsx` (720行) を分割
- [ ] 重複コードの統合
  - [ ] 時間帯判定ロジックを `src/utils/dateUtils.ts` に統一
- [ ] TODOコメントの整理
  - [ ] 17箇所のTODOをIssue化
- [ ] tsconfig.jsonの厳格化
  - [ ] `strict: true` に移行（段階的）

### 14. テスト追加（継続的改善）

- [ ] E2Eテストの追加
  - [ ] 主要導線（予約・キャンセル）のE2Eテスト
  - [ ] `npm run test:e2e` が成功する
- [ ] ユニットテストの追加（将来）
- [ ] 結合テストの追加（将来）

### 15. パフォーマンス最適化（継続的改善）

- [ ] バンドルサイズの最適化
  - [ ] 未使用のimportを削除
  - [ ] コード分割の実装
- [ ] 画像最適化（必要に応じて）
- [ ] キャッシュ戦略の最適化

---

## 🚀 デプロイ前の最終確認

### 16. デプロイ設定チェック

- [ ] Vercel設定が正しい
  - [ ] `vercel.json` の設定が適切
  - [ ] ビルドコマンドが `npm run build` である
  - [ ] 出力ディレクトリが `dist` である
- [ ] リダイレクト・リライト設定が正しい
  - [ ] SPA用のリライト設定が適切
- [ ] 環境変数がVercelに設定されている
  - [ ] 本番環境の環境変数が設定されている
  - [ ] プレビュー環境の環境変数が設定されている

### 17. リリースノート作成

- [ ] リリースノートが作成されている
  - [ ] 新機能の説明
  - [ ] バグ修正の説明
  - [ ] 破壊的変更の説明（あれば）
  - [ ] 既知の問題の説明（あれば）

### 18. ロールバック計画

- [ ] ロールバック手順が文書化されている
  - [ ] データベースマイグレーションのロールバック手順
  - [ ] コードのロールバック手順（Git tag使用）
- [ ] ロールバックが可能な状態である
  - [ ] 前のバージョンに戻せる状態

---

## 📝 確認完了後のチェックリスト

### 19. リリース実行

- [ ] ステージング環境で最終確認
  - [ ] 全機能が正常に動作する
  - [ ] パフォーマンスが許容範囲内
- [ ] 本番環境へのデプロイ
  - [ ] デプロイが成功する
  - [ ] デプロイ後の動作確認
- [ ] リリース後の監視
  - [ ] エラーログを監視
  - [ ] パフォーマンスを監視
  - [ ] ユーザーフィードバックを収集

### 20. リリース後タスク

- [ ] リリースノートを公開
- [ ] チームにリリース完了を通知
- [ ] 既知の問題をIssue化
- [ ] 次のスプリントの計画を立てる

---

## 🔍 確認コマンド集

### 型チェック
```bash
npm run typecheck
```

### Lintチェック
```bash
npm run lint
```

### ビルド
```bash
npm run build
```

### 全検証
```bash
npm run verify
```

### E2Eテスト
```bash
npm run test:e2e
```

### organization_idフィルタ漏れ検索
```bash
# INSERTでorganization_idがない箇所
grep -rn "\.insert(" src --include="*.ts" --include="*.tsx" | head -20

# SELECTでorganization_idフィルタがない箇所
grep -rn "\.from(" src --include="*.ts" --include="*.tsx" | head -20
```

### console.log検索
```bash
grep -rn "console\.log\|console\.error" src --include="*.ts" --include="*.tsx" | wc -l
```

### as any検索
```bash
grep -rn "as any" src --include="*.ts" --include="*.tsx" | wc -l
```

### CRITICALマーク検索
```bash
grep -rn "CRITICAL" src/
```

---

## 📚 関連ドキュメント

- [プロジェクト問題レポート](../PROJECT_ISSUES_REPORT.md)
- [プロジェクト状況レポート](../PROJECT_STATUS_REPORT.md)
- [重要機能保護ルール](../development/critical-features.md)
- [マルチテナントセキュリティガイド](../development/multi-tenant-security.md)
- [Edge Functionsセキュリティガイド](../development/edge-functions-security.md)
- [プロジェクトルール](../../rules/rurle.mdc)

---

## ✅ チェックリスト完了確認

**確認日**: ___________  
**確認者**: ___________  
**リリースバージョン**: ___________  

**高優先度項目の完了率**: ___ / 5 セクション  
**中優先度項目の完了率**: ___ / 7 セクション  
**低優先度項目の完了率**: ___ / 3 セクション  

**リリース可否**: [ ] 可 [ ] 不可

**備考**:
_________________________________________________________________
_________________________________________________________________
_________________________________________________________________

---

**最終更新**: 2026-01-31  
**次回レビュー**: リリース後1週間以内




