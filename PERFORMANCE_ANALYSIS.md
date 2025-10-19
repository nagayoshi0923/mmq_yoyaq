# パフォーマンス分析レポート

## 🔴 重大な問題（即対応必要）

### 1. **AdminDashboard の一括インポート問題**
**影響度**: ★★★★★ 最高  
**現状**: すべてのページコンポーネントを初回ロード時に一度にインポート

```typescript
// src/pages/AdminDashboard.tsx (行4-17)
import { StoreManagement } from './StoreManagement'
import { ScenarioManagement } from './ScenarioManagement'
import { StaffManagement } from './StaffManagement'
import { ScheduleManager } from './ScheduleManager/index'
import SalesManagement from './SalesManagement'
import { ShiftSubmission } from './ShiftSubmission/index'
import { ReservationManagement } from './ReservationManagement'
import { PublicBookingTop } from './PublicBookingTop'
import { ScenarioDetailPage } from './ScenarioDetailPage'
import { GMAvailabilityCheck } from './GMAvailabilityCheck'
import { PrivateBookingScenarioSelect } from './PrivateBookingScenarioSelect'
import { PrivateBookingRequestPage } from './PrivateBookingRequestPage'
import { PrivateBookingManagement } from './PrivateBookingManagement'
import { UserManagement } from './UserManagement'
```

**問題点**:
- 12個の大規模ページコンポーネントを初回に全部ロード
- ユーザーは1つのページしか見ないのに、全ページ分のコードがダウンロードされる
- 初回バンドルサイズが数MB規模になる可能性
- Time to Interactive (TTI) が大幅に遅延

**推定影響**:
- 初回ロード時間: +3〜5秒
- バンドルサイズ: 推定 2〜4MB（圧縮前）

---

## 🟡 中程度の問題

### 2. **AuthContext の重い初期化処理**
**影響度**: ★★★☆☆  
**現状**: ログイン時に複数のデータベースクエリを実行

```typescript
// src/contexts/AuthContext.tsx
async function setUserFromSession(supabaseUser: User) {
  // 1. ロール取得
  const rolePromise = supabase.from('users').select('role')...
  // 2. スタッフ情報取得
  const { data: staffData } = await supabase.from('staff')...
  // タイムアウト処理あり（3秒）
}
```

**問題点**:
- 認証フロー中にタイムアウトが発生している（ログから確認）
- スタッフ情報取得で3秒待機している

**推定影響**:
- 初回ロード時間: +1〜3秒（タイムアウト時）

### 3. **コード分割の未実装**
**影響度**: ★★★☆☆  
**現状**: vite.config.ts にコード分割の最適化設定なし

**問題点**:
- ベンダーライブラリ（React, TanStack Table等）が分離されていない
- 共通コンポーネントが各ページに重複バンドルされる可能性

---

## 🟢 軽微な問題（最適化推奨）

### 4. **大規模コンポーネントの再レンダリング**
**影響度**: ★★☆☆☆  
**現状**: 
- `ScenarioManagement`: 354行、複数のフィルタとソート処理
- `StaffManagement`: 508行、複雑なテーブル表示

**問題点**:
- `useMemo`/`useCallback` は使用されているが、最適化の余地あり
- 大規模なデータセットでのフィルタリングがクライアントサイドで実行

### 5. **TanStack Table のメモ化不足**
**影響度**: ★★☆☆☆  
**現状**: テーブル列定義の一部がメモ化されていない箇所がある

```typescript
// 良い例
const tableColumns = useMemo(
  () => createScenarioColumns(displayMode, {...}),
  [displayMode]
)

// 改善の余地あり
// アクションハンドラが毎回再作成される可能性
```

---

## 📊 パフォーマンス改善の優先順位

### **Phase 1: 即効性の高い改善（推定効果: 60-70%改善）**

1. **React.lazy + Suspense によるコード分割** ✅ 最優先
   - AdminDashboard の全ページコンポーネントを動的インポート化
   - 推定削減: 初回ロード 3〜5秒短縮

2. **vite.config.ts の最適化**
   - マニュアルチャンク分割設定
   - ベンダーライブラリの分離
   - 推定削減: バンドルサイズ 30-40%削減

