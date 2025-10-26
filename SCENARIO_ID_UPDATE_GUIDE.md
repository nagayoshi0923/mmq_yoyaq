# scenario_id 一括紐付けガイド

## 状況
- `ScenarioMatcher`でタイトルは既にマッチ済み
- しかし`scenario_id`は設定されていない（古いバージョンのバグ）
- `AddDemoParticipants`などのツールがIDベースで動作するため、紐付けが必要

## 実行方法

### 1. Supabaseダッシュボードを開く
1. https://supabase.com/dashboard にアクセス
2. プロジェクト「MMQ YOYAQ」を選択
3. 左メニューから「SQL Editor」を選択

### 2. SQLを実行
以下のSQLをコピー＆ペーストして実行：

```sql
-- scenario_idがNULLだがscenarioタイトルがscenariosテーブルに存在する場合、IDを自動設定
UPDATE schedule_events se
SET scenario_id = s.id
FROM scenarios s
WHERE se.scenario_id IS NULL
  AND se.scenario = s.title
  AND se.scenario IS NOT NULL
  AND se.scenario != '';
```

または、プロジェクトルートの `database/update_missing_scenario_ids.sql` を実行してください。

### 3. 確認
実行後、以下のSQLで結果を確認：

```sql
SELECT 
  COUNT(*) as total_events,
  COUNT(scenario_id) as with_id,
  COUNT(*) FILTER (WHERE scenario_id IS NULL AND scenario IS NOT NULL AND scenario != '') as without_id
FROM schedule_events;
```

**期待される結果:**
- `with_id`: ほぼ全てのイベント
- `without_id`: 0件、またはシナリオマスタに未登録のイベントのみ

### 4. 未紐付けの確認（オプション）
まだIDが紐付けられていないイベントを確認：

```sql
SELECT 
  scenario,
  COUNT(*) as count,
  MIN(date) as first_date,
  MAX(date) as last_date
FROM schedule_events
WHERE scenario_id IS NULL
  AND scenario IS NOT NULL
  AND scenario != ''
GROUP BY scenario
ORDER BY count DESC;
```

これらは以下のいずれか：
- シナリオマスタに未登録（本当に登録されていない）
- タイトルの表記が微妙に違う（全角/半角、スペースなど）

## 効果
このSQLを実行すると：
- ✅ `AddDemoParticipants`が確実に動作
- ✅ タイトルの表記違いによるエラーが激減
- ✅ 今後のシナリオタイトル変更が自動反映

## トラブルシューティング

### Q: 「まだ未紐付けが残っている」
A: 以下を確認：
1. シナリオマスタに本当に登録されているか？
2. タイトルが完全一致しているか？（全角/半角、スペース、記号など）

手動で紐付ける場合：
```sql
UPDATE schedule_events
SET scenario_id = (SELECT id FROM scenarios WHERE title = '正しいタイトル')
WHERE scenario = '表記違いのタイトル';
```

### Q: 「実行しても変わらない」
A: 既に紐付け済みの可能性があります。確認用SQLで`without_id`が0であればOKです。

## 今後の運用
- 新規イベント: `ScheduleManager`が自動的に`scenario_id`を設定
- マッチング作業: `ScenarioMatcher`が自動的に`scenario_id`を設定（修正済み）
- タイトル変更: シナリオマスタで変更すれば全イベントに自動反映

