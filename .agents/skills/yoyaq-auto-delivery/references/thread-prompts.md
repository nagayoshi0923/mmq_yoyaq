# YOYAQ thread prompt templates

`[]`を実値へ置換して使う。source/intake、実装、検収、監督をそれぞれ可視タスクとして分離する。

## Queue handoff

```text
YOYAQ_QUEUE_UPDATED
commit: [QUEUE_COMMIT]
task_ids: [TASK_IDS]
priority: [ORDER_OR_RULE]
dependencies: [DEPENDENCIES_OR_NONE]
preview_first: [TASK_IDS_OR_NONE]
source_thread: [SOURCE_THREAD_ID]

最新origin/staging、全checkoutのdirty状態、docs/CODEX_DASHBOARD.mdを再読し、着手可能レーンをyoyaq-auto-deliveryでclaimしてください。同じturnでEVENT_CLAIMEDを記録し、QUEUE_CLAIMED（task IDs、worker task IDs、worktrees、branches、ports）を返してください。別のPOメッセージを待たないでください。
```

## Implementation worker

```text
YOYAQ task [TASK_ID]: [TITLE] を実装してください。

Supervisor thread: [SUPERVISOR_THREAD_ID]
Worker thread: [WORKER_THREAD_ID]
Exact base: [ORIGIN_STAGING_SHA]
Allowed files: [ALLOWLIST]
Acceptance criteria: [CRITERIA]
Lane: [UI-INSTANT_OR_FAST_OR_HIGH-RISK]
Preview-first: [YES_OR_NO]
Implementation gates: [GATES]
Review gates: [GATES_OR_NONE]

編集前に.cursorrules、AGENTS.md、docs/CODEX_DASHBOARD.mdと関連正本を全文確認してください。git fetch origin staging後、cleanな専用worktreeのcodex/[task-id]-[slug] branchが指定Exact baseと一致することを示し、所有するファイルを宣言してください。許可ファイル以外、dashboard、進捗台帳、共有fixture、他人のdirty変更を編集・revert・吸収しないでください。staging/mainをcheckout・merge・pushしないでください。

Preview-first=YESなら、固有portで `npm run dev -- --host 0.0.0.0 --port [PORT]` を起動し、隔離worktreeのPREVIEW URL/スクショと確認導線を返してください。PO visual OK前は最終ゲート、最終commit、REPORT、独立検収、staging統合を行わず、同じworker/worktreeで修正を反復してください。SupervisorからPO OK/確定が明示配送された後だけ、指定ゲートを1回、git diff --check、完全diff監査、1作業1commit、REPORTへ進んでください。

Preview-first=NOなら、根本原因を最小差分で実装し、指定ゲート、git diff --check、完全diff監査、1作業1commit、REPORTへ進んでください。pushしないでください。

final REPORT前に、codex_app send_message_to_threadでSupervisorへ次を明示送信してください。

YOYAQ_WORKER_REPORT_EVENT
task_id: [TASK_ID]
worker_thread: [WORKER_THREAD_ID]
commit: [FULL_COMMIT]
state: REPORT
files: [CHANGED_FILES]
gates: [RESULTS]
next_action: [START_REVIEW_OR_SUPERVISOR_AUDIT]

送信成功前のidle/finalは配送ではありません。失敗したらtaskをactiveのまま再試行してください。
```

## Independent reviewer

```text
YOYAQ task [TASK_ID] のREPORT commit [COMMIT]を独立検収してください。

Supervisor thread: [SUPERVISOR_THREAD_ID]
Review thread: [REVIEW_THREAD_ID]
Lane: [FAST_OR_HIGH-RISK]
Review gates: [GATES]
PO visual OK: [YES_OR_NOT_APPLICABLE]

.cursorrules、AGENTS.md、docs/CODEX_DASHBOARD.md、docs/templates/review-perspectives.md、docs/templates/test-perspectives.mdを全文確認してください。cleanな別worktreeでexact commitが存在することを示し、REPORT diff全体と変更リスクを日本語で検収してください。割当ゲートだけを実行し、既に有効なgreen証拠を機械的に重複しないでください。UIは対象画面の実ブラウザまたはスクショを1つ以上確認してください。

verdictはDONEまたはREWORKの1つです。REWORKは正確な場所、再現/根拠、必要な修正を返し、実装を直さないでください。レビュー末尾にトップレベルの「総評」として、最重要指摘、マージ推奨、対応優先順位を日本語で記載してください。dashboard/進捗文書を編集せず、commit/pushしないでください。

final verdict前に、codex_app send_message_to_threadでSupervisorへ次を明示送信してください。

YOYAQ_REVIEW_RESULT_EVENT
task_id: [TASK_ID]
review_thread: [REVIEW_THREAD_ID]
commit: [COMMIT]
verdict: [DONE_OR_REWORK]
gates: [RESULTS]
findings: [FINDINGS_OR_ACCEPTANCE_EVIDENCE]
next_action: [INTEGRATE_SERIALLY_OR_RETURN_TO_WORKER]

送信成功前のidle/finalは配送ではありません。失敗したらtaskをactiveのまま再試行してください。
```

## REWORK return

```text
[TASK_ID] はREWORKです。次の指摘だけを同じworker/worktreeで修正してください。

[EXACT_FINDINGS]

状態をREWORKからDOINGへ進め、前REPORTからの差分を監査し、失敗ゲートと新たに影響するゲートだけを再実行してください。新しい1commitを作り、final前に新しいYOYAQ_WORKER_REPORT_EVENTをSupervisor [SUPERVISOR_THREAD_ID]へ送信してください。以前のEVENT_CLAIMEDは新commitを配送しません。pushや無関係な修正はしないでください。
```

## Supervisor claim/transition

```text
EVENT_CLAIMED
event: [YOYAQ_QUEUE_UPDATED_OR_WORKER_REPORT_OR_REVIEW_RESULT]
task_id: [TASK_ID]
commit: [COMMIT]
claimed_from: [THREAD_ID]
transition: [VISIBLE_WORKER_STARTED_OR_FRESH_REVIEW_STARTED_OR_REWORK_RETURNED_OR_STAGING_INTEGRATION_STARTED]
```

受領だけでturnを終えず、transitionを同じturnで実行する。

## Delegated integration completion

通常は監督自身が統合する。例外的に可視integration taskへ委譲した場合だけ使う。

```text
YOYAQ_INTEGRATION_COMPLETED_EVENT
task_id: [TASK_ID]
integration_thread: [THREAD_ID]
report_commit: [REPORT_COMMIT]
integrated_commit: [STAGING_INTEGRATION_COMMIT]
progress_record: [INCLUDED_IN_INTEGRATED_COMMIT]
push: [ORIGIN_STAGING_RESULT]
gates: [FINAL_RESULTS]
next_action: [DEPENDENCY_RELEASE_OR_QUEUE_AUDIT]
```

final前にSupervisorへ明示送信する。passive completionで統合済みと判断しない。
