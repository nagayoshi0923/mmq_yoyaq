# AWS SES セットアップ（新規アカウント用）

## 📋 前提条件

- ✅ 新しいAWSアカウント作成済み
- ✅ AWSコンソールにログインできる
- ✅ クレジットカード登録済み

---

## ステップ1: AWS SESの基本設定

### 1.1 リージョンを選択

1. https://console.aws.amazon.com/ses/ を開く
2. 画面右上のリージョン選択で「**アジアパシフィック（東京）ap-northeast-1**」を選択
   - 理由: 日本のサービスなのでレイテンシが低い

### 1.2 送信元メールアドレスを検証

1. 左メニュー「**Verified identities**」をクリック
2. 「**Create identity**」をクリック
3. **Email address** を選択
4. メールアドレスを入力: `mai.nagayoshi@gmail.com`
5. 「**Create identity**」をクリック
6. **検証メールが届きます**
7. メールを開いて**リンクをクリック**（24時間以内）
8. 「Verification successful」と表示されればOK ✅

### 1.3 サンドボックスモードを確認

1. 左メニュー「**Account dashboard**」をクリック
2. 「**Sending statistics**」セクションを確認
3. 「**Sandbox**」と表示されている場合:
   - ✅ 検証済みメールアドレスにのみ送信可能
   - ✅ 1日200通まで送信可能
   - ⚠️ **テストには十分です**

4. 本番環境に移行する場合（後でOK）:
   - 「**Request production access**」をクリック
   - フォームを記入して申請（24時間以内に承認）

---

## ステップ2: IAMユーザーの作成（API アクセス用）

### 2.1 IAMコンソールを開く

https://console.aws.amazon.com/iam/

### 2.2 新しいユーザーを作成

1. 左メニュー「**Users**」→「**Create user**」
2. User name: `mmq-ses-sender`
3. 「**Next**」をクリック

### 2.3 権限を設定

1. 「**Attach policies directly**」を選択
2. 検索ボックスに「**SES**」と入力
3. **`AmazonSESFullAccess`** にチェック
4. 「**Next**」→「**Create user**」

### 2.4 アクセスキーを作成

1. 作成したユーザー（`mmq-ses-sender`）をクリック
2. 「**Security credentials**」タブをクリック
3. 下にスクロールして「**Access keys**」セクション
4. 「**Create access key**」をクリック
5. Use case: **「Application running outside AWS」** を選択
6. 「**Next**」をクリック
7. Description（任意）: `MMQ Supabase Edge Functions`
8. 「**Create access key**」をクリック
9. **Access Key ID** と **Secret Access Key** が表示されます
10. **必ず両方をコピーして保存**（後で使います）
    ```
    Access Key ID: AKIA...
    Secret Access Key: xxxxxx...
    ```
11. 「**Done**」をクリック

⚠️ **重要**: Secret Access Keyは二度と表示されないので、必ず保存してください！

---

## ステップ3: Supabaseに環境変数を設定

### 3.1 Supabase CLIでシークレットを設定

ターミナルで以下を実行:

```bash
cd /Users/nagayoshimai/mmq_yoyaq

# 1. AWSアクセスキーID
supabase secrets set AWS_ACCESS_KEY_ID="AKIA..."
# ↑ ステップ2.4でコピーしたAccess Key IDを貼り付け

# 2. AWSシークレットアクセスキー
supabase secrets set AWS_SECRET_ACCESS_KEY="xxxxx..."
# ↑ ステップ2.4でコピーしたSecret Access Keyを貼り付け

# 3. AWSリージョン
supabase secrets set AWS_REGION="ap-northeast-1"

# 4. 送信元メールアドレス
supabase secrets set SES_FROM_EMAIL="mai.nagayoshi@gmail.com"
```

### 3.2 設定を確認

```bash
supabase secrets list | grep -E "(AWS|SES)"
```

以下のように表示されればOK:
```
AWS_ACCESS_KEY_ID         | xxxxxx...
AWS_REGION                | xxxxxx...
AWS_SECRET_ACCESS_KEY     | xxxxxx...
SES_FROM_EMAIL            | xxxxxx...
```

---

## ステップ4: テスト

### 4.1 スタッフ招待でテスト

1. アプリのスタッフ管理画面で「スタッフを招待」
2. メールアドレス: `mai.nagayoshi@gmail.com`（検証済みのアドレス）
3. 名前とその他の情報を入力
4. 「招待」をクリック

### 4.2 メールが届くか確認

1. `mai.nagayoshi@gmail.com` の受信箱を確認
2. 件名「Confirm your signup」のメールが届いているはず
3. リンクをクリックしてパスワードを設定

### 4.3 届かない場合

1. **迷惑メールフォルダ**を確認
2. **AWS SESの検証**が完了しているか確認
   - https://console.aws.amazon.com/ses/
   - 「Verified identities」に緑のチェックマーク ✅
3. **Supabaseの環境変数**が正しいか確認
   ```bash
   supabase secrets list | grep -E "(AWS|SES)"
   ```
4. **Edge Functionのログ**を確認
   - Supabase Dashboard → Functions → `invite-staff`
   - 最新の実行ログを確認

---

## ステップ5: 他のメールアドレスでテストする場合

サンドボックスモードでは、検証済みメールアドレスにしか送信できません。

### 他のメールアドレスを検証する

1. https://console.aws.amazon.com/ses/ を開く
2. 「**Verified identities**」→「**Create identity**」
3. Email address を選択
4. テストしたいメールアドレスを入力（例: `test@example.com`）
5. 「**Create identity**」をクリック
6. そのメールアドレスに検証メールが届く
7. リンクをクリックして検証完了

---

## 📊 制限と料金

### サンドボックスモード（デフォルト）
- ✅ 検証済みメールアドレスにのみ送信可能
- ✅ 1日200通まで
- ✅ 無料

### 本番環境（申請後）
- ✅ 任意のメールアドレスに送信可能
- ✅ 1日50,000通まで（段階的に増加）
- 💰 最初の62,000通/月: **無料**
- 💰 それ以降: $0.10/1,000通

---

## 🔧 トラブルシューティング

### エラー: "Email address is not verified"
→ AWS SESでメールアドレスを検証してください（ステップ1.2）

### エラー: "Access Denied"
→ IAMユーザーの権限を確認してください（`AmazonSESFullAccess` が必要）

### エラー: "Daily sending quota exceeded"
→ サンドボックスモードの制限（1日200通）に達しています
→ 本番環境への移行申請をしてください

### メールが届かない
1. 迷惑メールフォルダを確認
2. AWS SESの検証が完了しているか確認
3. Supabaseの環境変数が正しいか確認
4. サンドボックスモードの場合、受信者のメールアドレスも検証が必要

---

## ✅ チェックリスト

- [ ] AWS SESでメールアドレスを検証（ステップ1.2）
- [ ] IAMユーザーを作成（ステップ2）
- [ ] アクセスキーを作成（ステップ2.4）
- [ ] Supabaseに環境変数を設定（ステップ3）
- [ ] テスト送信が成功（ステップ4）

---

完了したら、スタッフ招待機能が使えるようになります！ 🎉

