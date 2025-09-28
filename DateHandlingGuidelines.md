# 日付・期間処理ガイドライン

## 基本原則

1. **JST固定**: すべての日付処理は日本時間（Asia/Tokyo）で統一
2. **ライブラリ不使用**: 純JavaScript（Date API + Intl.DateTimeFormat）のみ使用
3. **タイムゾーン変換禁止**: `toISOString().slice(0,10)` や `new Date('YYYY-MM-DD')` の直接使用を禁止

## 必須使用ユーティリティ

```typescript
import {
  getThisMonthRangeJST,
  getLastMonthRangeJST,
  getThisWeekRangeJST,
  getLastWeekRangeJST,
  getPastDaysRangeJST,
  getThisYearRangeJST,
  getLastYearRangeJST,
  getDaysDiff,
  formatDateJST,
  getCurrentJST
} from '@/utils/dateUtils'
```

## 実装ルール

### 1. 日付文字列の作成
```typescript
// ❌ 禁止
const dateStr = date.toISOString().split('T')[0]

// ✅ 正しい
const dateStr = formatDateJST(date)
```

### 2. 日付文字列のパース
```typescript
// ❌ 禁止
const date = new Date('2025-09-01')

// ✅ 正しい
const date = new Date('2025-09-01T00:00:00+09:00')
```

### 3. 期間の計算
```typescript
// ❌ 禁止
const daysDiff = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24))

// ✅ 正しい
const daysDiff = getDaysDiff(startDate, endDate)
```

### 4. 月の範囲取得
```typescript
// ❌ 禁止
const startDate = new Date(year, month, 1)
const endDate = new Date(year, month + 1, 0)

// ✅ 正しい
const range = getThisMonthRangeJST()
// range.startDateStr: "2025-09-01"
// range.endDateStr: "2025-09-30"
```

## 期間表示の統一フォーマット

```typescript
// 期間表示の標準フォーマット
const periodLabel = `期間: ${range.startDateStr} ～ ${range.endDateStr}`
// 例: "期間: 2025-09-01 ～ 2025-09-30"
```

## カレンダー表示の基準

### 月表示
- **開始**: その月の1日 00:00:00.000（JST）
- **終了**: その月の末日 23:59:59.999（JST）
- **表示形式**: YYYY-MM-DD

### 週表示
- **開始**: 月曜日 00:00:00.000（JST）
- **終了**: 日曜日 23:59:59.999（JST）

### 日表示
- **開始**: 指定日 00:00:00.000（JST）
- **終了**: 指定日 23:59:59.999（JST）

## テストケース

以下の期間が正しく表示されることを確認：

- **2025-09** → `2025-09-01 ～ 2025-09-30`
- **2024-02（うるう年）** → `2024-02-01 ～ 2024-02-29`
- **2025-08** → `2025-08-01 ～ 2025-08-31`
- **今週** → 月曜日 ～ 日曜日（JST）
- **先週** → 前週の月曜日 ～ 日曜日（JST）

## 禁止事項

1. `toISOString().slice(0,10)` の使用
2. `new Date('YYYY-MM-DD')` の直接使用
3. タイムゾーンを考慮しない日付計算
4. 環境依存の日付処理

## 推奨事項

1. すべての日付処理で `@/utils/dateUtils` を使用
2. 期間表示は統一フォーマットを使用
3. カレンダーコンポーネントはJST基準で実装
4. 日付の比較・計算は `getDaysDiff` を使用

## 既存コンポーネントの更新が必要な箇所

### 1. スケジュール管理
- `src/components/schedule/` 内の全コンポーネント
- 日付表示・期間計算の統一

### 2. シナリオ管理
- `src/components/modals/ScenarioEditModal.tsx`
- 期間設定の日付処理

### 3. その他の管理画面
- 日付入力・表示がある全てのコンポーネント
- 期間フィルタリング機能

### 更新手順

1. `@/utils/dateUtils` をインポート
2. 既存の日付処理を新しいユーティリティに置換
3. 期間表示を統一フォーマットに変更
4. テストケースで動作確認

---

*このガイドラインは、プロジェクト全体の日付処理の一貫性と正確性を保つために必須です。*
