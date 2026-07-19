# YOYAQ Codex delivery dashboard

POとCodexの自動配送連絡板。運用ルールの正規ソースは[`.cursorrules`](../.cursorrules)であり、本ファイルはキュー、状態、配送証拠だけを記録する。実行手順は[`yoyaq-auto-delivery`](../.agents/skills/yoyaq-auto-delivery/SKILL.md)を使う。

## 境界

- source/intakeタスクは壁打ちとキュー投入だけを行う。明示PO GOの新規queue追加に限り、初期`TODO`行と指示・受入条件・優先度・依存・PREVIEW要否・event sourceを本ファイルへ追記してcommitできる。
- sourceはqueue commit直後に既存監督へeventを送り、監督が無ければ別の可視監督タスクを作成またはwakeして送る。claimまたは着手可能な可視workerを確認するまでqueue追加は未完了であり、source自身は監督・integrationを兼務しない。
- POとの壁打ち後の明示GOだけが新規タスクを追加する。`BACKLOG.md`、`IMPROVEMENT_HANDOFF.md`、他台帳の既存TODOを自動追加・自動実行しない。
- sourceの新規queue追加commit後は、状態遷移、event audit、REPORT/REWORK/DONE、integration/push記録を監督だけが更新する。worker/reviewerは本ファイルを編集しない。
- worker/reviewerは正確な最新`origin/staging`から作る`codex/*` branchと隔離worktreeを使う。stagingの統合/pushは監督タスク本人だけが1件ずつ直列実行し、integration taskその他へ委譲しない。
- UI変更はPREVIEW-first。隔離worktree/branchのlocal previewをPOがvisual OKするまでstagingへ統合しない。
- 本番DB、main merge/push、本番デプロイは明示的なPO releaseだけで行い、このキューから自動実行しない。
- dirty/unrelated変更をrevert、移送、吸収しない。

## イベント配送

- キュー追加: `YOYAQ_QUEUE_UPDATED`
- worker REPORT: `YOYAQ_WORKER_REPORT_EVENT`
- reviewer verdict: `YOYAQ_REVIEW_RESULT_EVENT`
- `YOYAQ_QUEUE_UPDATED`はqueue専用payloadとしてqueue commit、task IDs、priority、dependencies、PREVIEW対象、source threadを含める。child task ID、state/verdict、gates、next actionは要求しない。
- worker/reviewerのterminal eventはtask ID、child/review task ID、exact commit、stateまたはverdict、gates、next actionを含める。
- queue/terminal eventはいずれも`codex_app send_message_to_thread`で監督へ明示配送する。
- passive completion、idle、child内final、`codex_delegation`表示は配送ではない。監督は同じ受領turnで`EVENT_CLAIMED`を記録し、次遷移も実行する。
- 監督起動、ユーザー書き込み、status監査ではidle childのterminal turnを回収する。固定polling、heartbeat、FSEventsは使わない。

## Queue intake order

```text
明示PO GO
  -> sourceが新規TODO行・指示/受入・優先度/依存・PREVIEW・sourceを追記
  -> sourceがqueue commit
  -> sourceがYOYAQ_QUEUE_UPDATEDを既存または新規の別可視監督へ明示送信
  -> 監督がEVENT_CLAIMED + QUEUE_CLAIMED、または可視worker作成
```

最終行まで完了して初めてqueue追加完了とする。queue commit後の記録は監督専有とする。

## ステータス

```text
TODO -> DOING
DOING -> PREVIEW                 # UIのみ
PREVIEW -> DOING | REPORT        # PO修正 | PO visual OK後のgate+commit
DOING -> REPORT                  # 非UIのgate+commit
REPORT -> DONE | REWORK
REWORK -> DOING -> REPORT
任意 -> PAUSED                   # 新しい明示GOまで停止
```

- `REPORT`はworker commitと対象ゲート証拠がある状態。
- `DONE`は必要な検収、監督の直列staging統合/push、進捗記録が完了した状態。
- `PAUSED`では実装、テスト、検収、DB適用、統合、pushを行わない。

