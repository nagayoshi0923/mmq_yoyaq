# パフォーマンス問題の原因分析

## 発見された問題点

### 1. **PublicBookingTop/index.tsx の不要な再レンダリング**
- `getStoreName`と`getStoreColor`が毎回新しい関数として生成されている
- `handleCardClick`と`handleToggleFavorite`がuseCallbackでメモ化されていない
- これにより、親コンポーネントが再レンダリングされるたびに子コンポーネントも再レンダリングされる

### 2. **LineupView の非効率な処理**
- `isFavorite(scenario.scenario_id)`が各カードごとに呼ばれている（これは問題ないが、メモ化可能）
- 大量のScenarioCardが一度にレンダリングされる

### 3. **画像の読み込み**
- OptimizedImageは使われているが、大量の画像が一度に読み込まれる可能性
- 遅延読み込み（lazy loading）は有効だが、viewport外の画像も読み込まれる可能性

### 4. **useEffect の依存配列**
- `useEffect(() => { loadData() }, [loadData])` - loadDataはuseCallbackでメモ化されているので問題ない

### 5. **useFavorites の最適化不足**
- `isFavorite`関数は毎回新しい参照を返している可能性（useCallbackでメモ化されていない）

## 修正方針

1. `getStoreName`と`getStoreColor`をuseCallbackでメモ化
2. `handleCardClick`と`handleToggleFavorite`をuseCallbackでメモ化
3. `useFavorites`の`isFavorite`をuseCallbackでメモ化
4. `LineupView`で`isFavorite`の呼び出しを最適化（useMemoで事前計算）
5. 画像の遅延読み込みをより積極的に（Intersection Observerの使用を検討）

