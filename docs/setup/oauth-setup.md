# ソーシャルログイン（OAuth）設定ガイド

MMQでGoogle・Discordログインを有効にするための設定手順です。

---

## 📌 事前準備

以下の情報を用意してください：

- **Supabase プロジェクトURL**: `https://[your-project-id].supabase.co`
- **Supabase Redirect URL**: `https://[your-project-id].supabase.co/auth/v1/callback`

Supabase ダッシュボード → Authentication → URL Configuration で確認できます。

---

## 🔷 Google ログインの設定

### Step 1: Google Cloud Console にアクセス

1. [Google Cloud Console](https://console.cloud.google.com/) にアクセス
2. Google アカウントでログイン

### Step 2: プロジェクトを作成（または選択）

1. 画面上部のプロジェクト選択ドロップダウンをクリック
2. 「新しいプロジェクト」をクリック
3. プロジェクト名を入力（例: `MMQ Production`）
4. 「作成」をクリック
5. 作成したプロジェクトを選択

### Step 3: OAuth 同意画面を設定

1. 左メニューから「APIとサービス」→「OAuth 同意画面」を選択
2. User Type で「外部」を選択 → 「作成」
3. 以下の情報を入力：

| 項目 | 入力内容 |
|------|----------|
| アプリ名 | `MMQ - Murder Mystery Quest` |
| ユーザーサポートメール | あなたのメールアドレス |
| アプリのロゴ | （任意）MMQのロゴをアップロード |
| アプリのホームページ | `https://mmq.jp`（または本番URL） |
| アプリのプライバシーポリシーリンク | `https://mmq.jp/privacy` |
| アプリの利用規約リンク | `https://mmq.jp/terms` |
| デベロッパーの連絡先情報 | あなたのメールアドレス |

4. 「保存して次へ」をクリック

### Step 4: スコープを設定

1. 「スコープを追加または削除」をクリック
2. 以下のスコープを選択：
   - `email` - ユーザーのメールアドレスを取得
   - `profile` - ユーザーのプロフィール情報を取得
   - `openid` - OpenID Connect
3. 「更新」をクリック
4. 「保存して次へ」をクリック

### Step 5: テストユーザーを追加（開発中のみ）

1. 「+ ADD USERS」をクリック
2. テストに使用するGoogleアカウントのメールアドレスを追加
3. 「保存して次へ」をクリック

> **注意**: 本番公開時は「公開ステータス」を「本番環境」に変更する必要があります。

### Step 6: OAuth クライアントIDを作成

1. 左メニューから「認証情報」を選択
2. 「+ 認証情報を作成」→「OAuth クライアント ID」をクリック
3. 以下の情報を入力：

| 項目 | 入力内容 |
|------|----------|
| アプリケーションの種類 | ウェブ アプリケーション |
| 名前 | `MMQ Web Client` |
| 承認済みの JavaScript 生成元 | `https://mmq.jp`（本番URL）<br>`http://localhost:5173`（開発用） |
| 承認済みのリダイレクト URI | `https://[your-project-id].supabase.co/auth/v1/callback` |

4. 「作成」をクリック
5. 表示された **クライアント ID** と **クライアント シークレット** をコピー

### Step 7: Supabase に設定

1. [Supabase ダッシュボード](https://supabase.com/dashboard) にアクセス
2. プロジェクトを選択
3. 左メニューから「Authentication」→「Providers」を選択
4. 「Google」をクリックして展開
5. 「Enable Sign in with Google」をON
6. 以下を入力：

| 項目 | 入力内容 |
|------|----------|
| Client ID | Google Cloud Console でコピーしたクライアントID |
| Client Secret | Google Cloud Console でコピーしたクライアントシークレット |

7. 「Save」をクリック

### ✅ Google ログイン設定完了！

---

## 🟣 Discord ログインの設定

### Step 1: Discord Developer Portal にアクセス

1. [Discord Developer Portal](https://discord.com/developers/applications) にアクセス
2. Discord アカウントでログイン

### Step 2: アプリケーションを作成

1. 右上の「New Application」をクリック
2. アプリ名を入力（例: `MMQ`）
3. 利用規約に同意して「Create」をクリック

### Step 3: アプリ情報を設定

1. 「General Information」タブで以下を設定：

| 項目 | 入力内容 |
|------|----------|
| Name | `MMQ - Murder Mystery Quest` |
| Description | マーダーミステリー予約プラットフォーム |
| App Icon | （任意）MMQのロゴをアップロード |
| Terms of Service URL | `https://mmq.jp/terms` |
| Privacy Policy URL | `https://mmq.jp/privacy` |

2. 「Save Changes」をクリック

### Step 4: OAuth2 設定

1. 左メニューから「OAuth2」→「General」を選択
2. **Client ID** をコピー（後で使用）
3. 「Reset Secret」をクリックして **Client Secret** を生成・コピー

### Step 5: Redirect URL を設定

1. 「OAuth2」→「General」のまま
2. 「Redirects」セクションで「Add Redirect」をクリック
3. 以下のURLを追加：

```
https://[your-project-id].supabase.co/auth/v1/callback
```

4. 開発用に以下も追加（任意）：

```
http://localhost:5173/
```

5. 「Save Changes」をクリック

### Step 6: Supabase に設定

1. [Supabase ダッシュボード](https://supabase.com/dashboard) にアクセス
2. プロジェクトを選択
3. 左メニューから「Authentication」→「Providers」を選択
4. 「Discord」をクリックして展開
5. 「Enable Sign in with Discord」をON
6. 以下を入力：

| 項目 | 入力内容 |
|------|----------|
| Client ID | Discord Developer Portal でコピーしたClient ID |
| Client Secret | Discord Developer Portal でコピーしたClient Secret |

7. 「Save」をクリック

### ✅ Discord ログイン設定完了！

---

## 🧪 動作確認

1. MMQ のログインページにアクセス: `http://localhost:5173/login`
2. 「Googleでログイン」または「Discordでログイン」をクリック
3. 認証画面が表示されることを確認
4. 認証後、MMQ にリダイレクトされログインできることを確認

---

## ⚠️ トラブルシューティング

### Google: 「このアプリは確認されていません」と表示される

- 開発中は「テストユーザー」に追加されたアカウントのみログイン可能
- 本番公開時は OAuth 同意画面で「公開ステータス」を「本番環境」に変更
- Google の審査が必要な場合があります

### Discord: 「Invalid OAuth2 redirect_uri」エラー

- Discord Developer Portal の Redirects に正しい URL が設定されているか確認
- URL の末尾に `/` があるかないかを確認（完全一致が必要）

### 「ログインに失敗しました」と表示される

1. Supabase ダッシュボードで Provider が有効になっているか確認
2. Client ID / Client Secret が正しくコピーされているか確認
3. Redirect URL が正しいか確認

### ログイン後にユーザーが作成されない

- Supabase の `users` テーブルに RLS ポリシーが設定されているか確認
- トリガーまたはアプリケーションコードでユーザーレコードを作成する必要があります

---

## 📝 本番環境チェックリスト

- [ ] Google Cloud Console で本番用の JavaScript 生成元を追加
- [ ] Google OAuth 同意画面を「本番環境」に公開
- [ ] Discord Developer Portal で本番用の Redirect URL を追加
- [ ] Supabase の URL Configuration で Site URL を本番 URL に設定
- [ ] 環境変数に本番用の Supabase URL / Key を設定

---

## 🔗 参考リンク

- [Supabase OAuth ドキュメント](https://supabase.com/docs/guides/auth/social-login)
- [Google OAuth 設定ガイド](https://supabase.com/docs/guides/auth/social-login/auth-google)
- [Discord OAuth 設定ガイド](https://supabase.com/docs/guides/auth/social-login/auth-discord)

