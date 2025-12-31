# SaaS化 & パフォーマンス最適化レポート

**作成日**: 2024年12月4日  
**目的**: 外部企業への提供（マルチテナントSaaS化）とパフォーマンス向上

---

## 目次

1. [SaaS化に必要な対応（🔴 必須）](#1-saas化に必要な対応-必須)
2. [パフォーマンス最適化（🟡 重要）](#2-パフォーマンス最適化-重要)
3. [スケーラビリティ対応（🟢 推奨）](#3-スケーラビリティ対応-推奨)
4. [実装優先度とロードマップ](#4-実装優先度とロードマップ)

---

## 1. SaaS化に必要な対応（🔴 必須）

### 1.1 マルチテナント対応

#### 現状の問題
現在、テナント（会社/組織）の概念が**全くありません**。

```bash
# テナント関連のコードを検索した結果
grep -r "tenant|organization|company_id|org_id" src/
# → 0件
```

#### 必要な対応

**A) データベース設計の変更**

すべての主要テーブルに `tenant_id` カラムを追加：

```sql
-- 例: stores テーブル
ALTER TABLE stores ADD COLUMN tenant_id UUID NOT NULL REFERENCES tenants(id);
ALTER TABLE scenarios ADD COLUMN tenant_id UUID NOT NULL REFERENCES tenants(id);
ALTER TABLE staff ADD COLUMN tenant_id UUID NOT NULL REFERENCES tenants(id);
ALTER TABLE schedule_events ADD COLUMN tenant_id UUID NOT NULL REFERENCES tenants(id);
ALTER TABLE reservations ADD COLUMN tenant_id UUID NOT NULL REFERENCES tenants(id);
-- ... 全テーブルに追加
```

**B) tenantsテーブルの新規作成**

```sql
CREATE TABLE tenants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,                    -- 会社名
  slug TEXT UNIQUE NOT NULL,             -- URLスラッグ (例: queens-waltz)
  domain TEXT,                           -- カスタムドメイン
  logo_url TEXT,                         -- ロゴURL
  primary_color TEXT DEFAULT '#4F46E5', -- ブランドカラー
  plan TEXT DEFAULT 'free',              -- 料金プラン
  settings JSONB DEFAULT '{}',           -- テナント固有設定
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
```

**C) Row Level Security (RLS) の強化**

```sql
-- 全テーブルにテナント分離ポリシーを追加
CREATE POLICY "tenant_isolation" ON stores
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid);
```

**工数見積り**: 2-3週間

---

### 1.2 ハードコードされた会社情報の除去

#### 現状の問題

「クイーンズワルツ」「Queens Waltz」が**11箇所**でハードコードされています：

| ファイル | 内容 |
|---------|------|
| `LoginForm.tsx` | 'Queens Waltz' |
| `StoreManagement.tsx` | 'Queens Waltz 全6店舗の管理' |
| `EmailSettings.tsx` | 'クイーンズワルツ', 'info@queens-waltz.jp' |
| `StoreBasicSettings.tsx` | 'クイーンズワルツ渋谷店' |

#### 必要な対応

```typescript
// Before: ハードコード
company_name: 'クイーンズワルツ'

// After: テナント設定から取得
const { tenant } = useTenant()
company_name: tenant.name
```

**工数見積り**: 2-3日

---

### 1.3 認証・認可の拡張

#### 現状の問題

- ロール: `admin`, `staff`, `customer` の3種類のみ
- テナントごとの権限管理なし

#### 必要な対応

```typescript
// 新しいロール構造
type UserRole = {
  tenant_id: string
  role: 'owner' | 'admin' | 'manager' | 'staff' | 'customer'
  permissions: string[]  // 'manage_staff', 'view_sales', etc.
}
```

**工数見積り**: 1週間

---

### 1.4 課金・プラン管理

#### 必要な機能

```typescript
interface Plan {
  id: 'free' | 'starter' | 'pro' | 'enterprise'
  limits: {
    max_stores: number      // 店舗数上限
    max_staff: number       // スタッフ数上限
    max_scenarios: number   // シナリオ数上限
    features: string[]      // 利用可能機能
  }
}
```

**工数見積り**: 2週間（Stripe連携含む）

---

## 2. パフォーマンス最適化（🟡 重要）

### 2.1 現状の良い点 ✅

| 項目 | 状態 | 詳細 |
|------|------|------|
| コード分割 | ✅ 実装済み | `React.lazy` で76ページを動的インポート |
| チャンク分割 | ✅ 実装済み | Viteで vendor-react, vendor-ui 等を分離 |
| メモ化 | ✅ 広く使用 | useMemo/useCallback が358箇所で使用 |
| React Query | ✅ 導入済み | キャッシュ・再取得の最適化 |
| 画像遅延読み込み | ✅ 一部実装 | IntersectionObserver使用 |

### 2.2 改善が必要な点

#### A) 仮想スクロールの未導入

**現状**: 長いリストをすべてDOMにレンダリング

**問題**: シナリオ100件、予約1000件などで重くなる

**対応**:
```bash
npm install @tanstack/react-virtual
```

```typescript
// Before: 全件レンダリング
{scenarios.map(scenario => <ScenarioCard />)}

// After: 仮想スクロール
const virtualizer = useVirtualizer({
  count: scenarios.length,
  getScrollElement: () => parentRef.current,
  estimateSize: () => 200,
})
```

**効果**: 1000件のリストでも60fps維持

**工数見積り**: 3-5日（主要リスト3-5箇所）

---

#### B) 画像最適化の強化

**現状**: 一部のみ最適化

**対応**:
1. WebP/AVIF形式への自動変換
2. レスポンシブ画像（srcset）
3. blur placeholder
4. Cloudinary/imgix の導入検討

```typescript
// 最適化された画像コンポーネント
<OptimizedImage
  src={scenario.key_visual_url}
  sizes="(max-width: 768px) 100vw, 33vw"
  placeholder="blur"
  blurDataURL={scenario.blur_hash}
/>
```

**工数見積り**: 3日

---

#### C) バンドルサイズの最適化

**現状のバンドル構成**:
```
vendor-react: ~140KB (gzip後)
vendor-ui: ~80KB
vendor-supabase: ~60KB
vendor-chart: ~200KB  ← 重い
vendor-xlsx: ~300KB   ← 重い
```

**対応**:

1. **Chart.js の遅延読み込み** (売上ページのみで使用)
```typescript
const ChartComponent = lazy(() => import('./SalesChart'))
```

2. **xlsx の遅延読み込み** (エクスポート時のみ)
```typescript
const exportToExcel = async () => {
  const XLSX = await import('xlsx')
  // ...
}
```

**効果**: 初期バンドルを500KB以上削減

**工数見積り**: 1日

---

#### D) データベースクエリの最適化

**N+1クエリの修正**（前述）

**インデックスの追加**:
```sql
-- 頻繁に使用されるクエリのインデックス
CREATE INDEX idx_schedule_events_date ON schedule_events(date);
CREATE INDEX idx_schedule_events_store_date ON schedule_events(store_id, date);
CREATE INDEX idx_reservations_event ON reservations(schedule_event_id);
CREATE INDEX idx_reservations_status ON reservations(status);
```

**工数見積り**: 1日

---

#### E) キャッシュ戦略の強化

**現状**: React Query の staleTime 5分

**改善**:
```typescript
// データ種類ごとに最適化
const queryConfig = {
  // マスターデータ: 長めにキャッシュ
  scenarios: { staleTime: 30 * 60 * 1000 }, // 30分
  stores: { staleTime: 60 * 60 * 1000 },    // 1時間
  staff: { staleTime: 10 * 60 * 1000 },     // 10分
  
  // 動的データ: 短めに
  schedule: { staleTime: 1 * 60 * 1000 },   // 1分
  reservations: { staleTime: 30 * 1000 },   // 30秒
}
```

**工数見積り**: 半日

---

### 2.3 初回読み込み高速化

#### 現状の課題

- First Contentful Paint (FCP): 推定 1.5-2秒
- Largest Contentful Paint (LCP): 推定 2.5-3秒

#### 対応策

**A) Critical CSS のインライン化**
```html
<style>
  /* ファーストビューに必要な最小限のCSS */
  .loading-screen { ... }
</style>
```

