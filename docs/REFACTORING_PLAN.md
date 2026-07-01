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
- [x] 4-3 操作系統ごとにフック分割（**完了** 2026-06-13）。
      `useEventDelete` / `useEventCancel` / `useEventMisc` /
      `useEventModalState`（公開・仮状態・予約受付・メモ変換・参加者数即時反映・
      公演モーダル状態・URL復元・ドラッグ開始）/ `useEventMoveCopy`（移動・複製・
      移動複製先の重複判定 checkConflict）/ `useEventSave`（保存本体 doSavePerformance・
      タイムスロット＋実時間の重複チェック・重複警告ダイアログ state・続行処理）に分離。
      移動/複製と保存が共有する `confirmSendPrivateBookingChangeEmail` /
      `syncRelatedDataOnEventDateChange` は `eventSyncHelpers.ts` へ切り出し。
      **useEventOperations 本体は 1589→201 行**（サブフックを合成するファサードのみ。公開IF不変）。
      全コミットで eslint / typecheck / build:fast / unit test を確認。挙動不変。
- [x] 4-4 `useScheduleData` と `useScheduleEventsQuery` の役割重複を調査（**完了** 2026-06-14）。
      結論: **重複なし**。`useScheduleEventsQuery`=events の React Query フェッチ層
      （fetch+整形+キャッシュ helper）、`useScheduleData`=それを委譲利用し stores/scenarios/staff・
      ±3/±6 プリフェッチ・Realtime購読・setEvents/fetchSchedule を束ねるオーケストレーション層、
      という綺麗な階層構成。当初の「役割重複」仮説は不成立。
      副産物: `useScheduleData` に同居していた未使用関数
      `addDemoParticipantsToPastUnderfullEvents`（約235行・参照ゼロ・実体は独立スクリプト
      scripts/add-demo-participants-now.cjs）を削除（knip 確認済み）。682→444 行。
