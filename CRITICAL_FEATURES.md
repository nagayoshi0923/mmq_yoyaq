# 重要機能リスト（削除・変更厳禁）

このファイルは、プロジェクトの中で**絶対に削除・劣化させてはいけない重要機能**をリストアップしています。
これらの機能を修正する際は、必ずこのドキュメントを確認し、機能が失われないように注意してください。

---

## 🚨 スケジュール重複防止機能

### 概要
同じ日付・店舗・時間帯に複数の公演が登録されることを防ぐための重要機能。

### 実装箇所

#### 1. スケジュール管理画面での手動追加・編集
**ファイル**: `src/pages/ScheduleManager.tsx`
**関数**: `handleSavePerformance` (827行目～)

**機能**:
- 公演を保存する前に、同じ日付・店舗・時間帯に既存の公演がないかチェック
- 重複がある場合は `ConflictWarningModal` を表示
- ユーザーが承認した場合のみ、既存公演を削除して新規公演を保存

**チェック項目**:
```typescript
// 以下の条件で重複をチェック
- event.date === performanceData.date
- event.venue === performanceData.venue
- getTimeSlot(event.start_time) === timeSlot
- !event.is_cancelled
```

**注意事項**:
- ⚠️ 編集モード時は、編集中の公演自身を除外すること
- ⚠️ 時間帯判定ロジック（`getTimeSlot`）は以下の通り：
  - 朝: 0-11時
  - 昼: 12-16時
  - 夜: 17時以降

---

#### 2. 貸切リクエスト承認時の競合チェック
**ファイル**: `src/pages/PrivateBookingManagement.tsx`
**関数**: `loadConflictInfo` (308行目～)

**機能**:
- 貸切リクエストを承認する際、店舗とGMの選択肢から既に予約済みの日時を除外
- 選択不可の店舗・GMには「予約済み」と表示

**重要**: この関数は**2つのテーブル**をチェックする必要があります：

1. **`reservations` テーブル** (確定済み貸切予約)
   ```typescript
   const { data: confirmedReservations } = await supabase
     .from('reservations')
     .select('id, store_id, gm_staff, candidate_datetimes')
     .eq('status', 'confirmed')
   ```

2. **`schedule_events` テーブル** (手動追加・インポートされた全公演)
   ```typescript
   const { data: scheduleEvents } = await supabase
     .from('schedule_events')
     .select('id, store_id, date, start_time, gms, is_cancelled')
     .eq('is_cancelled', false)
   ```

**⚠️ 重大な注意事項**:
- **どちらか一方だけのチェックでは不十分です！**
- 過去に `reservations` テーブルのみをチェックする簡易版が実装され、`schedule_events` のチェックが漏れた事例があります
- この機能を修正・再実装する際は、必ず両方のテーブルをチェックするように実装してください

**時間帯判定ロジック**:
```typescript
const getTimeSlot = (startTime: string): string => {
  const hour = parseInt(startTime.split(':')[0])
  if (hour < 12) return '朝'
  if (hour < 17) return '昼'
  return '夜'
}
```

**競合情報の形式**:
```typescript
// 店舗の競合: `${store_id}-${date}-${timeSlot}`
storeDateConflicts.add('bef973a7-faa2-466d-afcc-c6466f24474f-2025-10-15-夜')

// GMの競合: `${gm_id}-${date}-${timeSlot}`
gmDateConflicts.add('some-gm-uuid-2025-10-15-夜')
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

### 2025-10-17
- **修正**: 貸切リクエスト承認時の競合チェックを強化
- **詳細**: `loadConflictInfo` 関数が `reservations` テーブルのみをチェックしていた問題を修正
- **変更内容**: `schedule_events` テーブルも含めてチェックするように改善
- **修正者**: AI Assistant
- **理由**: 過去に実装した機能が失われていたため、再実装とともに保護コメントを追加

### 2025-10-17
- **追加**: 重要機能に保護コメント（🚨 CRITICAL）を追加
- **対象関数**:
  - `ScheduleManager.handleSavePerformance`
  - `PrivateBookingManagement.loadConflictInfo`
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

## 📝 今後の課題

- [ ] 重要機能に対するユニットテストの追加
- [ ] E2Eテストによる自動チェック
- [ ] CI/CDパイプラインでの重複チェック機能のテスト
- [ ] 重要関数を別ファイルに分離（`utils/conflictChecker.ts` など）