**B) リソースのプリロード**
```html
<link rel="preload" href="/assets/vendor-react.js" as="script">
<link rel="preconnect" href="https://cznpcewciwywcqcxktba.supabase.co">
```

**C) Service Worker によるキャッシュ**
```typescript
// vite.config.ts で PWA プラグインを有効化
VitePWA({
  registerType: 'autoUpdate',
  workbox: {
    globPatterns: ['**/*.{js,css,html,ico,png,svg}']
  }
})
```

**工数見積り**: 2日

---

## 3. スケーラビリティ対応（🟢 推奨）

### 3.1 APIレート制限

**対応**: Edge Functions にレート制限を追加
```typescript
// 1分あたり100リクエストに制限
const rateLimit = new RateLimiter({ max: 100, windowMs: 60000 })
```

### 3.2 ログ・監視

**対応**: Sentry または LogRocket の導入
```typescript
Sentry.init({
  dsn: process.env.SENTRY_DSN,
  tracesSampleRate: 0.1,
})
```

### 3.3 CDN の活用

**対応**: Vercel Edge Network を活用（現状で対応済み）

---

## 4. 実装優先度とロードマップ

### Phase 1: パフォーマンス最適化（1-2週間）

| 項目 | 工数 | 優先度 |
|------|------|--------|
| N+1クエリ修正 | 1日 | 🔴 |
| Chart.js/xlsx 遅延読み込み | 1日 | 🔴 |
| 仮想スクロール導入 | 3日 | 🟡 |
| DBインデックス追加 | 1日 | 🟡 |
| 初回読み込み最適化 | 2日 | 🟡 |