- [x] 4-5 `usePrivateGroup` をファイル分割（**完了** 2026-06-23 / 案A: ファイル分割）。
      ※ 当初記載「958行を create/invite/**chat** の3系統に」は実態と乖離していた。実ファイルは942行で
      既に3つの export 済みフック（`usePrivateGroup` 主操作群 / `usePrivateGroupData` ID取得+Realtime /
      `usePrivateGroupByInviteCode` 招待コード取得+Realtime）＋モジュールヘルパで構成され、**chat は本ファイルに無い**
      （chat は `GroupChat.tsx`/`PrivateGroupManage` 側）。これが「分割軸が実態と不一致」の正体。
      対応: フック境界そのままに4ファイルへ verbatim 分離。
      `usePrivateGroup.ts`(942→**561**) / `usePrivateGroupData.ts`(98) / `usePrivateGroupByInviteCode.ts`(136) /
      共有ヘルパ `privateGroupHelpers.ts`(163: getSystemMessageSettings/sendSystemMessage/enrichMembersWithNames/enrichGroupWithViewData)。
      import 元2箇所（PrivateGroupManage / PrivateGroupInvite）を新パスへ更新。挙動不変。
      検証: tsc=0 / eslint=0 / build:fast / test:unit 23 passed。
      ※ 残: 主 `usePrivateGroup()`（操作系統 creation/query/membership で更に分割可＝案B）は別タスク候補
- [x] 4-6 `AuthContext`（1,120行）の内部分割（セッション / リフレッシュ / マルチタブ同期。公開IFは不変）
      **コード完了（2026-06-23・6/6 サブステップ完了、AuthContext 1,120→134行・挙動不変）**。
      ※第6歩は staging push 済み・オーナーの実機検証（login/logout/リロード維持/タブ復帰/マルチタブ同期）待ち。
      各歩は「旧本体と byte 一致(空白除去diff=0)」＋ tsc=0 / eslint=0 / build:fast / test:unit 23 passed で担保。
      `src/contexts/auth/` 配下へ抽出。共有 state/ref は呼び出し側で生成し deps 注入（クロージャ捕捉タイミングを旧実装と一致させて挙動不変）。
      - [x] 第1歩 純ヘルパー → `authContextHelpers.ts`（lookupStaffRole/getSignOutRedirectPath/getClientIpAddress/logAuthEvent/定数）`fde32a11`（1,120→981）
      - [x] 第2歩 ロール解決 `setUserFromSession`(380行) → `resolveUserFromSession.ts`（deps: isProcessingRef/userRef/staffCache/setStaffCache/setUser）`350f724d`（981→603）
      - [x] 第3歩 リフレッシュ `refreshSession` → `useSessionRefresh.ts`（lastRefreshRef 内包、安定 useCallback）`9b2f0668`（603→544）
      - [x] 第4歩 アクション `signIn/signOut` → `authActions.ts`（createAuthActions ファクトリ）`ce507e23`（544→449）
      - [x] 第5歩 セッション `getInitialSession/tryRecoverSession` → `sessionBootstrap.ts`（createSessionBootstrap ファクトリ、deps: resolveDeps/setLoading/setIsInitialized）`dc09dfe6`（449→**356**）
      - [x] 第6歩（最難関）マウント `useEffect`（~230行）→ `useAuthLifecycle.ts`（`useAuthLifecycle` フック、deps: loading/resolveDeps/getInitialSession/tryRecoverSession/refreshSession/全 ref/各 setter）`f7d8b5c9`（356→**134**）。
            `onAuthStateChange` 購読／visibilitychange・focus／10分 interval／`BroadcastChannel`（マルチタブ同期）／SIGNED_OUT→`tryRecoverSession` リカバリーを内包し、AuthProvider は「状態＋合成」ファサードに。
            effect 本体は旧実装と byte 一致（空白除去 diff=0）、依存配列 `[refreshSession]`（マウント時1回）と cleanup（unsubscribe/removeEventListener/clearInterval/channel.close）を維持。tsc=0 / eslint=0 errors / build:fast / test:unit 23 passed。
            ※ **残: オーナーが staging で login/logout/リロード維持/タブ復帰/マルチタブ同期を実機検証 → OK なら main マージで 4-6 クローズ。**

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
- [x] F-2 公演作成直後の⚠️誤表示（**完了** 2026-06-25 / f3b06dc9）: 楽観表示カードと保存直後カードの
      シナリオ照合がタイトル厳密一致のみで、リロード時の寛容な照合（useScheduleEventsQuery の findScenario）
      と差があり、登録済みシナリオでもリロードまで「シナリオマスタ未登録」⚠️ が誤表示されていた。
      モーダルが渡す scenario_master_id（=組織シナリオ id）を id フォールバックに使う共通照合
      `findDisplayScenario` を useEventSave に追加し、添付タイトルを入力値に揃えて PerformanceCard の
      title 一致判定（event.scenario === scenarios.title）を満たすよう修正。表示のみで永続化（DB保存）は不変。
- [x] F-3 貸切削除ロジック重複の統合（**完了** 2026-06-12: deletePrivateBookingEventCore に一本化。
      同時に仕様変更: 貸切削除時に申込を物理削除→「キャンセル状態で保持」に変更（顧客台帳の保全・オーナー指示）。
      履歴スナップショットを削除前に取得する順序に修正し、削除履歴が残らないバグも解消）
- [x] F-4 手動貸切公演の変更通知メール（**対応不要・クローズ** 2026-06-25）:
      オーナー判断 ——「手動作成の貸切公演は、以前は別予約サイトを使っていた頃の名残であり、
      変更通知メールは不要」。新機能としての宛先持たせ（①手入力 ②顧客紐づけ ③予約紐づけ）は
      いずれも実装しない。Web貸切（顧客紐づき・確定済み）の変更通知は従来どおり動作するため影響なし。
      （以下は切り分け当時のメモ・参考）
      （**要件未確定**・2026-06-13 切り分け）:
      手動作成の貸切公演（schedule_events.category='private' かつ reservation_id NULL）には
      通知先メールが存在しない。staging 実測: private 公演143件中 reservation_id 有りは3件のみ
      （全て cancelled）、reservation_id NULL の140件で「メール有り予約」に紐づくものはゼロ。
      変更通知メール sendPrivateBookingCustomerChangeEmail は reservations.customer_email 宛のため、
      送るにはまず「誰の・どのアドレスに送るか」を持たせる必要がある。候補: ①モーダルに顧客メール欄を
      追加（手入力）②顧客マスタから顧客を紐づけ ③予約タブのメール有り予約へ送信。
      Edge Function send-booking-change-confirmation も reservationId 前提なので、宛先の持たせ方次第で
      送信経路の追加が要る。リファクタ／既存バグとは別件の新機能。**要件を詰めてから着手**。
      （元の発見: 「貸切公演を編集して日時変更してもメール確認が出ない」→ 退行ではなく、
      手動貸切に通知先が無いだけ。Web貸切で顧客紐づき・確定済みなら従来どおり出る）

## Phase 5: 巨大モーダルの解体

リスク: 中〜高 / 規模: 大（モーダル1つ=2〜4コミット）

分割の基本手順: ファイル内でセクション関数に切る → 子ファイルへ移動 → ロジックをフックへ（常に動く状態を維持）

- [ ] 5-1 `KitManagementDialog`（3,124行）: 状態→フック、テーブル→子コンポーネント
      **進行中（2026-06-23・6歩構成、各歩 staging push＋挙動不変）**。`components/kitManagement/` 配下へ抽出。
      JSXタブは props 注入で子化（Tabs コンテキストは親 `<Tabs>` から伝播）。各歩は「旧本体と byte 一致（空白除去diff=0）」＋ tsc=0 / eslint=0 errors / build:fast / test:unit 23 passed で担保。
      - [x] 第1歩 型・定数・純ヘルパー（DraggedKit/ContextMenuState/Props・WEEKDAYS・formatCompletionDate）→ `kitManagement/types.ts` ＋ `helpers.ts` `765f47c2`（3,124→3,087）
      - [x] 第2歩 「現在の配置」タブ → `kitManagement/tabs/CurrentPlacementTab.tsx`（props: scenarioSearch/scenariosWithKits/scenariosWithoutKits/kitLocations/stores/storeMap/handle{ChangeKitCount,SetKitLocation,UpdateCondition}）`c618952d`（3,087→**2,876**）
      - [x] 第3歩 「店舗別在庫」タブ → `kitManagement/tabs/StoreInventoryTab.tsx`（props: stores/storeInventory/dragOverStoreId/draggedKit/handle{DragOver,DragLeave,Drop,ToggleKitFixed,DragStart,DragEnd,ContextMenu}）`a4b77631`（2,876→**2,786**）
      - [x] 第4歩 「週間需要」タブ → `kitManagement/tabs/WeeklyDemandTab.tsx`（props: kitShortages/storeMap/scenarioMap/demandDates/scheduleEvents/kitLocations/stores/isSameStoreGroup/formatDate）`216b3285`（2,786→**2,670**）
      - [x] 第5歩 「移動計画(transfers)」タブ → `kitManagement/tabs/TransferPlanTab.tsx`（~880行・props 25個注入で移動のみ）`f1724b9d`（2,670→**1,822**）。内部の日付計算/グルーピング/小コンポーネント分割は後続コミットで実施（未）
      - 第6歩〜 ロジックを `useKitManagementData` / selectors(派生) / handlers フックへ分割（一括 useKitAssignment にせず分ける）。ContextMenu / deliveryConfirm / help dialog はタブ横断UI状態のため当面は親に残し必要 props のみ渡す
        - [x] 第6a歩 **データ層** → `kitManagement/useKitManagementData.ts`（2026-06-25・1,904→**1,730**）。
          サーバーデータ state（kitLocations/transferEvents/stores/storeTravelTimes/scenarios/scheduleEvents/
          completions/currentStaffId/currentStaffName/loading）＋ `fetchData` ＋ 初回取得 effect ＋
          完了状態の Realtime 購読 effect を移管。fetchData が書き戻す設定 state
          （selectedOffsets/transferStartStoreIds）は親所有のまま setter/ref を deps 注入
          （AuthContext と同じ方式・クロージャ捕捉タイミング一致で挙動不変）。移動した fetchData/effects は逐語コピー。
          副産物: 親の死んだ import（getCurrentStaff / storeApi / scheduleApi / Store / StoreTravelTime）を除去。
          検証: tsc=0 / eslint=0 / build:fast / test:unit 54 passed。**要 staging 実機確認（キット管理ダイアログ）**。
        - [x] 第6b歩 **selectors** → `kitManagement/useKitManagementSelectors.ts`（2026-06-25・1,730→**1,211**）。
          派生 useMemo/useCallback 全28個（demandDates/scenarioMap/storeMap/storeGroup系/storeInventory/
          kitShortages/groupedTransferEvents/completion lookups(isPickedUp/isDelivered/getCompletion等)/
          mergedSuggestions/新ロジック plan系(planToday/kitStateForPlan/plannerDemands/fixedKitKeys/newPlan/overdueTransfers)）を
          逐語抽出（**553行 byte 完全一致 diff=0** を確認）。入力11個（データ6＋storeTravelTimes＋suggestions/transferDates/weekDates/scenarioSearch）を
          注入、出力は全派生値を返し親は使用19個のみ destructure。内部相互参照はフック内で解決。
          親の死んだ import（planKitTransfers/findOverdueTransfers/PlannerDemand/OverdueTransfer/toJstYmd/KitTransferEvent/KitTransferCompletion/Scenario）も除去。
          検証: tsc=0 / eslint=0 / build:fast / test:unit 54 passed。**要 staging 実機確認**。
        - [x] 第6c歩 **handlers** → `kitManagement/useKitManagementHandlers.ts`（2026-06-25・1,211→**731**）。
          全ハンドラ（回収/設置トグル＋executeDeliveryToggle/週移動/移動計算 handleCalculateTransfers＋自動計算 effect/
          キット数・状態・固定/別店舗移動/D&D/右クリック）を逐語抽出（**519行 byte 完全一致 diff=0**）。
          入力29個を注入、出力17ハンドラを返す（handleCalculateTransfers は自動計算 effect 専用のため内部留保・非公開）。
          内部相互参照（handleDrop→handleMoveKit / toggle・confirm→executeDeliveryToggle）はフック内で解決。
          付随: `deliveryConfirm` のインライン型を `types.ts` の `DeliveryConfirmState` に集約（親子で型一致）。
          親の死んだ import（kitApi/scenarioApi/showToast/calculateKitTransfers/KitState/KitLocation）も除去。
          handleCalculateTransfers の deps に注入 setter（setIsCalculating/setSuggestions）を明記し exhaustive-deps を充足（挙動不変）。
          検証: tsc=0 / eslint=0 warnings / build:fast / test:unit 54 passed。**要 staging 実機確認**。
      **→ Phase 5-1 完了（3,124→731 行。types/helpers＋4タブ＋data/selectors/handlers フックへ分解。
        ContextMenu/deliveryConfirm/help dialog のタブ横断 UI 状態と JSX シェルのみ親に残置）。要 staging 実機確認後に 5-1 クローズ。**
- [ ] 5-2 `ImportScheduleModal`（2,013行）: パース/検証を純関数化（テスト対象）、プレビューUI分離
      - [x] 5-2a 純パース関数を `importSchedule/parsers.ts` へ抽出＋vitest（2026-06-25・2,013→**1,919**）。
        `parseTsvLines` / `parseTsvCells` / `isQuote`（TSVパース）・`parseTimeFromTitle`（タイトルから時刻）・
        `parseDate`（M/D→YYYY-MM-DD）を逐語抽出。`parseDate` は year フォールバック（currentDisplayDate）を
        呼び出し側が常に displayYear を渡しているため year 必須の純関数に（挙動同一）。13ケースのユニットテスト整備。
        検証: tsc=0 / eslint=0 errors（既存の scenarioMatchCache 警告のみ・スコープ外）/ build:fast / test:unit 68 passed。
      - [x] 5-2b 曖昧マッチャを純関数化＋テスト（2026-06-25・1,919→**1,758**）。
        `findBestStaffMatch`(93行)/`findBestScenarioMatch`(74行) のアルゴリズムを `importSchedule/matchers.ts` の
        純関数 `matchStaffName(input, staffList, mapping)` / `matchScenarioName(input, scenarioList, aliasMap)` へ抽出
        （メモ化キャッシュはコンポーネント側のラッパに残し挙動同一）。重複していたコンポーネント内
        `toKatakana`/`toHiragana` を削除し kanaUtils の `hiraganaToKatakana`/`katakanaToHiragana` に集約（実装一致確認済み）。
        死変数 `seasonalMatch` も除去。14ケースのユニットテスト整備。
        検証: tsc=0 / eslint=0 errors（既存 scenarioMatchCache 警告のみ）/ build:fast / test:unit 82 passed。
      - [~] 5-2c `handlePreview` の純パース部分を抽出＋テスト（2026-06-25・1,758→**1,704**）。
        当初構想の単一 `buildPreview` は、handlePreview が「既存イベントの supabase フェッチ＋state setter＋
        UIスレッド譲り(setTimeout)」をパースループに織り込んでおり**純関数として安全に切り出せない**ため、
        クリーンに純粋な部分のみ先行抽出: `mergeWrappedLines`（セル内改行の行結合）/ `detectTargetMonth`
        （対象年月判定）を `parsers.ts` へ逐語抽出＋7ケースのテスト。残る非同期パースループ本体の純化は
        後続（要 async 再構成＋実機確認）。検証: tsc=0 / eslint=0 errors / build:fast / test:unit 89 passed。
        **※ import パスに手を入れたため実機スモーク対象**。
      - [x] 5-2d プレビュー表示UIを子コンポーネントへ分離（2026-07-01・1,704→**1,406**・`d0f336d5`・**要 staging 実機確認**）。
        プレビューフェーズ JSX（border div）を `importSchedule/ImportPreview.tsx` へ sed 逐語抽出（byte一致 空白除去diff=0）。
        `PreviewEvent` を `importSchedule/types.ts` に移し親子共有、プレビュー専用 CATEGORY_OPTIONS/GM_ROLE_OPTIONS は子へ。
        親は props 9個注入のみ＋死 import（Alert/Select系/SearchableSelect/MultiSelect）除去。
        検証: tsc=0 / eslint=0 errors / build:fast / test:unit 130 passed。**残: 5-2c 非同期パースループの純化**。
- [~] 5-3 `ReservationList`（2,263行）: データ層→フック、ハンドラ→フック、テーブル/ダイアログ→子
      ※当初想定の「フィルタ/エクスポート」は実体無し（CSV エクスポート・フィルタUIは存在しない）。純ロジックは薄く、
        主戦場は データ取得+realtime / status・cancel・add ハンドラ / テーブル・各ダイアログ の分割（要スモーク）。
      - [x] 5-3a 参加者集計を純関数化＋テスト（2026-06-26・2,263→**2,259**）。
        `sumActiveParticipants`（有効ステータスのみ participant_count 合算・3箇所使用）を
        `reservationList/participants.ts` へ逐語抽出＋4ケースのテスト。検証: tsc=0 / eslint=0 / build:fast / test:unit 130。**実機テスト不要**。
      - [x] 5-3b データ層を `useReservationListData` フックへ分離（2026-06-26・2,259→**2,070**・**要 staging 実機確認**）。
        サーバーデータ state（reservations/loadingReservations/customerNames）＋ realtime トリガー（realtimeRefreshKey/
        debounceRef はフック内に閉じる）＋ 3 effect（loadReservations＋realtime購読＋顧客名取得）を移管。
        入力は event/mode/onParticipantChange/onLocalParticipantUpdate、ハンドラの楽観更新用に setReservations を公開。
        **3 effect は git 比較で完全一致（空白除く）**。死 import 一掃（useRef/RESERVATION_WITH_CUSTOMER_SELECT_FIELDS＋
        変更前から死んでいた Tabs 一式）。検証: tsc=0 / eslint=0 / build:fast / test:unit 130。
        **実機確認**: 公演モーダル→予約リストの 一覧表示/参加者数同期/realtime更新（別タブで予約変更→自動反映）。
        ※実機スモークで別件の realtime バグ（募集停止が他タブ反映されない＝schedule_blocked_slots 未購読）を発見・別コミットで修正済（本番反映済）。
      - [x] 5-3c ダイアログ4つを子コンポーネント化（`reservationList/dialogs/`・**要 staging 実機スモーク**）。2,070→**1,877**。
        - [x] CancelReservationDialog（予約キャンセル確認）/ DeleteEventDialog（貸切公演削除確認）。
          Delete のインライン削除処理は親 `handleConfirmDeleteEvent` へ持ち上げ。
        - [x] EmailConfirmDialog（キャンセルメール送信確認）。emailContent の型＋初期値を
          `reservationList/cancellationEmailState.ts` へ切出し（fast-refresh 警告回避）、リセットは親 `closeEmailConfirm` へ。
        - [x] SendEmailDialog（一括メール送信）。インライン90行の送信処理を親 `handleSendBulkEmail` へ持ち上げ。
          全4ダイアログ抽出で死 import（Dialog 一式）を除去。検証: tsc=0 / eslint=0 / build:fast / test:unit 130。
        **実機スモーク（公演モーダル→予約リスト）**: ①予約キャンセル→メール確認→確定 ②貸切で全員キャンセル→公演削除確認
        ③メール送信（複数選択→件名/本文→送信）④メール送信確認のテンプレ編集。
      - [~] 5-3d 参加者リスト本体を子コンポーネント化（**要 staging 実機スモーク**）。
        - [x] AddParticipantSection（「+参加者追加/+デモ追加」＋追加フォーム）（1,877→**1,683**）。
          209行の JSX を Python で逐語移送（デモ追加98行のインライン INSERT 処理含む・git 比較で外側 `{}` 以外 diff=0）、
          クロージャ参照は同名 props 注入。newParticipant 型は `reservationList/newParticipant.ts` へ。死 import 除去。
          検証: tsc=0 / eslint=0 / build:fast / test:unit 130。**実機スモーク**: 参加者追加（フォーム/スタッフ自動判定）・デモ追加。
        - [x] ReservationRow（予約1件の行・チェック/ステータス/キャンセル/展開詳細）（1,683→**1,281**）。
          417行の map を Python で逐語移送（git 比較で本体 diff=0）、クロージャ参照は同名 props 注入。死 import 一掃
          （Input/Label/Select一式/ChevronDown/Up/RESERVATION_SOURCE/getSafeErrorMessage）。tsc=0/eslint=0/build/test 130。
          **実機スモーク**: 予約のステータス変更（確定/チェックイン）・キャンセル・行展開（顧客情報/電話/メール）。
      - [x] 5-3③ ハンドラ群を `useReservationListActions` フックへ分離（1,281→**486**）。
        ステータス変更/キャンセル（メール送信含む）/参加者追加/貸切削除/一括メール送信の826行を逐語移送
        （git 比較で本体 diff=0）、状態・setter・props を 34 deps として注入、内部相互参照はフック内で解決。
        死 import 15個を一掃。検証: tsc=0 / eslint=0 / build:fast / test:unit 130。**実機スモーク**: ステータス変更・キャンセル（メール送信）・参加者追加・一括メール・貸切削除。
      **→ 5-3 完了。ReservationList 当セッション 2,263→486（-78%）。`reservationList/` に
        純モジュール/データ層フック/アクションフック/ダイアログ4/AddParticipantSection/ReservationRow を分離。**
- [~] 5-4 `PerformanceModal`（1,908行）: presentational から子化（**af0458c0 で退行リバート済みの鬼門**）
      方針: **純 presentational 子化のみ**（state/effect/handler は親に残し**同名 props 注入**）。これにより
      前回退行の原因（state/effect のフック化＝再レンダ/effect タイミング変化）を回避。各歩は「移送ブロックの
      byte 一致（空白除去diff=0）」＋ tsc=0 / eslint=0 / build:fast / test:unit 130 で担保。`performanceModal/` 配下へ抽出。
      ※オーナー指示「slices 1-4 を一括 staging スモーク」。1スライス＝別コミット（退行時に個別 revert 可能）。
      - [x] slice1 確認ダイアログ2つ（シナリオ変更確認/公演削除確認）→ `performanceModal/dialogs/PerformanceConfirmDialogs.tsx` `63ae8c7b`（1,908→1,865）
      - [x] slice2 セクション1「日時・場所」→ `performanceModal/sections/DateLocationSection.tsx` `880c3ab9`（1,865→1,785・死import SingleDatePopover/Calendar 除去）
      - [x] slice3 セクション2「公演内容（シナリオ/最大定員/料金）」→ `sections/PerformanceContentSection.tsx` `6767f7c6`（1,785→1,678・**退行①シナリオ外れゾーン**・死import BookOpen/ExternalLink/SearchableSelect 除去）
      - [x] slice4 セクション3「スタッフ・備考（GM選択/役割切替）」→ `sections/StaffNotesSection.tsx` ＋ async 副作用ヘルパー
            ensureStaffReservation/removeStaffReservation を `performanceModal/staffReservationHelpers.ts` へ逐語移設 `2d662e3f`
            （1,678→**1,374**・**退行②メインGM消失ゾーン**・死import 9個除去）
      **バッチ1（slice1-4）本番反映済み**（main `4ab2a8fb`・staging スモークOK）。PerformanceModal 1,908→1,374。
      - [x] slice5 カテゴリ（クイック選択）ブロック → `sections/CategorySelectSection.tsx` `64509997`（1,374→1,301・props2個・死import Select系/Input 除去）
      - [x] slice6 フッターアクションボタン（削除/キャンセル/保存）→ `sections/PerformanceFooter.tsx` `a7965028`（1,301→1,286・死import Button 除去）
      - [x] slice7 公演情報サマリー（renderPerformanceSummary・料金/GM/カテゴリ描画）→ `sections/PerformanceSummary.tsx` `9ca9bc5f`（1,286→**1,192**・死import lucide3種/computeCategoryFee 除去）
      **→ バッチ2（slice5-7）PerformanceModal 1,374→1,192。presentational 子化はほぼ完了
        （残 JSX は DialogHeader/Tabs シェル＝中央制御で分割非推奨、style 注入ブロック）。要 staging 実機スモーク→ OK で main マージ。
        以降の削減はフォーム state/effect/handler のフック化（**中〜高リスク・退行注意**）で別途相談。**
- [~] 5-5 `SendReports`（2,292行）: 送信ロジック→フック、テーブル分離
      - [x] 5-5a ライセンス料報告メール本文を純関数化＋テスト（2026-06-26・2,290→**2,195**）。
        `generateEmailText`（コピー用）/`generateEmailBodyForItems`（送信用）の本文組み立てを
        `sendReports/emailBody.ts` の純関数 `buildReportEmailText` / `buildSendEmailBody`（＋共通
        `emailTemplate`・`paymentDateText`）へ抽出。`getPreviewItem` は状態依存のため呼び出し側に残し、
        既に preview 適用・licenseCost>0 で絞った `paidItems` を渡す形に。2 関数は共通テンプレートを
        共有しつつ、行明細の単価表記の挙動差（コピー用は `|| 0` ガード有り／送信用は無し）は温存。
        7 ケースの characterization テスト整備。検証: tsc=0 / eslint=0 / build:fast / test:unit 110 passed。
        副作用なしの純抽出＝**実機テスト不要**（出力文字列はテストで byte 担保）。
      - [x] 5-5b 明細プレビュー計算 `getPreviewItem` の計算コアを純関数化＋テスト（2026-06-26・2,195→**2,185**）。
        手動上書き（internalInputs/externalInputs）反映の公演数・金額計算を `sendReports/reportItems.ts` の
        ジェネリック純関数 `computePreviewItem(item, internalInputs, externalInputs)` へ抽出。型は呼び出し側に
        依存しないよう `<T extends PreviewInput>` で全フィールド温存。`getPreviewItem` は上書きマップを注入する
        1行ラッパーに（約10箇所の呼び出し側は無改変）。6 ケースのテスト整備。
        検証: tsc=0 / eslint=0 / build:fast / test:unit 116 passed。**実機テスト不要**。
      - [x] 5-5c グループ並び替え比較を純関数化＋テスト（2026-06-26・2,185→**2,163**）。
        filteredGroups.sort の比較ロジック（hasEvents の公演あり優先＋名前タイブレーク／name/email/events/cost／
        sortAsc 反転）を `sendReports/sorting.ts` の `compareReportGroups(a, b, sortKey, sortAsc)` へ逐語抽出。
        4 ケース（実際に sort して順序を検証）のテスト整備。
        検証: tsc=0 / eslint=0 / build:fast / test:unit 120 passed。**実機テスト不要**。
      - [x] 5-5d 作者グループ化（生 items→ReportGroup）を純関数化＋テスト（2026-06-26・2,163→**2,049**）。
        loadData 内の集計ロジック（メアド/表示名でのグループ化・合計加算・hasPartialEmail・
        license_organization_name 上書き・複数表示名の " / " 連結・authorNotes 解決）を
        `sendReports/grouping.ts` の `groupReportItems(items, authorNotesMap, authorOrgNameMap)` へ逐語抽出。
        併せて `ReportItem`/`ReportGroup` 型をコンポーネント内定義から `sendReports/types.ts` へ移設
        （定義の移動のみ・28箇所の参照は無改変）。6 ケースの characterization テスト整備。
        検証: tsc=0 / eslint=0 / build:fast / test:unit 126 passed。純抽出だが**実メール生成の元データ経路**のため、
        念のため送信タブのスモーク（グループ/合計表示）を推奨（必須ではない）。
      **→ SendReports 安全な純ロジックはここで概ね出し切り（2,290→2,049）。残りは送信フロー（handleConfirmSend）・
        各種 save ハンドラ・テーブルUI＝async/対話的のため実機テストリストが必要。次バッチはオーナー確認後。**
      - [x] 5-5e ダイアログを子コンポーネント化（`sendReports/dialogs/`・**要 staging 実機スモーク**）。
        JSX を逐語移植しクロージャ参照を props 化（挙動不変）。オーナー承認済み（ダイアログ子化から開始）。
        - [x] EmailBodyEditDialog（送信済みメール確認・編集）`sendReports/dialogs/EmailBodyEditDialog.tsx`（2,049→**2,023**）。
          併せて inline 型を `types.ts` の `EmailBodyEditTarget` に集約。検証: tsc=0 / eslint=0 / build:fast / test:unit 126。
        - [x] BulkEmailDialog（作者メアド一括登録）`dialogs/BulkEmailDialog.tsx`（2,023→**1,966**）。tsc=0/eslint=0/build:fast。
        - [x] DisplayNameDialog（報告用表示名・メモ編集）`dialogs/DisplayNameDialog.tsx`（1,966→**1,901**）。tsc=0/eslint=0/build:fast。
        - [x] SendPreviewDialog（送信プレビュー・最大 ~206行）`dialogs/SendPreviewDialog.tsx`（1,901→**1,708**）。
          props 21個注入（内部 `tab` 変数は prop と衝突回避で `next` にリネーム・挙動同一）。
          併せて親の死んだ import（Dialog一式/Label/Textarea/Tabs一式）を除去。tsc=0/eslint=0/build:fast/test:unit 126。
        実機テストリスト（着手前にオーナー提示済み・**4ダイアログまとめて staging スモーク**）:
        ①送信プレビュー（作者「送信」→シナリオ選択/自社・他社公演数の手動上書き/本文タブ切替で再生成/本文手動編集後は再生成抑止/実送信）
        ②表示名編集（表示名・メモ変更→保存→一覧反映）
        ③一括メール登録（メアド入力→保存→未登録バッジ解消）
        ④メール本文編集（送信履歴のメール件名・本文編集→保存→履歴反映）。
      **→ ダイアログ子化バッチ完了。SendReports 2,049→1,708（当バッチ -341 / 当セッション累計 2,290→1,708）。
        次の大物は ①グループ一覧テーブルの子化（~450行）②データ層/ハンドラのフック化（loadData/handleBatchSend 等）。
        いずれも対話的＝実機テストリスト要。目標 ~700行まではあと 2-3 バッチ。**
      - [~] 5-5f 一覧UIを子コンポーネント化（`sendReports/components/`・**要 staging 実機スモーク**）。
        - [x] ReportStatsCards（上部統計カード）`components/ReportStatsCards.tsx`（1,763→**1,714**）。props=stats/フラグのみ。tsc=0/eslint=0/build:fast。
        - [x] ReportGroupCard（報告先カード1件・最大 ~370行）`components/ReportGroupCard.tsx`（1,714→**1,380**）。
          filteredGroups.map の本体を逐語移植し props ~26個で注入。送信済/差分バッジの「送信済メールを開く」処理は
          親 `handleOpenSentEmail` に集約、sentHistory マップは渡さず `sentAt` のみ。併せて親の死んだ import を一掃
          （Badge/Checkbox/Tooltip一式/多数の lucide アイコン/formatJstMonthDay/useMemo/Scenario 型）。
          検証: tsc=0 / eslint=0 / build:fast / test:unit 126。**実機スモーク**: 一覧の各バッジ/送信/コピー/展開/明細の公演数入力。
        - [x] ReportToolbar（月送り＋一括送信／検索・ソート・表示モード）`components/ReportToolbar.tsx`（1,380→**1,291**）。
          2ブロックを Fragment で返す（親 space-y-6 維持）。sortKey 型は sorting.ts の `ReportSortKey` を再利用。
          死 import 一掃（Input/Select一式/MonthSwitcher/Search/各アイコン）。tsc=0/eslint=0/build:fast/test:unit 126。
          **実機スモーク**: 月送り/検索/ソート切替/昇降順/viewMode 切替/一括送信。
      **→ JSX はほぼ抽出完了。当セッション累計 SendReports 2,290→1,291（-999）。
        残り ~700 へは データ層/ハンドラのフック化（loadData/handleBatchSend/handleConfirmSend/save系 ~800行・**中リスク**）。
        これは独立バッチ（kitManagement の useData/useHandlers 方式）として次回。**
      - [~] 5-5g データ層をフック化（`useSendReportsData`・**中リスク・要 staging 実機確認**）。
        - [x] データ層 → `sendReports/useSendReportsData.ts`（1,291→**963・1,000行突破**）。
          サーバーデータ state（loading/reportGroups/externalInputs/internalInputs/sentHistory）＋ `loadData`（~325行を逐語移植）
          ＋ 年月/組織変更時の取得 effect を移管。loadData は他 state を読まず依存は引数4個（organizationId/selectedYear/
          selectedMonth/isLicenseManager）のみ。上書き入力・送信履歴・グループは handler 側でも更新するため setter を公開。
          **loadData 本体は git 比較で diff=末尾空白のみ＝完全逐語一致**。親の死 import 一掃（scenarioApi/salesApi/storeApi/
          getAllExternalReports/groupReportItems/Author/useEffect）＋ save入力 useCallback の deps に安定 setter 追記で警告解消。
          検証: tsc=0 / eslint=0 / build:fast / test:unit 126。**実機確認**: タブ表示時のデータ取得・年月切替・シナリオ編集後の再読込。
        - [ ] ハンドラ層 → `useSendReportsActions`（handleBatchSend/handleConfirmSend/save系/各 open）は次バッチ。
      **→ 当セッション累計 SendReports 2,290→963（-1,327 / -58%・目標1,000突破）。残りはハンドラ層フック化で ~700 目標。**

## Phase 6: 巨大ページの解体

リスク: 中 / 規模: 大

- [~] 6-1 `PrivateGroupInvite/index.tsx`（3,469行・最大）: フォーム / メール送信 / バリデーション / 確認UI を分離
      **presentational 抽出 第1バッチ（2026-07-02・3,469→2,544・staging 実機確認待ち）**。方式は 6-2 と同一。
      - [x] チャット画面（`isChatMode`）のオーバーレイシート5つ（候補日/招待/設定/店舗編集/予約申請）→ `components/GroupChatSheets.tsx`
            （989行を DOM順保持で byte 逐語移送・props 62個を同名注入。props の自由変数は **tsc 駆動**で厳密特定＝空白除去 diff=0）`7eddec86`。死 import Trash2/ChevronDown/MapPin 除去。
      各スライス tsc=0 / eslint=0 / build:fast / test:unit 130。
      ※ 残: 非チャット表示（招待/参加フロー・main return 1,649-末尾 ~896行＝進捗ステップ/タブ4種/参加費クーポン/PIN認証/ゲスト情報 等）＝**次バッチ**。チャット本体の GroupChat 領域は既存コンポーネントで抽出対象外。
      （zsh の教訓: `for x in $VAR` は unquoted でも語分割しない＝props 生成は `tr ' ' '\n' | while read` を使う）
- [~] 6-2 `ScheduleManager/index.tsx`（2,053行）: カレンダー描画 / D&D / 右クリックメニュー / ツールバー分離
      **presentational 抽出バッチ完了（2026-07-02・2,053→1,316・main `b03f0441` 反映済＝staging スモークOK）**。
      方式は Phase 5 と同一（byte 逐語移送・空白除去 diff=0・同名 props 注入・state/effect/handler は親に残置・1スライス1コミット）。
      `ScheduleManager/components/` 配下へ抽出:
      - [x] ① ツールバー sticky 操作行（月切替/フィルター群/PC・スマホのアクションボタン）→ `ScheduleToolbar.tsx`（props33）`8926df26`（2,053→1,779・死 import HelpButton＋lucide10種 除去）
      - [x] ② モバイル用フィルターパネル（showMobileFilters 時）→ `ScheduleMobileFilters.tsx`（props12）`babd7bfb`（1,779→1,715・死 import MultiSelect/StoreMultiSelect 除去）
      - [x] ③ `<Suspense>` 配下の全モーダル＋右クリック ContextMenu を **DOM 順を保ったまま** → `ScheduleModals.tsx`（props32・lazy()定義7つも移設）`b03f0441`（1,715→1,316・死 import lazy/Suspense・ContextMenu系・ScheduleDialogs・ExportRangeModal・FillSeatsModal・lucide10種・timeslot util2種 除去）
      各スライス tsc=0 / eslint=0 / build:fast / test:unit 130。
      ※ **残: 800行到達には state/handler のフック化が必要（前半~1,050行が state/effect/handler・中〜高リスク・退行注意）。別バッチでオーナー承認後に着手。**
      （デプロイ中に「新しいバージョンがあります」＝ErrorBoundary のチャンク404画面が出たが、実物 curl 検証でデプロイは健全＝開いたままのタブが旧チャンクを掴んだ定番挙動。`_v=2` 固定キャッシュバスターの papercut は別件）
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
