---
name: yoyaq-auto-delivery
description: Queens Waltz予約管理(yoyaq)で、POとの壁打ち後の明示GOを、Codexだけで可視worker・隔離worktree・PREVIEW・対象ゲート・独立検収・REWORK・staging直列統合/push・進捗記録まで配送する。POが「GO」「実装へ」「自動で進めて」など、合意済みタスクの着手を明示したときに使う。本番DB、main、本番デプロイには使わない。
---

# YOYAQ Auto Delivery

合意済みタスクを、POにタスク作成や切替を求めず、Codexの可視タスクだけでstaging配送まで進める。`.cursorrules`を常に最優先する。

## 契約を読む

1. `.cursorrules`、`AGENTS.md`、`docs/CODEX_DASHBOARD.md`を全文読む。
2. 実装/検収タスクを作る前に[thread-prompts.md](references/thread-prompts.md)を読む。
3. 改善タスクなら`docs/IMPROVEMENT_HANDOFF.md`、レビュー時は`docs/templates/review-perspectives.md`と`docs/templates/test-perspectives.md`も読む。
4. `git fetch origin staging`後の`origin/staging` SHAと全checkoutのdirty状態を確認する。無関係な変更を破棄・吸収しない。

## 着手条件と停止条件

- 壁打ちで受入条件、許可ファイル、依存関係、リスクが確定し、POが明示的にGOしたタスクだけをキューへ追加する。
- `docs/BACKLOG.md`や`docs/IMPROVEMENT_HANDOFF.md`の既存TODOを自動インポート・自動着手しない。
- source/intakeタスクは壁打ちとキュー投入だけを担当する。実装、検収、監督はサイドバーに見える別タスクで行い、source自身が監督やintegrationを兼務しない。
- POのSTOP/PAUSEDを即時停止として扱う。過去のGOやREPORTで再開せず、新しい明示GOを待つ。
- 本番DB適用、mainのmerge/push、本番デプロイは自動配送の範囲外とする。POの明示的な本番リリース指示がある別ターンだけで行う。

## キュー配送を完了させる

- キュー文書のcommitだけで完了としない。sourceタスクは監督へ`YOYAQ_QUEUE_UPDATED`を`codex_app send_message_to_thread`で明示送信する。
- `YOYAQ_QUEUE_UPDATED`専用payloadへ`commit`、`task_ids`、`priority`、`dependencies`、`preview_first`、`source_thread`を含める。childの`state/verdict/gates/next_action`はqueue eventには要求しない。
- 監督が無ければ、sourceは別の可視監督タスクを作成またはwakeし、その監督へqueue eventを送る。source自身は監督へ昇格せず、監督の`QUEUE_CLAIMED`または着手可能レーンごとの可視worker作成を確認するまでqueue配送を完了としない。
- 監督は受領turnで`EVENT_CLAIMED`を記録し、次の遷移まで同じturnで実行する。

## リスクとゲートを選ぶ

全ゲートを機械的に回さず、変更リスクへ直接対応するものだけを割り当てる。

- `UI-INSTANT`: 狭いUI、文言、状態表示。PREVIEW-first。PO visual OK後に`npm run typecheck`、必要なら`npm run check:design-tokens`/`npm run check:jst-date`、対象テスト、`git diff --check`、短いdiff監査を行う。通常は独立検収を省略し、監督が統合前監査する。
- `FAST`: DBを伴わない局所ロジック。`npm run typecheck`に加え、該当する`test:unit`、`test:e2e`、`check:security-guardrails`、`check:cancellation-rpcs`、`check:multi-tenant`、`check:org-scope`、`check:jst-date`、`check:design-tokens`、`build`から選ぶ。境界変更や回帰余地がある場合は独立検収する。
- `HIGH-RISK`: migration、RLS/RPC、Edge Function、`organization_id`/マルチテナント、認証/PII、予約在庫/決済、メール/通知、日付/締切、並行処理。独立検収を必須とし、`verify`、`db:check`、`test:rpcs`、`check:permissions`、`check:anon-rls-grants`、`check:multi-tenant`、`check:org-scope`、`check:security-guardrails`、`check:cancellation-rpcs`、`check:jst-date`、`test:unit`、対象`test:e2e`、`build`から変更に必要な組合せだけを指定する。
- 改善タスクでは`.cursorrules`どおりcommit前に`npm run verify`を必須とする。

## 可視workerを起動する

