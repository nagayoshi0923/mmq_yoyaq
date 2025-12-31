# メールアドレス統一 & Resend完全移行のデプロイ手順

## 📋 変更内容

### 1. メール送信元アドレスの統一

すべてのメール送信元を `noreply@mmq.game` に統一しました。

### 2. AWS SES から Resend への完全移行

すべてのEdge FunctionsでAWS SESを廃止し、Resend APIに統一しました。

### 変更したEdge Functions

1. **`send-booking-confirmation`** - 予約確認メール
   - 変更前: `booking@mmq.example.com`（Resend）
   - 変更後: `noreply@mmq.game`（Resend）

2. **`send-reminder-emails`** - リマインダーメール
   - 変更前: `booking@mmq.example.com`（Resend）
   - 変更後: `noreply@mmq.game`（Resend）

3. **`send-email`** - 一斉メール送信 🆕
   - 変更前: AWS SES使用
   - 変更後: Resend API + `noreply@mmq.game`

---

## 🚀 デプロイ手順

### 方法1: 個別にデプロイ（推奨）

変更した関数のみデプロイします：

```bash
cd /Users/nagayoshimai/mmq_yoyaq

# 予約確認メール
./deploy-single-function.sh send-booking-confirmation

# リマインダーメール
./deploy-single-function.sh send-reminder-emails

# 一斉メール送信（AWS SES → Resend移行）
./deploy-single-function.sh send-email
```

### 方法2: 一括デプロイ

すべてのEdge Functionsをデプロイします：

```bash
cd /Users/nagayoshimai/mmq_yoyaq

./deploy-functions.sh
```

---

## ✅ デプロイ確認

### 1. Supabase Dashboardで確認

https://supabase.com/dashboard/project/cznpcewciwywcqcxktba/functions

- `send-booking-confirmation` の最終デプロイ時刻を確認
- `send-reminder-emails` の最終デプロイ時刻を確認
- `send-email` の最終デプロイ時刻を確認

### 2. ログで確認

```bash
# 予約確認メールのログ
supabase functions logs send-booking-confirmation --limit 10

# リマインダーメールのログ
supabase functions logs send-reminder-emails --limit 10

# 一斉メール送信のログ
supabase functions logs send-email --limit 10
```

### 3. テスト送信

#### テスト1: 予約確認メール

1. 顧客予約サイトから実際に予約を作成
2. メールが届くことを確認
3. 送信元が `noreply@mmq.game` になっているか確認

#### テスト2: リマインダーメール

1. 管理画面 → 設定 → メール設定
2. テストリマインダーを送信
3. メールが届くことを確認
4. 送信元が `noreply@mmq.game` になっているか確認

---

## 🔍 トラブルシューティング

### デプロイが失敗する場合

```bash
# Supabaseにログインし直す
supabase login

# プロジェクトにリンク
supabase link --project-ref cznpcewciwywcqcxktba

# 再度デプロイ
./deploy-single-function.sh send-booking-confirmation
```

### メールが届かない場合

1. **Resend Dashboard で送信ログを確認**
   - https://resend.com/emails
   - `noreply@mmq.game` から送信されているか確認

2. **Supabase Logs でエラーを確認**
   - https://supabase.com/dashboard/project/cznpcewciwywcqcxktba/logs

3. **ドメイン認証を確認**
   - Resend Dashboard → Domains → `mmq.game`
   - ステータスが「Verified」になっているか確認

4. **迷惑メールフォルダを確認**

---

## 📝 デプロイ後チェックリスト

- [ ] `send-booking-confirmation` がデプロイされた
- [ ] `send-reminder-emails` がデプロイされた
- [ ] `send-email` がデプロイされた（AWS SES → Resend移行完了）
- [ ] Supabase Dashboard で最終デプロイ時刻を確認
- [ ] テスト予約を作成して予約確認メールが届くか確認
- [ ] 送信元が `noreply@mmq.game` になっているか確認
- [ ] Resend Dashboard で送信ログを確認
- [ ] 迷惑メールに分類されていないか確認
- [ ] AWS SES関連の環境変数を削除（オプション）

---

## 📚 関連ドキュメント

- **`EMAIL_USAGE_SCENARIOS.md`** - 全メール使用シーンと実装状況
- **`EMAIL_SETUP.md`** - メール送信機能セットアップガイド
- **`RESEND_QUICK_SETUP.md`** - クイックセットアップガイド

---

## 次のステップ

メールアドレスの統一が完了したら、次の機能を実装します：

### 優先度1: キャンセル確認メール
- [ ] Edge Function作成: `send-cancellation-confirmation`
- [ ] キャンセル処理に統合
- [ ] テンプレート作成

### 優先度2: 貸切予約確定メール
- [ ] Edge Function作成: `send-private-booking-confirmation`
- [ ] 承認処理に統合
- [ ] テンプレート作成

### 優先度3: 貸切リクエスト却下メール
- [ ] Edge Function作成: `send-private-booking-rejection`
- [ ] 却下処理に統合
- [ ] テンプレート作成

詳細: **`EMAIL_USAGE_SCENARIOS.md`** を参照

---

## 🎉 AWS SES完全廃止について

この変更により、システムから**AWS SESが完全に廃止**されました：

### 廃止された環境変数（削除可能）

以下の環境変数はもう使用されていないため、Supabase Secretsから削除できます：

```bash
# 削除してOK（オプション）
# supabase secrets unset AWS_ACCESS_KEY_ID
# supabase secrets unset AWS_SECRET_ACCESS_KEY
# supabase secrets unset AWS_REGION
# supabase secrets unset SES_FROM_EMAIL
```

### 必要な環境変数（保持）

以下は引き続き必要です：

- `RESEND_API_KEY` - すべてのメール送信に使用

### メリット

- ✅ **シンプル化**: 1つのメールサービス（Resend）に統一
- ✅ **コスト削減**: AWSアカウント不要
- ✅ **保守性向上**: 設定箇所が減少
- ✅ **ドメイン統一**: すべて `noreply@mmq.game` から送信

