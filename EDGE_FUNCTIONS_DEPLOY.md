# Edge Functions デプロイガイド

## 🚨 重要: JWT検証について

このプロジェクトのEdge Functionsは**常に `--no-verify-jwt` でデプロイ**する必要があります。

理由: フロントエンドからの呼び出しでJWT検証をオフにする必要があるため。

---

## 📦 デプロイ方法

### 1. すべてのFunctionを一括デプロイ

```bash
./deploy-functions.sh
```

以下のFunctionが自動的にデプロイされます:
- `notify-shift-request-discord-simple` - シフト募集Discord通知
- `notify-shift-submitted-discord` - シフト提出Discord通知
- `sync-shifts-to-google-sheet` - Googleスプレッドシート同期
- `discord-shift-interactions` - Discordボタンインタラクション処理

### 2. 特定のFunctionだけをデプロイ

```bash
./deploy-single-function.sh <関数名>
```

**例:**
```bash
./deploy-single-function.sh sync-shifts-to-google-sheet
```

---

## 🔧 手動デプロイ（非推奨）

もし手動でデプロイする場合は、**必ず `--no-verify-jwt` を付けてください**:

```bash
npx supabase functions deploy <関数名> --no-verify-jwt
```

❌ **絶対にこれをやらないでください:**
```bash
npx supabase functions deploy <関数名>  # JWT検証がオンになり動作しません
```

---

## 📝 新しいFunctionを追加した場合

1. `deploy-functions.sh` の `FUNCTIONS` 配列に追加:

```bash
FUNCTIONS=(
  "notify-shift-request-discord-simple"
  "notify-shift-submitted-discord"
  "sync-shifts-to-google-sheet"
  "discord-shift-interactions"
  "your-new-function"  # ← 追加
)
```

2. 一括デプロイを実行:

```bash
./deploy-functions.sh
```

---

## 🐛 トラブルシューティング

### デプロイしたのに動作しない

**原因:** JWT検証がオンになっている

**解決策:**
```bash
./deploy-single-function.sh <関数名>
```

### `--no-verify-jwt` を忘れてデプロイしてしまった

**解決策:** 再度 `--no-verify-jwt` 付きでデプロイしてください:
```bash
./deploy-single-function.sh <関数名>
```

---

## 📚 参考

- Supabase Edge Functions ドキュメント: https://supabase.com/docs/guides/functions
- JWT検証について: https://supabase.com/docs/guides/functions/auth