1. タスク/許可ファイル/依存/画面所有のmatrixを作る。重ならないレーンだけを並走させる。
2. Codexアプリのタスク作成機能を使い、各write laneをサイドバーに見える実装タスクにする。hidden subagentを主workerにしない。
3. 各workerを`git fetch origin staging`後の正確な最新`origin/staging`から、`codex/<task-id>-<slug>` branchと専用worktreeで開始する。worker/reviewerはstagingをcheckout・merge・pushしない。
4. workerへ着手前の許可ファイル宣言、clean status、base SHA一致を要求する。dashboardと共有進捗文書は監督だけが更新する。
5. UI workerは固有portで`npm run dev -- --host 0.0.0.0 --port <port>`を使い、隔離worktree/branchのPREVIEWを提示する。stagingへの統合やpushをpreview代わりにしない。

## PREVIEWからREPORTへ進める

- UI変更はレーンを問わずPREVIEW-firstとする。PO visual OK前は同じworker/worktreeで反復し、staging統合、最終ゲート、最終commit、独立検収を行わない。
- POの修正を同じworkerへ返す。POが`OK`/`確定`と明示したら、割当ゲートを1回、diff監査、1作業1commit、REPORTまで進める。
- 非UI workerは実装、対象ゲート、1commit、REPORTまで進める。pushしない。
- workerはfinal前に監督へ`YOYAQ_WORKER_REPORT_EVENT`を明示送信する。terminal event専用payloadとしてtask ID、worker task ID、exact commit、`REPORT`、gate結果、次actionを含める。送信失敗時はfinalにせず再試行する。

## 検収とREWORKを回す

- `HIGH-RISK`と、監督が必要と判断した`FAST`はREPORT commitからcleanな別worktree/別可視タスクを作り、独立検収する。UIはPO visual OK済みであることを確認する。
- reviewerは日本語で完全diff、リスク境界、割当ゲート、必要な実ブラウザ/スクショを確認し、`DONE`か`REWORK`だけを返す。実装を修正せず、dashboardを編集せず、pushしない。
- reviewerはfinal前に`YOYAQ_REVIEW_RESULT_EVENT`を監督へ明示送信する。terminal event専用payloadとしてtask ID、review task ID、exact commit、verdict、gate結果、所見、次actionを含める。
- `REWORK`受領時、監督は同じturnで`EVENT_CLAIMED`を記録し、正確な所見を元workerへ返す。`REWORK -> DOING -> REPORT`を同じレーンで回し、新commitをfresh reviewで検収する。

## stagingへ直列配送する

- 監督タスク本人だけがaccepted commitを1件ずつ、最新`origin/staging`を基点とするcleanな統合checkoutへ取り込む。この権限をintegration taskその他へ委譲しない。push直前にfetchし、基点が動いていれば再統合・再確認する。
- worker commit、検収証拠、許可範囲、dirty状態を監査してから、対象commitを`git cherry-pick --no-commit`または同等の非破壊手順で適用する。`git add .`、force push、無関係なclean-upを行わない。
- dashboardのDONE/検収/イベント記録を監督が加え、製品差分と進捗記録を**staging上の1作業1commit**にまとめて`origin/staging`へpushする。次のaccepted laneはその後に扱う。
- staging push後は`.cursorrules`の形式で、ページ名・タブ名・たどり方を含む動作確認チェックリストをPOへ返す。

## DB・Edge Function境界を守る

- DB変更は常にHIGH-RISKとする。migration全文、既存データへの影響、rollback/互換方針、確認queryをPOへ提示し、現行の承認規則に従ってから`npm run db:push:staging`を実行する。
- staging DB適用後は確認query結果を記録する。`DB -> 必要なEdge Function -> frontend staging配送`の順を守り、`npm run functions:deploy:staging`の対象と結果も記録する。
- RLSに関わるタスクもHIGH-RISKとするが、RLSポリシーは直接変更せず、SECURITY DEFINER RPCで必要最小限を返す。`.cursorrules`の全レビュー観点とpermission gateを満たす。
- production DB/Edge Function、main、本番frontendは明示PO releaseだけで、DB先行を守る。事前に`git log origin/staging..origin/main --oneline`を監査し、mainのhotfix分岐があれば停止・報告する。release後はstagingをmainへff resyncする。

## イベントを回収する

- passive completion、idle、child内final、`codex_delegation`表示を配送とみなさない。
- 監督起動時、ユーザー書き込み時、status監査時にidle child/reviewerのterminal turnを読み、未claimのREPORT/DONE/REWORKをrecovered eventとしてclaimして同じturnで遷移する。
- 固定polling、heartbeat、FSEvents、定期monitorを作らない。明示messageと受領確認だけで駆動する。
- POへの中間報告はPREVIEW判断、materialなREWORK、DONEに絞って簡潔にする。
