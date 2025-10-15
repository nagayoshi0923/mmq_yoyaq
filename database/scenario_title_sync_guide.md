# シナリオタイトル変更の自動反映設定ガイド

## 問題
シナリオマスタでタイトルを変更しても、スケジュール画面に反映されない。

## 原因
`schedule_events`テーブルには以下の2つのフィールドがあります：
- `scenario` (TEXT型): シナリオ名を直接保存（古い方式）
- `scenario_id` (UUID型): シナリオマスタへの参照（新しい方式）

古いデータは`scenario_id`が設定されていないため、タイトル変更が反映されません。

## 解決策

### 1. 既存データのscenario_idを設定

以下のSQLを**Supabase SQL Editor**で実行してください：

```sql
-- 既存公演にscenario_idを自動設定
UPDATE schedule_events se
SET scenario_id = s.id
FROM scenarios s
WHERE se.scenario_id IS NULL
  AND se.scenario = s.title
  AND se.scenario IS NOT NULL
  AND se.scenario != '';
```

### 2. フロントエンドの修正（完了済み）

以下の修正が完了しています：

#### ScheduleManager.tsx
- ✅ 表示時に`scenarios.title`（最新）を優先
- ✅ 新規作成時に`scenario_id`を保存
- ✅ 編集時に`scenario_id`を更新

## 実行手順

1. **SQLを実行**
   ```bash
   # Supabaseダッシュボード > SQL Editor で実行
   # または以下のファイルの内容をコピペ
   ```
   ファイル: `database/update_scenario_ids.sql`

2. **確認**
   ```sql
   -- scenario_idが設定されているか確認
   SELECT 
     COUNT(*) as total_events,
     COUNT(scenario_id) as with_id,
     COUNT(*) - COUNT(scenario_id) as without_id
   FROM schedule_events
   WHERE date >= '2025-01-01';
   ```

3. **スケジュール画面をリロード**
   - ブラウザでスケジュール画面を開く
   - F5キーでリロード
   - シナリオマスタで変更したタイトルが表示される ✅

## 動作確認

1. **シナリオ管理画面**で任意のシナリオのタイトルを変更
2. **スケジュール画面**をリロード
3. 変更されたタイトルが表示されることを確認 ✅

## 今後の動作

- **新規公演**: 自動的に`scenario_id`が設定される
- **公演編集**: シナリオを変更すると`scenario_id`も更新される
- **タイトル変更**: シナリオマスタで変更すれば全公演に反映される

## トラブルシューティング

### Q: まだ古いタイトルが表示される
A: 以下を確認してください：
```sql
-- 該当公演のscenario_idを確認
SELECT id, scenario, scenario_id 
FROM schedule_events 
WHERE scenario = '古いタイトル名';
```

`scenario_id`が`NULL`の場合は、手動で設定：
```sql
UPDATE schedule_events
SET scenario_id = (SELECT id FROM scenarios WHERE title = '正しいタイトル名')
WHERE scenario = '古いタイトル名';
```

### Q: シナリオ名が一致しないためIDが設定されない
A: `database/check_scenario_id_status.sql`を実行して一致しないシナリオを確認し、手動で修正してください。

