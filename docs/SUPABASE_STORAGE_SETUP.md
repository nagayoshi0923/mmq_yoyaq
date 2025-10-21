# Supabase Storage セットアップ

シナリオのキービジュアル画像をアップロードするために、Supabase Storageのバケットを作成します。

## 1. Supabase Storageバケットの作成

### 手順

1. **Supabase Dashboard にアクセス**
   - https://supabase.com/dashboard
   - プロジェクトを選択

2. **Storage ページを開く**
   - 左メニューから **Storage** をクリック

3. **新しいバケットを作成**
   - **Create bucket** ボタンをクリック
   - バケット名: `key-visuals`
   - Public bucket: **ON** （公開バケットにする）
   - **Create bucket** をクリック

## 2. フォルダ構造（オプション）

バケット内にファイルが直接保存されます：

```
key-visuals/
├── scenario1.jpg
├── scenario2.png
└── ...
```

フォルダは不要です。すべての画像がバケット直下に保存されます。

## 3. ストレージポリシーの設定

### 3.1 すべてのユーザーに読み取りを許可（推奨）

```sql
-- 誰でも画像を閲覧可能
CREATE POLICY "Public read access"
ON storage.objects FOR SELECT
USING (bucket_id = 'key-visuals');
```

### 3.2 管理者とスタッフのみアップロード可能

```sql
-- 管理者とスタッフのみアップロード可能
CREATE POLICY "Admin and staff can upload"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'key-visuals' AND
  auth.role() = 'authenticated' AND
  EXISTS (
    SELECT 1 FROM users
    WHERE users.id = auth.uid()
    AND users.role IN ('admin', 'staff')
  )
);
```

### 3.3 管理者とスタッフのみ削除可能

```sql
-- 管理者とスタッフのみ削除可能
CREATE POLICY "Admin and staff can delete"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'key-visuals' AND
  auth.role() = 'authenticated' AND
  EXISTS (
    SELECT 1 FROM users
    WHERE users.id = auth.uid()
    AND users.role IN ('admin', 'staff')
  )
);
```

### 3.4 管理者とスタッフのみ更新可能

```sql
-- 管理者とスタッフのみ更新可能
CREATE POLICY "Admin and staff can update"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'key-visuals' AND
  auth.role() = 'authenticated' AND
  EXISTS (
    SELECT 1 FROM users
    WHERE users.id = auth.uid()
    AND users.role IN ('admin', 'staff')
  )
);
```

## 4. ポリシーの適用方法

1. **SQL Editor を開く**
   - 左メニューから **SQL Editor** をクリック

2. **ポリシーを実行**
   - 上記のSQLを順番に実行

## 5. 動作確認

### シナリオ管理ページで確認

1. シナリオ管理ページを開く
2. シナリオを編集
3. キービジュアル画像をアップロード
4. 画像が表示されることを確認

### アップロードされた画像の確認

1. Supabase Dashboard の Storage ページを開く
2. `key-visuals` バケットをクリック
3. アップロードされた画像が表示される

## 6. トラブルシューティング

### 画像がアップロードできない

**原因1: バケットが公開されていない**
- Storage > key-visuals > Settings
- Public bucket が **ON** になっているか確認

**原因2: ポリシーが設定されていない**
- SQL Editorで上記のポリシーが実行されているか確認

**原因3: ファイルサイズが大きすぎる**
- デフォルトで5MBまで
- より大きいファイルをアップロードする場合は、`src/lib/uploadImage.ts` の `validateImageFile` 関数を修正

### 画像が表示されない

**原因1: 公開URLが正しくない**
- Storage > key-visuals > ファイルを右クリック > Get URL
- URLが正しく取得できるか確認

**原因2: CORSの問題**
- Supabase Dashboard > Settings > API > CORS
- アプリケーションのドメインが許可されているか確認

## 7. 画像の最適化（オプション）

### 推奨画像サイズ
- 幅: 800px - 1200px
- 高さ: 1000px - 1600px
- アスペクト比: 3:4 または 2:3
- ファイル形式: JPEG, PNG, WebP
- ファイルサイズ: 500KB以下推奨

### 画像圧縮ツール
- [TinyPNG](https://tinypng.com/)
- [Squoosh](https://squoosh.app/)
- [ImageOptim](https://imageoptim.com/)（Mac）

## 8. 参考リンク

- [Supabase Storage Documentation](https://supabase.com/docs/guides/storage)
- [Storage Security](https://supabase.com/docs/guides/storage/security/access-control)

