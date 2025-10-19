# ScenarioDetailPage リファクタリング進捗

## 📊 現在の状態

### ✅ 完了済み（Step 1）

#### 1. UI部品の分離
- **ScenarioHero.tsx** (102行): ヒーローセクション（キービジュアル + タイトル + 基本情報）
- **EventList.tsx** (130行): 公演日程一覧
- **PrivateBookingForm.tsx** (172行): 貸切リクエスト日時選択
- **ScenarioInfo.tsx** (117行): シナリオ詳細情報（既存）

**削減結果**: 1,092行 → 793行（**299行削減、27.4%**）

#### 2. バックアップファイル整理
- 5つのバックアップファイル削除（合計6,448行）
- `.gitignore` と `.cursorignore` に `*.backup`, `*.old`, `*.bak` 追加

---

## 🎯 次のステップ（優先度順）

### Step 2: 残りのUI部品分離（目標: 200-300行）

**現在793行 → 目標200-300行**にするため、以下を分離：

1. **BookingPanel.tsx** (予約確認パネル)
   - 人数選択
   - 料金表示
   - 予約ボタン
   - 推定50-80行

2. **BookingNotice.tsx** (予約注意事項)
   - 注意事項リスト
   - カード表示
   - 推定30-50行

3. **OrganizerInfo.tsx** (主催者情報)
   - 主催者カード
   - アバター + 名前
   - 推定20-30行

### Step 3: React.memo適用（パフォーマンス最適化）

以下のコンポーネントをメモ化：
- `EventList` (130行) - イベントリスト
- `PrivateBookingForm` (172行) - 貸切フォーム
- `ScenarioHero` (102行) - ヒーローセクション

**理由**: 親の状態変更時に不要な再レンダーを防ぐ

### Step 4: ロジックをhooksに分離

1. **usePrivateBooking.ts**
   - `generatePrivateDates()`
   - `checkTimeSlotAvailability()`
   - `toggleTimeSlot()`
   - `isTimeSlotSelected()`
   - 貸切関連の状態管理

2. **useBookingActions.ts**
   - 予約確定処理
   - 貸切リクエスト送信
   - エラーハンドリング

### Step 5: 重い計算をselectorsに移動

**utils/selectors.ts** を作成：
- 日付生成ロジック
- 空き状況チェック
- イベントフィルタリング

---

## 📝 コミット履歴

### 最新のコミット

```
d08471b - chore: バックアップファイルを削除し .gitignore/.cursorignore に追加
32d4953 - feat: extract EventList & PrivateBookingForm (1092行→793行、27.4%削減)
ff65531 - feat: extract ScenarioHero component (1092行→1010行、7.5%削減)
c1eadfc - refactor: ScenarioDetailPage 部分リファクタリング（1130行→1092行、3.4%削減）
```

---

## 🔄 再開時のアクション

1. **TODOリストを確認**: 次のタスクを `in_progress` に設定
2. **Step 2から継続**: BookingPanel, BookingNotice, OrganizerInfo を分離
3. **目標達成確認**: index.tsx が 200-300行になったら Step 3へ

---

## 📐 設計原則（遵守中）

✅ **各コンポーネントは300行以内**  
✅ **propsは完成形データ + 最低限のコールバック**  
✅ **UIロジックとビジネスロジックを分離**  
✅ **責務を明確に**  

---

## 🚀 最終目標

**ScenarioDetailPage/index.tsx**: 1,092行 → **200-300行**（薄いコンテナ）

**達成率**: 27.4% → 目標: 75-80%

