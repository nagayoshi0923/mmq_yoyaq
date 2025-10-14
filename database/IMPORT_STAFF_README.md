# スタッフマスターデータのインポート手順

このガイドでは、スタッフマスターデータをデータベースにインポートする手順を説明します。

## 実行順序

### 方法1: 初回インポート（簡単・推奨）

初めてスタッフデータをインポートする場合は、こちらを推奨します。

1. Supabase DashboardのSQL Editorを開く
2. `database/import_staff_master_simple.sql`の内容をコピー&ペースト
3. 実行する

**実行するSQL:**
```sql
-- database/import_staff_master_simple.sql
```

これだけで完了！ON CONFLICTを使わないシンプル版です。

### 方法2: 更新可能なインポート（2ステップ）

既存データを更新したい場合や、何度も実行する可能性がある場合はこちらを使用します。

#### ステップ1: UNIQUE制約の追加

nameカラムにUNIQUE制約を追加し、重複したスタッフ登録を防ぎます。

1. Supabase DashboardのSQL Editorを開く
2. `database/add_staff_name_unique.sql`の内容をコピー&ペースト
3. 実行する

**実行するSQL:**
```sql
-- database/add_staff_name_unique.sql
```

#### ステップ2: スタッフデータのインポート

制約が追加されたら、スタッフデータをインポートします。

1. Supabase DashboardのSQL Editorを開く
2. `database/import_staff_master.sql`の内容をコピー&ペースト
3. 実行する

**実行するSQL:**
```sql
-- database/import_staff_master.sql
```

この方法なら、同じSQLを何度実行しても既存データが更新されます。

## データ構造

| カラム名 | 説明 | 例 |
|---------|------|---|
| name | スタッフ名（表示名） | えいきち |
| line_name | LINE名 | まい（えいきち） |
| x_account | Xアカウント | @mt_shira |
| stores | 出勤店舗（配列） | {} |
| ng_days | NG曜日（配列） | {土曜,日曜} |
| want_to_learn | 覚えたい作品一覧（配列） | {} |
| role | 役割（配列） | {admin,manager,gm,staff,author} |
| notes | 備考 | 社長 |
| status | ステータス | active/inactive/on-leave |

## 役割（role）の種類

| role | 説明 | 例 |
|------|------|---|
| admin | 管理者 | えいきち、江波 |
| manager | マネージャー | ソラ、八継じの、つばめ |
| gm | GMスタッフ | きゅう、松井、しらやま |
| staff | 一般スタッフ | さく |
| author | 作品制作者 | ほがらか、みくみん |

## インポートされるスタッフ

### 管理者・マネージャー（5名）
- えいきち（社長）
- 江波（えなみん）- 制作企画・監修
- ソラ（マネージャー）
- 八継じの（マネージャー）
- つばめ（マネージャー）

### GMスタッフ（16名）
- きゅう
- 松井（まつい）
- れいにー
- Remia（れみあ）
- みずき
- りえぞー
- えりん
- ぽんちゃん
- しらやま
- 崎
- ぴよな
- あんころ
- りんな
- labo
- イワセモリシ
- 藤崎ソルト

### 作品制作者・その他（4名）
- さく（事務）
- ほがらか（自作のみのGM）
- みくみん（作品制作者）
- 古賀（イベント担当）

## 確認方法

インポート後、以下のSQLで確認できます：

```sql
-- 全スタッフ確認
SELECT 
  name,
  line_name,
  array_to_string(role, ', ') as roles,
  array_to_string(ng_days, ', ') as ng_days,
  notes,
  status
FROM staff
ORDER BY name;

-- 役割別集計
SELECT 
  UNNEST(role) as role_type,
  COUNT(*) as count
FROM staff
GROUP BY role_type
ORDER BY count DESC;

-- GMスタッフのみ
SELECT 
  name,
  line_name,
  array_to_string(ng_days, ', ') as ng_days,
  notes
FROM staff
WHERE 'gm' = ANY(role)
ORDER BY name;
```

## NG曜日の設定例

| スタッフ名 | NG曜日 |
|-----------|--------|
| ソラ | 土曜、日曜 |
| さく | 土曜、日曜 |
| りえぞー | 水曜昼、金曜昼、月曜夜 |
| えりん | 平日昼 |
| ぽんちゃん | 水曜、金曜夜、土曜、日曜、祝日 |
| しらやま | 月曜、金曜1日、火水木土の朝昼 |
| 崎 | 平日 |
| りんな | 月水金の夜 |

## スタッフの管理

### 新規スタッフの追加

```sql
INSERT INTO staff (name, line_name, role, ng_days, notes)
VALUES ('新スタッフ', 'LINE名', '{gm,staff}', '{土曜,日曜}', '備考');
```

### スタッフ情報の更新

```sql
UPDATE staff
SET 
  ng_days = '{月曜,水曜}',
  notes = '新しい備考',
  updated_at = NOW()
WHERE name = 'えいきち';
```

### スタッフのステータス変更

```sql
-- 休職中に変更
UPDATE staff
SET status = 'on-leave', updated_at = NOW()
WHERE name = 'スタッフ名';

-- 退職
UPDATE staff
SET status = 'inactive', updated_at = NOW()
WHERE name = 'スタッフ名';
```

## トラブルシューティング

### エラー: there is no unique or exclusion constraint

**原因:** ステップ1の`add_staff_name_unique.sql`が実行されていません。

**解決方法:** 
1. `database/add_staff_name_unique.sql`を実行
2. その後、`database/import_staff_master.sql`を再実行

### エラー: duplicate key value violates unique constraint "staff_name_unique"

**原因:** データベースに既に同じ名前のスタッフが存在しています。

**解決方法:** これは正常です。ON CONFLICTにより既存データが自動的に更新されます。

## 備考

- スタッフ名はユニーク（一意）である必要があります
- NG曜日は配列形式で複数設定できます
- roleも配列形式で複数の役割を設定できます（例：{admin,gm}）
- statusは「active」「inactive」「on-leave」のいずれか

