# パフォーマンス改善 Phase 3 提案

## 📊 現状分析

### 既に実装済み（Phase 1 + 2）
- ✅ React.lazy + Suspense によるコード分割
- ✅ Vite ビルド最適化（マニュアルチャンク分割）
- ✅ 認証タイムアウトの短縮（5秒 → 1.5秒）
- ✅ スタッフ情報のバックグラウンド取得
- ✅ ダッシュボード統計の遅延ロード

### **現在の速度**: 3〜4秒（操作可能まで）⭐️

---

## 🎯 Phase 3: さらなる最適化提案

### カテゴリ別の改善案

| カテゴリ | 改善案 | 効果 | 難易度 | 優先度 |
|----------|--------|------|--------|--------|
| **1. 依存関係** | 重いライブラリを軽量化 | 中 | 低 | ⭐️⭐️⭐️ |
| **2. アイコン** | lucide-react の Tree-shaking | 小〜中 | 低 | ⭐️⭐️⭐️ |
| **3. Chart.js** | 遅延ロード | 中 | 低 | ⭐️⭐️ |
| **4. XLSX** | 使用時のみロード | 中 | 低 | ⭐️⭐️ |
| **5. 画像最適化** | WebP + 遅延ロード | 小 | 中 | ⭐️⭐️ |
| **6. Preload** | 重要リソースを事前ロード | 小 | 低 | ⭐️⭐️ |
| **7. React Query** | API キャッシュ最適化 | 大 | 高 | ⭐️ |
| **8. Service Worker** | オフライン対応 | 大 | 高 | ⭐️ |

---

## 💡 Phase 3.1: 即効性の高い改善（推奨）

### 1. **lucide-react のアイコンを最適化**

#### 問題
現在、すべてのページで大量のアイコンをインポート：
```typescript
import { Store, Calendar, Users, BookOpen, ... } from 'lucide-react'
```

全部で 400 個以上のアイコンがバンドルされる可能性。

#### 解決策: Tree-shaking の確認

**vite.config.ts に追加**:
```typescript
export default defineConfig({
  // ... 既存設定
  optimizeDeps: {
    include: ['lucide-react']
  }
})
```

#### 効果
- バンドルサイズ: **-50〜100KB**（推定）
- 初回ロード: **-0.2〜0.5秒**

---

### 2. **Chart.js を遅延ロード**

#### 問題
`SalesManagement` ページでのみ使用するが、常にロードされている。

#### 解決策

**Before**:
```typescript
import { Chart } from 'chart.js'
```

**After**:
```typescript
// SalesManagement コンポーネント内で遅延インポート
const [Chart, setChart] = useState(null)

useEffect(() => {
  import('chart.js').then(module => {
    setChart(module.Chart)
  })
}, [])
```

または、vite.config.ts でチャンク分離：
```typescript
manualChunks: {
  'vendor-chart': ['chart.js', 'react-chartjs-2']
}
```

#### 効果
- 初回バンドルサイズ: **-150KB**（推定）
- SalesManagement 以外のページ: **より高速**

---

### 3. **XLSX を遅延ロード**

#### 問題
エクスポート機能でのみ使用するが、常にロードされている。

#### 解決策

**現在の使用箇所**:
```typescript
import * as XLSX from 'xlsx'
```

**改善案**:
```typescript
// エクスポートボタンをクリックしたときだけロード
async function handleExport() {
  const XLSX = await import('xlsx')
  // エクスポート処理
}
```

#### 効果
- 初回バンドルサイズ: **-200KB**（推定）
- 操作開始まで: **-0.3〜0.5秒**

---

### 4. **@radix-ui の最適化**

#### 現状
9個の @radix-ui コンポーネント：
```json
"@radix-ui/react-alert-dialog": "^1.1.15",
"@radix-ui/react-avatar": "^1.1.10",
"@radix-ui/react-checkbox": "^1.3.3",
"@radix-ui/react-dialog": "^1.1.15",
"@radix-ui/react-dropdown-menu": "^2.0.6",
"@radix-ui/react-label": "^2.1.7",
"@radix-ui/react-popover": "^1.1.15",
"@radix-ui/react-select": "^2.2.6",
"@radix-ui/react-tabs": "^1.1.13",
"@radix-ui/react-tooltip": "^1.2.8"
```

#### 解決策

すでに vite.config.ts でチャンク分離済み：
```typescript
'vendor-ui': [
  'lucide-react',
  '@radix-ui/react-dialog',
  '@radix-ui/react-select',
  ...
]
```

**追加最適化**: 未使用のものを確認
```bash
# 使用していない @radix-ui を見つける
npx depcheck
```

