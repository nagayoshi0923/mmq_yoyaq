# 全体設定テーブルのセットアップ

## 概要
全体設定機能（シフト提出期間設定など）を使用するために、データベースに`global_settings`テーブルを作成する必要があります。

## セットアップ手順

### 1. Supabaseダッシュボードにアクセス

1. [Supabase Dashboard](https://supabase.com/dashboard)にログイン
2. プロジェクトを選択

### 2. SQL Editorを開く

1. 左側のメニューから「SQL Editor」をクリック
2. 「New query」をクリック

### 3. SQLスクリプトを実行

1. `database/create_global_settings_table.sql`の内容をコピー
2. SQL Editorにペースト
3. 「Run」ボタンをクリックして実行

### 4. 実行結果の確認

以下のSQLを実行してテーブルが作成されたことを確認します：

```sql
SELECT * FROM global_settings;
```

1レコードのデータが表示されれば成功です。

## テーブル構造

### `global_settings`テーブル

| カラム名 | 型 | デフォルト値 | 説明 |
|---------|-----|------------|------|
| `id` | UUID | auto | 主キー |
| `shift_submission_start_day` | INTEGER | 1 | シフト提出開始日（毎月X日から） |
| `shift_submission_end_day` | INTEGER | 15 | シフト提出締切日（毎月X日まで） |
| `shift_submission_target_months_ahead` | INTEGER | 1 | 何ヶ月先のシフトを提出するか |
| `system_name` | TEXT | MMQ 予約管理システム | システム名 |
| `maintenance_mode` | BOOLEAN | false | メンテナンスモード |
| `maintenance_message` | TEXT | NULL | メンテナンスメッセージ |
| `enable_email_notifications` | BOOLEAN | true | メール通知の有効化 |
| `enable_discord_notifications` | BOOLEAN | false | Discord通知の有効化 |
| `created_at` | TIMESTAMPTZ | NOW() | 作成日時 |
| `updated_at` | TIMESTAMPTZ | NOW() | 更新日時 |

## 設定方法

### 管理画面から設定

1. ログイン後、「設定」ページに移動
2. サイドバーから「全体設定」を選択
3. シフト提出期間設定を入力
   - **提出開始日**: 毎月X日からシフト提出可能
   - **提出締切日**: 毎月X日までシフト提出可能
   - **対象月**: Xヶ月先のシフトを提出
4. 「保存」ボタンをクリック

### 設定例

#### 例1: 翌月のシフトを月初めに提出
```
提出開始日: 1日
提出締切日: 15日
対象月: 1ヶ月先
```
→ 毎月1日〜15日の間に、翌月のシフトを提出

#### 例2: 翌々月のシフトを月半ばに提出
```
提出開始日: 15日
提出締切日: 25日
対象月: 2ヶ月先
```
→ 毎月15日〜25日の間に、翌々月のシフトを提出

## トラブルシューティング

### エラー: relation "global_settings" does not exist

`global_settings`テーブルが作成されていません。上記の手順3を実行してください。

### エラー: function update_global_settings_updated_at() does not exist

トリガー関数が作成されていません。`create_global_settings_table.sql`全体を実行してください。

### 設定が反映されない

1. ブラウザをリロードしてください
2. データベースで設定を確認：
   ```sql
   SELECT * FROM global_settings;
   ```
3. 値が正しく保存されているか確認

## 関連ファイル

- `/database/create_global_settings_table.sql` - テーブル作成SQL
- `/src/pages/Settings/pages/GeneralSettings.tsx` - 設定画面
- `/src/hooks/useGlobalSettings.ts` - 設定取得フック
- `/src/pages/ShiftSubmission/index.tsx` - シフト提出ページ（設定を使用）

