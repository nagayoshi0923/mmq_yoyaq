# 予約システム統合セットアップガイド

## 概要
このガイドでは、既存のスケジュール管理システムと予約システムを統合するためのデータベース変更を説明します。

## セットアップ手順

### 1. データベースマイグレーションの実行

Supabase SQL Editorで以下のSQLファイルを実行してください：

```sql
-- database/add_reservation_integration.sql の内容を実行
```

このスクリプトは以下を実行します：
- `customers`テーブルに`email`と`email_verified`カラムを追加
- `reservations`テーブルに`schedule_event_id`カラムを追加
- `schedule_events`テーブルに予約関連カラムを追加
  - `max_participants`: 最大参加人数
  - `reservation_deadline_hours`: 予約締切時間
  - `is_reservation_enabled`: 予約受付可能フラグ
  - `reservation_notes`: 予約時の注意事項
- 便利なビューを作成
  - `reservation_summary`: 予約状況サマリー
  - `customer_reservation_history`: 顧客予約履歴

### 2. 既存データの確認

マイグレーション後、以下のクエリで確認してください：

```sql
-- customersテーブルの確認
SELECT id, name, email, phone FROM customers LIMIT 5;

-- reservationsテーブルの確認
SELECT id, reservation_number, schedule_event_id, status FROM reservations LIMIT 5;

-- schedule_eventsテーブルの確認
SELECT id, scenario, max_participants, is_reservation_enabled FROM schedule_events LIMIT 5;

-- 予約サマリービューの確認
SELECT * FROM reservation_summary LIMIT 5;
```

### 3. 既存予約データの移行（オプション）

既存の予約データに`schedule_event_id`を設定する場合：

```sql
-- 例: 日付・店舗・シナリオが一致するschedule_eventを予約に紐付ける
UPDATE reservations r
SET schedule_event_id = se.id
FROM schedule_events se
WHERE r.schedule_event_id IS NULL
  AND DATE(r.requested_datetime) = se.date
  AND r.store_id = se.venue
  AND r.scenario_id = (SELECT id FROM scenarios WHERE title = se.scenario LIMIT 1);

-- 紐付け結果の確認
SELECT 
  COUNT(*) as total,
  COUNT(schedule_event_id) as linked,
  COUNT(*) - COUNT(schedule_event_id) as unlinked
FROM reservations;
```

### 4. 最大参加人数の設定

各公演に最大参加人数を設定：

```sql
-- 例: 全公演に一律6人を設定
UPDATE schedule_events 
SET max_participants = 6 
WHERE max_participants IS NULL;

-- またはシナリオごとに設定
UPDATE schedule_events se
SET max_participants = s.player_count_max
FROM scenarios s
WHERE se.scenario = s.title
  AND se.max_participants IS NULL;
```

### 5. 予約受付設定

予約受付の初期設定：

```sql
-- 全公演で予約受付を有効化
UPDATE schedule_events 
SET is_reservation_enabled = true,
    reservation_deadline_hours = 0
WHERE is_reservation_enabled IS NULL;

-- GMテスト公演は予約受付を無効化
UPDATE schedule_events 
SET is_reservation_enabled = false
WHERE category = 'gmtest';
```

## 確認事項

### ✅ チェックリスト

- [ ] `customers`テーブルに`email`カラムが追加された
- [ ] `reservations`テーブルに`schedule_event_id`カラムが追加された
- [ ] `schedule_events`テーブルに予約関連カラムが追加された
- [ ] `reservation_summary`ビューが作成された
- [ ] `customer_reservation_history`ビューが作成された
- [ ] 既存の予約データが正常に動作する
- [ ] 各公演に`max_participants`が設定された

## トラブルシューティング

### エラー: relation "reservation_summary" already exists
```sql
-- ビューを削除して再作成
DROP VIEW IF EXISTS reservation_summary CASCADE;
DROP VIEW IF EXISTS customer_reservation_history CASCADE;
-- その後、add_reservation_integration.sqlを再実行
```

### エラー: column "email" already exists
```sql
-- カラムが既に存在する場合はスキップされます（IF NOT EXISTS使用）
-- エラーが出た場合は、既に追加済みなので問題ありません
```

### 予約サマリーのデータが表示されない
```sql
-- schedule_eventsとreservationsの紐付けを確認
SELECT 
  se.id,
  se.scenario,
  COUNT(r.id) as reservation_count
FROM schedule_events se
LEFT JOIN reservations r ON r.schedule_event_id = se.id
GROUP BY se.id, se.scenario
ORDER BY reservation_count DESC
LIMIT 10;
```

## 次のステップ

1. ✅ データベースマイグレーション完了
2. ⏭️ 予約管理画面の実装
3. ⏭️ スケジュール画面に予約数表示
4. ⏭️ 空席管理システムの構築
5. ⏭️ 顧客向け予約画面の実装

---

📝 **注意**: 本番環境で実行する前に、必ずバックアップを取得してください。

