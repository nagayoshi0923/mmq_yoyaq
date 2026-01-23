# 重要機能保護ルール

**最終更新**: 2025-12-30

絶対に削除・劣化させてはいけない重要機能のリスト。

> ⚠️ **このドキュメントはコードと同期が必須**
> 重要機能を変更した場合は、このファイルも同時に更新すること。
> 詳細は `rules/rurle.mdc` の「13) ドキュメント信頼性ルール」を参照。

---

## 🚨 スケジュール重複防止機能

### 概要
同じ日付・店舗・時間帯に複数の公演が登録されることを防ぐための重要機能。

### 実装箇所

#### 1. スケジュール管理画面での手動追加・編集

**ファイル**: `src/hooks/useEventOperations.ts`

**関数**: 
- `checkConflict` - 重複チェックのコア関数（🚨 CRITICAL マーク付き）
- `handleSavePerformance` - 公演保存時の重複チェック（🚨 CRITICAL マーク付き）

**検索コマンド**:
```bash
grep -n "CRITICAL.*重複" src/hooks/useEventOperations.ts
```

**機能**:
- 公演を保存する前に、同じ日付・店舗・時間帯に既存の公演がないかチェック
- 重複がある場合は `ConflictWarningModal` を表示
- ユーザーが承認した場合のみ、既存公演を削除して新規公演を保存

**チェック項目**:
```typescript
// 以下の条件で重複をチェック
- event.date === targetDate
- event.venue === targetVenue
- getEventTimeSlot(event) === targetTimeSlot
- !event.is_cancelled
```

**注意事項**:
- ⚠️ 編集モード時は、編集中の公演自身を除外すること（`excludeEventId`パラメータ）
- ⚠️ 時間帯判定は `getEventTimeSlot()` 関数を使用
- ⚠️ 移動・複製・ペースト時も同じロジックで重複チェックを行う

---

#### 2. 貸切リクエスト承認時の競合チェック

**ファイル**: `src/pages/PrivateBookingManagement/hooks/useConflictCheck.ts`

**関数**: `loadConflictInfo`

**検索コマンド**:
```bash
grep -n "loadConflictInfo" src/pages/PrivateBookingManagement/hooks/
```

**機能**:
- 貸切リクエストを承認する際、店舗とGMの選択肢から既に予約済みの日時を除外
- 選択不可の店舗・GMには「予約済み」と表示

**⚠️ 現在の問題（2025-12-30確認）**:
現在の実装は `schedule_events` テーブルのみをチェックしており、
`reservations` テーブルのチェックが**欠落**しています。
これは本ドキュメントで警告していた問題そのものです。

**正しい実装（必須要件）**:
この関数は**2つのテーブル**をチェックする必要があります：

1. **`schedule_events` テーブル** (手動追加・インポートされた全公演)
   ```typescript
   const { data: scheduleEvents } = await supabase
     .from('schedule_events')
     .select('id, store_id, date, start_time, gms, is_cancelled')
     .eq('is_cancelled', false)
   ```

2. **`reservations` テーブル** (確定済み貸切予約) ← **現在欠落中**
   ```typescript
   const { data: confirmedReservations } = await supabase
     .from('reservations')
     .select('id, store_id, gm_staff, candidate_datetimes')
     .eq('status', 'confirmed')
   ```

**⚠️ 重大な注意事項**:
- **どちらか一方だけのチェックでは不十分です！**
- この機能を修正・再実装する際は、必ず両方のテーブルをチェックするように実装してください

**競合情報の形式**:
```typescript
// 店舗の競合: `${store_id}-${date}-${timeSlot}`
storeDateConflicts.add('store-uuid-2025-10-15-夜')

// GMの競合: `${gm_id}-${date}-${timeSlot}`
gmDateConflicts.add('gm-uuid-2025-10-15-夜')
```

---

#### 3. スケジュールインポート機能

**ファイル**: `src/components/schedule/ImportScheduleModal.tsx`

**機能**:
- 「既存の同月データを削除してから登録」チェックボックス（デフォルトON）
- ONの場合: 月全体のデータを削除してからインポート（推奨）
- OFFの場合: 重複チェックなしで追加（非推奨）

**注意事項**:
- ⚠️ チェックボックスOFF時は重複が発生する可能性がある
- ユーザーには「推奨」として削除オプションを明示している

---

## 📋 変更履歴

