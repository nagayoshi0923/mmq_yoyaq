# scenariosテーブルにkey_visual_urlカラムを追加

## 概要
マイページの各ページ（遊んだシナリオ、遊びたいシナリオ、予約履歴）でシナリオの画像を表示するために、`scenarios`テーブルに`key_visual_url`カラムを追加します。

## エラー内容
```
column scenarios_1.key_visual_url does not exist
```

## 実行手順

### 1. Supabase SQL Editorで実行

1. [Supabase Dashboard](https://supabase.com/dashboard) にアクセス
2. プロジェクトを選択
3. 左メニューから **SQL Editor** を開く
4. 新しいクエリを作成
5. 以下のSQLを実行：

```sql
-- scenariosテーブルにkey_visual_urlカラムを追加
ALTER TABLE scenarios
ADD COLUMN IF NOT EXISTS key_visual_url TEXT;

-- コメントを追加
COMMENT ON COLUMN scenarios.key_visual_url IS 'シナリオのキービジュアル画像URL';
```

### 2. ローカルでSupabase CLIを使用（オプション）

```bash
# ローカルのSupabaseに接続
supabase db push

# または、SQLファイルを直接実行
psql -h <your-db-host> -U postgres -d postgres -f database/add_key_visual_url_to_scenarios.sql
```

## 確認方法

SQLを実行後、以下のクエリでカラムが追加されたことを確認：

```sql
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'scenarios' AND column_name = 'key_visual_url';
```

結果：
```
column_name      | data_type
-----------------+-----------
key_visual_url   | text
```

## 画像データの登録方法

### シナリオ管理ページから登録
1. 管理画面の「シナリオ管理」ページを開く
2. 各シナリオの編集で画像URLを設定

### SQLで直接更新（例）
```sql
-- 特定のシナリオに画像URLを設定
UPDATE scenarios
SET key_visual_url = 'https://your-storage-url/scenario-image.jpg'
WHERE title = 'シナリオ名';
```

## 注意事項

- このカラムは `TEXT` 型で、NULL許容です
- 既存のシナリオレコードには自動的にNULLが設定されます
- 画像がない場合、UIでは「No Image」フォールバックが表示されます
- 画像URLはSupabase StorageまたはCDNのURLを推奨します

## 関連ファイル

- `src/pages/MyPage/pages/PlayedScenariosPage.tsx` - 遊んだシナリオページ
- `src/pages/MyPage/pages/LikedScenariosPage.tsx` - 遊びたいシナリオページ
- `src/pages/MyPage/pages/ReservationsPage.tsx` - 予約履歴ページ
- `src/components/ui/optimized-image.tsx` - 画像表示コンポーネント