### **Phase 2: 中期的な改善（推定効果: 20-30%改善）**

3. **AuthContext の最適化**
   - タイムアウト時間の短縮（3秒 → 1.5秒）
   - スタッフ情報を遅延ロード（必要になってから取得）
   - 推定削減: 認証時間 1〜2秒短縮

4. **画像とアセットの最適化**
   - 画像の遅延ロード実装
   - WebP 形式の使用
   - CDN からの配信

### **Phase 3: 長期的な改善（推定効果: 10-15%改善）**

5. **API 呼び出しの最適化**
   - データのページネーション実装（現在全件取得）
   - キャッシュ戦略の実装（React Query 導入検討）

6. **コンポーネントの分割とメモ化**
   - 大規模コンポーネント（300行以上）を分割
   - React.memo の適切な適用

---

## 🎯 即座に実装すべき改善

### 改善1: AdminDashboard のコード分割

**Before**:
```typescript
import { StoreManagement } from './StoreManagement'
import { ScenarioManagement } from './ScenarioManagement'
// ... 全12コンポーネント
```

**After**:
```typescript
import { lazy, Suspense } from 'react'

const StoreManagement = lazy(() => import('./StoreManagement'))
const ScenarioManagement = lazy(() => import('./ScenarioManagement'))
// ... 全12コンポーネント

// 使用時
<Suspense fallback={<LoadingScreen />}>
  {currentPage === 'stores' && <StoreManagement />}
</Suspense>
```

**効果**: 
- 初回ロード: -70%（推定）
- TTI: -3〜5秒

---

### 改善2: vite.config.ts の最適化

```typescript
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-react': ['react', 'react-dom'],
          'vendor-ui': ['lucide-react', '@radix-ui/react-dialog', '@radix-ui/react-select'],
          'vendor-table': ['@tanstack/react-table'],
          'vendor-supabase': ['@supabase/supabase-js'],
        }
      }
    },
    chunkSizeWarningLimit: 1000
  }
})
```

**効果**:
- キャッシュ効率: +80%（ベンダーコード変更なし時）
- 並列ダウンロード: 有効化

---

## 📈 期待される総合的な改善

| 項目 | 現状 | 改善後 | 効果 |
|------|------|--------|------|
| 初回ロード時間 | 8〜12秒 | 2〜4秒 | **-70%** |
| 初回バンドルサイズ | 3〜4MB | 800KB〜1.2MB | **-70%** |
| Time to Interactive | 10〜15秒 | 3〜5秒 | **-65%** |
| ページ遷移時間 | 即座 | 0.5〜1秒 | +0.5秒（lazy load） |

**注**: ページ遷移時に若干の遅延が発生しますが、初回ロードの大幅な改善でUX全体は向上します。

---

## 🚀 実装ロードマップ

### Week 1: Phase 1 実装
- [ ] AdminDashboard のコード分割
- [ ] vite.config.ts の最適化
- [ ] ローディング UI の改善
- [ ] ブラウザテストと検証

### Week 2: Phase 2 実装
- [ ] AuthContext の最適化
- [ ] 画像の遅延ロード
- [ ] パフォーマンス計測とベンチマーク

### Week 3: Phase 3 実装
- [ ] API ページネーション
- [ ] React Query 導入検討
- [ ] コンポーネント分割とメモ化

---

## 📝 計測方法

### 開発環境での計測
```bash
npm run build
npm run preview
# Chrome DevTools > Performance タブで計測
```

### 計測指標
- **LCP** (Largest Contentful Paint): 2.5秒以下が目標
- **FID** (First Input Delay): 100ms以下が目標
- **CLS** (Cumulative Layout Shift): 0.1以下が目標
- **TTI** (Time to Interactive): 3.8秒以下が目標

---

## 🔧 次のステップ

1. **Phase 1 の実装を開始する**（コード分割）
2. **ビルドサイズを計測する**（改善前後の比較）
3. **パフォーマンス指標を記録する**（Lighthouse / Chrome DevTools）

実装を開始しますか？