## リスクレーン

| lane | 対象 | 基本方針 |
|---|---|---|
| UI-INSTANT | 狭いUI/文言/状態表示 | PREVIEW-first。PO OK後にtypecheck+直接関係するcheck+短いdiff監査。通常は独立検収なし |
| FAST | boundedな非DBロジック | typecheck+直接関係するunit/check/build。境界変更時は独立検収 |
| HIGH-RISK | migration、RLS/RPC、Edge Function、org/認証/PII、予約在庫/決済、通知、日付/締切、並行処理 | risk-targeted gateと独立検収必須。DBはfrontendより先 |

選択可能なgate: `npm run typecheck`、`npm run verify`、`npm run db:check`、`npm run test:unit`、`npm run test:e2e`、`npm run test:rpcs`、`npm run check:security-guardrails`、`npm run check:cancellation-rpcs`、`npm run check:multi-tenant`、`npm run check:org-scope`、`npm run check:permissions`、`npm run check:anon-rls-grants`、`npm run check:jst-date`、`npm run check:design-tokens`、`npm run build`。毎回全部は実行しない。

## Active supervisor

| supervisor task | integration checkout | current origin/staging | last audit |
|---|---|---|---|
| `019f779d-7170-7752-a846-37c593cf3ec8` | `/Users/mai/mmq_yoyaq-1` | `4371ba19225351832b656cc2c851f3d8047bd2f1` | 2026-07-19 11:17 JST |

## Queue

初期キューは空。今後、POの明示GOを受けたsourceが新規タスクを先に追記・commitし、そのcommitを`YOYAQ_QUEUE_UPDATED`で配送してclaim/可視worker確認まで完了させる。

| task ID | title | status | lane | preview | dependencies | worker/review | report commit | staging result |
|---|---|---|---|---|---|---|---|---|
| YOYAQ-001 | キャンセルポリシー共通基盤と予約時スナップショット | DOING | HIGH-RISK | N/A | なし | `019f77fc-8eb6-77a0-b8ba-033a4e9e614a` REWORK中 / `019f7822-b07a-7150-a58b-6ba6d716856a` | `704de5280506e197d82904b0af26a48bff88d3df`（旧REPORT） | - |
| YOYAQ-002 | 管理設定から顧客向けポリシー表示を動的統一 | TODO | HIGH-RISK | 必須 | YOYAQ-001 | 未割当 | - | - |
| YOYAQ-003 | マイページ貸切キャンセル動線・料金表示・API検証 | TODO | HIGH-RISK | 必須 | YOYAQ-001, YOYAQ-002 | 未割当 | - | - |

## Event log

