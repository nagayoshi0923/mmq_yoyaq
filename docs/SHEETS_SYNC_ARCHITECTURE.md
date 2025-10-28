# Googleスプレッドシート同期 - アーキテクチャ設計

## 📊 スプレッドシートの構成案

### 採用案: 時間帯別スタッフ表示版 + 月別タブ（決定）

#### シート構造

```
タブ構成:
- 2025年11月
- 2025年12月
- 2026年1月
...（月ごとにタブを作成）
```

#### 各タブの構成

```
列A: 日付
列B: 朝（スタッフ名のリスト）
列C: 昼（スタッフ名のリスト）
列D: 夜（スタッフ名のリスト）
```

**例: 2025年11月タブ**
（スタッフ名は実際に提出したスタッフの名前を表示）

| 日付 | 朝 | 昼 | 夜 |
|------|-------|-------|---------|
| 11/1 | 田中太郎 | 山田花子 | 田中太郎、山田花子 |
| 11/2 | 田中太郎、山田花子 | 田中太郎、山田花子 | 山田花子 |
| 11/3 | 山田花子 | 田中太郎、山田花子 | 山田花子 |
| 11/4 | 田中太郎 | 田中太郎 | - |
| 11/5 | - | 山田花子 | 山田花子 |
| ... | ... | ... | ... |
| 11/30 | 田中太郎、山田花子 | 田中太郎 | 山田花子 |

**メリット**
- ✅ **月ごとに整理されている**
- ✅ **各時間帯に出勤可能なスタッフが一目でわかる**
- ✅ **シフト表として使いやすい**
- ✅ **同じ時間帯に何人出勤可能かが分かりやすい**
- ✅ **過去のデータを探しやすい**

**データ構造**
- 同一時間帯に複数のスタッフはカンマ区切り
- 出勤不可の場合は空欄
- 終日の場合は3つの列すべてにスタッフ名を記載
- 月ごとにタブを作成・更新

## 🎯 採用案

**時間帯別スタッフ表示版** を採用します。

### データの変換ロジック

#### Supabaseのデータ形式

```typescript
// 各スタッフのシフト
[
  {
    staff_name: "田中太郎",  // ← 実際のスタッフ名
    date: "2025-11-01",
    morning: true,    // 朝
    afternoon: false, // 昼
    evening: true     // 夜
  },
  {
    staff_name: "山田花子",  // ← 実際のスタッフ名
    date: "2025-11-01",
    morning: false,
    afternoon: true,
    evening: true
  }
]
```

#### スプレッドシートへの変換

```typescript
// 日付ごとにグループ化
{
  "2025-11-01": {
    morning: ["田中太郎"],
    afternoon: ["山田花子"],
    evening: ["田中太郎", "山田花子"]
  },
  "2025-11-02": {
    morning: ["田中太郎", "山田花子"],
    afternoon: ["田中太郎", "山田花子"],
    evening: ["山田花子"]
  }
}
```

#### 最終的なスプレッドシート表示

| 日付 | 朝 | 昼 | 夜 |
|------|-------|-------|---------|
| 11/1 | 田中太郎 | 山田花子 | 田中太郎、山田花子 |
| 11/2 | 田中太郎、山田花子 | 田中太郎、山田花子 | 山田花子 |

### 終日シフトの処理

**終日チェックがONの場合:**
- 朝・昼・夜の3つの時間帯すべてにスタッフ名を追加

```typescript
if (all_day) {
  morning.push(staff_name)
  afternoon.push(staff_name)
  evening.push(staff_name)
}
```

### セルのフォーマット

```javascript
// セルの書式設定
- フォント色: デフォルト（黒）
- 背景色: 
  - 出勤あり（文字列あり）: 白
  - 出勤なし（空欄）: 薄いグレー（#F5F5F5）
```

## 🔄 同期の仕組み

### データフロー

```
1. スタッフがシフトを提出
   ↓
2. Supabaseにデータが保存
   ↓
3. Edge Functionがトリガー
   ↓
4. Google Apps ScriptにHTTP POST
   ↓
5. スプレッドシートに反映
```

### 処理の流れ

1. **データ取得**: Supabaseから該当月の全スタッフのシフトを取得
2. **データ変換**: データベース形式からスプレッドシート形式に変換
3. **タブの存在確認**: 該当月のタブが存在するかチェック
4. **タブの作成**: タブが存在しない場合は作成
5. **書込み**: スプレッドシートの該当月タブに書き込み
6. **レスポンス**: 成功/失敗を返す

## 📊 データ構造の詳細

### Supabase → スプレッドシート変換

#### 変換アルゴリズム

