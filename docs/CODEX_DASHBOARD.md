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
| なし | なし | 未claim | 未実施 |

## Queue

初期キューは空。今後、POの明示GOを受けたsourceが新規タスクを先に追記・commitし、そのcommitを`YOYAQ_QUEUE_UPDATED`で配送してclaim/可視worker確認まで完了させる。

| task ID | title | status | lane | preview | dependencies | worker/review | report commit | staging result |
|---|---|---|---|---|---|---|---|---|

## Event log

| time (JST) | event | task ID | commit | claimed/transition |
|---|---|---|---|---|

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
