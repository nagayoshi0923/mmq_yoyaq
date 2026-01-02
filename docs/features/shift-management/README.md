# シフト管理機能 詳細

**最終更新**: 2025-12-30

スタッフのシフト希望を収集し、管理者がスケジュールを作成するための機能。

---

## 1. 概要

### この機能が解決する課題

- スタッフが出勤可能日を簡単に提出したい
- 管理者がシフト提出状況を把握したい
- 提出期限を管理したい
- Discord通知でリマインドしたい

### 登場人物

| 人物 | 役割 |
|------|------|
| **スタッフ** | 出勤可能日を提出 |
| **管理者** | 提出状況確認、締切設定 |

---

## 2. 画面構成

### 2.1 シフト提出画面（スタッフ向け）

```
┌─────────────────────────────────────────────────────────────────────┐
│ シフト提出                                                           │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ◀ 2025年1月 ▶                     [全選択] [全解除]               │
│                                                                      │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │ 日付         曜日      朝       昼       夜                  │   │
│  ├─────────────────────────────────────────────────────────────┤   │
│  │ 1/1          水       [ ]      [✓]      [✓]                 │   │
│  │ 1/2          木       [✓]      [✓]      [ ]                 │   │
│  │ 1/3          金       [ ]      [ ]      [✓]                 │   │
│  │ ...                                                          │   │
│  │ 1/31         金       [✓]      [✓]      [✓]                 │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                      │
│  ⚠️ 提出期限: 2025/01/15                                            │
│                                                                      │
│  [提出する]                                                          │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

### 2.2 シフト提出状況（管理者向け）

設定ページ内のシフト設定タブで確認可能。

---

## 3. 処理フロー

```
┌─────────────────────────────────────────────────────────────────────┐
│                        シフト提出フロー                              │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  【管理者】                                                          │
│    │                                                                 │
│    ▼                                                                 │
│  ┌─────────────────────────────────────────────────────────┐        │
│  │ 1. シフト提出期間を設定                                   │        │
│  │    - 対象月                                               │        │
│  │    - 提出締切日                                           │        │
│  │    → global_settings テーブル更新                         │        │
│  └──────────────────────────┬──────────────────────────────┘        │
│                             │                                        │
│                             ▼                                        │
│  ┌─────────────────────────────────────────────────────────┐        │
│  │ 2. シフト提出依頼 Discord通知                             │        │
│  │    → notify-shift-request-discord                         │        │
│  └──────────────────────────┬──────────────────────────────┘        │
│                             │                                        │
│  【スタッフ】               ▼                                        │
│  ┌─────────────────────────────────────────────────────────┐        │
│  │ 3. シフト提出画面で入力                                   │        │
│  │    - 日付ごとに朝/昼/夜の可否をチェック                   │        │
│  │    - 「提出する」ボタン                                   │        │
│  └──────────────────────────┬──────────────────────────────┘        │
│                             │                                        │
│                             ▼                                        │
│  ┌─────────────────────────────────────────────────────────┐        │
│  │ 4. shift_submissions テーブルに保存                       │        │
│  │    - staff_id, year_month, submitted_data                 │        │
│  │    - is_submitted = true                                  │        │
│  └──────────────────────────┬──────────────────────────────┘        │
│                             │                                        │
│                             ▼                                        │
│  ┌─────────────────────────────────────────────────────────┐        │
│  │ 5. 提出完了 Discord通知（管理者向け）                     │        │
│  │    → notify-shift-submitted-discord                       │        │
│  └─────────────────────────────────────────────────────────┘        │
│                                                                      │
│  【締切前】                                                          │
│  ┌─────────────────────────────────────────────────────────┐        │
│  │ 6. リマインダー Discord通知（未提出者向け）               │        │
│  │    → notify-shift-reminder-discord                        │        │
│  └─────────────────────────────────────────────────────────┘        │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 4. データ構造

### 4.1 shift_submissions テーブル

```typescript
interface ShiftSubmission {
  id: string
  organization_id: string         // マルチテナント識別
  staff_id: string                // 提出者
  year_month: string              // 'YYYY-MM' 形式
  
  // 提出データ（JSON）
  submitted_data: {
    [date: string]: {             // キー: 'YYYY-MM-DD'
      morning: boolean            // 朝（10:00-13:00）
      afternoon: boolean          // 昼（14:00-17:00）
      evening: boolean            // 夜（18:00-21:00）
    }
  }
  
  is_submitted: boolean           // 提出済みフラグ
  
  submitted_at: string            // 提出日時
  created_at: string
  updated_at: string
}
```

### 4.2 global_settings テーブル（シフト関連）

```typescript
// organization_settingsテーブル内
{
  // シフト提出設定
  shift_submission_enabled: boolean      // シフト提出受付中
  shift_target_month: string             // 対象月 'YYYY-MM'
  shift_deadline: string                 // 締切日 'YYYY-MM-DD'
  shift_submission_start_day: number     // 受付開始日（前月の何日から）
}
```

