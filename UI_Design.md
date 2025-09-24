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
  - 要素名: `changeMonth` 関数 + `currentDate` 状態
  - 左矢印: `ChevronLeft` ボタン
  - 右矢印: `ChevronRight` ボタン
  - 月選択: `Select` コンポーネント

##### カテゴリタブ
- **カテゴリフィルター**
  - 要素名: `selectedCategory` 状態
  - コンポーネント: `Tabs` > `TabsList` > `TabsTrigger`
  - 機能: 選択カテゴリの公演のみ表示（`getEventsForSlot`でフィルタリング）
  - タブ一覧:
    - "すべて" (`value="all"`) - 全カテゴリ表示
    - "オープン公演" (`value="open"`) - オープン公演のみ
    - "貸切公演" (`value="private"`) - 貸切公演のみ
    - "GMテスト" (`value="gmtest"`) - GMテストのみ
    - "テストプレイ" (`value="testplay"`) - テストプレイのみ
    - "出張公演" (`value="trip"`) - 出張公演のみ

##### メインテーブル
- **スケジュールテーブル**
  - コンポーネント: `Table` > `TableHeader` + `TableBody`
  - ヘッダー列:
    - 日付列: "日付" (`w-20` - 80px)
    - 曜日列: "曜日" (`w-16` - 64px)
    - 会場列: "会場" (`w-20` - 80px)
    - 午前列: "午前 (~12:00)" (`w-60` - 240px)
    - 午後列: "午後 (12:00-17:00)" (`w-60` - 240px)
    - 夜間列: "夜間 (17:00~)" (`w-60` - 240px)
    - メモ列: "メモ" (`w-48` - 192px)
  - 特殊スタイル:
    - 土曜日: `text-blue-600`
    - 日曜日: `text-red-600`
    - 祝日行: `bg-red-50 border-red-200`

##### タイムスロットセル (`TimeSlotCell.tsx`)
- **公演がある場合**: `PerformanceCard` コンポーネント
- **空きスロットの場合**: `EmptySlot` コンポーネント

##### メモセル (`MemoCell.tsx`)
- **メモセル**
  - 要素名: `MemoCell` コンポーネント
  - 機能: インライン編集可能なテキストエリア（自動保存）
  - データ: `memos[${date}-${venue}]` 形式で状態管理 + Supabase連携
  - 表示モード: 破線ボーダー + "メモを追加" プレースホルダー
  - 編集モード: `Textarea`のみ（ボタンなし）
  - 自動保存: 1秒デバウンス + フォーカスアウト時即座保存
  - サイズ: `w-48` (192px)

---

## スケジュール管理画面の詳細要素マップ

### 公演カード内の要素 (`PerformanceCard.tsx`)

#### 🕐 時間表示エリア
- **要素名**: `start_time-end_time` span
- **場所**: カード上部左
- **内容**: "14:00-18:00" 形式
- **スタイル**: `font-mono text-xs`
- **色制御**: `badgeTextColor` (カテゴリ色)

#### 🏷️ バッジエリア (カード上部右)
1. **中止バッジ**
   - **要素名**: 中止Badge
   - **表示条件**: `event.is_cancelled === true`
   - **内容**: "中止"
   - **スタイル**: `variant="destructive" size="sm"`
   - **色**: `badgeTextColor` 適用

2. **予約者数バッジ**
   - **要素名**: 予約者数Badge
   - **表示条件**: `reservationCount > 0 && !event.is_cancelled`
   - **内容**: `<Users アイコン> + 数値`
   - **例**: "👥 6"
   - **色**: カテゴリ色 (`categoryConfig[category].badgeColor`)

3. **カテゴリバッジ**
   - **要素名**: カテゴリBadge
   - **内容**: カテゴリ名 ("貸切公演", "オープン公演" など)
   - **色**: カテゴリ色 (`categoryConfig[category].badgeColor`)

#### 📝 テキスト情報エリア
1. **シナリオタイトル**
   - **要素名**: シナリオ名div
   - **場所**: バッジエリア下
   - **内容**: `event.scenario` または "未定"
   - **スタイル**: `font-medium line-clamp-2`
   - **色**: `badgeTextColor`

2. **GM情報**
   - **要素名**: GM情報div
   - **内容**: "GM: [GM名]" または "GM: 未定"
   - **データ**: `event.gms[]` 配列
   - **色**: `badgeTextColor`

3. **ノート情報**
   - **要素名**: ノートdiv
   - **表示条件**: `event.notes` が存在する場合
   - **内容**: `event.notes`
   - **スタイル**: `text-xs truncate`
   - **色**: `badgeTextColor`

