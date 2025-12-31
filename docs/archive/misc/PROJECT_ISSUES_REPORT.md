# プロジェクト問題レポート

**作成日**: 2024年12月4日  
**プロジェクト**: MMQ予約システム (mmq_yoyaq)

このドキュメントは、プロジェクト全体を調査して発見した潜在的な問題点を列挙しています。
優先度は「🔴 高」「🟡 中」「🟢 低」で分類しています。

---

## 目次

1. [セキュリティの問題](#1-セキュリティの問題)
2. [型安全性の問題](#2-型安全性の問題)
3. [コード品質の問題](#3-コード品質の問題)
4. [パフォーマンスの問題](#4-パフォーマンスの問題)
5. [未完成・未実装の機能](#5-未完成未実装の機能)
6. [エラーハンドリングの問題](#6-エラーハンドリングの問題)
7. [保守性の問題](#7-保守性の問題)
8. [設計上の問題](#8-設計上の問題)
9. [依存関係の問題](#9-依存関係の問題)
10. [運用上の問題](#10-運用上の問題)

---

## 1. セキュリティの問題

### 🔴 1.1 Supabase認証情報のハードコード

**ファイル**: `src/lib/supabase.ts` (4-5行目)

```typescript
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://cznpcewciwywcqcxktba.supabase.co'
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6...'
```

**問題点**:
- 本番環境のSupabase URLとAnon Keyがコードにハードコードされている
- 環境変数が設定されていない場合、自動的に本番環境に接続してしまう
- Anon Keyはpublicですが、URLの露出はセキュリティリスクになりうる

**推奨対応**:
- フォールバック値を削除し、環境変数が未設定の場合はエラーを投げる
- 本番URLは環境変数からのみ取得するように変更

---

### 🟡 1.2 CORSの設定が緩い

**ファイル**: `supabase/functions/send-email/index.ts` (3-5行目), 他のEdge Functions

```typescript
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
```

**問題点**:
- すべてのオリジンからのアクセスを許可している (`'*'`)
- 本番環境では特定のドメインのみ許可すべき

**推奨対応**:
- 本番環境では `https://mmq-yoyaq.vercel.app` など、許可するオリジンを明示的に指定

---

### 🟢 1.3 パスワードリセット中のグローバルフラグ

**ファイル**: `src/contexts/AuthContext.tsx` (124行目)

```typescript
if ((window as any).__PASSWORD_RESET_IN_PROGRESS__) {
```

**問題点**:
- グローバル変数を使用してパスワードリセット状態を管理
- XSSなどで操作される可能性がある

**推奨対応**:
- Reactのコンテキストまたは状態管理を使用

---

## 2. 型安全性の問題

### 🔴 2.1 `as any` の過剰使用

**該当箇所**: 53箇所（25ファイル）

**主な問題ファイル**:
- `src/pages/SalesManagement/hooks/useSalesData.ts` - 6箇所
- `src/components/schedule/TimeSlotCell.tsx` - 4箇所
- `src/pages/ScheduleManager/index.tsx` - 4箇所
- `src/components/modals/ScenarioEditDialog.tsx` - 4箇所

**問題点**:
- 型チェックを回避しているため、ランタイムエラーのリスクが増加
- TypeScriptの恩恵を受けられない

**推奨対応**:
- 適切な型定義を追加
- unknown型を使用して明示的に型を絞り込む

---

### 🟡 2.2 tsconfig.jsonでstrict: false

**ファイル**: `tsconfig.json` (18行目)

```json
"strict": false,
```

**問題点**:
- TypeScriptの厳格な型チェックが無効
- null/undefinedの潜在的な問題を見逃しやすい

**推奨対応**:
- 段階的に `strict: true` に移行
- 最低限 `strictNullChecks: true` を有効化

---

### 🟡 2.3 apiErrorHandlerの型問題

**ファイル**: `src/lib/apiErrorHandler.ts` (65-66行目)

```typescript
const code = error.code || error.status
const message = error.message || 'エラーが発生しました'
```

**問題点**:
- `error` が `any` として扱われている（パラメータ型は `unknown` だが、プロパティアクセスで型チェック無視）

**推奨対応**:
- 型ガードを追加して安全にプロパティアクセス

---

## 3. コード品質の問題

### 🟡 3.1 console.log/console.errorの残存

**該当箇所**: 208箇所（44ファイル）

**主な問題ファイル**:
- `src/hooks/useScheduleData.ts` - 18箇所
- `src/pages/ScenarioDetailPage/hooks/usePrivateBooking.ts` - 24箇所
- `src/pages/ScheduleManager/index.tsx` - 8箇所

**問題点**:
- 本番環境でもコンソールログが出力される
- パフォーマンスへの影響
- 機密情報が露出する可能性

**推奨対応**:
- `logger` ユーティリティを使用（既存の `src/utils/logger.ts` を活用）
- ESLintルールで `no-console` を有効化

---

### 🟡 3.2 未実装のTODOコメント

**該当箇所**: 17箇所

**重要なTODO**:
1. `src/contexts/AuthContext.tsx` (603行目)
   - 「将来的には実際のSupabaseテーブルからロール情報を取得」

2. `src/pages/CustomerBookingPage.tsx` (286行目)
   - 「予約フォームへ遷移」- 機能未実装

3. `src/pages/BookingConfirmation/hooks/useBookingSubmit.ts` (75行目)
   - 「実際のstore_idを取得する必要がある」

4. `src/components/schedule/modal/ReservationList.tsx` (812-815行目)
   - 「customer_email, customer_phone, notesは別途実装が必要」

**推奨対応**:
- TODOを整理してIssue化
- 優先度を付けて計画的に実装

---

### 🟢 3.3 デバッグコード・alert()の残存

**ファイル**: `src/pages/ScheduleManager/index.tsx` (366, 425行目など)

```typescript
alert('すべての臨時会場が使用されています')
```

**問題点**:
- alertはUXが悪い
- モダンなUIコンポーネント（Toast等）を使用すべき

**推奨対応**:
- `sonner` や `react-hot-toast` などのToastライブラリを使用

---

## 4. パフォーマンスの問題

### 🟡 4.1 N+1クエリの潜在的リスク

**ファイル**: `src/lib/api.ts` - `scheduleApi.getByMonth()` (1049-1060行目)

```typescript
for (const booking of confirmedPrivateBookings) {
  // ...
  const { data: gmStaff, error: gmError } = await supabase
    .from('staff')
    .select('id, name')
    .eq('id', booking.gm_staff)
    .maybeSingle()
  // ...
}
```

**問題点**:
- ループ内で個別のクエリを実行
- データ量が増えるとパフォーマンスが低下

**推奨対応**:
- バッチクエリを使用（`in` オペレータ）
- Supabaseのjoinを活用

---

### 🟡 4.2 setTimeoutのメモリリーク可能性

**該当箇所**: 34箇所

**問題のあるパターン**:
```typescript
useEffect(() => {
  setTimeout(() => {
    // 処理
  }, 1000)
  // cleanup関数なし
}, [])
```

**問題点**:
- コンポーネントがアンマウントされてもタイマーが動作し続ける
- 状態更新時にメモリリークやワーニングの原因になる

**推奨対応**:
- すべてのsetTimeoutにclearTimeoutのクリーンアップを追加
- 例:
```typescript
useEffect(() => {
  const timer = setTimeout(() => { /* 処理 */ }, 1000)
  return () => clearTimeout(timer)
}, [])
```

---

### 🟡 4.3 useEffectの過剰使用

**該当箇所**: 276箇所（108ファイル）

**問題点**:
- 一部のuseEffectは不要な再レンダリングを引き起こす可能性
- 依存配列の管理が複雑になりやすい

**推奨対応**:
- 可能な場合はuseMemoやuseCallbackで代替
- useEffectの依存配列を見直し

---

### 🟢 4.4 大量のimportが未使用

**問題点**:
- 一部のファイルで未使用のimportが存在する可能性
- バンドルサイズに影響

**推奨対応**:
- ESLintの `no-unused-vars` ルールを有効化
- `eslint-plugin-unused-imports` の導入

---

## 5. 未完成・未実装の機能

### 🟡 5.1 予約フォーム遷移

**ファイル**: `src/pages/CustomerBookingPage.tsx`

```typescript
const handleBooking = (event: PublicEvent) => {
  // TODO: 予約フォームへ遷移
  logger.log('予約:', event)
}
```

**問題点**:
- 顧客向け予約機能が未実装
- ボタンをクリックしても何も起きない

---

### 🟡 5.2 顧客情報の表示

**ファイル**: `src/components/schedule/modal/ReservationList.tsx`

```typescript
{/* TODO: customer_emailは別途実装が必要 */}
{/* TODO: customer_phoneは別途実装が必要 */}
{/* TODO: notesは別途実装が必要 */}
```

**問題点**:
- 予約リストで顧客の詳細情報が表示されない

---

### 🟢 5.3 営業時間制限

**ファイル**: `src/components/schedule/PerformanceModal.tsx` (171行目)

```typescript
// TODO: 営業時間制限を時間選択肢に適用
logger.log('営業時間設定を読み込みました:', businessHoursData)
```

**問題点**:
- 設定された営業時間が時間選択に反映されていない

---

## 6. エラーハンドリングの問題

### 🟡 6.1 catchブロックでのエラー無視

**ファイル**: `src/hooks/useReservationStats.ts` (76-78行目)

```typescript
} catch (e) {
  // 日付パースエラーは無視
}
```

**問題点**:
- エラーを完全に無視している
- デバッグが困難になる

**推奨対応**:
- 最低限loggerでエラーを記録
- 必要に応じてユーザーへの通知

---

### 🟡 6.2 throw errorの一貫性

**該当箇所**: 221箇所

**問題点**:
- 一部でエラーをthrowし、一部でnullを返している
- 呼び出し側でのエラーハンドリングが複雑になる

**推奨対応**:
- 統一したエラーハンドリング戦略を策定
- `ApiError` クラスを一貫して使用

---

### 🟢 6.3 Edge Functionsでの型なしエラー

**ファイル**: `supabase/functions/invite-staff/index.ts` (382行目)

```typescript
} catch (error: any) {
```

**問題点**:
- エラーを `any` として扱っている

**推奨対応**:
- `unknown` を使用して型ガードを追加

---

## 7. 保守性の問題

### 🟡 7.1 大きすぎるファイル

**問題のあるファイル**:
- `src/lib/api.ts` - 1942行
- `src/contexts/AuthContext.tsx` - 720行

**問題点**:
- 可読性が低い
- テストが困難
- コードの重複が見つけにくい

**推奨対応**:
- 機能ごとにファイルを分割
- 例: `api.ts` → `storeApi.ts`, `scenarioApi.ts`, `scheduleApi.ts` など

---

### 🟡 7.2 マジックナンバー

**例**:
```typescript
// src/contexts/AuthContext.tsx (56行目)
if (now - lastRefreshRef.current < 30000) {

// src/contexts/AuthContext.tsx (91行目)
const loadingTimeout = setTimeout(() => { ... }, 300)

// src/contexts/AuthContext.tsx (298行目)
const timeoutMs = 1000
```

**問題点**:
- 数値の意味が分かりにくい
- 変更時に漏れが発生しやすい

**推奨対応**:
- 定数として定義
```typescript
const SESSION_REFRESH_INTERVAL_MS = 30000
const AUTH_LOADING_TIMEOUT_MS = 300
const ROLE_FETCH_TIMEOUT_MS = 1000
```

---

### 🟢 7.3 重複コード

**例**: 時間帯判定ロジック

```typescript
// 複数のファイルで重複
const hour = parseInt(startTime.split(':')[0])
if (hour < 12) return 'morning'
if (hour < 17) return 'afternoon'
return 'evening'
```

**推奨対応**:
- `src/utils/dateUtils.ts` に統一したユーティリティを作成

---

## 8. 設計上の問題

### 🟡 8.1 ハッシュベースのルーティング

**ファイル**: `src/App.tsx`

```typescript
const parseHashPath = React.useCallback((hashValue: string) => { ... })
```

**問題点**:
- React Routerではなく、手動でハッシュルーティングを実装
- ルート管理が散在
- ナビゲーション履歴が複雑

**推奨対応**:
- `react-router-dom` の導入を検討
- または現在の実装をカスタムフックに整理

---

### 🟡 8.2 ローカルストレージの直接使用

**該当箇所**: 12箇所（5ファイル）

**問題点**:
- ローカルストレージへのアクセスが分散
- キー名の管理が困難
- SSR対応が困難

**推奨対応**:
- ストレージアクセスを統一したフックに集約
- キー名を定数として管理

---

### 🟢 8.3 複数のシナリオ編集コンポーネント

**ファイル**:
- `src/components/modals/ScenarioEditDialog.tsx`
- `src/components/modals/ScenarioEditModal.tsx`
- `src/components/modals/ScenarioEditModal/index.tsx`

**問題点**:
- 類似機能を持つコンポーネントが複数存在
- どれを使うべきか混乱する

**推奨対応**:
- 1つのコンポーネントに統合
- 不要なものを削除

---

## 9. 依存関係の問題

### 🟡 9.1 `@types/date-fns` の不要なインストール

**ファイル**: `package.json` (57行目)

```json
"@types/date-fns": "^2.5.3",
```

**問題点**:
- `date-fns` v4は型定義を内蔵している
- `@types/date-fns` は非推奨

**推奨対応**:
- `@types/date-fns` を削除

---

### 🟢 9.2 開発用パッケージの本番ビルドへの影響

**問題点**:
- `@tanstack/react-query-devtools` が dependencies に含まれている
- 本番ビルドサイズへの影響

**推奨対応**:
- 本番ビルドで除外されているか確認
- 必要に応じて devDependencies に移動

---

### 🟢 9.3 ESLintの設定

**ファイル**: `package.json`

```json
"lint": "eslint . --ext ts,tsx --report-unused-disable-directives --max-warnings 0"
```

**問題点**:
- ESLintの設定ファイル（`.eslintrc.js` など）が見当たらない
- ルールが明示されていない

**推奨対応**:
- ESLint設定ファイルを追加
- 推奨ルールセットを適用

---

## 10. 運用上の問題

### 🟡 10.1 メールテンプレートのハードコード

**ファイル**: `src/pages/Settings/pages/EmailSettings.tsx` (162-164行目)

```typescript
company_name: 'クイーンズワルツ',
company_phone: '03-XXXX-XXXX',
company_email: 'info@queens-waltz.jp',
```

**問題点**:
- 電話番号がプレースホルダーのまま
- 実際の連絡先が設定されていない可能性

**推奨対応**:
- 正しい連絡先情報を設定
- 環境変数から取得するように変更

---

### 🟡 10.2 環境変数の文書化

**ファイル**: `env.example`

**問題点**:
- Supabase関連の環境変数のみ記載
- Discord Bot Token、Google Sheets API Keyなどが未記載

**推奨対応**:
- 必要なすべての環境変数を `env.example` に記載
- 各環境変数の説明を追加

---

### 🟢 10.3 ログ出力の一貫性

**問題点**:
- `console.log` と `logger.log` が混在
- ログレベル（info, warn, error）の使い分けが不統一

**推奨対応**:
- すべてのログを `logger` ユーティリティ経由に統一

---

## 改善優先度まとめ

### 🔴 高優先度（セキュリティ・重大なバグ）
1. Supabase認証情報のハードコード削除
2. `as any` の削減（特にAPI関連）
3. N+1クエリの修正

### 🟡 中優先度（品質・保守性）
4. console.logの `logger` への置換
5. setTimeoutのクリーンアップ追加
6. TODO項目のIssue化と対応
7. 大きすぎるファイルの分割
8. tsconfig.jsonの厳格化

### 🟢 低優先度（改善）
9. alert()のToastへの置換
10. 重複コードの統合
11. 不要な依存関係の削除
12. ESLint設定の追加

---

## 次のアクション

1. **即座に対応すべき項目**:
   - `supabase.ts` のハードコードされた認証情報を環境変数必須に変更

2. **今週中に対応すべき項目**:
   - 重要なAPIファイルの `as any` を型安全に修正
   - setTimeoutのクリーンアップ追加

3. **今月中に対応すべき項目**:
   - console.logの整理
   - 大きいファイルの分割
   - TODOの整理とIssue化

4. **継続的に改善すべき項目**:
   - ESLintルールの追加と適用
   - テストカバレッジの向上
   - ドキュメントの充実

---

*このレポートは `2024-12-04` に自動生成されました。*
*定期的に見直し、更新することを推奨します。*

