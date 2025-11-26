# サイト全体のパフォーマンス問題分析

## 🔴 重大な問題（全ページに影響）

### 1. **AdminDashboard.tsx の navigationTabs が毎回生成**
- **問題**: `navigationTabs`配列が毎回新しいオブジェクトとして生成される
- **影響**: 全ページで不要な再レンダリング
- **場所**: `src/pages/AdminDashboard.tsx:232-244`

### 2. **Header.tsx のインライン関数**
- **問題**: `onClick`ハンドラがインライン関数（useCallbackでメモ化されていない）
- **影響**: Headerが再レンダリングされるたびに新しい関数が生成される
- **場所**: `src/components/layout/Header.tsx:68-75`

### 3. **NavigationBar.tsx のインライン関数**
- **問題**: `onClick`ハンドラがインライン関数
- **影響**: NavigationBarが再レンダリングされるたびに新しい関数が生成される
- **場所**: `src/components/layout/NavigationBar.tsx:58-68`

### 4. **共通コンポーネントの再レンダリング**
- **問題**: HeaderとNavigationBarが全ページでレンダリングされるが、最適化が不十分
- **影響**: どのページでもHeader/NavigationBarの再レンダリングが発生

## 🟡 中程度の問題（特定ページに影響）

### 5. **useScenarioData の N+1 問題**
- **問題**: 各シナリオごとに`assignmentApi.getScenarioAssignments`を呼んでいる
- **影響**: シナリオ管理ページが重い
- **場所**: `src/pages/ScenarioManagement/hooks/useScenarioData.ts:27-44`
- **解決策**: バッチ取得APIを使用（`getBatchScenarioAssignments`は既に存在）

### 6. **useScenarioDetail の重いデータ取得**
- **問題**: 3ヶ月分のデータを毎回取得
- **影響**: シナリオ詳細ページが重い
- **場所**: `src/pages/ScenarioDetailPage/hooks/useScenarioDetail.ts:43-52`
- **解決策**: React Queryでキャッシュ、または必要な期間のみ取得

### 7. **React Query の未使用**
- **問題**: 一部のページでReact Queryが使われていない
- **影響**: データの重複取得、キャッシュが効かない
- **対象ページ**: 
  - ScenarioDetailPage
  - PublicBookingTop（一部）
  - その他多数

### 8. **画像の一括読み込み**
- **問題**: 大量の画像が一度に読み込まれる
- **影響**: ネットワーク帯域の消費、初期表示が遅い
- **場所**: ScenarioCard, ListView等
- **解決策**: Intersection Observerによる遅延読み込み

## 🟢 軽微な問題（最適化の余地）

### 9. **useMemo/useCallback の不足**
- **問題**: 一部のコンポーネントでメモ化が不十分
- **影響**: 不要な再レンダリング

### 10. **sessionStorage の過度な使用**
- **問題**: 大量のデータをsessionStorageに保存
- **影響**: メモリ使用量の増加

## 📊 優先順位

1. **最優先**: AdminDashboard, Header, NavigationBarの最適化（全ページに影響）
2. **高優先**: useScenarioDataのN+1問題修正
3. **中優先**: React Queryの導入拡大
4. **低優先**: 画像の遅延読み込み

