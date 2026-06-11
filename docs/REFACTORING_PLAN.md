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
- [ ] 0-2 未使用コード検出ツール導入（knip または ts-prune）、ベースライン出力
- [x] 0-3 削除前チェック手順の明文化（本ドキュメント）

## Phase 1: 死にコードの全面削除

リスク: 低 / 規模: 中（5〜8コミット、推定 -4,000〜6,000行）

- [x] 1-1 シナリオ編集 V0/V1 + `pages/ScenarioEdit/` 削除（**完了**: ec3c219a, -5,490行）
- [ ] 1-2 旧シナリオ管理UI削除: `ENABLE_LEGACY_SCENARIO_UI=false` 系統
      （`tableColumns.tsx` 559行 / `ScenarioTableRow.tsx` 197行 / `ScenarioTableHeader.tsx` 126行 /
      `useScenarioData.ts` 179行 / `index.tsx` 内の分岐・uiMode 関連）約 -1,200行
- [ ] 1-3 重複クエリフックの監査（`useScenarioQuery.ts` 内 deprecated `useScenariosQuery` 等）
- [ ] 1-4 knip 検出分の削除（1領域=1コミット）
- [ ] 1-5 `ScenarioEditModal/types.ts`・`utils/constants.ts` を `ScenarioEditDialogV2/` 配下へ移住し、
      旧ディレクトリを完全消滅（import パス書き換えのみ）

## Phase 2: 型と定数の整理

リスク: 低 / 規模: 小〜中（3〜5コミット）

- [ ] 2-1 `types/index.ts`（1,082行）をドメイン分割
      （organization / scenario / reservation / schedule / staff / auth。index.ts は re-export バレルとして残す）
- [ ] 2-2 分割過程で見えたドメイン間の不自然な依存をメモ化（Phase 4 以降の指針）
- [ ] 2-3 散在する status / option 系定数の置き場統一

## Phase 3: 散在する状態管理の統一

リスク: 中 / 規模: 中（4〜6コミット）

- [ ] 3-1 全 localStorage / sessionStorage キーの棚卸し
- [ ] 3-2 `useUIPreferences` への集約（**キー名と保存形式は変えない** — 既存ユーザー設定を壊さない）
- [ ] 3-3 スクロール復元の統一（`RouteScrollRestorationContext` と各ページ独自実装の重複解消）

## Phase 4: 巨大フックの分割 ★最重要・最も慎重に

リスク: 高（スケジュール管理は業務の中核） / 規模: 大（8〜12コミット）

- [ ] 4-1 `useEventOperations.ts`（2,422行）の依存マップ作成（コードを変える前に呼び出し元一覧）
- [ ] 4-2 純関数の抽出 → `utils/eventOperationUtils.ts`（時間重複判定・バリデーション等。**ここでユニットテストを書く**）
- [ ] 4-3 操作系統ごとにフック分割: `useAddEvent` / `useEditEvent` / `useCancelRestoreEvent` / `useMoveCopyEvent`
      （1分割=1コミット。旧フックは re-export で互換維持 → 最後に削除）
- [ ] 4-4 `useScheduleData` と `useScheduleEventsQuery` の役割重複を調査（まず実際の行数を実測）
- [ ] 4-5 `usePrivateGroup`（958行）を create / invite / chat の3系統に分離
- [ ] 4-6 `AuthContext`（1,120行）の内部分割（セッション / リフレッシュ / マルチタブ同期。公開IFは不変）

※ このフェーズは各コミット後にステージングでスケジュール画面の動作確認を必ず挟む。
※ 並行中の org_scope API 化（セキュリティ案件）と同一ファイルを触る場合、コミットを分離する。

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