| time (JST) | event | task ID | commit | claimed/transition |
|---|---|---|---|---|
| 2026-07-19 10:28 | `YOYAQ_QUEUE_UPDATED` / `EVENT_CLAIMED` | YOYAQ-001, YOYAQ-002, YOYAQ-003 | `89484b2b04d23f6652e6c9feb79dc46773e26b14` | source `019f77bb-e598-78e0-b0e9-f301d3626e89` からclaim、YOYAQ-001可視worker起動（recovered: false） |
| 2026-07-19 10:37 | `YOYAQ_SCOPE_UPDATED` / `EVENT_CLAIMED` | YOYAQ-002, YOYAQ-003 | - | source `019f77bb-e598-78e0-b0e9-f301d3626e89` からclaim。002着手前の横断棚卸し、分類、動的反映、001 snapshot下流契約確認を追加（recovered: false） |
| 2026-07-19 10:48 | `YOYAQ_WORKER_REPORT_EVENT` / `EVENT_CLAIMED` | YOYAQ-001 | `e5e4d13ee6c67fc21c737392cb26034715eda6db` | worker `019f77fc-8eb6-77a0-b8ba-033a4e9e614a` からclaim、fresh独立検収 `019f7810-79a7-7b51-9f3b-7c35f2b3cd38` 起動（recovered: false） |
| 2026-07-19 10:58 | `YOYAQ_REVIEW_RESULT_EVENT` / `EVENT_CLAIMED` | YOYAQ-001 | `e5e4d13ee6c67fc21c737392cb26034715eda6db` | reviewer `019f7810-79a7-7b51-9f3b-7c35f2b3cd38` のREWORKをclaim。同workerへ4件返送しREWORK→DOING（recovered: false） |
| 2026-07-19 10:59 | `YOYAQ_SCOPE_REQUEST` / `FILE_APPROVED` | YOYAQ-001 | - | tenant不整合trigger再現テスト `supabase/tests/yoyaq_001_cancellation_policy_snapshot_test.sql` 1件だけを追加許可。local transaction限定、staging/prod実行禁止 |
| 2026-07-19 11:08 | `YOYAQ_WORKER_REPORT_EVENT` / `EVENT_CLAIMED` | YOYAQ-001 | `704de5280506e197d82904b0af26a48bff88d3df` | worker `019f77fc-8eb6-77a0-b8ba-033a4e9e614a` の再REPORTをclaim、fresh独立検収 `019f7822-b07a-7150-a58b-6ba6d716856a` 起動（recovered: false） |
| 2026-07-19 11:17 | `YOYAQ_REVIEW_RESULT_EVENT` / `EVENT_CLAIMED` | YOYAQ-001 | `704de5280506e197d82904b0af26a48bff88d3df` | reviewer `019f7822-b07a-7150-a58b-6ba6d716856a` のREWORKをclaim。同workerへtenant境界3経路のSQL回帰テスト追加を返送しREWORK→DOING（recovered: false） |

## 記録テンプレート

```markdown
### YOYAQ-XXX: タイトル

- **GO/source:** <PO GOの要約、source task ID、queue event source>
- **status/lane:** <TODO等> / <UI-INSTANT等と根拠>
- **scope:** <指示、許可ファイル、受入条件、優先度、依存、PREVIEW要否>
- **worker:** <task ID、worktree、branch、base SHA、port>
- **PREVIEW:** <URL/スクショ、確認導線、PO判断。非UIはN/A>
- **REPORT:** <commit、全変更ファイル、対象gate、判断、残課題>
- **review:** <task ID、DONE/REWORK、対象gate、根拠>
- **integration:** <最新origin/staging、統合commit、push結果>
- **PO check:** <staging上のページ名・タブ名・たどり方>
```

PO向け報告はPREVIEW判断、materialなREWORK、DONEに絞る。

### YOYAQ-001: キャンセルポリシー共通基盤と予約時スナップショット

