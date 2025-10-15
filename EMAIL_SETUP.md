# メール送信機能セットアップガイド

## 概要
予約確認メールの自動送信機能は、Supabase Edge FunctionsとResend APIを使用して実装されています。

## 前提条件
- Supabaseプロジェクトが作成されていること
- Supabase CLIがインストールされていること（`npm install -g supabase`）

## セットアップ手順

### 1. Resendアカウントの作成

1. [Resend](https://resend.com)にアクセスしてアカウントを作成
2. ダッシュボードから「API Keys」を選択
3. 新しいAPIキーを作成（例: `MMQ Booking Confirmation`）
4. APIキーをコピー（`re_...`で始まる文字列）

### 2. Resendでドメインを設定（本番環境のみ）

**開発環境では不要** - Resendは開発用に`onboarding@resend.dev`を提供しています。

本番環境の場合：
1. Resendダッシュボードで「Domains」を選択
2. 独自ドメインを追加（例: `mmq.example.com`）
3. DNSレコードを設定（Resendが指示するSPF、DKIM、DMARCレコード）
4. ドメイン認証を完了

### 3. SupabaseにAPIキーを設定

#### 方法A: Supabase Dashboard（推奨）

1. [Supabase Dashboard](https://app.supabase.com)にログイン
2. プロジェクトを選択
3. 左メニューから「Settings」→「Edge Functions」を選択
4. 「Add new secret」をクリック
5. 以下を入力：
   - Name: `RESEND_API_KEY`
   - Value: コピーしたResend APIキー
6. 「Save」をクリック

#### 方法B: Supabase CLI

```bash
# Supabaseにログイン
supabase login

# プロジェクトにリンク
supabase link --project-ref your-project-ref

# シークレットを設定
supabase secrets set RESEND_API_KEY=re_your_api_key_here
```

### 4. Edge Functionのデプロイ

```bash
# Supabaseにログインしていない場合
supabase login

# プロジェクトにリンク（まだの場合）
supabase link --project-ref your-project-ref

# Edge Functionをデプロイ
supabase functions deploy send-booking-confirmation
```

### 5. 送信元メールアドレスの設定

Edge Function（`supabase/functions/send-booking-confirmation/index.ts`）内の以下の行を編集：

```typescript
from: 'MMQ予約システム <booking@mmq.example.com>',
```

**開発環境の場合：**
```typescript
from: 'MMQ予約システム <onboarding@resend.dev>',
```

**本番環境の場合：**
自分のドメインに変更してください（例: `booking@yourdomain.com`）

## メールテンプレート

現在実装されているメール：
- ✅ **予約確認メール** - 予約完了時に自動送信

メールには以下の情報が含まれます：
- 予約番号
- シナリオ名
- 日時
- 会場
- 参加人数
- 料金
- 重要事項（キャンセルポリシーなど）

## メール送信のテスト

### ローカルでのテスト

```bash
# Edge Functionをローカルで起動
supabase functions serve send-booking-confirmation --env-file supabase/.env.local

# 別のターミナルでテストリクエストを送信
curl -i --location --request POST 'http://localhost:54321/functions/v1/send-booking-confirmation' \
  --header 'Authorization: Bearer YOUR_SUPABASE_ANON_KEY' \
  --header 'Content-Type: application/json' \
  --data '{
    "reservationId": "test-id",
    "customerEmail": "test@example.com",
    "customerName": "テスト太郎",
    "scenarioTitle": "テストシナリオ",
    "eventDate": "2024-12-25",
    "startTime": "19:00:00",
    "endTime": "22:00:00",
    "storeName": "テスト店舗",
    "participantCount": 6,
    "totalPrice": 24000,
    "reservationNumber": "20241225-123456"
  }'
```

### 本番でのテスト

実際に予約サイトから予約を行い、メールが届くか確認してください。

## トラブルシューティング

### メールが届かない場合

1. **Resend APIキーが正しく設定されているか確認**
   ```bash
   supabase secrets list
   ```

2. **Edge Functionのログを確認**
   - Supabase Dashboardの「Edge Functions」→「Logs」を確認

3. **メールアドレスが正しいか確認**
   - 入力されたメールアドレスにタイポがないか

4. **迷惑メールフォルダを確認**
   - 初回送信時は迷惑メールに分類される可能性があります

5. **Resendのログを確認**
   - Resend Dashboardの「Logs」でメール送信状況を確認

### Edge Functionのエラー

Edge Functionのログは以下で確認できます：
```bash
supabase functions logs send-booking-confirmation
```

または、Supabase Dashboardの「Edge Functions」→「send-booking-confirmation」→「Logs」

## 今後の拡張

### リマインダーメール（未実装）

予約日の前日や当日にリマインダーメールを送信する機能を追加予定：
- 前日リマインダー（24時間前）
- 当日リマインダー（3時間前）

実装方法：
- Supabase Cron Jobsを使用して定期的にチェック
- 該当する予約に対してメール送信

### キャンセル確認メール（未実装）

予約がキャンセルされた際の確認メール。

## セキュリティ

- ✅ Resend APIキーはSupabase Secretsで安全に管理
- ✅ Edge Functionは認証されたリクエストのみ処理
- ✅ メール送信はサーバーサイドで実行（クライアント側に秘密情報を露出しない）

## 料金

### Resend料金

- **無料枠**: 月3,000通まで無料
- **有料プラン**: $20/月から（月50,000通まで）

詳細: https://resend.com/pricing

### Supabase Edge Functions料金

- **無料枠**: 月500,000リクエストまで無料
- **有料**: それ以降は$2 per 1M requests

詳細: https://supabase.com/pricing

## 参考リンク

- [Resend Documentation](https://resend.com/docs)
- [Supabase Edge Functions](https://supabase.com/docs/guides/functions)
- [Supabase Secrets Management](https://supabase.com/docs/guides/functions/secrets)

