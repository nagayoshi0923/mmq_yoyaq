# UI Design Document

## 概要
このドキュメントは、MMQ（Murder Mystery Queue）システムの全UI要素とコンポーネントの使用状況を管理するためのものです。

## ページ別UI要素一覧

### 1. ログインページ (`LoginForm.tsx`)

#### UI要素
- **フォーム切り替えボタン**
  - 種類: Button
  - 用途: ログイン/サインアップの切り替え
  - 状態: `isSignUp` で制御

- **認証フォーム**
  - 種類: Input (email, password)
  - 用途: ユーザー認証情報入力

- **テストアカウント作成ボタン**
  - 種類: Button (3種類)
  - 用途: 管理者/スタッフ/顧客のテストアカウント作成
  - ラベル: "管理者アカウント作成", "スタッフアカウント作成", "顧客アカウント作成"

---

### 2. 管理者ダッシュボード (`AdminDashboard.tsx`)

#### 共通レイアウト
- **Header** (`Header.tsx`)
  - サイトタイトル: "MMQ"
  - ユーザー情報表示
  - ログアウトボタン

- **NavigationBar** (`NavigationBar.tsx`)
  - ナビゲーションタブ: "店舗", "シナリオ", "スタッフ", "スケジュール"
  - アクティブ状態表示: 3px下線

#### ダッシュボード固有要素
- **統計カード**
  - 種類: Card
  - 内容: 店舗数、シナリオ数、スタッフ数、今月の公演数
  - アイコン: Store, FileText, Users, Calendar

- **アクティビティログ**
  - 種類: Card + リスト
  - 用途: 最近の活動履歴表示

---

### 3. 店舗管理ページ (`StoreManagement.tsx`)

#### 共通レイアウト
- **Header** + **NavigationBar** (共通)

#### 店舗管理固有要素
- **店舗カード**
  - 種類: Card
  - 要素:
    - 店舗識別色ドット (小さな色付き円)
    - 店舗名 + 略称
    - 住所、電話番号、メール
    - 営業開始日、管理者名
    - ステータスバッジ
    - 編集/削除ボタン

- **編集モーダル** (`StoreEditModal.tsx`)
  - 種類: Dialog
  - フォーム要素: Input, Select, Textarea
  - 保存/キャンセルボタン

---

### 4. シナリオ管理ページ (`ScenarioManagement.tsx`)

#### 共通レイアウト
- **Header** + **NavigationBar** (共通)

#### シナリオ管理固有要素
- **検索・フィルター**
  - 種類: Input (検索), Select (カテゴリフィルター)

- **シナリオカード**
  - 種類: Card
  - 要素:
    - シナリオタイトル
    - カテゴリバッジ
    - 説明文 (`line-clamp` で省略)
    - プレイ時間、参加人数
    - 削除ボタン

---

### 5. スタッフ管理ページ (`StaffManagement.tsx`)

#### 共通レイアウト
- **Header** + **NavigationBar** (共通)

#### スタッフ管理固有要素
- **スタッフカード**
  - 種類: Card
  - 要素:
    - スタッフ名
    - 役職バッジ
    - メールアドレス
    - 電話番号
    - 削除ボタン

---

### 6. スケジュール管理ページ (`ScheduleManager.tsx`)

#### 共通レイアウト
- **Header** + **NavigationBar** (共通)

#### スケジュール管理固有要素

##### ヘッダー部分
- **月選択コントロール**
  - 種類: Button (ChevronLeft/Right) + Select
  - 用途: 表示月の変更

##### カテゴリタブ
- **カテゴリフィルター**
  - 種類: Tabs (TabsList + TabsTrigger)
  - タブ: "すべて", "オープン公演", "貸切公演", "GMテスト", "テストプレイ", "出張公演"
  - 各タブに専用色設定

##### メインテーブル
- **スケジュールテーブル**
  - 種類: Table (TableHeader + TableBody)
  - 列: 日付, 曜日, 会場, 午前, 午後, 夜間
  - 特殊スタイル:
    - 土曜日: `text-blue-600`
    - 日曜日: `text-red-600`
    - 祝日行: `bg-red-50 border-red-200`

##### タイムスロットセル (`TimeSlotCell.tsx`)
- **公演カード** (`PerformanceCard.tsx`) または **空きスロット** (`EmptySlot.tsx`)

---

## コンポーネント詳細

### PerformanceCard.tsx
公演情報を表示するカード型コンポーネント

#### バッジ要素
1. **中止バッジ**
   - 種類: Badge (variant="destructive", size="sm")
   - 表示条件: `event.is_cancelled === true`
   - ラベル: "中止"
   - 色: カテゴリ色のテキスト色を適用

2. **予約者数バッジ**
   - 種類: Badge (size="sm")
   - 表示条件: `reservationCount > 0 && !event.is_cancelled`
   - アイコン: Users
   - 内容: 予約者数 (例: "6")
   - 色: カテゴリ色 (背景色 + テキスト色)

3. **カテゴリバッジ**
   - 種類: Badge (size="sm")
   - 内容: カテゴリラベル (例: "貸切公演")
   - 色: カテゴリ色 (背景色 + テキスト色)

#### テキスト要素
- **時間表示**: `start_time-end_time` (例: "14:00-18:00")
- **シナリオタイトル**: 公演のシナリオ名
- **GM情報**: "GM: [GM名]"
- **ノート**: 追加情報 (任意)

#### アクション要素
- **中止ボタン**: Ban アイコン (公演中止用)
- **復活ボタン**: Plus アイコン (中止解除用)

#### 状態表示
- **未完成警告**: AlertTriangle アイコン (シナリオ/GM未定時)
- **中止状態**: 全体を `opacity-75` + 取り消し線

### EmptySlot.tsx
空のタイムスロット表示用コンポーネント

#### 要素
- **追加ボタン**
  - 種類: Button (variant="ghost")
  - スタイル: 破線ボーダー
  - アイコン: Plus
  - ラベル: "公演追加"

---

## 色システム

### カテゴリ色設定 (`categoryConfig`)
```typescript
const categoryConfig = {
  open: { 
    label: 'オープン公演', 
    badgeColor: 'bg-blue-100 text-blue-800', 
    cardColor: 'bg-blue-50 border-blue-200' 
  },
  private: { 
    label: '貸切公演', 
    badgeColor: 'bg-purple-100 text-purple-800', 
    cardColor: 'bg-purple-50 border-purple-200' 
  },
  gmtest: { 
    label: 'GMテスト', 
    badgeColor: 'bg-orange-100 text-orange-800', 
    cardColor: 'bg-orange-50 border-orange-200' 
  },
  testplay: { 
    label: 'テストプレイ', 
    badgeColor: 'bg-yellow-100 text-yellow-800', 
    cardColor: 'bg-yellow-50 border-yellow-200' 
  },
  trip: { 
    label: '出張公演', 
    badgeColor: 'bg-green-100 text-green-800', 
    cardColor: 'bg-green-50 border-green-200' 
  }
}
```

### 店舗識別色
- 高田馬場店: blue
- 別館①: green  
- 別館②: purple
- 大久保店: orange
- 大塚店: red
- 埼玉大宮店: amber

---

## 更新履歴
- 2025-09-24: 初版作成
- 予約者数バッジの色を満席率ベースからカテゴリ色ベースに変更

---

## 注意事項
- コンポーネントや要素を変更する際は、必ずこのドキュメントも更新してください
- 新しいバッジや要素を追加する場合は、該当セクションに詳細を記載してください
- 色の変更は `categoryConfig` または店舗色設定を参照してください
