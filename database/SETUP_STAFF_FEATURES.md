# スタッフ機能セットアップガイド

このガイドでは、スタッフアバター機能とシフト提出機能をセットアップする手順を説明します。

## 📋 必要な作業

1. スタッフテーブルにアバター関連カラムを追加
2. スタッフテーブルとauth.usersを紐付けるuser_idカラムを追加
3. シフト提出テーブルを作成
4. 既存スタッフとユーザーアカウントを紐付け

## 🔧 セットアップ手順

### ステップ1: Supabase Studioにアクセス

1. ブラウザでSupabase Studioを開く
2. プロジェクトを選択
3. 左メニューから「SQL Editor」を選択

### ステップ2: スタッフアバター機能を追加

以下のSQLを実行:

```sql
-- スタッフテーブルにアバター画像カラムを追加
ALTER TABLE staff ADD COLUMN IF NOT EXISTS avatar_url TEXT;

-- アバター背景色カラムを追加（未設定時のデフォルト色用）
ALTER TABLE staff ADD COLUMN IF NOT EXISTS avatar_color TEXT DEFAULT '#3B82F6';
```

### ステップ3: スタッフとユーザーアカウントを紐付け

以下のSQLを実行:

```sql
-- スタッフテーブルにuser_idカラムを追加してauth.usersと紐付け
ALTER TABLE staff ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;

-- user_idにインデックスを追加
CREATE INDEX IF NOT EXISTS idx_staff_user_id ON staff(user_id);
```

### ステップ4: 既存データの紐付け（任意）

既存のスタッフデータがある場合、emailに基づいてuser_idを更新:

```sql
-- emailに基づいてuser_idを更新
UPDATE staff
SET user_id = (SELECT id FROM auth.users WHERE auth.users.email = staff.email)
WHERE email IS NOT NULL;
```

### ステップ5: シフト提出テーブルを作成

以下のSQLを実行:

```sql
-- シフト提出テーブル
CREATE TABLE IF NOT EXISTS shift_submissions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  staff_id UUID REFERENCES staff(id) ON DELETE CASCADE NOT NULL,
  date DATE NOT NULL,
  morning BOOLEAN DEFAULT false,
  afternoon BOOLEAN DEFAULT false,
  evening BOOLEAN DEFAULT false,
  all_day BOOLEAN DEFAULT false,
  submitted_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'submitted', 'approved', 'rejected')),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(staff_id, date)
);

-- インデックス
CREATE INDEX IF NOT EXISTS idx_shift_submissions_staff_id ON shift_submissions(staff_id);
CREATE INDEX IF NOT EXISTS idx_shift_submissions_date ON shift_submissions(date);
CREATE INDEX IF NOT EXISTS idx_shift_submissions_status ON shift_submissions(status);

-- RLSポリシー
ALTER TABLE shift_submissions ENABLE ROW LEVEL SECURITY;

-- スタッフは自分のシフトのみアクセス可能
CREATE POLICY shift_submissions_self_policy ON shift_submissions
  FOR ALL USING (
    staff_id IN (
      SELECT id FROM staff WHERE user_id = auth.uid()
    )
  );

-- 管理者は全てのシフトにアクセス可能（開発用）
CREATE POLICY shift_submissions_admin_policy ON shift_submissions
  FOR ALL USING (
    auth.uid() IS NOT NULL
  );
```

## ✅ 動作確認

### 1. スタッフアバターの確認

1. アプリにログイン
2. スタッフ管理ページを開く
3. 各スタッフの名前の横に丸いアバターが表示されることを確認
4. アバターには名前の最初の2文字が表示される

### 2. シフト提出機能の確認

1. スタッフアカウントでログイン
2. 「シフト提出」ページを開く
3. 各日付の時間帯にチェックを入れる
4. 「下書き保存」または「提出」ボタンをクリック
5. 保存されることを確認

### 3. スケジュールでのアバター表示確認

1. 管理者アカウントでログイン
2. スケジュール管理ページを開く
3. 各タイムスロットに出勤可能なスタッフのアバターが表示されることを確認

## 🔍 トラブルシューティング

### エラー: "relation does not exist"

- テーブルが存在しない場合のエラーです
- SQLを順番に実行してください

### エラー: "column already exists"

- カラムが既に存在する場合のエラーです
- `IF NOT EXISTS` を使用しているので、通常は発生しません
- 安全に無視できます

### エラー: "foreign key constraint"

- 外部キー制約エラーです
- auth.usersテーブルにユーザーが存在することを確認してください

### スタッフのアバターが表示されない

1. staffテーブルにavatar_urlとavatar_colorカラムが追加されているか確認
2. ブラウザのキャッシュをクリア
3. アプリを再起動

### シフトが保存されない

1. shift_submissionsテーブルが作成されているか確認
2. staffテーブルのuser_idが正しく設定されているか確認
3. RLSポリシーが正しく設定されているか確認

## 📝 追加のカスタマイズ

### アバター画像をアップロード

Supabase Storageを使用してアバター画像をアップロード:

```sql
-- スタッフのアバターURLを更新
UPDATE staff
SET avatar_url = 'https://your-supabase-project.supabase.co/storage/v1/object/public/avatars/staff-123.jpg'
WHERE id = 'staff-id-here';
```

### カスタムアバターカラーを設定

```sql
-- スタッフのアバターカラーを更新
UPDATE staff
SET avatar_color = '#10B981'  -- 緑色
WHERE id = 'staff-id-here';
```

## 🎉 完了！

これでスタッフアバター機能とシフト提出機能のセットアップが完了しました！

