# Amazon SES メール送信設定

## 前提条件
- AWS アカウント
- ドメイン（独自ドメインがない場合は、検証済みメールアドレスのみ使用可能）

## 1. AWS SES のセットアップ

### 1.1 AWS コンソールにログイン
https://console.aws.amazon.com/

### 1.2 SES サービスに移動
1. AWS コンソールで「SES」を検索
2. リージョンを選択（推奨: `us-east-1` または `ap-northeast-1`（東京））

### 1.3 送信元メールアドレスの検証
1. 左メニュー「Verified identities」をクリック
2. 「Create identity」をクリック
3. **Email address** を選択
4. 送信元として使用するメールアドレスを入力（例: `noreply@yourdomain.com`）
5. 「Create identity」をクリック
6. **検証メールが届くので、リンクをクリックして検証完了**

### 1.4 サンドボックスの解除（本番環境用）
デフォルトではサンドボックスモード（検証済みアドレスにのみ送信可能、1日200通まで）

#### 本番環境に移行する手順：
1. 左メニュー「Account dashboard」をクリック
2. 「Request production access」をクリック
3. フォームに記入：
   - **Mail type**: Transactional
   - **Website URL**: あなたのサイトのURL
   - **Use case description**: 
     ```
     This application is a booking management system for escape game venues.
     We send transactional emails such as:
     - Booking confirmation emails
     - Booking reminder emails
     - Staff shift notification emails
     - Direct communication with customers from admin dashboard
     
     All emails are sent to customers who have made bookings or staff members.
     Expected volume: ~2,000 emails per month
     ```
4. 「Submit request」をクリック
5. **通常24時間以内に承認**される

## 2. IAM ユーザーの作成（API アクセス用）

### 2.1 IAM コンソールに移動
https://console.aws.amazon.com/iam/

### 2.2 新しいユーザーを作成
1. 左メニュー「Users」→「Create user」
2. User name: `mmq-ses-sender`
3. 「Next」をクリック

### 2.3 権限を設定
1. 「Attach policies directly」を選択
2. 検索で「SES」と入力
3. **`AmazonSESFullAccess`** にチェック
4. 「Next」→「Create user」

### 2.4 アクセスキーを作成
1. 作成したユーザー（`mmq-ses-sender`）をクリック
2. 「Security credentials」タブをクリック
3. 「Create access key」をクリック
4. Use case: **「Application running outside AWS」** を選択
5. 「Next」→「Create access key」
6. **Access Key ID** と **Secret Access Key** をコピーして保存（後で使用）

## 3. Supabase Edge Function のデプロイ

### 3.1 Supabase CLI のインストール
```bash
npm install -g supabase
```

### 3.2 Supabase にログイン
```bash
supabase login
```

### 3.3 プロジェクトにリンク
```bash
cd /Users/nagayoshimai/mmq_yoyaq
supabase link --project-ref YOUR_PROJECT_REF
```

**YOUR_PROJECT_REF** は Supabase ダッシュボードの Settings > General > Reference ID で確認

### 3.4 シークレットを設定
```bash
supabase secrets set AWS_ACCESS_KEY_ID=your_access_key_id
supabase secrets set AWS_SECRET_ACCESS_KEY=your_secret_access_key
supabase secrets set AWS_REGION=us-east-1  # または ap-northeast-1
supabase secrets set SES_FROM_EMAIL=noreply@yourdomain.com
```

### 3.5 Edge Function をデプロイ
```bash
supabase functions deploy send-email
```

### 3.6 デプロイされた URL を確認
```
https://YOUR_PROJECT_REF.supabase.co/functions/v1/send-email
```

## 4. フロントエンドの設定

### 4.1 `.env.local` を更新
```bash
# 既存の Google Apps Script URL をコメントアウト
# VITE_GOOGLE_APPS_SCRIPT_URL=https://script.google.com/...

# Supabase の URL と Key を使用（既に設定済みのはず）
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your_anon_key_here
```

## 5. テスト

1. 開発サーバーを起動: `npm run dev`
2. スケジュール管理ページで予約者にメール送信
3. メールが届くことを確認

## トラブルシューティング

### エラー: "Email address is not verified"
→ SES で送信元メールアドレスを検証してください

### エラー: "Daily sending quota exceeded"
→ サンドボックスモードの制限（1日200通）に達しています。本番環境への移行申請をしてください

### エラー: "Access Denied"
→ IAM ユーザーの権限を確認してください（`AmazonSESFullAccess` が必要）

## 料金

- **最初の62,000通/月**: 無料（AWS 無料利用枠）
- **それ以降**: $0.10/1,000通

例: 月10,000通送信 → **$0（無料枠内）**

