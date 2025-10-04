# シフト提出サンプルデータ

このドキュメントでは、シフト提出機能のテスト用サンプルデータの投入方法を説明します。

## 📋 前提条件

以下のセットアップが完了していること:
1. `shift_submissions`テーブルが作成済み
2. `staff`テーブルにスタッフデータが存在
3. スタッフに`user_id`が設定済み（任意）

## 🎯 サンプルデータの内容

2025年10月1日～31日の期間で、6名のスタッフのシフトを作成します:

| スタッフ名 | シフトパターン |
|-----------|--------------|
| 田中 太郎 | 平日夜間メイン + 週末午後 |
| 佐藤 花子 | 週末フルタイム + 平日午後 |
| 鈴木 一郎 | 週末専門 + 金曜夜 |
| 伊藤 健太 | 火水木金 終日 |
| 山田 美咲 | 月水金 午後～夜間 |
| 高橋 健 | ほぼフルタイム（日曜休み） |

## 🚀 実行手順

### ステップ1: Supabase Studioにアクセス

1. ブラウザでSupabase Studioを開く
2. プロジェクトを選択
3. 左メニューから「SQL Editor」を選択
4. 「New Query」をクリック

### ステップ2: スタッフ名を確認

まず、既存のスタッフ名を確認:

```sql
SELECT id, name FROM staff ORDER BY name;
```

### ステップ3: サンプルデータを投入

`database/insert_sample_shifts_simple.sql`の内容をコピーして実行。

または、以下の簡易版を実行:

```sql
-- 田中 太郎: 平日夜間 + 週末午後
WITH target_staff AS (
  SELECT id FROM staff WHERE name = '田中 太郎' LIMIT 1
)
INSERT INTO shift_submissions (staff_id, date, morning, afternoon, evening, status, submitted_at)
SELECT 
  target_staff.id,
  d::date,
  false,
  CASE WHEN EXTRACT(DOW FROM d) IN (0, 6) THEN true ELSE false END,
  CASE WHEN EXTRACT(DOW FROM d) IN (1, 2, 3, 4, 5) THEN true ELSE false END,
  'submitted',
  NOW()
FROM target_staff, generate_series('2025-10-01', '2025-10-31', '1 day'::interval) d
ON CONFLICT (staff_id, date) DO NOTHING;

-- 佐藤 花子: 週末フルタイム + 平日午後
WITH target_staff AS (
  SELECT id FROM staff WHERE name = '佐藤 花子' LIMIT 1
)
INSERT INTO shift_submissions (staff_id, date, morning, afternoon, evening, all_day, status, submitted_at)
SELECT 
  target_staff.id,
  d::date,
  CASE WHEN EXTRACT(DOW FROM d) IN (0, 6) THEN true ELSE false END,
  true,
  CASE WHEN EXTRACT(DOW FROM d) IN (0, 5, 6) THEN true ELSE false END,
  CASE WHEN EXTRACT(DOW FROM d) IN (0, 6) THEN true ELSE false END,
  'submitted',
  NOW()
FROM target_staff, generate_series('2025-10-01', '2025-10-31', '1 day'::interval) d
ON CONFLICT (staff_id, date) DO NOTHING;

-- 鈴木 一郎: 週末専門
WITH target_staff AS (
  SELECT id FROM staff WHERE name = '鈴木 一郎' LIMIT 1
)
INSERT INTO shift_submissions (staff_id, date, morning, afternoon, evening, all_day, status, submitted_at)
SELECT 
  target_staff.id,
  d::date,
  CASE WHEN EXTRACT(DOW FROM d) IN (0, 6) THEN true ELSE false END,
  CASE WHEN EXTRACT(DOW FROM d) IN (0, 6) THEN true ELSE false END,
  CASE WHEN EXTRACT(DOW FROM d) IN (0, 5, 6) THEN true ELSE false END,
  CASE WHEN EXTRACT(DOW FROM d) IN (0, 6) THEN true ELSE false END,
  'submitted',
  NOW()
FROM target_staff, generate_series('2025-10-01', '2025-10-31', '1 day'::interval) d
ON CONFLICT (staff_id, date) DO NOTHING;
```

