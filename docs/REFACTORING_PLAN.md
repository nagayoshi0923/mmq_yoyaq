# 段階的リファクタリング計画

作成日: 2026-06-11 / ブランチ: staging

## 背景と目的

- 開発中に「意図しない変更」が頻発している。原因は (1) 旧バージョンのコードが消されず併存し、どれが本番か分かりにくい、(2) 2,000〜3,000行級の巨大ファイルに複数の責務が同居し、変更の影響範囲が見えない、こと。
- 本計画は「**理解 → 削除 → 整理 → 分割**」の順で、低リスクな作業から段階的に複雑さを減らす。

## 共通原則（全フェーズ）

1. **1作業 = 1コミット**。各コミットは単体で revert 可能な粒度に保つ。
2. **挙動を変えるコミットと変えないコミットを混ぜない**。リファクタ中に見つけたバグは別コミット。
3. 各コミットの検証: `npx tsc --noEmit` (EXIT=0) → `npm run lint` → 必要に応じ `npm run build`。
4. フェーズ区切りごとにステージング環境で動作確認 → main マージ。
5. **削除は import 追跡で「参照ゼロ」を証明してから**:
   - `grep -rn "from '@/path/to/module'"` で直接 import を確認
   - バレル (index.ts) 経由の re-export を確認
   - knip / ts-prune の検出結果と突き合わせ
   - 削除後 `tsc --noEmit` で EXIT=0 を確認

---

## Phase 0: 安全網の整備

リスク: 極小 / 規模: 小（1〜3コミット）

- [x] 0-1 ベースライン確認（tsc / lint / build がグリーンであること）※tsc 確認済み
- [x] 0-2 未使用コード検出ツール導入（knip 6.16.1）、ベースライン出力
      （未使用ファイル69件・未使用依存8件 → `docs/refactoring/knip-baseline-2026-06-11.txt`。
      ※ lazy() 動的 import の誤検出があり得るため、削除時は必ず個別に手動 import 追跡で裏取りする）
- [x] 0-3 削除前チェック手順の明文化（本ドキュメント）

## Phase 1: 死にコードの全面削除

リスク: 低 / 規模: 中（5〜8コミット、推定 -4,000〜6,000行）

- [x] 1-1 シナリオ編集 V0/V1 + `pages/ScenarioEdit/` 削除（**完了**: ec3c219a, -5,490行）
- [x] 1-2 旧シナリオ管理UI削除: `ENABLE_LEGACY_SCENARIO_UI=false` 系統（**完了**）
      （`tableColumns.tsx` / `ScenarioTableRow.tsx` / `ScenarioTableHeader.tsx` / `useScenarioData.ts` /
      `ScenarioStats.tsx` / `ScenarioFilters.tsx` / `scenarioFormatters.ts` ＋ `index.tsx` の分岐除去 722→280行。
      ※ `useScenarioFilters` フックは編集ダイアログの前後ナビゲーション用に存続）
- [x] 1-3 重複クエリフックの監査（**完了**）
      `useScenariosQuery` は現役（編集ダイアログ・useScheduleData・AuthorReport が使用）のため存続、
      誤誘導の @deprecated コメントを除去。未使用の `useAllScenarioStatsQuery` /
      `useScenariosInfiniteQuery` と孤児化した `scenarioApi.getPaginated` / `getAllScenarioStats`、
      未使用 queryKey (paginated/detail/stats) を削除。
      ※ バックエンド `api/scenarios.ts` の `type=paginated` / `type=all-stats` ハンドラは
      フロント参照が消え到達不能になったが、API面のため削除は別途判断（候補としてメモ）
