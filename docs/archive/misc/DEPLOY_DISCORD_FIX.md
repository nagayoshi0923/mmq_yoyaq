# Discord通知機能の修正とデプロイ

## 実施した修正

### 1. エラーハンドリングの改善

`supabase/functions/notify-private-booking-discord/index.ts`を修正：

- `discord_channel_id`が空の場合、より分かりやすいエラーメッセージを出力
- 空のチャンネルIDでAPIリクエストを送信しないように修正

### 2. 修正内容

**Before (問題):**
```typescript
📤 Sending notification to えいきち (Channel: )  ← 空！
❌ Failed to send notification: 405 Method Not Allowed
```

**After (改善):**
```typescript
⚠️ Skipping えいきち: discord_channel_id not set
❌ Failed to send notification to えいきち: discord_channel_id not set for えいきち
```

## デプロイ手順

### 方法1: Supabase CLI（推奨）

```bash
# プロジェクトディレクトリに移動
cd /Users/nagayoshimai/mmq_yoyaq

# Supabaseにログイン（まだの場合）
supabase login

# プロジェクトをリンク（まだの場合）
supabase link --project-ref cznpcewciwywcqcxktba

# Edge Functionをデプロイ
supabase functions deploy notify-private-booking-discord
```

### 方法2: Supabase Dashboard

1. Supabase Dashboard → Edge Functions
2. `notify-private-booking-discord` を選択
3. 「Deploy new version」をクリック
4. `/Users/nagayoshimai/mmq_yoyaq/supabase/functions/notify-private-booking-discord/index.ts` の内容をコピー＆ペースト
5. 「Deploy」をクリック

## 根本的な解決: discord_channel_idを設定

エラーハンドリングを改善しましたが、**根本的な問題は`discord_channel_id`が設定されていないこと**です。

### 今すぐやること

1. **Discordチャンネルを準備**
   - 共通の通知チャンネル or 各GM専用チャンネル

2. **チャンネルIDを取得**
   ```
   Discord → 設定 → 詳細設定 → 開発者モード ON
   チャンネルを右クリック → 「IDをコピー」
   ```

3. **データベースに設定**
   ```sql
   -- Supabase Dashboard → SQL Editor で実行
   
   -- 全GMに同じチャンネルを使う場合（簡単）
   UPDATE staff 
   SET discord_channel_id = 'YOUR_CHANNEL_ID_HERE'
   WHERE 'gm' = ANY(role) AND status = 'active';
   
   -- または個別に設定
   UPDATE staff SET discord_channel_id = 'CHANNEL_ID_1' WHERE name = 'えいきち';
   UPDATE staff SET discord_channel_id = 'CHANNEL_ID_2' WHERE name = 'まつい';
   -- ...他のGMも同様
   ```

4. **確認**
   ```sql
   SELECT name, discord_channel_id 
   FROM staff 
   WHERE 'gm' = ANY(role) AND status = 'active';
   ```

## テスト

設定完了後:
1. テスト用の貸切リクエストを作成
2. Edge Function のログを確認
   - Supabase Dashboard → Edge Functions → notify-private-booking-discord → Logs
3. Discordチャンネルに通知が届くことを確認

## トラブルシューティング

### ❌ まだ405エラーが出る場合

1. **Edge Functionをデプロイしたか確認**
   ```bash
   supabase functions deploy notify-private-booking-discord
   ```

2. **discord_channel_idが設定されているか確認**
   ```sql
   SELECT name, discord_channel_id, LENGTH(discord_channel_id) as id_length
   FROM staff 
   WHERE 'gm' = ANY(role) AND status = 'active';
   ```
   → `id_length`が17-19桁であることを確認

3. **ボットトークンが有効か確認**
   - Supabase Dashboard → Project Settings → Edge Functions → Secrets
   - `DISCORD_BOT_TOKEN`が設定されているか確認

### 📋 参考ドキュメント

- `DISCORD_CHANNEL_SETUP.md` - チャンネルIDの設定方法
- `database/fix_discord_channel_ids.sql` - SQL設定用テンプレート
- `DISCORD_NOTIFICATION_TROUBLESHOOTING.md` - 詳細なトラブルシューティング

## 完了チェックリスト

- [ ] Edge Functionをデプロイ
- [ ] Discordチャンネルを準備
- [ ] チャンネルIDを取得
- [ ] データベースに`discord_channel_id`を設定
- [ ] テスト用リクエストで動作確認
- [ ] 本番運用開始！