```typescript
// 1. 日付ごとにデータをグループ化
const groupedByDate = {}

shifts.forEach(shift => {
  const date = shift.date
  if (!groupedByDate[date]) {
    groupedByDate[date] = {
      morning: [],
      afternoon: [],
      evening: []
    }
  }
  
  // 終日チェック
  if (shift.all_day) {
    groupedByDate[date].morning.push(shift.staff_name)
    groupedByDate[date].afternoon.push(shift.staff_name)
    groupedByDate[date].evening.push(shift.staff_name)
  } else {
    // 個別の時間帯チェック
    if (shift.morning) {
      groupedByDate[date].morning.push(shift.staff_name)
    }
    if (shift.afternoon) {
      groupedByDate[date].afternoon.push(shift.staff_name)
    }
    if (shift.evening) {
      groupedByDate[date].evening.push(shift.staff_name)
    }
  }
})

// 2. カンマ区切りの文字列に変換
Object.entries(groupedByDate).forEach(([date, timeSlots]) => {
  const morningStr = timeSlots.morning.join('、')
  const afternoonStr = timeSlots.afternoon.join('、')
  const eveningStr = timeSlots.evening.join('、')
  
  // スプレッドシートに書き込み
  // 行: date
  // 列B: morningStr
  // 列C: afternoonStr
  // 列D: eveningStr
})
```

#### 具体例

**入力:**
```typescript
[
  { staff_name: "田中太郎", date: "2025-11-01", morning: true, afternoon: false, evening: true, all_day: false },
  { staff_name: "山田花子", date: "2025-11-01", morning: false, afternoon: true, evening: true, all_day: false }
]
```

**変換後:**
```typescript
{
  "2025-11-01": {
    morning: ["田中太郎"],
    afternoon: ["山田花子"],
    evening: ["田中太郎", "山田花子"]
  }
}
```

**スプレッドシート表示:**
```
日付 | 朝       | 昼       | 夜
-----|----------|----------|------------------------
11/1 | 田中太郎 | 山田花子 | 田中太郎、山田花子
```

**重要:**
- `staff_name` は `staffs` テーブルの `name` フィールドから取得
- 実際にシフトを提出したスタッフの名前が表示される
- 複数のスタッフは「、」（全角カンマ）で区切る

## 🎨 UI/UX考慮事項

### スプレッドシートの見やすさ

1. **行の高さ**: 
   - ヘッダー: 40px
   - データ行: 25px
2. **列幅**:
   - 日付: 80px
   - 朝・昼・夜: 200px
3. **固定行**: 1行目（ヘッダー）を固定
4. **固定列**: A列（日付）を固定

### 条件付き書式

```
- セルにスタッフ名がある場合: 白背景
- セルが空の場合: 薄いグレー（#F5F5F5）
```

### 文字の装飾

- **フォントサイズ**: 11pt
- **フォント色**: 黒
- **テキストの折り返し**: 有効（複数名が入るため）

### ヘッダースタイル

```
- 背景色: 濃いグレー（#6B7280）
- 文字色: 白
- 太字: 有効
- 中央揃え: 有効
```

## 🔐 セキュリティ

### 認証

- Google Apps ScriptのWebアプリとして公開
- 「全員に公開」を選択
- 実行ユーザー: 「自分」

### アクセス制御

- スプレッドシートの共有設定で編集権限を制限
- 同期機能は閲覧のみで実行

## 📈 パフォーマンス

### 想定データ量

- スタッフ数: 約30名
- 日数: 31日
- セル数: 約124個（31行 × 4列）

### データ構造

```
- 行数: 31行（日付数）+ 1行（ヘッダー）= 32行
- 列数: 4列（日付、朝、昼、夜）
- 総セル数: 128個（ヘッダー含む）
```

### 処理時間

- データ取得: 1-2秒
- スプレッドシート書込み: 2-3秒
- **合計: 3-5秒**

### 最適化

- バッチ書き込み（一度に全データを書き込む）
- 不要なシートの更新をスキップ
- エラーハンドリングの強化

## 🚀 実装の優先順位

### Phase 1: 基本機能（必須）

1. ✅ スプレッドシートの作成
2. ✅ Google Apps Scriptの実装
3. ✅ Edge Functionの実装
4. ✅ 同期処理の呼び出し
5. ✅ 基本的なテスト

### Phase 2: 改善（推奨）

1. ⚪ 条件付き書式の追加
2. ⚪ エラーハンドリングの強化
3. ⚪ ログ機能の追加
4. ⚪ 手動同期ボタン

### Phase 3: 拡張（将来）

1. ⚪ 複数月の統合表示
2. ⚪ シフト希望の集計
3. ⚪ 自動通知機能
4. ⚪ データの履歴管理

