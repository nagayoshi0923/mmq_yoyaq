# useEventOperations.ts 依存マップ（Phase 4-1）

作成: 2026-06-12 ／ 対象: `src/hooks/useEventOperations.ts`（2,422行）
**このドキュメントは分割作業（4-2, 4-3）の設計図。コード変更前の現状記録。**

## 1. 呼び出し元（2箇所 + 透過利用）

| 呼び出し元 | 用途 | 使う範囲 |
|---|---|---|
| `hooks/useScheduleTable.ts` **L60**（useScheduleTable） | スケジュール表本体 | `eventOperations` を丸ごと保持し ScheduleManager へ透過 |
| `hooks/useScheduleTable.ts` **L207**（useScheduleTableModals） | モーダル群だけ使う軽量版 | 同上（fetchSchedule **なし**で呼ぶ点に注意） |
| `pages/DashboardHome.tsx` L100 | スタッフの「自分の予定」 | **サブセットのみ**: モーダル状態 / edit / save / delete / conflict / participant。move・copy・D&D・cancel・publish 系は未使用 |

- `ScheduleManager/index.tsx` は useScheduleTable 経由の間接利用（最大の消費者）
- `PerformanceModal.tsx` はフックを呼ばず、ハンドラを props で受けるだけ（コメント言及のみ）

## 2. 内部構造（行範囲と責務グループ）

### フック外のトップレベル関数（L30-271）
| 行 | 関数 | 純粋? | 内容 |
|---|---|---|---|
| 30 | confirmSendPrivateBookingChangeEmail | ✗(window.confirm) | 貸切変更メール送信の確認 |
| 40 | getEventTimeSlot | ✅純関数 | 開始時刻→morning/afternoon/evening |
| 51 | timeToMinutes | ✅純関数 | "HH:MM"→分 |
| 59 | calcEndTime | ✅純関数 | 開始+所要→終了時刻 |
| 81 | checkTimeOverlap | ✅純関数 | **時間重複判定（最重要ロジック）** |
| 121 | syncRelatedDataOnEventDateChange | ✗(DB) | 日時変更時に予約・貸切候補日を同期 |
| 234 | handleParticipantChange | ✗(DB) | 参加者数の直接更新 |

### フック内（L273-2422）
| 行範囲 | グループ | 含まれるもの |
|---|---|---|
| 273-344 | 入力と状態 | props(events/setEvents/stores/scenarios/fetchSchedule)、org、時間帯設定、**URLパラメータ同期**、モーダル/ダイアログ×6種の state |
| 345-457 | モーダル開閉 | handleAddPerformance（推奨開始時刻の計算込み）/ handleEditPerformance / handleCloseModal / handleDrop |
| 439-457 | 衝突検出 | checkConflict（events state に依存） |
| 458-828 | **移動・コピー** | handleMoveEvent（**247行**・同期処理/GM通知/履歴）/ handleCopyEvent（122行） |
| 829-1533 | **保存** | handleSavePerformance（127行・重複チェック→確認ダイアログ）/ **doSavePerformance（577行・最大の塊**: 新規/編集、貸切連動、GM割当、履歴、メール） |
| 1534-1874 | 削除 | handleDeletePerformance / handleConfirmDelete（188行・予約処理込み）/ deleteEventDirectly（147行） |
| 1875-2093 | 中止・復活 | handleCancelConfirmPerformance / handleConfirmCancel（143行・キャンセルメール）/ handleUncancelPerformance |
| 2094-2294 | トグル＆衝突続行 | handleToggleTentative / handleToggleReservation / handleConfirmPublishToggle / handleConflictContinue（保存とmove双方の続行を担う） |
| 2295-2356 | メモ変換 | handleConvertToMemo |
| 2357-2422 | 公開IF | 状態20個 + ハンドラ19個 + setter6個 |

## 3. 分割設計（4-2 → 4-3 の順）

### 4-2: 純関数の抽出（先行・低リスク）
`src/utils/eventOperationUtils.ts` を新設し、↓を移動 + **vitest でユニットテスト**:
- getEventTimeSlot / timeToMinutes / calcEndTime / **checkTimeOverlap**
- 元ファイルからは import で利用（挙動不変）。vitest はこのコミットで導入

### 4-3: フック分割（1分割=1コミット、後方互換ファサード維持）
```
useEventOperations（ファサード: 公開IFを現状維持で再構成）
 ├─ useEventModalState   … モーダル/ダイアログ state + URL同期 + open/close/drop
 ├─ useEventSave         … handleSave / doSave / conflict続行(保存側)
 ├─ useEventMoveCopy     … move / copy / checkConflict / conflict続行(移動側)
 ├─ useEventDelete       … delete confirm / directly
 ├─ useEventCancel       … cancel / uncancel
 └─ useEventMisc         … toggles(tentative/reservation/publish) / convertToMemo / participant
共有: syncRelatedDataOnEventDateChange は utils か専用モジュールへ
```

## 4. リスクと注意
1. **doSavePerformance（577行）が最難関**。新規/編集/貸切連動が絡む。4-3 では「まず移動だけ・ロジック不変」を厳守し、内部分解はさらに後続コミットへ
2. **conflict フローが保存と移動コピーにまたがる**（pendingPerformanceData / handleConflictContinue）。分割時は conflict 状態を共有 state として設計
3. **URLパラメータ同期**（モーダル状態をURLに保持）が open/close と密結合
4. 削除・中止はメール送信や予約処理を含む＝**実環境での動作確認必須**（各コミット後にスケジュール画面で確認）
5. useScheduleTableModals は fetchSchedule なしで呼ぶ → ファサードの引数互換を崩さない
6. ScheduleEvent 型の二重定義統合（Phase 2 の宿題）はこの分割が終わってから別コミットで