#### 効果
- 未使用ライブラリの削除: **-20〜50KB**（推定）

---

## 🚀 Phase 3.2: 中期的な改善

### 5. **Preload ヒントの追加**

#### index.html に追加

```html
<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8" />
  <link rel="icon" type="image/svg+xml" href="/vite.svg" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Queens Waltz - 店舗管理システム</title>
  
  <!-- Preload 重要リソース -->
  <link rel="preload" href="/assets/vendor-react.js" as="script" crossorigin>
  <link rel="preload" href="/assets/vendor-ui.js" as="script" crossorigin>
  <link rel="preload" href="/fonts/main-font.woff2" as="font" type="font/woff2" crossorigin>
</head>
```

#### 効果
- ブラウザが早期にリソースをダウンロード開始
- 初回ロード: **-0.1〜0.3秒**

---

### 6. **フォントの最適化**

#### 現状確認
```bash
# フォントファイルのサイズを確認
ls -lh public/fonts/
```

#### 解決策

1. **フォントのサブセット化**（日本語のみ）
2. **WOFF2 形式を使用**（最も圧縮率が高い）
3. **font-display: swap**

```css
@font-face {
  font-family: 'YourFont';
  src: url('/fonts/font.woff2') format('woff2');
  font-display: swap; /* フォント読み込み中も表示 */
}
```

#### 効果
- フォントサイズ: **-50〜70%**
- 初回表示: **より滑らか**

---

### 7. **画像の最適化**

#### 現状
- 画像形式: PNG / JPEG
- 遅延ロード: 未実装

#### 解決策

**A. 画像形式の変更**
```bash
# WebP に変換（-30〜50% 削減）
npx @squoosh/cli --webp auto *.png
```

**B. 遅延ロード**
```typescript
<img 
  src={imageUrl} 
  loading="lazy"  // ネイティブ遅延ロード
  alt="..."
/>
```

**C. Placeholder（ぼかし）**
```typescript
import { useState } from 'react'

function OptimizedImage({ src, alt }) {
  const [loaded, setLoaded] = useState(false)
  
  return (
    <div className="relative">
      {!loaded && (
        <div className="absolute inset-0 bg-gray-200 animate-pulse" />
      )}
      <img 
        src={src} 
        alt={alt}
        loading="lazy"
        onLoad={() => setLoaded(true)}
        className={loaded ? 'opacity-100' : 'opacity-0'}
      />
    </div>
  )
}
```

#### 効果
- 画像サイズ: **-30〜50%**
- 初回表示: **より高速**

---

## 🔥 Phase 3.3: 上級者向け改善

### 8. **React Query の導入**

#### メリット
- 自動的なキャッシュ管理
- バックグラウンド更新
- Optimistic UI
- 重複リクエストの排除

#### 実装例

**Before**:
```typescript
const [scenarios, setScenarios] = useState([])
useEffect(() => {
  scenarioApi.getAll().then(setScenarios)
}, [])
```

**After**:
```typescript
import { useQuery } from '@tanstack/react-query'

const { data: scenarios } = useQuery({
  queryKey: ['scenarios'],
  queryFn: () => scenarioApi.getAll(),
  staleTime: 5 * 60 * 1000, // 5分間キャッシュ
})
```

#### 導入コスト
- パッケージインストール: `@tanstack/react-query`
- 既存コードの書き換え: 中程度
- バンドルサイズ: +40KB

#### 効果
- API呼び出し回数: **-50〜80%**
- ページ遷移速度: **大幅向上**
- ユーザー体験: **劇的改善**

---

### 9. **Virtualization（仮想スクロール）**

#### 対象
大量のデータを表示するテーブル：
- ScenarioManagement（100+ シナリオ）
- StaffManagement（50+ スタッフ）
- ScheduleManager（数百イベント）

#### 実装

**TanStack Table は既に導入済み** → Virtualization を追加

```bash
npm install @tanstack/react-virtual
```

```typescript
import { useVirtualizer } from '@tanstack/react-virtual'

function VirtualizedTable({ data, columns }) {
  const parentRef = useRef(null)
  
  const virtualizer = useVirtualizer({
    count: data.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 50, // 行の高さ
  })
  
  return (
    <div ref={parentRef} style={{ height: '600px', overflow: 'auto' }}>
      <div style={{ height: virtualizer.getTotalSize() }}>
        {virtualizer.getVirtualItems().map(virtualRow => (
          <TableRow key={virtualRow.index} data={data[virtualRow.index]} />
        ))}
      </div>
    </div>
  )
}
```

#### 効果
- 100+ 行のテーブル: **スムーズなスクロール**
- レンダリング時間: **-80〜90%**
- メモリ使用量: **-60〜70%**

