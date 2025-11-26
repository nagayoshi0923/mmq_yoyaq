# パフォーマンス分析レポート

## 主なボトルネック

### 1. `useBookingData.loadData()` の重い処理（最重要）

**問題点：**
- `scenariosData.forEach` で各シナリオごとに `publicEvents.filter` を実行（O(n*m)）
- 各シナリオごとに複数のフィルタリングとソート処理
- `storesData.find` が各イベントごとに実行（O(n*m)）

**計算量：**
- シナリオ数: N
- イベント数: M
- 総計算量: O(N * M) 以上

**例：**
- シナリオ50個 × イベント500個 = 25,000回以上の比較処理

### 2. `useCalendarData.getEventsForDate()` の非効率

**問題点：**
- 毎回 `allEvents.filter` を実行（メモ化されていない）
- カレンダーの各日付ごとに呼び出される（約42回/月）

**計算量：**
- 日付数: D (約42)
- イベント数: M
- 総計算量: O(D * M)

### 3. `useListViewData.getEventsForDateStore()` の非効率

**問題点：**
- 毎回 `allEvents.filter` を実行
- `stores.find` が複数回実行されている
- 日付×店舗の組み合わせごとに呼び出される

**計算量：**
- 日付数: D (約30)
- 店舗数: S (約6)
- イベント数: M
- 総計算量: O(D * S * M)

### 4. `scheduleApi.getByMonth()` のデータ量

**問題点：**
- 3ヶ月分のデータを一度に取得
- 確定した貸切公演も別途取得
- 各イベントごとにJOINでstores/scenariosを取得

**データ量：**
- 1ヶ月あたりのイベント数: 約100-200件
- 3ヶ月分: 約300-600件
- JOINデータも含めるとさらに大きい

### 5. `useBookingFilters` のソート処理

**問題点：**
- `allScenarios.sort` が毎回実行される（メモ化されているが、`filteredScenarios`が変わるたびに再計算）

## 最適化の優先順位

1. **最優先**: `useBookingData.loadData()` の最適化
   - イベントをシナリオIDでインデックス化（Map使用）
   - `storesData.find` をMapに変換して高速化
   - フィルタリングとソートを一度に実行

2. **高優先**: `useCalendarData` と `useListViewData` のメモ化
   - イベントを日付でインデックス化
   - `getEventsForDate` と `getEventsForDateStore` をメモ化

3. **中優先**: データ取得の最適化
   - 必要な期間のデータのみ取得
   - JOINデータの最適化

4. **低優先**: その他の最適化
   - 画像の遅延読み込み
   - 仮想スクロールの導入
