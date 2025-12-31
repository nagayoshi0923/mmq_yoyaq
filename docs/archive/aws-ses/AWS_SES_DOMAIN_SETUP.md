# ⚠️ このドキュメントは非推奨です

**現在のシステムは AWS SES ではなく Resend を使用しています。**

最新のセットアップ手順は以下を参照してください：
- **RESEND_QUICK_SETUP.md** - クイックスタートガイド
- **EMAIL_SETUP.md** - 詳細なセットアップガイド（ドメイン認証手順を含む）
- **RESEND_PASSWORD_RESET_SETUP.md** - パスワードリセット設定

---

# AWS SES ドメイン設定 - 非推奨

**注意**: このガイドは古い設定方法です。現在は使用していません。

## 📋 前提条件

- ✅ 独自ドメインを持っている（例: `mmq.jp`、`example.com`）
- ✅ ドメインのDNS設定ができる（お名前.com、ムームードメイン、Route53など）

---

## 🎯 ドメイン設定のメリット

### メールアドレス認証との違い

#### メールアドレス認証（簡単）
```
✅ 登録: mai.nagayoshi@gmail.com
✅ 送信可能: mai.nagayoshi@gmail.com のみ
❌ 送信不可: noreply@gmail.com、info@gmail.com など
```

#### ドメイン認証（本格的）
```
✅ 登録: mmq.jp（ドメイン全体）
✅ 送信可能: noreply@mmq.jp、info@mmq.jp、support@mmq.jp など
✅ 送信可能: そのドメインの任意のメールアドレス
```

---

## ステップ1: AWS SESでドメインを登録（5分）

### 1-1. SESコンソールを開く

https://console.aws.amazon.com/ses/

右上のリージョンを「**東京 (ap-northeast-1)**」に設定

### 1-2. ドメインを登録

1. 左メニュー「**Verified identities**」
2. 「**Create identity**」をクリック
3. **Domain** を選択 ← ここが重要
4. Domain: `mmq.jp`（あなたのドメインを入力）
5. 「**Use a custom MAIL FROM domain**」: チェックしない（デフォルトのまま）
6. 「**DKIM signing key length**」: 2048-bit RSA（デフォルトのまま）
7. 「**Create identity**」をクリック

### 1-3. DNS設定値が表示される

画面に以下のような情報が表示されます：

```
🔹 DKIM レコード（3つ）
Type: CNAME
Name: xxxxxxxx._domainkey.mmq.jp
Value: xxxxxxxx.dkim.amazonses.com

Type: CNAME
Name: yyyyyyyy._domainkey.mmq.jp
Value: yyyyyyyy.dkim.amazonses.com

Type: CNAME
Name: zzzzzzzz._domainkey.mmq.jp
Value: zzzzzzzz.dkim.amazonses.com
```

**この画面を開いたままにしておく** ← 次のステップで使います

---

## ステップ2: DNSにレコードを追加

### お使いのDNSサービスは？

選択してください：
- A. お名前.com
- B. ムームードメイン
- C. AWS Route53
- D. その他

---

### A. お名前.comの場合

#### 1. お名前.comにログイン

https://www.onamae.com/

#### 2. DNS設定画面を開く

1. 「ドメイン」→「ドメイン機能一覧」
2. 「DNS関連機能の設定」
3. 対象ドメインを選択→「次へ」
4. 「DNSレコード設定を利用する」→「設定する」

#### 3. CNAMEレコードを3つ追加

AWS SESの画面に戻り、表示されている3つのDKIMレコードを1つずつ追加：

| タイプ | ホスト名 | VALUE | TTL |
|--------|----------|-------|-----|
| CNAME | xxxxxxxx._domainkey | xxxxxxxx.dkim.amazonses.com | 3600 |
| CNAME | yyyyyyyy._domainkey | yyyyyyyy.dkim.amazonses.com | 3600 |
| CNAME | zzzzzzzz._domainkey | zzzzzzzz.dkim.amazonses.com | 3600 |

⚠️ **注意**: ホスト名から `.mmq.jp` は除く（お名前.comが自動で付けます）

例:
```
ホスト名: xxxxxxxx._domainkey
VALUE: xxxxxxxx.dkim.amazonses.com
```

#### 4. 保存

「追加」をクリック → 「確認画面へ進む」→「設定する」

---

### B. ムームードメインの場合

#### 1. ムームードメインにログイン

https://muumuu-domain.com/

#### 2. DNS設定画面を開く

1. コントロールパネル
2. 「ドメイン管理」→「ドメイン操作」→「ムームーDNS」
3. 対象ドメインの「変更」をクリック
4. 「カスタム設定」