### ステップ4: データ確認

投入されたデータを確認:

```sql
-- シフト提出状況の確認
SELECT 
  s.name,
  COUNT(*) as 提出日数,
  SUM(CASE WHEN ss.morning THEN 1 ELSE 0 END) as 午前,
  SUM(CASE WHEN ss.afternoon THEN 1 ELSE 0 END) as 午後,
  SUM(CASE WHEN ss.evening THEN 1 ELSE 0 END) as 夜間,
  SUM(CASE WHEN ss.all_day THEN 1 ELSE 0 END) as 終日
FROM shift_submissions ss
JOIN staff s ON s.id = ss.staff_id
WHERE ss.date >= '2025-10-01' AND ss.date <= '2025-10-31'
GROUP BY s.name
ORDER BY s.name;

-- 特定の日のシフト状況
SELECT 
  s.name,
  ss.date,
  ss.morning as 午前,
  ss.afternoon as 午後,
  ss.evening as 夜間,
  ss.all_day as 終日,
  ss.status
FROM shift_submissions ss
JOIN staff s ON s.id = ss.staff_id
WHERE ss.date = '2025-10-05'  -- 土曜日
ORDER BY s.name;
```

## ✅ 動作確認

### 1. スケジュールページで確認

1. アプリにログイン（管理者アカウント）
2. スケジュール管理ページを開く
3. 2025年10月を表示
4. 各タイムスロット（午前・午後・夜間）に出勤可能なスタッフのアバターが表示されることを確認

### 2. シフト提出ページで確認

1. スタッフアカウントでログイン
2. シフト提出ページを開く
3. 10月のシフトが既に入力されていることを確認

## 🔧 カスタマイズ

### 異なる月のデータを作成

```sql
-- 11月のデータを作成
WITH target_staff AS (
  SELECT id FROM staff WHERE name = '田中 太郎' LIMIT 1
)
INSERT INTO shift_submissions (staff_id, date, morning, afternoon, evening, status)
SELECT 
  target_staff.id,
  d::date,
  true,
  true,
  true,
  'draft'  -- 下書き状態
FROM target_staff, generate_series('2025-11-01', '2025-11-30', '1 day'::interval) d
ON CONFLICT (staff_id, date) DO NOTHING;
```

### 特定の日だけ追加

```sql
-- 特定の日付のシフトを追加
INSERT INTO shift_submissions (staff_id, date, morning, afternoon, evening, all_day, status, submitted_at)
VALUES 
  ((SELECT id FROM staff WHERE name = '田中 太郎'), '2025-10-15', true, true, true, true, 'submitted', NOW()),
  ((SELECT id FROM staff WHERE name = '佐藤 花子'), '2025-10-15', false, true, true, false, 'submitted', NOW())
ON CONFLICT (staff_id, date) DO UPDATE SET
  morning = EXCLUDED.morning,
  afternoon = EXCLUDED.afternoon,
  evening = EXCLUDED.evening,
  all_day = EXCLUDED.all_day,
  status = EXCLUDED.status;
```

### データの削除

```sql
-- 10月のシフトデータを全削除
DELETE FROM shift_submissions WHERE date >= '2025-10-01' AND date <= '2025-10-31';

-- 特定スタッフのシフトを削除
DELETE FROM shift_submissions 
WHERE staff_id = (SELECT id FROM staff WHERE name = '田中 太郎')
  AND date >= '2025-10-01' AND date <= '2025-10-31';
```

## 📊 期待される結果

サンプルデータ投入後、スケジュール画面では:

- **平日午前**: 佐藤花子、伊藤健太、高橋健のアバター表示
- **平日午後**: ほぼ全員のアバター表示（充実）
- **平日夜間**: 田中太郎、佐藤花子、伊藤健太、山田美咲、高橋健のアバター表示
- **週末**: 鈴木一郎、佐藤花子を含む多くのスタッフが出勤可能

各タイムスロットに50pxのアバターが表示され、マウスホバーでスタッフ名が確認できます。

## 🎉 完了！

これでシフト提出機能のテストデータが投入されました！
スケジュール画面で各スタッフのアバターが表示されることを確認してください。