- [x] 1-4 knip 検出分の削除（**完了**: 共有層25 + ページ層41 = 66ファイル、約 -12,400行）
      検証: knip + ベース名grep + ルーティング(parsePath)突き合わせ + tsc/build。
      特記: `lib/api/index.ts` は `@/lib/api` がファイル優先で `lib/api.ts` に解決されるため死んでいた
      （api.ts のコメントは死んでいる側を推奨していた）。AuthorReport ページ一式は未ルートで全滅。
      knip 再実行で未使用ファイル 0件。
      ※ 既存 lint error 3件（PerformanceModal の直接delete / StaffProfile の冗長Boolean×2）は
      今回のスコープ外として残置 — 別作業で修正すること
- [x] 1-5 `ScenarioEditModal/types.ts`・`utils/constants.ts` を `ScenarioEditDialogV2/` 配下へ移住（**完了**）
      旧 ScenarioEditModal ディレクトリは完全消滅。未使用の ScenarioEditModalProps も削除。

## Phase 2: 型と定数の整理

リスク: 低 / 規模: 小〜中（3〜5コミット）

- [x] 2-1 `types/index.ts`（1,082行）をドメイン分割（**完了**: 15ドメインファイル + 21行のバレル）
      organization / license / store / staff / scenario / scheduleEvent / user / sales /
      customer / reservation / kit / coupon / privateGroup / survey / blog。
      既存 import は無変更で動作（バレル re-export 方式）。
      ⚠️ 発見: `ScheduleEvent` が二重定義（旧index由来の簡易版 → scheduleEvent.ts /
      既存 types/schedule.ts の詳細版）。同名別定義の統合は Phase 4 で扱う。
- [x] 2-2 依存メモ（**完了**）: 最大の発見は `ScheduleEvent` の二重定義（2-1参照、Phase 4で統合）。
      その他のドメイン間参照（coupon→reservation / kit→scenario,store / license→organization,scenario,staff /
      reservation→customer,scheduleEvent / survey→privateGroup）は自然な依存で問題なし
- [x] 2-3 定数整理（**完了**）: V1遺物の未使用定数（genreOptions / TIME_SLOTS / GM_ROLES /
      DEMO_RESERVATION_SOURCES）と AppRoot の迷い再export を削除。
      shadcn系UIプリミティブの未使用exportは標準ライブラリ面として残置

## Phase 3: 散在する状態管理の統一

リスク: 中 / 規模: 中（4〜6コミット）

- [x] 3-1 全キーの棚卸し（**完了**: `docs/STATE_MANAGEMENT.md` に一覧化）
- [x] 3-2 集約方針（**完了・計画変更**）: 調査の結果、既存5フック
      （useLocalState / useSessionState / useUserPreference / usePageState / useTablePreferences）は
      役割分担が妥当で、新たな統一フックを作るより使い分けの文書化が低リスク・高効果と判断。
      `docs/STATE_MANAGEMENT.md` に「どの状態をどこに保存するか」のガイドを整備。
      生キー直書き（認証フロー・チャンクリロード等の特殊用途）は現状維持、
      スケジュール画面の表示状態キー群のみ Phase 4 でフック化を検討
- [x] 3-3 スクロール復元の統一（**完了**）: 唯一の手書き残骸だった ScenarioManagement の
      独自実装（55行・標準Providerと二重動作）を useReportRouteScrollRestoration 1行に置換

## Phase 4: 巨大フックの分割 ★最重要・最も慎重に

リスク: 高（スケジュール管理は業務の中核） / 規模: 大（8〜12コミット）

- [x] 4-1 依存マップ作成（**完了**: `docs/refactoring/useEventOperations-map.md`）
      呼び出し元は useScheduleTable（2箇所）と DashboardHome（サブセット利用）のみ。
      最難関は doSavePerformance（577行）と、保存/移動にまたがる conflict フロー
- [x] 4-2 純関数の抽出（**完了**）: getEventTimeSlot / timeToMinutes / calcEndTime /
      checkTimeOverlap（時間重複判定）を `utils/eventOperationUtils.ts` へ移動。
      vitest を導入し16ケースのユニットテストを整備（`npm run test:unit`）。挙動不変