---

## 5. 提出期間の制御

### 5.1 設定による制御

```typescript
interface GlobalSettings {
  shift_submission_enabled: boolean  // 提出受付中か
  shift_target_month: string         // 対象月
  shift_deadline: string             // 締切日
  shift_submission_start_day: number // 開始日
}
```

### 5.2 提出可能条件

```typescript
const canSubmitShift = (targetDate: Date): { allowed: boolean; reason: string } => {
  if (!settings.shift_submission_enabled) {
    return { allowed: false, reason: 'シフト提出は現在受け付けていません' }
  }
  
  const targetMonth = format(targetDate, 'yyyy-MM')
  if (targetMonth !== settings.shift_target_month) {
    return { allowed: false, reason: '対象月ではありません' }
  }
  
  const today = new Date()
  const deadline = new Date(settings.shift_deadline)
  if (today > deadline) {
    return { allowed: false, reason: '締切を過ぎています' }
  }
  
  return { allowed: true, reason: '' }
}
```

---

## 6. Discord通知

### 6.1 シフト提出依頼

**Edge Function**: `notify-shift-request-discord`

**トリガー**: 管理者がシフト提出期間を開始した時

**通知内容**:
```
📅 シフト提出のお願い

対象月: 2025年2月
締切日: 2025/01/20

下記リンクからシフトを提出してください。
[シフト提出画面へ]
```

### 6.2 提出完了通知

**Edge Function**: `notify-shift-submitted-discord`

**トリガー**: スタッフがシフトを提出した時

**通知先**: 管理者

**通知内容**:
```
✅ シフト提出完了

スタッフ: 山田 太郎
対象月: 2025年2月

提出済み: 10/15名
```

### 6.3 リマインダー

**Edge Function**: `notify-shift-reminder-discord`

**トリガー**: 締切前（Cronジョブ）

**通知先**: 未提出スタッフ

**通知内容**:
```
⏰ シフト提出リマインダー

締切日: 2025/01/20（あと3日）

まだシフトが提出されていません。
[シフト提出画面へ]
```

---

## 7. 関連ファイル

### ページ

| ファイル | 役割 |
|---------|------|
| `src/pages/ShiftSubmission/index.tsx` | シフト提出画面 |
| `src/pages/Settings/pages/ShiftSettingsPage.tsx` | シフト設定（管理者） |

### コンポーネント

| ファイル | 役割 |
|---------|------|
| `components/NotificationSettings.tsx` | 通知設定 |
| `utils/tableColumns.tsx` | テーブルカラム定義 |

### フック

| ファイル | 役割 |
|---------|------|
| `hooks/useShiftData.ts` | シフトデータ取得・更新 |
| `hooks/useShiftSubmit.ts` | 提出処理 |
| `hooks/useMonthNavigation.ts` | 月選択 |
| `src/hooks/useGlobalSettings.ts` | 全体設定取得 |

### Edge Functions

| 関数 | 役割 |
|------|------|
| `notify-shift-request-discord` | 提出依頼通知 |
| `notify-shift-submitted-discord` | 提出完了通知 |
| `notify-shift-reminder-discord` | リマインダー通知 |
| `sync-shifts-to-google-sheet` | Google Sheets同期 |

---

## 8. Google Sheets連携

シフトデータはGoogle Sheetsにも同期可能。

### 連携フロー

```
shift_submissions更新
    │
    ▼
Edge Function: sync-shifts-to-google-sheet
    │
    ▼
Google Sheets API
    │
    ▼
スプレッドシート更新
```

### セットアップ

詳細は [google-sheets/](../../setup/google-sheets/) 参照。

---

## 9. 注意点

### 9.1 時間帯の定義

| 時間帯 | 英語 | 時間 |
|--------|------|------|
| 朝 | morning | 10:00-13:00 |
| 昼 | afternoon | 14:00-17:00 |
| 夜 | evening | 18:00-21:00 |

### 9.2 提出データの上書き

同じ月に再提出すると、前回のデータは上書きされる。

### 9.3 締切後の編集

- 締切後はスタッフによる編集不可
- 管理者は設定で締切を延長可能

---

## 10. トラブルシューティング

### シフトが提出できない

1. 提出期間内か確認（`global_settings`）
2. 対象月が正しいか確認
3. 締切を過ぎていないか確認
4. スタッフとして登録されているか確認

### Discord通知が届かない

1. `staff.discord_channel_id` が設定されているか確認
2. Edge Functionログ確認
3. Botの権限確認

### データが保存されない

1. RLSポリシー確認
2. `organization_id` が正しいか確認
3. Supabaseログ確認

---

## 11. 関連ドキュメント

- [notifications/](../notifications/) - 通知機能詳細
- [google-sheets/](../../setup/google-sheets/) - Google Sheets連携
- [features/README.md](../README.md) - 機能概要一覧


