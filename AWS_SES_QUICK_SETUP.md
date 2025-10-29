# AWS SES クイックセットアップ（新規アカウント）

## 🎯 目標
スタッフ招待メールが届くようにする

## 📋 必要な情報
- 送信元メールアドレス: `mai.nagayoshi@gmail.com`
- リージョン: `東京 (ap-northeast-1)` または `バージニア (us-east-1)`

---

## ステップ1: メールアドレスを検証（5分）

### 1. AWS SESを開く
https://console.aws.amazon.com/ses/

### 2. リージョンを選択
右上で「**東京 (ap-northeast-1)**」を選択

### 3. メールアドレスを登録
1. 左メニュー「**Verified identities**」
2. 「**Create identity**」
3. Email address: `mai.nagayoshi@gmail.com`
4. 「**Create identity**」

### 4. 検証メールを確認
1. Gmailを開く
2. AWSからのメールを探す
3. リンクをクリック

---

## ステップ2: IAMユーザー作成（5分）

### 1. IAMを開く
https://console.aws.amazon.com/iam/

### 2. ユーザー作成
1. Users → Create user
2. User name: `mmq-ses-sender`
3. Next

### 3. 権限設定
1. Attach policies directly
2. 検索: `SES`
3. `AmazonSESFullAccess` にチェック
4. Create user

### 4. アクセスキー作成
1. ユーザーをクリック
2. Security credentials タブ
3. Create access key
4. Application running outside AWS
5. Create access key
6. **コピーして保存** ⚠️

```
Access key ID: AKIA................
Secret access key: ................................
```

---

## ステップ3: SMTP認証情報作成（3分）

### 1. SES SMTP設定
1. SESコンソール → 左メニュー「**SMTP settings**」
2. Create SMTP credentials
3. Create user
4. **ダウンロードまたはコピー** ⚠️

```
SMTP Username: ................................
SMTP Password: ................................
Server: email-smtp.ap-northeast-1.amazonaws.com
Port: 587
```

---

## ステップ4: Supabase設定（5分）

### 4-1. Edge Function用シークレット

```bash
cd /Users/nagayoshimai/mmq_yoyaq

supabase secrets set AWS_ACCESS_KEY_ID=AKIA................
supabase secrets set AWS_SECRET_ACCESS_KEY=................................
supabase secrets set AWS_REGION=ap-northeast-1
supabase secrets set SES_FROM_EMAIL=mai.nagayoshi@gmail.com
```

### 4-2. Supabase Auth SMTP設定

https://supabase.com/dashboard/project/cznpcewciwywcqcxktba/settings/auth

下にスクロールして「**SMTP Settings**」:

```
Enable Custom SMTP: ON

Sender name: MMQ
Sender email: mai.nagayoshi@gmail.com

Host: email-smtp.ap-northeast-1.amazonaws.com
Port: 587
Username: [SMTP Username]
Password: [SMTP Password]
```

Save をクリック

---

## ステップ5: デプロイ（1分）

```bash
./deploy-single-function.sh invite-staff
```

---

## ステップ6: テスト

1. Supabase Dashboard → Auth → Users
2. Invite user
3. Email: `mai.nagayoshi@gmail.com`
4. Invite
5. メールが届くか確認 ✅

---

## 完了！

メールが届いたら成功です。
届かない場合は迷惑メールフォルダを確認してください。

