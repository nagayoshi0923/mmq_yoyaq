# ⚠️ このドキュメントは非推奨です

**現在のシステムは AWS SES ではなく Resend を使用しています。**

最新のセットアップ手順は以下を参照してください：
- **RESEND_QUICK_SETUP.md** - クイックスタートガイド
- **EMAIL_SETUP.md** - 詳細なセットアップガイド
- **RESEND_PASSWORD_RESET_SETUP.md** - パスワードリセット設定

---

# AWS SES 設定（超シンプル版）- 非推奨

**注意**: このガイドは古い設定方法です。現在は使用していません。

## 🎯 やること
スタッフ招待メールを送れるようにする

---

## ステップ1: メールアドレスを登録（5分）

### やること
AWSに「このメールアドレスから送信します」と登録する

### 手順
1. https://console.aws.amazon.com/ses/ を開く
2. 右上のリージョンで「**東京**」を選ぶ
3. 左メニュー「**Verified identities**」をクリック
4. 「**Create identity**」をクリック
5. **Email address** を選ぶ
6. `mai.nagayoshi@gmail.com` と入力
7. 「**Create identity**」をクリック

### 次にやること
**Gmailを開いてAWSからのメールを確認 → リンクをクリック**

✅ これで登録完了

---

## ステップ2: アクセスキーを作る（5分）

### やること
SupabaseがAWSを使えるようにする鍵を作る

### 手順
1. https://console.aws.amazon.com/iam/ を開く
2. 左メニュー「**Users**」をクリック
3. 「**Create user**」をクリック
4. User name: `mmq-ses` と入力
5. 「**Next**」をクリック
6. 「**Attach policies directly**」を選ぶ
7. 検索ボックスに `SES` と入力
8. `AmazonSESFullAccess` にチェック
9. 「**Next**」→「**Create user**」

### 次にやること
作ったユーザー（mmq-ses）をクリック

1. 「**Security credentials**」タブをクリック
2. 下にスクロールして「**Create access key**」
3. 「**Application running outside AWS**」を選ぶ
4. 「**Next**」→「**Create access key**」

### 重要！コピーして保存
画面に2つの値が表示されます：

```
Access key: AKIA................ ← これをコピー
Secret key: ........................ ← これもコピー
```

**メモ帳に貼り付けて保存してください**
（この画面は二度と表示されません）

✅ これで鍵の作成完了

---

## ステップ3: Supabaseに設定（3分）

### やること
作った鍵をSupabaseに登録する

### 手順
ターミナルで以下を実行：

```bash
cd /Users/nagayoshimai/mmq_yoyaq

# 1つ目（さっきコピーしたAccess keyを貼り付け）
supabase secrets set AWS_ACCESS_KEY_ID="AKIA..............."

# 2つ目（さっきコピーしたSecret keyを貼り付け）
supabase secrets set AWS_SECRET_ACCESS_KEY="........................"

# 3つ目（東京リージョン）
supabase secrets set AWS_REGION="ap-northeast-1"

# 4つ目（送信元メールアドレス）
supabase secrets set SES_FROM_EMAIL="mai.nagayoshi@gmail.com"
```

### 確認
```bash
supabase secrets list
```

4つ表示されればOK ✅

---

## ステップ4: デプロイ（1分）

```bash
./deploy-single-function.sh invite-staff
```

---

## ステップ5: テスト

### 方法1: Supabaseから直接テスト

1. https://supabase.com/dashboard/project/cznpcewciwywcqcxktba/auth/users
2. 右上「**Invite user**」
3. Email: `mai.nagayoshi@gmail.com`
4. 「**Invite**」
5. **Gmailを確認**

### 方法2: アプリからテスト

1. スタッフ管理画面
2. スタッフを招待
3. メールアドレス入力
4. 招待
5. **メールが届くか確認**

---

## ⚠️ 届かない場合

1. **迷惑メールフォルダ**を確認
2. **ステップ1**のメール登録が完了しているか確認
   - https://console.aws.amazon.com/ses/
   - Verified identities に緑のチェック ✅ があるか
3. **ステップ3**の4つの設定ができているか確認
   ```bash
   supabase secrets list
   ```

---

## 完了！

以上です。わからないところがあれば教えてください。