- [ ] 4-3 操作系統ごとにフック分割: `useAddEvent` / `useEditEvent` / `useCancelRestoreEvent` / `useMoveCopyEvent`
      （1分割=1コミット。旧フックは re-export で互換維持 → 最後に削除）
      進行中: `useEventDelete` / `useEventCancel` / `useEventMisc` /
      `useEventModalState`（公開・仮状態・予約受付・メモ変換・参加者数即時反映・
      公演モーダル状態・URL復元・ドラッグ開始）/ `useEventMoveCopy`（移動・複製・
      移動複製先の重複判定 checkConflict）まで分離済み。移動/複製と保存が共有する
      `confirmSendPrivateBookingChangeEmail` / `syncRelatedDataOnEventDateChange` は
      `eventSyncHelpers.ts` へ切り出し。useEventOperations 本体は 1473→1002 行。
      残るは最大リスクの `doSavePerformance`（保存本体・重複チェックフロー）のみ。挙動不変。
- [ ] 4-4 `useScheduleData`(683行) と `useScheduleEventsQuery`(357行) の役割重複を調査
      （実測済み。当初調査の「26.6K行」はKB誤読と確定）
- [ ] 4-5 `usePrivateGroup`（958行）を create / invite / chat の3系統に分離
- [ ] 4-6 `AuthContext`（1,120行）の内部分割（セッション / リフレッシュ / マルチタブ同期。公開IFは不変）

※ このフェーズは各コミット後にステージングでスケジュール画面の動作確認を必ず挟む。
※ 並行中の org_scope API 化（セキュリティ案件）と同一ファイルを触る場合、コミットを分離する。

**Phase 4 完了後のフォローアップ（機能改善・2026-06-12 オーナー承認済み。忘れないこと）**
- [x] F-1 削除フローの統合（**完了** 2026-06-13）: 有効予約のある公演の削除時、
      「①予約キャンセル確認（件数＋予約者一覧）→ ②メール送信確認（理由編集＋送信
      チェックボックス）→ 全予約一括キャンセル（記録保持）→ 公演削除＋履歴」の
      統合フロー。右クリック削除・公演編集モーダルの「この予定を削除」の両方が通る。
      メール送信は reservationApi.cancel（サーバー側一括オーケストレーション）。
      UI は専用2ステップモーダル DeleteEventCancelDialog（①キャンセル確認＝件数＋
      予約者一覧 → ②メール送信確認＝理由編集＋送信選択＋実行まとめ。予約一覧の
      「予約をキャンセル」と作法を統一。一度1画面に統合したが予約数件で縦に
      苦しいため2ステップに確定）。有効予約ありの場合は通常の削除確定モーダルを出さず F-1 が確定を
      兼ねる（確定モーダルが先に出る順序は不自然、というオーナー指摘を反映）。
      **中止フローも同型に統一（2026-06-13）**: 有効予約ありの中止は同じダイアログ
      （variant:'cancel'）を通り、メール送信が選択制に（従来は必ず送信・件数も
      見えなかった）。予約ゼロの中止は確認なしで即実行（復活できる操作のため）。対象予約も in('confirmed','pending') → neq('cancelled') に
      揃え、gm_confirmed の漏れを解消。成功トーストも追加
- [ ] F-2 公演作成直後の⚠️誤表示: 楽観表示（保存前の仮カード）にシナリオ情報(scenarios)が
      添付されないケースがあり、リロードまで「シナリオマスタ未登録」警告が出る。
      doSavePerformance の optimisticEvent 構築を修正（リロードで消えることは確認済み）。
- [x] F-3 貸切削除ロジック重複の統合（**完了** 2026-06-12: deletePrivateBookingEventCore に一本化。
      同時に仕様変更: 貸切削除時に申込を物理削除→「キャンセル状態で保持」に変更（顧客台帳の保全・オーナー指示）。
      履歴スナップショットを削除前に取得する順序に修正し、削除履歴が残らないバグも解消）

