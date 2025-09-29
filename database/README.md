# データベース管理

## スキーマ管理

### 現在のテーブル構造

#### scenarios テーブル
```sql
CREATE TABLE scenarios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  author TEXT NOT NULL,
  difficulty TEXT NOT NULL CHECK (difficulty IN ('初級', '中級', '上級', '最高級')),
  duration INTEGER NOT NULL, -- 分単位
  min_players INTEGER NOT NULL DEFAULT 4,
  max_players INTEGER NOT NULL DEFAULT 8,
  required_props TEXT[] DEFAULT '{}',
  props JSONB DEFAULT '[]',
  genre TEXT[] DEFAULT '{}',
  production_cost INTEGER DEFAULT 0,                    -- 制作費（数値）
  production_cost_items JSONB DEFAULT '[]',            -- 制作費詳細項目
  gm_fee INTEGER DEFAULT 0,                            -- 廃止予定（gm_assignmentsに移行）
  gm_assignments JSONB DEFAULT '[]',                   -- GM配置情報
  participation_fee INTEGER DEFAULT 0,                 -- 参加費
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

#### schedule_events テーブル
```sql
CREATE TABLE schedule_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date DATE NOT NULL,
  venue TEXT NOT NULL,
  scenario TEXT NOT NULL,
  gms TEXT[] NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  category TEXT NOT NULL DEFAULT 'open' CHECK (category IN ('open', 'private', 'gmtest', 'testplay', 'offsite')),
  status TEXT NOT NULL DEFAULT 'scheduled',
  memo TEXT DEFAULT '',
  is_recurring BOOLEAN DEFAULT FALSE,
  scenario_id UUID REFERENCES scenarios(id),
  store_id UUID REFERENCES stores(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  deleted_at TIMESTAMP WITH TIME ZONE,
  max_players INTEGER DEFAULT 8,
  event_type TEXT DEFAULT 'scheduled'
);
```

### スキーマ変更の手順

1. **変更前の確認**
   ```bash
   # 現在のスキーマを確認
   npx supabase db diff --schema public
   ```

2. **マイグレーションファイルの作成**
   ```bash
   # 新しいマイグレーションを作成
   npx supabase migration new your_migration_name
   ```

3. **スキーマファイルの更新**
   - `database/create_tables.sql`を更新
   - このREADMEも更新

4. **テスト環境での確認**
   ```bash
   # ローカルでテスト
   npx supabase db reset --local
   ```

5. **本番環境への適用**
   ```bash
   # 本番環境に適用
   npx supabase db push
   ```

### よくある問題と解決方法

#### 1. カラム名の変更
- **問題**: `gm_fee` → `gm_assignments`への移行
- **解決**: マイグレーションで段階的に移行
- **注意**: 既存データの移行が必要

#### 2. データ型の変更
- **問題**: `INTEGER` → `JSONB`への変更
- **解決**: 一時的なカラムを作成してデータを移行

#### 3. 制約の追加
- **問題**: `CHECK`制約の追加
- **解決**: 既存データを確認してから制約を追加

### 開発時の注意事項

1. **スキーマ変更時は必ずこのREADMEを更新**
2. **マイグレーションファイルは必ず作成**
3. **本番環境への適用前にローカルでテスト**
4. **カラム名の変更は慎重に行う**

### 参考リンク

- [Supabase Migration Guide](https://supabase.com/docs/guides/database/migrations)
- [PostgreSQL JSONB Documentation](https://www.postgresql.org/docs/current/datatype-json.html)