#### ⚠️ 状態表示要素
1. **未完成警告アイコン**
   - **要素名**: AlertTriangle アイコン
   - **場所**: カード右上角
   - **表示条件**: `!event.scenario || event.gms.length === 0`
   - **色**: `text-yellow-500`

2. **中止状態表示**
   - **要素名**: カード全体のopacity
   - **表示条件**: `event.is_cancelled === true`
   - **効果**: `opacity-75` + 取り消し線

#### 🔧 アクションボタン (カード右下角)
1. **中止ボタン**
   - **要素名**: 中止Button
   - **表示条件**: `!event.is_cancelled`
   - **アイコン**: `Ban`
   - **機能**: `onCancel(event)` 実行

2. **復活ボタン**
   - **要素名**: 復活Button
   - **表示条件**: `event.is_cancelled`
   - **アイコン**: `Plus`
   - **機能**: `onUncancel(event)` 実行

### 空きスロット要素 (`EmptySlot.tsx`)

#### ➕ 追加ボタン
- **要素名**: 公演追加Button
- **内容**: `<Plus アイコン> + "公演追加"`
- **スタイル**: `variant="ghost"` + 破線ボーダー
- **機能**: `onAddPerformance(date, venue, timeSlot)` 実行

---

## 要素の特定方法

### 編集したい要素を見つける手順
1. **UI_Design.md** でページを特定
2. **該当セクション** で要素名を確認
3. **ファイル名** でコンポーネントを特定
4. **要素名** でコード内の該当箇所を検索

### 例: "予約者数の表示を変更したい"
1. スケジュール管理ページ → 公演カード内の要素
2. **予約者数バッジ** を確認
3. `PerformanceCard.tsx` ファイルを開く
4. "予約者数Badge" または `reservationCount` で検索

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

---

## 🚨 プロジェクトルール: UI_Design.md更新義務

### **必須更新タイミング**
以下の変更を行う際は、**必ずUI_Design.mdも同時に更新**してください：

1. **新しいUI要素の追加**
   - 新しいボタン、バッジ、アイコン、フォーム要素など
   - 要素名、場所、機能、スタイルを詳細記載

2. **既存要素の変更**
   - 表示条件の変更
   - スタイル・色の変更
   - 機能・動作の変更

3. **新しいページ・コンポーネントの追加**
   - 新しいページセクションを追加
   - 全UI要素を詳細マップ化

4. **要素の削除**
   - 該当要素をドキュメントからも削除
   - 関連する説明も更新

### **更新手順**
1. コードを変更
2. UI_Design.mdの該当セクションを更新
3. 変更履歴に記録
4. 必要に応じて「要素の特定方法」も更新

### **更新忘れ防止**
- コミット前にUI_Design.mdの更新を確認
- プルリクエスト時にUI変更とドキュメント更新をセットで確認

---

## 🚨 プロジェクトルール: アドバイス時の実装禁止

### **アドバイス要求時の対応**
ユーザーが以下のような表現でアドバイスを求めた場合は、**実装を行わずアドバイスのみ提供**する：

- "アドバイスくれない？"
- "設計のアドバイス所望"
- "どう思う？"
- "おすすめは？"
- "どうしたらいい？"

### **実装を行う条件**
明示的な実装指示がある場合のみ実装を行う：

- "実装して"
- "作って"
- "追加して"
- "変更して"

### **違反防止**
- アドバイス要求 → 選択肢・比較・推奨案の提示のみ
- 実装指示 → アドバイス + 実装の両方

---

## 更新履歴
- 2025-09-24: 初版作成
- 2025-09-24: スケジュール管理画面の詳細要素マップを追加
- 2025-09-24: 予約者数バッジの色を満席率ベースからカテゴリ色ベースに変更
- 2025-09-24: プロジェクトルール「UI_Design.md更新義務」を確立
- 2025-09-24: カテゴリタブでの表示切り替え機能を実装（`getEventsForSlot`にフィルタリング追加）
- 2025-09-24: TimeSlotCellの幅を240px（`w-60`）に統一
- 2025-09-24: 全ページを1440px画面最適化（`max-w-7xl px-8` - コンテンツ幅1280px）
- 2025-09-24: スケジュール管理画面にメモエリア追加（`MemoCell`コンポーネント、インライン編集機能）
- 2025-09-24: メモエリアを自動保存仕様に変更（ボタンなし、デバウンス付き自動保存、Supabase連携）

---

## 注意事項
- **🚨 重要**: UI変更時は必ずこのドキュメントも更新（プロジェクトルール）
- 新しいバッジや要素を追加する場合は、該当セクションに詳細を記載
- 色の変更は `categoryConfig` または店舗色設定を参照
- 要素名は検索しやすい名前を付ける（例: "予約者数Badge", "GM情報div"）