## Phase 5: 巨大モーダルの解体

リスク: 中〜高 / 規模: 大（モーダル1つ=2〜4コミット）

分割の基本手順: ファイル内でセクション関数に切る → 子ファイルへ移動 → ロジックをフックへ（常に動く状態を維持）

- [ ] 5-1 `KitManagementDialog`（3,124行）: 状態→`useKitAssignment`、テーブル→子コンポーネント
- [ ] 5-2 `ImportScheduleModal`（2,013行）: パース/検証を純関数化（テスト対象）、プレビューUI分離
- [ ] 5-3 `ReservationList`（2,219行）: フィルタ→フック、エクスポート→util、テーブル→子
- [ ] 5-4 `PerformanceModal`（1,930行）: フォーム状態→フック、時間枠選択→子コンポーネント
- [ ] 5-5 `SendReports`（2,292行）: 送信ロジック→フック、テーブル分離

## Phase 6: 巨大ページの解体

リスク: 中 / 規模: 大

- [ ] 6-1 `PrivateGroupInvite/index.tsx`（3,468行・最大）: フォーム / メール送信 / バリデーション / 確認UI を分離
- [ ] 6-2 `ScheduleManager/index.tsx`（2,056行）: カレンダー描画 / D&D / 右クリックメニュー / ツールバー分離
- [ ] 6-3 `MyPage/index.tsx`（1,749行）: タブごとにコンポーネント分離
- [ ] 6-4 `CompleteProfile.tsx`（1,173行）: 構造のみ整理（既知の誤遷移バグ修正とは**混ぜない**）

## Phase 7: ルーティングと全体仕上げ

リスク: 中 / 規模: 小〜中

- [ ] 7-1 `AdminDashboard.tsx`（980行）: `parsePath()` の手書きディスパッチを宣言的ルート定義へ抽出
- [ ] 7-2 最終 knip 実行（分割で生まれた未使用 export の一掃）
- [ ] 7-3 ビフォーアフター計測の記録

---

## 進行順とリスク

```
Phase 0 (安全網)      小   リスク極小
Phase 1 (死にコード)   中   リスク小
Phase 2 (型整理)      小   リスク小
─── ここまでで「全体理解」と「見通し」が確保される。まずここを一区切りに ───
Phase 3 (状態統一)     中   リスク中
Phase 4 (巨大フック)   大   リスク高 ★
Phase 5 (モーダル)     大   リスク中高
Phase 6 (ページ)      大   リスク中
Phase 7 (仕上げ)      小   リスク中
```

## 成功指標

| 指標 | 開始時 | 目標 |
|---|---|---|
| 800行超のファイル数 | 約30 | 5以下 |
| 最大ファイル行数 | 3,468 | 1,000以下 |
| 旧バージョン併存（死にUI） | 複数 | ゼロ |
| 純関数ロジックのテスト | なし | 重複判定・CSV検証等のコアにあり |
| UI状態の保存場所 | 散在 | 1フック/Contextに集約 |

## 進捗ログ

| 日付 | コミット | 内容 |
|---|---|---|
| 2026-06-11 | ec3c219a | 1-1: シナリオ編集 V0/V1 + pages/ScenarioEdit 削除（-5,490行） |
| 2026-06-11 | a33b7561 | 0-2: knip 導入＋未使用コードベースライン記録 |
| 2026-06-11 | b5f69fc8 | 1-2: 旧シナリオ管理UI削除（-1,814行、index.tsx 722→280行） |
| 2026-06-11 | 64f2898d | 1-3: 未使用クエリフック・孤児APIメソッド削除（-92行） |
| 2026-06-11 | 16895ad3 | 1-4a: 共有層の未使用ファイル25点削除 |
| 2026-06-11 | 6089844e | 1-4b: ページ層の未使用ファイル41点削除（-10,382行） |