- **GO/source:** 2026-07-19 PO明示GO。source task `019f77bb-e598-78e0-b0e9-f301d3626e89`。本番公開画面・Queens Waltz全有効店舗の設定を再監査し、オープン/貸切の料率・受付期限・変更期限を管理設定の唯一の正として統一する合意。
- **status/lane:** DOING（REWORK対応中） / HIGH-RISK（migration、予約金額、日付・締切、既存予約互換）
- **scope:** 優先度P0。Exact base `4371ba19225351832b656cc2c851f3d8047bd2f1`。予約時点の店舗・公演種別・受付期限・料率・料金基準・ポリシー更新時点を予約へスナップショット保存し、管理設定変更を既存予約へ遡及適用しない。既存予約は安全な互換方針を明記する。オープン/貸切を同じ純粋計算基盤で扱い、JSTの開演境界、0時間、7日/3日、50%/100%、金額丸めを対象テストで固定する。`reservation_settings`と`reservations`の正規schema、必要なmigration/API/型/共通ロジック/対象テストだけを許可し、RLS直接変更は禁止。REWORK指摘1のDB trigger再現に限り、`supabase/tests/yoyaq_001_cancellation_policy_snapshot_test.sql`を追加許可する。テストはBEGIN/ROLLBACKの使い捨てlocal DB専用で、staging/prod実行は禁止。migration全文、既存データ影響、rollback/互換方針、確認queryを提示し、staging DB適用は監督のDB先行手順に従う。実装gate: `npm run verify`、`npm run db:check`、`npm run test:unit`、`npm run check:cancellation-rpcs`、`npm run check:jst-date`、`npm run check:multi-tenant`、`git diff --check`。独立検収必須。
- **worker:** task `019f77fc-8eb6-77a0-b8ba-033a4e9e614a`、worktree `/Users/mai/.codex/worktrees/52f9/mmq_yoyaq-1`、branch `codex/yoyaq-001-cancellation-policy-snapshot`、base `4371ba19225351832b656cc2c851f3d8047bd2f1`、port N/A（非UI）
- **PREVIEW:** N/A（非UI）
- **REPORT:** commit `704de5280506e197d82904b0af26a48bff88d3df`、累積10ファイル（前REPORTからのREWORK差分6ファイル）。tenant不一致storeの拒否、version=1未完成snapshotのpending契約、正規schema同期、`RESERVATION_SOURCE.WEB_PRIVATE`利用を反映。`verify`、`db:check`、unit 153件、cancellation RPC、JST、diff checkはPASS。multi-tenantはbase/currentとも既知136件でexit 1、増分0。追加SQL testはmigration未適用かつ前提live列未同期の既存local DBを変更しないためNOT RUNで、BEGIN/ROLLBACK、tenant不一致、同一tenant設定なしdefault、snapshot完全性を構造監査済み。RLS/DB適用/Edge deploy/staging・main統合/pushなし。migration全文・既存データ影響・rollback/互換・確認query受領済み。
- **review:** task `019f7822-b07a-7150-a58b-6ba6d716856a`、REWORK。前回4指摘の実装上の解消と全gateは確認済み。追加SQL testに、(a) `store_id`を他tenant店舗へ変更するUPDATE拒否、(b) `organization_id`変更でstore不一致になるUPDATE拒否、(c) 既存予約の無関係UPDATE成功とsnapshot不変、の3経路がなく、HIGH-RISK境界を実装・テスト双方で閉じた証拠が不足。同じSQL testのBEGIN/ROLLBACK内へ23514、行/旧snapshot不変、無関係UPDATE成功のassertを追加するよう同workerへ返送する。
- **integration:** 未着手
- **PO check:** staging DB確認queryと、新規予約にスナップショットが保存され、設定変更後も既存予約の算定が変わらない証拠を提示する。

### YOYAQ-002: 管理設定から顧客向けポリシー表示を動的統一

- **GO/source:** 同上。source task `019f77bb-e598-78e0-b0e9-f301d3626e89`。
- **status/lane:** TODO / HIGH-RISK（マルチテナント、顧客向け料金表示、管理設定連動）
- **scope:** 優先度P1、YOYAQ-001のstaging統合後に着手。MMQ管理サイトのキャンセル設定を唯一の正とし、保存後に公開キャンセルポリシー、組織FAQまたはポリシー誘導、通常/貸切予約確認、管理画面プレビュー、最終更新日へ動的反映する。着手前にキャンセルポリシー・締切・手数料・キャンセル方法のハードコードをリポジトリ全体で`rg`等により全件棚卸しし、FAQ/よくある質問、注意事項・利用規約・キャンセルポリシー、予約フォーム/確認/完了、マイページ予約詳細/キャンセルダイアログ、貸切関連ページ、顧客向けメール/通知、料金・期限判定、API/RPCを確認する。各ヒットを「動的化」「正当な固定文言」「対象外」に分類し根拠をREPORTへ残し、動的化対象は調査だけで終えず同一の管理設定またはYOYAQ-001予約時snapshotへ接続する。FAQは条件をDBコンテンツへ重複保持せず、共通動的表示または正規ページへの明示リンクを使い、注意事項その他の顧客ページにある条件も共通表示へ置換する。organization_id/store scopeを維持し、予約文脈では予約店舗と既存予約snapshotを必ず使用して後日の設定変更を遡及させない。複数店舗で設定が異なる場合は店舗を誤認させない。通常/貸切の料金基準と期間を読みやすく表示し、既存の顧客向けスクエアブランド外観を維持する。棚卸し結果から許可ファイルと画面所有を確定し、キャンセルポリシー関連以外の設定棚卸しへ拡張しない。対象ページ/フック/共通表示部品/対象テストと`docs/IMPROVEMENT_HANDOFF.md`の本タスク記録だけを許可し、公演モーダル・公演カードは変更禁止。管理画面変更から公開ページ群、予約済み顧客画面、メール/APIまでの整合をテストする。PREVIEW-first。PO visual OK後の実装gate: `npm run verify`、`npm run test:unit`、`npm run check:design-tokens`、`npm run check:jst-date`、`npm run check:multi-tenant`、`npm run check:org-scope`、`git diff --check`。独立検収必須。
- **worker:** 未割当
- **PREVIEW:** 必須。desktop/mobileで管理サイト「設定 > キャンセル設定」と、顧客サイト「キャンセルポリシー」「FAQ」「注意事項・利用規約」「予約フォーム/確認/完了」を固有portで確認する。
- **REPORT:** 未着手
- **review:** 未着手
- **integration:** 未着手
- **PO check:** 管理設定を変更すると上記各表示が同じ内容・最終更新日に変わり、別組織/別店舗の内容が混入しないこと。