### Phase 2: SaaS基盤（3-4週間）

| 項目 | 工数 | 優先度 |
|------|------|--------|
| tenantsテーブル作成 | 2日 | 🔴 |
| 全テーブルにtenant_id追加 | 1週間 | 🔴 |
| RLSポリシー更新 | 3日 | 🔴 |
| ハードコード除去 | 3日 | 🔴 |
| 認証・認可拡張 | 1週間 | 🟡 |

### Phase 3: 商用化（2-3週間）

| 項目 | 工数 | 優先度 |
|------|------|--------|
| 課金システム（Stripe） | 2週間 | 🔴 |
| テナント管理画面 | 1週間 | 🟡 |
| ログ・監視 | 2日 | 🟡 |

---

## パフォーマンス目標値

| 指標 | 現状（推定） | 目標 |
|------|-------------|------|
| First Contentful Paint | 1.5-2秒 | < 1秒 |
| Largest Contentful Paint | 2.5-3秒 | < 1.5秒 |
| Time to Interactive | 3-4秒 | < 2秒 |
| 初期バンドルサイズ | ~800KB | < 300KB |
| 1000件リストのレンダリング | 遅い | 60fps維持 |

---

## すぐに始められるアクション

### 今日できること（30分）

1. **DBインデックス追加**
```sql
CREATE INDEX IF NOT EXISTS idx_schedule_events_date ON schedule_events(date);
CREATE INDEX IF NOT EXISTS idx_reservations_event ON reservations(schedule_event_id);
```

### 今週できること

1. **N+1クエリ修正**（`scheduleApi.getByMonth()`）
2. **Chart.js/xlsx の動的インポート化**
3. **React Query の staleTime 最適化**

### 来週以降

1. **仮想スクロールの導入**
2. **マルチテナント設計の開始**

---

*このレポートは将来的なSaaS化を見据えた技術ロードマップです。*
*優先度と工数は目安であり、実際の状況に応じて調整してください。*

