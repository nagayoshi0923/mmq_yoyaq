# プルリクエスト

## 変更内容
<!-- このPRで何を変更したか簡潔に説明 -->

## 関連Issue
<!-- 関連するIssue番号があれば記載 -->
Closes #

## チェックリスト

### マルチテナント対応（必須）🚨
- [ ] **SELECTクエリ**: すべての`from('テーブル名')`に`organization_id`フィルタがあるか確認
- [ ] **INSERT/UPSERT**: `organization_id`が設定されているか確認
- [ ] **UPDATE/DELETE**: 範囲操作に`organization_id`フィルタがあるか確認
- [ ] **例外テーブル**: `users`, `organizations`, `authors`, `auth_logs`は除外されているか確認

### セキュリティ（必須）🚨
- [ ] **予約/在庫/料金に影響する更新**が、直接UPDATE/DELETEではなく **RPC経由** になっている
  - 対象例: `reservations`, `schedule_events`, 料金系カラム（`total_price`, `final_price`, `unit_price` など）
- [ ] **複数DB操作**（UPDATE→INSERT→UPDATE 等）を **非アトミックに実行していない**
  - 必要なら DB側RPC（トランザクション）に統合する
- [ ] **クライアント入力（request body / query）を信用していない**
  - 料金/日時/URL/organizationId 等はサーバー側で検証・確定する（fail-closed）
- [ ] **Edge Function** の認可が適切（スタッフ/管理者限定など）で、監査ログが必要なら追加している

### データベース操作の確認
- [ ] 新しいテーブルに`organization_id`カラムがあるか
- [ ] 新しいテーブルにRLSポリシーを設定したか
- [ ] カラム名を既存コードで確認したか（推測で書いていないか）

### 型安全性
- [ ] `npm run typecheck`でエラーがないか確認
- [ ] 新しいプロパティを追加した場合、型定義も更新したか

### ドキュメント
- [ ] ページ追加・変更・削除時、`docs/PAGES.md`を更新したか
- [ ] UI変更時、`docs/UI_Design.md`を更新したか

### テスト
- [ ] ローカル環境で動作確認したか
- [ ] 複数組織での動作確認をしたか（マルチテナント機能の場合）

## スクリーンショット（UI変更の場合）
<!-- 変更前後のスクリーンショットを添付 -->

## 補足情報
<!-- その他、レビュアーに伝えたい情報があれば記載 -->

