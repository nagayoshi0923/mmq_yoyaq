# 開発状況メモ - 予約システム実装

## 📅 最終更新: 2025年10月5日

## ✅ 完了した実装

### 1. データベース設計（完了）
- ✅ `database/add_reservation_integration.sql` 作成
  - `customers`テーブルに`email`カラム追加
  - `reservations`テーブルに`schedule_event_id`カラム追加
  - `schedule_events`テーブルに予約関連カラム追加
    - `max_participants`: 最大参加人数
    - `reservation_deadline_hours`: 予約締切時間
    - `is_reservation_enabled`: 予約受付有効化
    - `reservation_notes`: 予約備考
  - ビュー作成: `schedule_event_reservations_summary`, `customer_reservation_history`

### 2. 型定義（完了）
- ✅ `src/types/index.ts`
  - `Customer`, `Reservation`, `ReservationSummary`, `ScheduleEventWithReservations`
  - 型の重複を解消（Reservation型の統一）

### 3. API実装（完了）
- ✅ `src/lib/reservationApi.ts` 作成
  - `customerApi`: getAll, create, update
  - `reservationApi`: getAll, getById, create, update, delete, getReservationSummary
- ✅ `src/lib/api.ts`
  - `scheduleApi.update`に`is_reservation_enabled`追加

### 4. スケジュール管理の予約機能統合（完了）
- ✅ `src/pages/ScheduleManager.tsx`
  - 予約数表示（「3/6」バッジ、満席時「満席」表示）
  - 予約サイト公開トグル（「公開前」「公開中」バッジ）
  - データ読み込みに`is_reservation_enabled`を追加

- ✅ `src/components/schedule/PerformanceCard.tsx`
  - 予約数バッジ（Users アイコン + 「3/6」または「満席」）
  - 予約公開バッジ（緑/グレーで状態表示）
  - アクションボタンのデザイン統一（セルの色に合わせた透明ボタン）

- ✅ `src/components/schedule/TimeSlotCell.tsx`
  - `onToggleReservation`プロップ追加
  - 予約機能の統合

### 5. 予約管理ページ（管理者用）（完了）
- ✅ `src/pages/ReservationManagement.tsx` 作成
  - 統計ダッシュボード（総予約数、確定済み、保留中、未払い）
  - 検索・フィルター機能
  - 予約一覧表示（ステータス・支払いバッジ付き）
  - `AdminDashboard`に統合

### 6. 顧客向け予約サイト（完了）
- ✅ `src/pages/CustomerBookingPage.tsx` 作成
  - 公開中のオープン公演一覧表示
  - 検索・フィルター（シナリオ名、店舗、日付）
  - 残席表示・満席警告
  - 店舗カラーの視覚的表現
  - 既存のHeader/NavigationBarを使用

- ✅ ナビゲーション統合
  - `src/components/layout/NavigationBar.tsx`
    - ロール別タブ表示機能追加
    - 「予約サイト」タブ追加（全ロール表示）
    - 「予約管理」タブ（管理者・スタッフのみ）
  
  - `src/pages/AdminDashboard.tsx`
    - 顧客ロール時に自動的に予約サイトを表示
    - `CustomerBookingPage`の統合

  - `src/App.tsx`
    - ルーティングをシンプル化
    - 全ロールで`AdminDashboard`を使用

### 7. インストールしたパッケージ
- ✅ `react-router-dom` (最終的に削除、使用せず)

## 🚧 未実装・次のステップ

### Phase 1: 予約フロー実装（優先度: 高）
1. **予約詳細モーダル/ページ**
   - [ ] 公演の詳細情報表示
   - [ ] 参加人数選択
   - [ ] 予約ボタンから遷移

2. **予約フォーム**
   - [ ] 顧客情報入力フォーム
     - 名前、メールアドレス、電話番号
     - 参加者名リスト
     - 特記事項
   - [ ] バリデーション
   - [ ] 確認画面への遷移

3. **予約確認画面**
   - [ ] 入力内容の確認
   - [ ] 料金計算・表示
   - [ ] 利用規約への同意
   - [ ] 予約確定ボタン

4. **予約完了画面**
   - [ ] 予約番号の生成・表示
   - [ ] 確認メール送信（TODO: メール機能）
   - [ ] 予約内容のサマリー表示