#### 3. CNAMEレコードを3つ追加

| サブドメイン | 種別 | 内容 | 優先度 |
|-------------|------|------|--------|
| xxxxxxxx._domainkey | CNAME | xxxxxxxx.dkim.amazonses.com | - |
| yyyyyyyy._domainkey | CNAME | yyyyyyyy.dkim.amazonses.com | - |
| zzzzzzzz._domainkey | CNAME | zzzzzzzz.dkim.amazonses.com | - |

#### 4. 保存

「セットアップ情報変更」をクリック

---

### C. AWS Route53の場合

#### 1. Route53を開く

https://console.aws.amazon.com/route53/

#### 2. ホストゾーンを選択

1. 左メニュー「Hosted zones」
2. ドメイン（`mmq.jp`）をクリック

#### 3. レコードを作成

1. 「Create record」をクリック
2. **Simple routing** を選択
3. 「Define simple record」

AWS SESの画面の「**Publish DNS records**」ボタンをクリックすると、**自動的にRoute53にレコードが追加されます**

✅ Route53を使っている場合は超簡単！

---

## ステップ3: 検証を待つ（10分〜72時間）

### 3-1. DNS設定の反映を待つ

DNS設定は通常10分〜1時間で反映されますが、最大72時間かかる場合があります。

### 3-2. AWS SESで確認

1. AWS SESの「Verified identities」に戻る
2. ドメイン（`mmq.jp`）をクリック
3. **Identity status** が以下のように変わるのを待つ：

```
Pending verification → Verified ✅
```

### 3-3. DKIM設定も確認

同じ画面で：

```
DKIM configuration: Successful ✅
```

と表示されればOK

---

## ステップ4: Supabaseに設定

### 4-1. 送信元メールアドレスを変更

```bash
cd /Users/nagayoshimai/mmq_yoyaq

# ドメインのメールアドレスに変更
supabase secrets set SES_FROM_EMAIL="noreply@mmq.jp"
```

他の設定（`AWS_ACCESS_KEY_ID`など）は既に設定済みなのでそのままでOK

### 4-2. Edge Functionを再デプロイ

```bash
./deploy-single-function.sh invite-staff
```

---

## ステップ5: テスト

### テスト用メールアドレスを検証（サンドボックスモードの場合）

1. AWS SES → Verified identities
2. Create identity
3. Email address: `test@example.com`（テスト送信先）
4. そのメールアドレスに検証メールが届く
5. リンクをクリック

### スタッフ招待でテスト

1. スタッフ管理画面
2. スタッフを招待
3. Email: `test@example.com`
4. メールが届くか確認

✅ 送信元が `noreply@mmq.jp` になっているはず

---

## 🔧 トラブルシューティング

### ドメインが Verified にならない

#### 確認1: DNSレコードが正しく設定されているか

ターミナルで確認:

```bash
# 1つ目のDKIMレコードを確認
dig xxxxxxxx._domainkey.mmq.jp CNAME

# 正しく設定されていれば、以下のように表示される
# xxxxxxxx._domainkey.mmq.jp. 3600 IN CNAME xxxxxxxx.dkim.amazonses.com.
```

#### 確認2: DNS反映を待つ

DNS設定は最大72時間かかる場合があります。気長に待ちましょう。

#### 確認3: CNAMEレコードの値が正確か

- 末尾の `.` があってもなくてもOK
- 余計なスペースが入っていないか確認
- コピペミスがないか確認

### エラー: "Email address is not verified"

→ 送信先のメールアドレスも検証が必要（サンドボックスモードの場合）
→ または本番環境への移行申請をする

---

## 💡 本番環境への移行（オプション）

ドメイン検証が完了したら、本番環境への移行を申請できます。

### メリット
- ✅ 任意のメールアドレスに送信可能（検証不要）
- ✅ 1日50,000通まで送信可能

### 申請方法

1. AWS SES → Account dashboard
2. 「Request production access」
3. フォームを記入:
   ```
   Mail type: Transactional
   Website URL: https://your-site.com
   Use case description:
   This is a booking management system for escape game venues.
   We send transactional emails for booking confirmations and
   staff notifications using the verified domain mmq.jp.
   Expected volume: ~2,000 emails per month.
   ```
4. Submit
5. 通常24時間以内に承認 ✅

---

## ✅ チェックリスト

- [ ] AWSでドメインを登録
- [ ] DNS設定（CNAMEレコード3つ）
- [ ] ドメインが Verified になるまで待つ
- [ ] Supabaseの送信元メールアドレスを更新
- [ ] テスト送信が成功

---

**どのDNSサービスを使っていますか？**
（お名前.com、ムームードメイン、Route53、その他）