### YOYAQ-003: マイページ貸切キャンセル動線・料金表示・API検証

- **GO/source:** 同上。source task `019f77bb-e598-78e0-b0e9-f301d3626e89`。
- **status/lane:** TODO / HIGH-RISK（予約取消、金額、日付・締切、認可、メール/通知、貸切グループ原子更新）
- **scope:** 優先度P2、YOYAQ-001/002のstaging統合後に着手。002の横断棚卸し結果を引き継ぎ、マイページ予約詳細/キャンセルダイアログ、貸切関連ページ、顧客向けメール/通知、料金・期限判定、API/RPCの各ヒットを「動的化」「正当な固定文言」「対象外」に分類した根拠と対応をREPORTへ残す。貸切主催者が「マイページ > 予約 > 貸切」から予約詳細とキャンセル確認へ進める動線を追加する。通常/貸切とも予約スナップショットから受付可否と現在のキャンセル料・金額を表示し、開演後は顧客操作を画面/API双方で拒否する。一般メンバーには貸切全体キャンセルを出さない。顧客キャンセルは予約と貸切グループを既存の原子処理で同期し、メール・GM通知・キャンセル待ち通知を維持する。スタッフ起点の店舗都合キャンセルは顧客期限で阻害しない。キャンセルメールの固定24時間計算を同じスナップショット計算へ統一し、表示・メール・APIの期限/料率/金額/可否を同じ正へ接続する。organization_id/store scopeを維持し、既存予約は後日の設定変更ではなく予約時snapshotを使う。キャンセルポリシー関連以外の設定棚卸しへ拡張しない。対象MyPage/PrivateGroup/API/reservationApi/メール連携/対象テストと`docs/IMPROVEMENT_HANDOFF.md`の完了記録だけを許可。PREVIEW-first。PO visual OK後の実装gate: `npm run verify`、`npm run test:unit`、`npm run check:cancellation-rpcs`、`npm run check:security-guardrails`、`npm run check:jst-date`、`npm run check:multi-tenant`、`npm run check:org-scope`、`npm run build`、`git diff --check`。独立検収必須。
- **worker:** 未割当
- **PREVIEW:** 必須。desktop/mobileで「マイページ > 予約 > 貸切 > 予約詳細」を開き、主催者/一般メンバー、期限前/開演後、オープン/貸切の確認導線と金額表示を固有portで確認する。
- **REPORT:** 未着手
- **review:** 未着手
- **integration:** 未着手
- **PO check:** 「マイページ > 予約 > 貸切 > 予約詳細」で主催者だけがキャンセルでき、確認画面とメールの料金が公開ポリシーと一致し、キャンセル後に予約・グループ・通知が整合すること。