---

### 10. **Service Worker + PWA**

#### メリット
- オフライン対応
- アプリのようなインストール可能
- バックグラウンド同期
- プッシュ通知

#### 実装

**vite-plugin-pwa を使用**:
```bash
npm install -D vite-plugin-pwa
```

```typescript
// vite.config.ts
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg}']
      },
      manifest: {
        name: 'Queens Waltz 管理システム',
        short_name: 'QW Admin',
        theme_color: '#000000',
        icons: [
          {
            src: '/icon-192.png',
            sizes: '192x192',
            type: 'image/png'
          }
        ]
      }
    })
  ]
})
```

#### 効果
- 2回目以降のアクセス: **ほぼ瞬時**
- オフラインでも基本機能が使える
- モバイルでアプリのように使える

---

## 📊 Phase 3 の総合効果（推定）

### Phase 3.1（即効性の高い改善）

| 改善項目 | 削減量 | 削減時間 |
|----------|--------|----------|
| lucide-react 最適化 | -50〜100KB | -0.2〜0.5秒 |
| Chart.js 遅延ロード | -150KB | -0.3〜0.5秒 |
| XLSX 遅延ロード | -200KB | -0.3〜0.5秒 |
| 未使用ライブラリ削除 | -20〜50KB | -0.1秒 |
| **合計** | **-420〜500KB** | **-0.9〜1.6秒** |

### Phase 3.2（中期的な改善）

| 改善項目 | 効果 |
|----------|------|
| Preload ヒント | -0.1〜0.3秒 |
| フォント最適化 | より滑らか |
| 画像最適化 | -30〜50% |
| **合計** | **体感速度向上** |

### Phase 3.3（上級者向け）

| 改善項目 | 効果 |
|----------|------|
| React Query | ページ遷移速度 大幅向上 |
| Virtualization | 大量データでもスムーズ |
| Service Worker | 2回目以降ほぼ瞬時 |
| **合計** | **UX 劇的改善** |

---

## 🎯 推奨実装順序

### 今すぐできる（30分以内）

1. **lucide-react の最適化**
   ```typescript
   // vite.config.ts
   optimizeDeps: {
     include: ['lucide-react']
   }
   ```

2. **未使用ライブラリの確認**
   ```bash
   npx depcheck
   ```

3. **Chart.js のチャンク分離**
   ```typescript
   // vite.config.ts
   manualChunks: {
     'vendor-chart': ['chart.js', 'react-chartjs-2']
   }
   ```

### 今週中（2〜3時間）

4. **XLSX の遅延ロード実装**
5. **Preload ヒントの追加**
6. **画像の WebP 変換**

### 今月中（1〜2日）

7. **React Query の導入**（最も効果的）
8. **Virtualization の実装**

### 余裕があれば

9. **Service Worker + PWA**
10. **フォントのサブセット化**

---

## 🔍 効果測定方法

### Before / After 測定

```bash
# Phase 3.1 実装前
npm run build
# → 出力されたファイルサイズをメモ

# Phase 3.1 実装後
npm run build
# → ファイルサイズを比較
```

### Lighthouse での測定

1. **実装前のスコアを保存**
2. **各改善を実装**
3. **スコアを比較**

目標:
- Performance Score: 90 → **95+**
- LCP: 2.0s → **1.5s**
- TBT: 150ms → **100ms**

---

## 📝 実装チェックリスト

### Phase 3.1（即効性）

- [ ] lucide-react の最適化設定
- [ ] depcheck で未使用ライブラリ確認
- [ ] Chart.js をチャンク分離
- [ ] XLSX を遅延ロード化
- [ ] ビルドサイズを計測
- [ ] Lighthouse で測定

### Phase 3.2（中期）

- [ ] Preload ヒントを追加
- [ ] フォントを WOFF2 に変換
- [ ] 画像を WebP に変換
- [ ] 画像に loading="lazy" 追加
- [ ] Lighthouse で測定

### Phase 3.3（上級）

- [ ] React Query をインストール
- [ ] API 呼び出しを useQuery に変換
- [ ] Virtualization を実装
- [ ] Service Worker を設定
- [ ] PWA マニフェストを追加
- [ ] Lighthouse で測定

---

## 💬 次のステップ

### 提案

1. **Phase 3.1 を今すぐ実装**（30分）
   - 最も簡単で効果的
   - リスクが低い

2. **効果を測定**
   - ビルドサイズ比較
   - Lighthouse スコア

3. **Phase 3.2 に進む**（必要に応じて）

実装しますか？どの部分から始めたいか教えてください！

---

**作成者**: AI Assistant  
**最終更新**: 2025-10-19