### Phase 2: 予約照会機能（優先度: 中）
5. **予約照会ページ**
   - [ ] 予約番号での検索
   - [ ] 予約詳細表示
   - [ ] キャンセル機能

### Phase 3: 管理機能強化（優先度: 中）
6. **予約管理ページの強化**
   - [ ] 予約詳細モーダル
   - [ ] 予約編集機能
   - [ ] 予約キャンセル機能
   - [ ] メール送信機能

7. **顧客管理ページ**
   - [ ] 顧客一覧表示
   - [ ] 顧客情報の追加・編集
   - [ ] 予約履歴の表示

### Phase 4: 実際のAPI接続（優先度: 低）
8. **Supabase統合**
   - [ ] `reservationApi.ts`の実装完了
   - [ ] RLS（Row Level Security）設定
   - [ ] リアルタイム更新

## 📁 主要ファイル

### データベース
```
database/
├── add_reservation_integration.sql  # 予約システム統合スキーマ
└── RESERVATION_SYSTEM_SETUP.md      # セットアップ手順
```

### フロントエンド
```
src/
├── pages/
│   ├── CustomerBookingPage.tsx      # 顧客向け予約サイト
│   ├── ReservationManagement.tsx    # 管理者向け予約管理
│   ├── ScheduleManager.tsx          # スケジュール管理（予約統合済み）
│   └── AdminDashboard.tsx           # ダッシュボード（ルーティング）
├── components/
│   ├── schedule/
│   │   ├── PerformanceCard.tsx      # 公演カード（予約表示）
│   │   └── TimeSlotCell.tsx         # タイムスロット
│   └── layout/
│       └── NavigationBar.tsx        # ナビゲーション（ロール対応）
├── lib/
│   ├── api.ts                       # 既存API（scheduleApi更新）
│   └── reservationApi.ts            # 予約API（作成済み、未接続）
└── types/
    └── index.ts                     # 型定義（予約関連追加）
```

## 🎯 次回の作業開始方法

### 1. 開発サーバー起動
```bash
cd /Users/nagayoshimai/mmq_yoyaq
npm run dev
```

### 2. アクセス
- 管理画面: `http://localhost:5173/`
- 予約サイト: ナビゲーションの「予約サイト」タブ

### 3. 次のタスク
**「予約ボタンをクリックした時の処理」から実装開始**

```typescript
// src/pages/CustomerBookingPage.tsx の handleBooking 関数
const handleBooking = (event: PublicEvent) => {
  // TODO: 予約フォームへ遷移
  console.log('予約:', event)
  alert(`「${event.scenario_title}」の予約機能は実装中です`)
}
```

### 実装手順案:
1. 予約フォームコンポーネント作成（`src/components/booking/BookingForm.tsx`）
2. モーダルまたは別ページで表示
3. 顧客情報入力フォーム実装
4. 確認画面の実装
5. 予約確定処理の実装

## 💡 メモ・注意事項

### ロール別アクセス制御
- **admin**: 全機能アクセス可能
- **staff**: 設定以外の全機能アクセス可能
- **customer**: 予約サイトのみアクセス可能

### 予約公開の仕組み
1. スケジュール管理で公演を作成
2. 「公開前」バッジをクリック → 「公開中」に変更
3. `is_reservation_enabled = true` に更新
4. 予約サイトに自動的に表示される

### データフロー
```
1. 管理者が公演作成（ScheduleManager）
2. 予約受付を有効化（公開中バッジ）
3. 顧客が予約サイトで公演閲覧（CustomerBookingPage）
4. 予約フォームで申し込み（未実装）
5. 予約管理で確認・編集（ReservationManagement）
```

## 🐛 既知の問題・制限事項

1. **モックデータ使用中**
   - 予約数は固定値（`current_participants: 0`）
   - 参加費は固定値（`3000円`）
   - 実際のデータはSupabase接続後に取得

2. **予約フォーム未実装**
   - 予約ボタンはアラート表示のみ
   - フォーム、確認画面、完了画面が必要

3. **メール機能未実装**
   - 予約確認メールの送信機能が必要

4. **リアルタイム更新なし**
   - 予約数の自動更新機能が必要
   - Supabaseのリアルタイム機能を使用予定

## 📚 参考ドキュメント

- `Guidelines.md`: デザインガイドライン
- `README.md`: プロジェクト全体の説明
- `database/RESERVATION_SYSTEM_SETUP.md`: DB設定手順

