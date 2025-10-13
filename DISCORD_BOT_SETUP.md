# Discord Bot セットアップ（インタラクティブ通知）

Discord上でボタンを使ってGM確認を直接回答できる機能のセットアップ手順です。

## 1. Discord Botの作成

### 1.1 Discord Developer Portalでアプリケーションを作成

1. https://discord.com/developers/applications にアクセス
2. 「New Application」をクリック
3. 名前を入力（例: 「マーダーミステリー予約Bot」）
4. 「Create」をクリック

### 1.2 Botを作成

1. 左メニューから「Bot」を選択
2. 「Add Bot」をクリック → 「Yes, do it!」で確認
3. Bot名とアイコンを設定（オプション）
4. **「Reset Token」をクリックしてトークンをコピー**（後で使用）
   - ⚠️ このトークンは絶対に公開しないでください
5. **Privileged Gateway Intents**の設定:
   - 「MESSAGE CONTENT INTENT」をON（メッセージ内容を読む場合）
   - 他はOFFでOK

### 1.3 OAuth2設定

1. 左メニューから「OAuth2」→「URL Generator」を選択
2. **SCOPES**で以下を選択:
   - ✅ `bot`
   - ✅ `applications.commands`
3. **BOT PERMISSIONS**で以下を選択:
   - ✅ Send Messages
   - ✅ Embed Links
   - ✅ Read Message History
4. 生成されたURLをコピー
5. そのURLをブラウザで開いて、Botをサーバーに追加

### 1.4 インタラクションエンドポイントを設定（後で）

この手順は、Edge Functionをデプロイした後に行います。

## 2. Supabase Edge Functionsの準備

### 2.1 Supabase CLIのインストール（まだの場合）

```bash
# macOS
brew install supabase/tap/supabase

# Windows
scoop bucket add supabase https://github.com/supabase/scoop-bucket.git
scoop install supabase

# npm
npm install -g supabase
```

### 2.2 プロジェクトをリンク

```bash
cd /Users/nagayoshimai/mmq_yoyaq
supabase login
supabase link --project-ref YOUR_PROJECT_REF
```

### 2.3 環境変数を設定

```bash
# Discord Bot Token
supabase secrets set DISCORD_BOT_TOKEN="YOUR_BOT_TOKEN"

# Discord Application ID（Developer Portal → General Information → Application ID）
supabase secrets set DISCORD_APPLICATION_ID="YOUR_APPLICATION_ID"

# Discord Public Key（Developer Portal → General Information → Public Key）
supabase secrets set DISCORD_PUBLIC_KEY="YOUR_PUBLIC_KEY"

# Supabase接続情報
supabase secrets set SUPABASE_URL="https://YOUR_PROJECT_REF.supabase.co"
supabase secrets set SUPABASE_SERVICE_ROLE_KEY="YOUR_SERVICE_ROLE_KEY"

# サイトURL（オプション）
supabase secrets set SITE_URL="https://your-domain.com"
```

**環境変数の確認**:
```bash
supabase secrets list
```

## 3. Edge Functionsのデプロイ

### 3.1 通知用Function（修正版）

```bash
supabase functions deploy notify-private-booking-discord
```

### 3.2 インタラクション処理用Function

```bash
supabase functions deploy discord-interactions
```

デプロイ後、以下のURLが表示されます:
```
https://YOUR_PROJECT_REF.supabase.co/functions/v1/discord-interactions
```

## 4. Discord Developer Portalでインタラクションエンドポイントを設定

1. https://discord.com/developers/applications に戻る
2. 作成したアプリケーションを選択
3. 左メニューから「General Information」を選択
4. **INTERACTIONS ENDPOINT URL**に以下を入力:
   ```
   https://YOUR_PROJECT_REF.supabase.co/functions/v1/discord-interactions
   ```
5. 「Save Changes」をクリック
   - Discordがエンドポイントを検証します
   - ✅ 緑色のチェックマークが出れば成功

## 5. Database Webhookの設定

Supabaseダッシュボード → Database → Webhooks

1. 「Create a new hook」をクリック
2. 設定:
   - Name: `notify_private_booking_discord`
   - Table: `reservations`
   - Events: ✅ Insert のみ
   - Type: HTTP Request
   - Method: POST
   - URL: `https://YOUR_PROJECT_REF.supabase.co/functions/v1/notify-private-booking-discord`
   - HTTP Headers:
     - Key: `Authorization`
     - Value: `Bearer YOUR_ANON_KEY`
   - Conditions: `reservation_source = 'web_private'`
3. 「Create webhook」をクリック

## 6. テスト

1. アプリケーションから貸切予約を作成
2. Discordに通知が届き、ボタンが表示されることを確認
3. ボタンをクリックして、候補選択ができることを確認
4. 回答が保存され、GM確認ページに反映されることを確認

## トラブルシューティング

### インタラクションエンドポイントの検証が失敗する

**原因**:
- Edge Functionがデプロイされていない
- Public Keyが正しく設定されていない
- 署名検証に失敗している

**解決策**:
```bash
# ログを確認
supabase functions logs discord-interactions --follow

# Public Keyを再確認
supabase secrets list
```

### ボタンを押してもエラーが出る

**原因**:
- Service Role Keyが設定されていない
- データベースの権限が不足している

**解決策**:
```bash
# Supabase接続情報を確認
supabase secrets list

# ログを確認
supabase functions logs discord-interactions --follow
```

### 通知は来るがボタンが表示されない

**原因**:
- Bot Tokenが正しくない
- Botの権限が不足している

**解決策**:
1. Bot TokenをDiscord Developer Portalで再生成
2. `supabase secrets set DISCORD_BOT_TOKEN="新しいトークン"`
3. 再デプロイ: `supabase functions deploy notify-private-booking-discord`

## セキュリティ注意事項

⚠️ **絶対に公開してはいけない情報**:
- Discord Bot Token
- Discord Public Key
- Supabase Service Role Key
- Webhook URL

これらは環境変数として管理し、コードに直接書かないでください。

## 次のステップ

セットアップが完了したら、以下を確認してください：

1. ✅ Discord Botがサーバーに参加している
2. ✅ 貸切予約作成時に通知が届く
3. ✅ ボタンが表示される
4. ✅ ボタンをクリックして回答できる
5. ✅ データベースに回答が保存される
6. ✅ GM確認ページに反映される

