# Supabase APIトークンの取得方法

自動的にJWT検証をdisableにするには、Supabase Management APIを使う必要があります。

## 手順

### 1. アクセストークンを取得

1. https://supabase.com/dashboard/account/tokens にアクセス
2. 「Generate New Token」をクリック
3. トークン名を入力（例: `CLI Automation`）
4. 「Generate Token」をクリック
5. 表示されたトークンをコピー（⚠️ 一度しか表示されません）

### 2. 環境変数に設定

```bash
# .zshrc または .bashrc に追加
export SUPABASE_ACCESS_TOKEN="sbp_xxxxxxxxxxxxxxxxxxxxxxxxxxxx"
```

または、プロジェクトディレクトリに `.env.local` ファイルを作成：

```bash
# .env.local
SUPABASE_ACCESS_TOKEN=sbp_xxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

### 3. デプロイスクリプトを実行

```bash
./deploy-discord-auto.sh
```

これで、デプロイ後に自動的にJWT検証がdisableになります。

## セキュリティ注意

⚠️ アクセストークンは機密情報です：
- Gitにコミットしない（`.gitignore`に追加済み）
- 環境変数として管理する
- 必要最小限の権限のみ付与する