### 2026-01-23
- **修正**: 参加人数変更の在庫制御をRPCで統一
- **変更内容**:
  - `ReservationsPage` と `ReservationList` の人数変更を `update_reservation_participants` RPC経由に変更
  - 予約作成は既存の `create_reservation_with_lock` RPCを継続使用
  - 参加人数変更のエラーメッセージを明確化
- **修正者**: AI Assistant
- **理由**: 残席オーバーブッキング（C-1）をDB層で確実に防止するため

### 2026-01-11
- **修正**: `useConflictCheck.ts` に `reservations` テーブルのチェックを追加
- **変更内容**:
  - `loadConflictInfo` 関数に確定済み貸切予約（status='confirmed'）のチェックを追加
  - `loadGMConflicts` 関数に確定済み貸切予約のGM競合チェックを追加
  - 両関数に `🚨 CRITICAL` コメントを追加
- **修正者**: AI Assistant
- **理由**: ドキュメントに記載されていたTODO「reservationsテーブルのチェック欠落」を修正

### 2025-12-30
- **更新**: ドキュメントを現在のコード構造に合わせて全面改訂
- **変更内容**:
  - ファイルパスを `src/hooks/useEventOperations.ts` に修正（旧: `src/pages/ScheduleManager.tsx`）
  - 関数名を正確に記載（`checkConflict`, `handleSavePerformance`）
  - 行番号を削除（古くなるため）
  - 検索コマンドを追加（コード内での場所を特定しやすくするため）
- **問題発見**: `useConflictCheck.ts` が `reservations` テーブルをチェックしていない
- **修正者**: AI Assistant

### 2025-10-17
- **修正**: 貸切リクエスト承認時の競合チェックを強化
- **詳細**: `loadConflictInfo` 関数が `reservations` テーブルのみをチェックしていた問題を修正
- **変更内容**: `schedule_events` テーブルも含めてチェックするように改善
- **修正者**: AI Assistant
- **理由**: 過去に実装した機能が失われていたため、再実装とともに保護コメントを追加

### 2025-10-17
- **追加**: 重要機能に保護コメント（🚨 CRITICAL）を追加
- **対象関数**:
  - `useEventOperations.checkConflict`
  - `useEventOperations.handleSavePerformance`
- **目的**: 将来的な機能の削除・劣化を防ぐ

### 2025-10-17
- **作成**: このドキュメント（`CRITICAL_FEATURES.md`）を作成
- **目的**: 重要機能を明文化し、削除・変更時の参照資料とする

---

## 🛡️ 機能保護ルール

このプロジェクトで重要機能を修正・再実装する際は、以下のルールを守ってください：

1. **コードに保護コメントがある場合、必ず読んで理解すること**
   - `🚨 CRITICAL` マークがある機能は特に注意
   - コメントに記載された要件を満たしているか確認

2. **このドキュメントを参照すること**
   - 重要機能を修正する前に、必ずこのファイルを確認
   - 過去の変更履歴や注意事項を理解する

3. **変更履歴を記録すること**
   - 重要機能を修正した場合、このファイルに変更履歴を追記
   - 日付、変更内容、理由を明記

4. **テストすること**
   - 機能を修正した後は、必ず動作確認を行う
   - 特に重複チェック機能は、実際に重複を試して確認すること

5. **簡易版・退化版を実装しないこと**
   - 「とりあえず動く」簡易版を実装すると、以前の完全版が失われる
   - 既存実装を必ず確認し、同等以上の機能を維持すること

---

## 🔴 要修正事項（TODO）

### 高優先度
- [x] `useConflictCheck.ts` に `reservations` テーブルのチェックを追加 ✅ 2026-01-11 完了
  - `schedule_events` と `reservations` テーブル（status='confirmed'）の両方をチェック
  - `loadConflictInfo` と `loadGMConflicts` の両関数に実装済み

### 中優先度
- [ ] 重要機能に対するユニットテストの追加
- [ ] E2Eテストによる自動チェック
- [ ] CI/CDパイプラインでの重複チェック機能のテスト

---

## 🔍 重要機能の検索方法

コード内で重要機能を見つけるには以下のコマンドを使用：

```bash
# CRITICALマーク付きのコードを検索
grep -rn "CRITICAL" src/

# 重複チェック関連のコードを検索
grep -rn "conflict\|重複" src/hooks/

# 競合チェック関連のコードを検索
grep -rn "loadConflictInfo" src/pages/PrivateBookingManagement/
```
