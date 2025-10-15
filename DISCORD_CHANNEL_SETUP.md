# DiscordチャンネルIDの設定方法

## 問題
貸切確認通知が届かない原因: スタッフテーブルに`discord_channel_id`が設定されていません。

エラーログ:
```
📤 Sending notification to まつい (Channel: )  ← チャンネルIDが空！
❌ Failed to send notification to まつい: Error: Discord API error: 405 Method Not Allowed
```

## 解決手順

### 1. Discordチャンネルの準備

各GMごとに以下のいずれかを用意:

#### オプションA: 個別DMチャンネル（推奨）
- ボットから各GMにDMを送る
- プライバシーが保たれる
- **制限**: ボットは最初にGMからメッセージを受け取る必要がある

#### オプションB: 専用通知チャンネル
- 各GM専用のプライベートチャンネルを作成
- ボットを各チャンネルに招待
- より確実

### 2. DiscordチャンネルIDの取得

1. **開発者モードを有効化**
   - Discord設定 → 詳細設定 → 開発者モード をON

2. **チャンネルIDをコピー**
   - チャンネルを右クリック
   - 「IDをコピー」をクリック
   - 例: `1234567890123456789`（18桁の数字）

### 3. データベースに設定

#### 方法A: Supabase Dashboard（簡単）

1. Supabase Dashboard → Database → Table Editor
2. `staff` テーブルを開く
3. 該当するGMの行を見つける
4. `discord_channel_id` カラムに、コピーしたIDを貼り付け
5. 保存

#### 方法B: SQL Editor

```sql
-- まず現在の状況を確認
SELECT 
  id,
  name,
  discord_channel_id,
  status
FROM staff
WHERE 'gm' = ANY(role)
  AND status = 'active'
ORDER BY name;

-- 各GMにチャンネルIDを設定（実際のIDに置き換えてください）
UPDATE staff 
SET discord_channel_id = '1234567890123456789'
WHERE name = 'まつい';

UPDATE staff 
SET discord_channel_id = '9876543210987654321'
WHERE name = '崎';

-- 他のGMも同様に設定...

-- 設定を確認
SELECT 
  name,
  discord_channel_id,
  CASE 
    WHEN discord_channel_id IS NOT NULL THEN '✅ 設定済み'
    ELSE '❌ 未設定'
  END as status
FROM staff
WHERE 'gm' = ANY(role)
  AND status = 'active'
ORDER BY name;
```

### 4. ボットの権限確認

各チャンネルでボットが以下の権限を持っているか確認:
- ✅ `Send Messages` (メッセージを送信)
- ✅ `Embed Links` (埋め込みリンク)
- ✅ `Use Application Commands` (アプリケーションコマンドを使用)

### 5. テスト

1. 設定完了後、テスト用の貸切リクエストを作成
2. 各GMのチャンネルに通知が届くことを確認
3. ボタンが正しく動作することを確認

## トラブルシューティング

### ❌ 通知が届かない場合

**チェック1: チャンネルIDは正しいか？**
```sql
SELECT name, discord_channel_id, LENGTH(discord_channel_id) as id_length
FROM staff
WHERE 'gm' = ANY(role) AND status = 'active';
```
→ `id_length`が17-19桁であることを確認

**チェック2: ボットがチャンネルにアクセスできるか？**
- プライベートチャンネルの場合、ボットを招待してください
- DMの場合、GMが先にボットにメッセージを送る必要があります

**チェック3: Discord Bot Tokenは有効か？**
```bash
# Supabase Dashboard → Project Settings → Edge Functions → Manage secrets
# DISCORD_BOT_TOKEN が設定されているか確認
```

### ⚠️ DMチャンネルを使う場合の注意

Discordボットは、ユーザーからメッセージを受け取っていないとDMを送れません。

**解決方法**:
1. 各GMにボットへのDMを送ってもらう（例: `/hello`コマンド）
2. その後、DMチャンネルのIDを取得して設定

または、専用の通知チャンネルを使う方が確実です。

## 推奨セットアップ

### パターン1: 全員共通チャンネル（簡単）
```
Discordサーバー
└── 📢 gm-貸切通知（全GMが見られる共通チャンネル）
    └── ボットからの通知が届く
```

**メリット**: 設定が簡単、1つのチャンネルIDのみ
**デメリット**: 他のGMの回答が見える

→ 全GMに同じチャンネルIDを設定:
```sql
UPDATE staff 
SET discord_channel_id = '1234567890123456789'
WHERE 'gm' = ANY(role) AND status = 'active';
```

### パターン2: 個別チャンネル（プライバシー重視）
```
Discordサーバー
├── 📢 gm-まつい（まつい専用）
├── 📢 gm-崎（崎専用）
├── 📢 gm-えいきち（えいきち専用）
└── ...
```

**メリット**: 各GMの回答がプライベート
**デメリット**: チャンネル数が多い

→ 各GMに個別のチャンネルIDを設定（上記SQL参照）

## 次のステップ

1. ✅ Discordチャンネルを準備
2. ✅ チャンネルIDを取得
3. ✅ データベースに設定（`database/fix_discord_channel_ids.sql`を使用）
4. ✅ テスト用貸切リクエストで確認
5. ✅ 本番運用開始！

