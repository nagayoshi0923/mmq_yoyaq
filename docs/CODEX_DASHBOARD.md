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
- UI PREVIEWのPO向けURLは、同一Wi-Fi内外の実機から到達できるinternet-reachable HTTPSを必須とする。`localhost`と`192.168.x.x`は内部証拠だけに使い、唯一のPO URLにしない。提示直前に対象routeの外部HTTP 200を確認し、rotation/期限切れ時は再発行・再検証する。proxy/tunnelはPREVIEWに限定しreview後に停止・削除する。staging統合を代替PREVIEWにしない。

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
| `019f779d-7170-7752-a846-37c593cf3ec8` | `/Users/mai/mmq_yoyaq-1` | `8c68d7dc9d28fa844a0041f94d81f666b0f97f2f` | 2026-07-19 12:55 JST |

## Queue

初期キューは空。今後、POの明示GOを受けたsourceが新規タスクを先に追記・commitし、そのcommitを`YOYAQ_QUEUE_UPDATED`で配送してclaim/可視worker確認まで完了させる。

| task ID | title | status | lane | preview | dependencies | worker/review | report commit | staging result |
|---|---|---|---|---|---|---|---|---|
| YOYAQ-001 | キャンセルポリシー共通基盤と予約時スナップショット | DONE | HIGH-RISK | N/A | なし | `019f77fc-8eb6-77a0-b8ba-033a4e9e614a` / `019f782e-f6c6-7f72-9d34-0b7dcaec3565` DONE | `169f33fc64761db9624ed7dabdefff36a930beae` | staging DB `20260719090000`適用・本commitで統合 |
| YOYAQ-002 | 管理設定から顧客向けポリシー表示を動的統一 | REWORK | HIGH-RISK | 必須 / PO OK | YOYAQ-001 | `019f783c-455a-7db2-bf06-c9bae6cbcdd4` / `019f7a1c-829a-7900-92cb-f9a3eb0697fc` REWORK | `ce8977d2c50e0481306bcbb2b1812b870c32e9b8` | 管理設定linkのorganization scope修正中 |
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
| 2026-07-19 11:22 | `YOYAQ_WORKER_REPORT_EVENT` / `EVENT_CLAIMED` | YOYAQ-001 | `169f33fc64761db9624ed7dabdefff36a930beae` | worker `019f77fc-8eb6-77a0-b8ba-033a4e9e614a` の再REPORTをclaim、fresh独立検収 `019f782e-f6c6-7f72-9d34-0b7dcaec3565` 起動（recovered: false） |
| 2026-07-19 11:28 | `YOYAQ_REVIEW_RESULT_EVENT` / `EVENT_CLAIMED` | YOYAQ-001 | `169f33fc64761db9624ed7dabdefff36a930beae` | reviewer `019f782e-f6c6-7f72-9d34-0b7dcaec3565` のDONEをclaim、監督本人がstaging直列統合開始（recovered: false） |
| 2026-07-19 11:32 | `STAGING_DB_APPLIED` | YOYAQ-001 | `20260719090000` | staging DBへmigration 1件を先行適用。追加列11件、trigger 2件、legacy 11547件、pending/incomplete/tenant mismatch各0、未適用migration 0を確認 |
| 2026-07-19 11:37 | `LANE_STARTED` | YOYAQ-002 | `8c68d7dc9d28fa844a0041f94d81f666b0f97f2f` | YOYAQ-001依存解消後、横断棚卸しと画面所有を確定。可視worker `019f783c-455a-7db2-bf06-c9bae6cbcdd4` をPREVIEW-firstで起動（port 5182） |
| 2026-07-19 11:54 | `YOYAQ_SCOPE_REQUEST` / `FILE_APPROVED` | YOYAQ-002 | - | `/:organizationSlug/cancel-policy`の404解消に限り、`src/pages/AdminDashboard.tsx`の2セグメント公開route分岐1件を追加許可。他route/UI変更は禁止 |
| 2026-07-19 11:59 | `YOYAQ_SCOPE_REQUEST` / `FILE_APPROVED` | YOYAQ-002 | - | 通常予約の選択公演store伝播と、貸切複数候補で先頭storeを暗黙採用しないため、`BookingPanel.tsx`、`PrivateBookingScenarioSelect.tsx`、`PrivateBookingRequest/index.tsx`の`BookingNotice`引数だけを追加許可 |
| 2026-07-19 12:06 | `YOYAQ_PREVIEW_READY_EVENT` / `EVENT_CLAIMED` | YOYAQ-002 | - | workerのport 5182 PREVIEWをclaim。公開ポリシー/FAQ/選択店舗付き注意事項と390px表示、console error 0を監督確認。公開RPC未適用のためvisual OK待ち |
| 2026-07-19 12:55 | `YOYAQ_PREVIEW_DELIVERY_CORRECTION` / `EVENT_CLAIMED` | YOYAQ-002 | - | 実機mobile用LAN URL `http://192.168.3.67:5182`を追加し、今後のPREVIEW必須契約へ反映。visual OK未受領、staging/DB統合なし |
| 2026-07-19 12:56 | `YOYAQ_PREVIEW_DELIVERY_CORRECTED` / `EVENT_CLAIMED` | YOYAQ-002 | - | workerがlocalhost/LANの両URLを再配送。server `*:5182`、実装変更なし、PREVIEW_WAITING_VISUAL_OKを維持 |
| 2026-07-19 13:38 | `YOYAQ_PREVIEW_LAN_UNREACHABLE` / `EVENT_CLAIMED` | YOYAQ-002 | - | PO実機Chromeで`ERR_CONNECTION_REFUSED`。visual OK未受領。一時public tunnelは依存download/外部公開を伴うため明示PO承認待ち、staging/DB統合なし |
| 2026-07-19 15:18 | `YOYAQ_PREVIEW_SERVER_RESTART_REQUIRED` / `EVENT_CLAIMED` | YOYAQ-002 | - | PO承認済みlocalhost.run tunnel `https://ab88982db88323.lhr.life`はactiveだがworker server停止。exact worktree/未commit実装を`0.0.0.0:5182`で再起動指示、visual OK待ち |
| 2026-07-19 15:20 | `YOYAQ_PREVIEW_SERVER_RESTARTED` / `EVENT_CLAIMED` | YOYAQ-002 | - | worker Vite PID 69220、TCP `*:5182`復旧。localhost policy/FAQ HTTP 200、実装差分変更なし |
| 2026-07-19 15:20 | `YOYAQ_PREVIEW_TUNNEL_HOST_BLOCKED` / `EVENT_CLAIMED` | YOYAQ-002 | - | tunnel hostがViteで403拒否。product/vite.configを変えず、exact hostだけを`__VITE_ADDITIONAL_SERVER_ALLOWED_HOSTS`で許可してserver再起動指示。wildcard禁止 |
| 2026-07-19 15:22 | `YOYAQ_PREVIEW_TUNNEL_DOMAIN_ROTATED` / `EVENT_CLAIMED` | YOYAQ-002 | - | localhost.run現行domain `52f2b8a3f03ecc.lhr.life`がVite到達/host-block 403であることを確認。旧domainを廃止し、現行完全一致hostだけでVite再起動指示。重複tunnelは終了 |
| 2026-07-19 15:24 | `YOYAQ_PREVIEW_HOST_ENV_UNSUPPORTED` | YOYAQ-002 | - | Vite 5.4.21実装に指定envの参照がなく、PID 75094でも現行domainは403。repo/product無変更・wildcardなしの`/tmp`一時configでexact allowedHostsを渡す代替案をPO承認待ち |
| 2026-07-19 15:26 | `YOYAQ_PREVIEW_PUBLIC_READY` | YOYAQ-002 | - | Node標準のlocalhost-only proxy `127.0.0.1:5183 -> 127.0.0.1:5182`でHostだけを`localhost:5182`へ書換え、新tunnel `https://b826920a8b3afe.lhr.life`を確立。外部policy/FAQ各HTTP 200、repo/config/依存変更なし |
| 2026-07-19 15:34 | `YOYAQ_PREVIEW_PUBLIC_URL_REPLACED` / `EVENT_CLAIMED` | YOYAQ-002 | - | PO実機でlocalhost.run URL到達不能のためCloudflare Quick Tunnel `https://infant-technologies-alternatives-expected.trycloudflare.com`へ差替え。停止していたproxyを再起動し、外部policy/FAQ各HTTP 200を再確認 |
| 2026-07-19 15:35 | `PO_PREVIEW_ACCESS_POLICY_UPDATED` / `EVENT_CLAIMED` | UI PREVIEW共通 | - | PO向けはinternet-reachable HTTPS必須、localhost/LANは内部証拠のみ。提示直前の外部HTTP 200、URL rotation再発行、review後停止、staging代替禁止を恒久契約化 |
| 2026-07-19 15:36 | `YOYAQ_PREVIEW_URL_EXPIRED` | YOYAQ-002 | - | 提示直前再検証で現Cloudflare全4routeがHTTP 530、Vite 5182停止を検知。無効URLは未提示。worker server再起動とQuick Tunnel再発行を要求、proxy 5183は維持 |
| 2026-07-19 15:38 | `YOYAQ_PREVIEW_CLOUDFLARE_REISSUED` / `EVENT_CLAIMED` | YOYAQ-002 | - | 新Cloudflare Quick Tunnel `https://schemes-seminar-velocity-twin.trycloudflare.com`をclaim。公開ポリシー/FAQ/予約導線/管理設定の全4routeを外部HTTPSでHTTP 200再検証。Vite PID 89034 (`*:5182`)・localhost-only proxy PID 86547 (`127.0.0.1:5183`)を確認し、visual OK待ちを維持 |
| 2026-07-19 16:13 | `YOYAQ_VISUAL_CORRECTION` / `EVENT_CLAIMED` | YOYAQ-002 | - | POから「予約画面内でキャンセルポリシーを確認したい」と修正指示。初期コンパクトな展開UIで共通`CancellationPolicyView`と選択店舗のcurrent settingsを再利用し、正規ページへの店舗付きリンクは補助導線として維持するPREVIEW再作業を同じworkerへ返却。通常は`selectedEvent.store_id`、貸切は単一店舗だけを特定し、複数/未確定時に先頭店舗を暗黙採用しない。commit/gate/DB/staging/mainは保留 |
| 2026-07-19 16:23 | `YOYAQ_PREVIEW_READY_EVENT` / `EVENT_CLAIMED` | YOYAQ-002 | - | visual correctionの未commit実装をclaim。公開HTTPS `https://schemes-seminar-velocity-twin.trycloudflare.com`のpolicy/FAQ/通常予約fixture/設定を全4route HTTP 200再検証。監督ブラウザでdesktop/mobile 390pxの初期コンパクト/展開、通常・貸切共通View、store付き正規リンク、貸切複数店舗の非暗黙選択案内、横overflow 0、console error/warning 0を確認。worker報告のmobile展開/貸切画像2点は保存先に存在せず証拠採用せず、監督直接確認で補完。visual OK待ち、commit/gate/DB/staging/mainは保留 |
| 2026-07-19 17:29 | `YOYAQ_VISUAL_OK` / `EVENT_CLAIMED` | YOYAQ-002 | - | POが公開PREVIEWの予約画面内compact展開、共通open/private表示、選択店舗link、貸切複数店舗の非暗黙選択、policy/FAQ/scenario/settings desktop/mobileを承認。同workerを最終gate・完全diff監査・1commit・WORKER_REPORTへ遷移。HIGH-RISK fresh独立検収必須。DB先行適用前のためstaging統合なし、main/本番は変更禁止。一時tunnel/proxyは終了へ移行 |
| 2026-07-19 17:30 | `YOYAQ_PREVIEW_TUNNEL_STOPPED` / `EVENT_CLAIMED` | YOYAQ-002 | - | Cloudflare tunnel session 50659終了、metrics `127.0.0.1:20241` listenerなし、旧公開URL HTTP 530を確認。localhost-only proxy `127.0.0.1:5183`もlistenerなし、一時script削除済み。repo/config/DB/staging/main変更なし |
| 2026-07-19 20:10 | `YOYAQ_CONTINUE` / `EVENT_CLAIMED` | YOYAQ-002, YOYAQ-003 | - | POの「じゃあ進めて」を明示継続としてclaim。中断したYOYAQ-002 FINAL_GATESをrecovery監査し、worker HEADはexact base `8c68d7dc9d28fa844a0041f94d81f666b0f97f2f`、同branch/worktree、承認済み15 modified + 6 untracked、未commit、port 5182停止済み、diff check PASSを確認。同workerを残りgate・完全diff監査・1commit・REPORTへwake。`origin/staging`は`8c68d7dc...`、監督checkoutの未push user/Claude commit `79963dbf...`とdirty smokeを別所有として保存し自動配送へ吸収しない。002 DONE後はDB先行統合し、003をPREVIEW-firstで自動開始 |
| 2026-07-19 20:10 | `YOYAQ_002_FINAL_GATES_RESUMED` | YOYAQ-002 | - | 同worker `019f783c-455a-7db2-bf06-c9bae6cbcdd4`へ明示resume message送信成功、status `active` / turn `inProgress`を確認。worktree `/Users/mai/.codex/worktrees/2621/mmq_yoyaq-1`、branch `codex/yoyaq-002-dynamic-cancellation-policy`、base/HEAD `8c68d7dc...`。残りgateはverify、unit、design-token、JST、multi-tenant base増分、org-scope、diff check、RPC/migration/SQL安全監査、1commit、REPORT |
| 2026-07-19 20:22 | `YOYAQ_WORKER_REPORT_EVENT` / `EVENT_CLAIMED` | YOYAQ-002 | `ce8977d2c50e0481306bcbb2b1812b870c32e9b8` | worker REPORTをclaim。exact baseから1commit、承認済み22ファイル、worktree clean。verify、unit 15 files/157 tests、design/JST、org-scope -1、multi-tenant増分0、diff/RPC mirror/SQL静的監査PASS。SQL実行は安全なmigration適用済みdisposable DB不在のためNOT RUN。fresh HIGH-RISK独立検収 `019f7a1c-829a-7900-92cb-f9a3eb0697fc` を別worktreeで起動 |
| 2026-07-19 20:34 | `YOYAQ_REVIEW_RESULT_EVENT` / `EVENT_CLAIMED` | YOYAQ-002 | `ce8977d2c50e0481306bcbb2b1812b870c32e9b8` | reviewer `019f7a1c-829a-7900-92cb-f9a3eb0697fc` のREWORKをclaim。SQL/tenant/security/verify/unit/design/JST/org-scope/multi-tenantはgreen。`/settings?tab=cancellation`では組織slugが取れず、公開linkが`/cancel-policy?store=...`へ落ちるMid 1件を同workerへ返送。認証済みorganization slugから組織scope付きlinkを生成し、slug不明時はstore queryだけを付けない防御と回帰testを要求 |
| 2026-07-19 20:41 | `YOYAQ_WORKER_REPORT_EVENT` / `EVENT_CLAIMED` | YOYAQ-002 | `236ee32d8f60e842e0763f519d885d398f92d365` | 同workerのREWORK REPORTをclaim。前REPORTから承認済み3ファイルだけを変更し、認証済みorganization slugで管理設定の公開linkを組織scope付きに修正、slug不明時はstore queryを破棄。targeted 4 tests、verify、unit 15 files/157 tests、diff/show checkがPASS、worktree clean。前回とは別のfresh独立検収 `019f7a2d-ffd9-7361-b14a-2a739599834a` をworktree `/Users/mai/.codex/worktrees/86de/mmq_yoyaq-1`で起動（recovered: false） |
| 2026-07-19 20:50 | `YOYAQ_REVIEW_RESULT_EVENT` / `EVENT_CLAIMED` | YOYAQ-002 | `236ee32d8f60e842e0763f519d885d398f92d365` | fresh reviewer `019f7a2d-ffd9-7361-b14a-2a739599834a` のDONEをclaim。REWORK 3ファイルと累積22ファイル、targeted 4 tests、verify、unit 15/157、multi-tenant増分0、org-scope 1件改善、design増分なし、JST、diff/show、RPC権限・tenant・PII・DB-first契約がgreen。staging DBへmigration/RPC先行適用を開始（recovered: false） |
| 2026-07-19 20:50 | `DB_APPLIED` / `INTEGRATED` | YOYAQ-002 | `41d76c1e` → `997f62f8` | staging DBへ`20260719140000`を先行適用。migration履歴、SECURITY DEFINER/search_path/ACL、anon RPC 12店舗、明示店舗1件、別組織/inactive店舗0件、返却列の非PIIを確認後、review済み2commitを最新`origin/staging=8c68d7dc...`へ直列統合。既知remote-only `20260717100000`は同一SHA-256 blobをCLI履歴照合へ一時配置しただけで再適用・commitせず削除。main/production変更なし |
| 2026-07-19 20:53 | `LANE_STARTED` | YOYAQ-003 | `4d9da2747e7cbb959c7f3a6b878509b18f4e8cf6` | YOYAQ-001/002依存解消後、可視PREVIEW-first worker `019f7a38-e35c-7fd0-83dd-37d7df446707` を隔離worktree `/Users/mai/.codex/worktrees/0f0d/mmq_yoyaq-1`、branch `codex/yoyaq-003-private-cancellation-flow`、port 5184で起動。MyPage貸切詳細、主催者認可、snapshot料金/期限、API原子取消、メール/通知整合だけを所有し、PO確認は外部HTTPS PREVIEW準備後（recovered: false） |
| 2026-07-19 21:02 | `YOYAQ_SCOPE_REQUEST` / `FILE_APPROVED` / `EVENT_CLAIMED` | YOYAQ-003 | - | workerの横断棚卸しとstaging live関数監査をclaim。MyPage/API/予約・貸切確認メール/取消Edgeの既存15ファイル、環境非依存pure core、既存3取消RPCの正規mirror＋migration、transaction SQL testの新規4ファイルを追加許可。PrivateGroup画面はread-onlyのまま、RLS・公開policy RPC・無関係設定は変更禁止。顧客判定は信頼済みDB/auth状態、client申告料金は不採用、group取消＋system messageは同一transaction、既存signature/GRANT/戻り値維持。PREVIEW-first、workerのDB/Edge apply・deploy・staging/main/pushは禁止（recovered: false） |
| 2026-07-19 21:27 | `YOYAQ_PREVIEW_READY_EVENT` / `EVENT_CLAIMED` | YOYAQ-003 | - | workerの未commit PREVIEWをclaim。監督所有Cloudflare HTTPS `https://bedding-susan-estates-healing.trycloudflare.com`について、`/`、`/mypage`、`/mypage/reservation/preview-yoyaq-003`を提示直前に外部HTTP 200再確認。desktop 1280px/mobile 390px overflowなし、console error/warnなし、pure core対象unit 11/11、frontend eslint 0 error、diff check、RPC/migration mirrorはworker確認。安全な既存signed-in session/fixtureはなく、POが既存アカウント・既存予約で主催者/一般メンバーと期限状態を送信せず確認する。PREVIEW_WAITING_VISUAL_OK、commit/final gate/DB/Edge/staging/mainは保留（recovered: false） |
| 2026-07-19 22:01 | `YOYAQ_VISUAL_CORRECTION` / `EVENT_CLAIMED` | YOYAQ-003 | - | POの「stagingでしか認証できず、HTTP 200 SPA shellだけでは実画面確認不能」をclaim。PREVIEW_WAITING_VISUAL_OK→PREVIEW_REWORK。同workerへ、public HTTPS上で認証不要・実データ非使用・送信不能・production build/runtime非公開のdev/PREVIEW-only fixtureを返却。主催者貸切詳細＋ConfirmDialog、一般メンバーの全体取消非表示、期限前、期限後/開演後、通常予約snapshotを切替または個別routeで表示し、desktop/mobile 390px、console/overflow、外部HTTPSで内容まで直接検証する。追加ファイルは編集前scope request必須。commit/final gate/DB/Edge/staging/mainは保留（recovered: false） |

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
- **status/lane:** DONE / HIGH-RISK（migration、予約金額、日付・締切、既存予約互換）
- **scope:** 優先度P0。Exact base `4371ba19225351832b656cc2c851f3d8047bd2f1`。予約時点の店舗・公演種別・受付期限・料率・料金基準・ポリシー更新時点を予約へスナップショット保存し、管理設定変更を既存予約へ遡及適用しない。既存予約は安全な互換方針を明記する。オープン/貸切を同じ純粋計算基盤で扱い、JSTの開演境界、0時間、7日/3日、50%/100%、金額丸めを対象テストで固定する。`reservation_settings`と`reservations`の正規schema、必要なmigration/API/型/共通ロジック/対象テストだけを許可し、RLS直接変更は禁止。REWORK指摘1のDB trigger再現に限り、`supabase/tests/yoyaq_001_cancellation_policy_snapshot_test.sql`を追加許可する。テストはBEGIN/ROLLBACKの使い捨てlocal DB専用で、staging/prod実行は禁止。migration全文、既存データ影響、rollback/互換方針、確認queryを提示し、staging DB適用は監督のDB先行手順に従う。実装gate: `npm run verify`、`npm run db:check`、`npm run test:unit`、`npm run check:cancellation-rpcs`、`npm run check:jst-date`、`npm run check:multi-tenant`、`git diff --check`。独立検収必須。
- **worker:** task `019f77fc-8eb6-77a0-b8ba-033a4e9e614a`、worktree `/Users/mai/.codex/worktrees/52f9/mmq_yoyaq-1`、branch `codex/yoyaq-001-cancellation-policy-snapshot`、base `4371ba19225351832b656cc2c851f3d8047bd2f1`、port N/A（非UI）
- **PREVIEW:** N/A（非UI）
- **REPORT:** commit `169f33fc64761db9624ed7dabdefff36a930beae`、前REPORT `704de5280506e197d82904b0af26a48bff88d3df` から承認済みSQL test 1ファイルだけを変更し、累積許可範囲は10ファイルのまま。tenant不一致のstore変更UPDATE、organization変更UPDATEを23514で拒否し失敗後の行全体/snapshot/store/org不変をassert。INSERT triggerをtransaction内だけ無効化してlegacy NULL snapshotを再現し、無関係UPDATE成功とsnapshot 7列不変をassert。diff check、1ファイルscope、実装/migration差分ゼロ、SQL構造監査はPASS。multi-tenantはbase/currentとも既知136件で増分0。SQL testはmigration適用済みの安全な使い捨てlocal DBがなくNOT RUN。実装本体未変更のため前REPORTのverify/db:check/unit 153件/cancellation RPC/JST green証拠を継承。DB適用/Edge deploy/staging・main統合/pushなし。
- **review:** task `019f782e-f6c6-7f72-9d34-0b7dcaec3565`、DONE。exact state、REWORK delta 1ファイル、累積10ファイル、diff/show check、SQL静的監査、multi-tenant増分0を確認。前回green証拠は実装/migration/schema/TS/unit差分0のため継承。追加3経路は23514、失敗後の行/snapshot不変、legacy無関係UPDATE成功を満たし、指摘なし。SQL testは安全なmigration適用済み使い捨てlocal DBがなくNOT RUN。
- **integration:** 監督checkoutでreview済みchain `e5e4d13ee6c67fc21c737392cb26034715eda6db` → `704de5280506e197d82904b0af26a48bff88d3df` → `169f33fc64761db9624ed7dabdefff36a930beae` を`--no-commit`直列適用し、10ファイルのblobがreview targetと完全一致。`verify` PASS（lint 57 warnings・0 errorsを含む）、unit 14 files/153 tests、JST、diff check、db:check PASS、multi-tenantは既知136件・増分0。staging DBへ`20260719090000`だけを先行適用し、適用済み471件・未適用0、追加列11件、trigger 2件、function存在、legacy 11547件、pending 0、incomplete 0、snapshot/reservation tenant mismatch各0を確認。remote適用済みだがstaging未統合の`20260717100000`は同一remote blobをCLI履歴照合へ一時使用しただけで、再適用・commitせず削除済み。本commitを`origin/staging`へpushし、main/本番DB/本番deployは変更しない。
- **PO check:** 非UIのため画面確認不要。staging DB確認queryで追加列・trigger・migration履歴、pending/incomplete/tenant mismatch各0を確認済み。次のYOYAQ-002/003で顧客向け表示と予約後動線をPREVIEW-firstで確認する。

### YOYAQ-002: 管理設定から顧客向けポリシー表示を動的統一

- **GO/source:** 同上。source task `019f77bb-e598-78e0-b0e9-f301d3626e89`。
- **status/lane:** DONE / HIGH-RISK（PO visual OK・fresh独立再検収DONE・staging DB先行適用/確認・直列統合完了）
- **scope:** 優先度P1、YOYAQ-001のstaging統合後に着手。MMQ管理サイトのキャンセル設定を唯一の正とし、保存後に公開キャンセルポリシー、組織FAQまたはポリシー誘導、通常/貸切予約確認、管理画面プレビュー、最終更新日へ動的反映する。着手前にキャンセルポリシー・締切・手数料・キャンセル方法のハードコードをリポジトリ全体で`rg`等により全件棚卸しし、FAQ/よくある質問、注意事項・利用規約・キャンセルポリシー、予約フォーム/確認/完了、マイページ予約詳細/キャンセルダイアログ、貸切関連ページ、顧客向けメール/通知、料金・期限判定、API/RPCを確認する。各ヒットを「動的化」「正当な固定文言」「対象外」に分類し根拠をREPORTへ残し、動的化対象は調査だけで終えず同一の管理設定またはYOYAQ-001予約時snapshotへ接続する。FAQは条件をDBコンテンツへ重複保持せず、共通動的表示または正規ページへの明示リンクを使い、注意事項その他の顧客ページにある条件も共通表示へ置換する。organization_id/store scopeを維持し、予約文脈では予約店舗と既存予約snapshotを必ず使用して後日の設定変更を遡及させない。複数店舗で設定が異なる場合は店舗を誤認させない。通常/貸切の料金基準と期間を読みやすく表示し、既存の顧客向けスクエアブランド外観を維持する。棚卸し結果から許可ファイルと画面所有を確定し、キャンセルポリシー関連以外の設定棚卸しへ拡張しない。対象ページ/フック/共通表示部品/対象テストと`docs/IMPROVEMENT_HANDOFF.md`の本タスク記録だけを許可し、公演モーダル・公演カードは変更禁止。管理画面変更から公開ページ群、予約済み顧客画面、メール/APIまでの整合をテストする。PREVIEW-first。PO visual OK後の実装gate: `npm run verify`、`npm run test:unit`、`npm run check:design-tokens`、`npm run check:jst-date`、`npm run check:multi-tenant`、`npm run check:org-scope`、`git diff --check`。独立検収必須。
- **inventory/ownership:** `rg`横断棚卸しにより、002は現在設定の公開表示を所有する。動的化対象は`CancelPolicyPage`のadmin-only RLS直SELECT・先頭店舗選択・固定料率説明、`FAQPage`の固定3日前/前日/当日条件、`BookingConfirmation`の固定中止判定説明とrootリンク、共通`BookingNotice`の正規ポリシー誘導、`Footer`/`LegalPage`のorganization scope付き正規リンク、`CancellationSettings`の料金基準/公開プレビュー、公開専用最小RPC。`reservation_settings`全体のanon SELECT policyは追加せず、active organization/storeへ絞った`SECURITY DEFINER` RPCを使う。正当な固定文言は「各店舗ポリシーに従う」等の条件を持たない誘導、対象外は汎用キャンセルボタン、24時間オンライン予約、waitlist期限、無関係な料金設定。予約済みsnapshot、MyPage、固定24時間API判定、通常/貸切確認・キャンセルメール/通知は003所有として編集禁止。`PrivateBookingRequest`は共通`BookingNotice`経由で正規誘導し、任意DB本文は自動改変しない。
- **allowed files:** 既存は`src/pages/static/{CancelPolicyPage,FAQPage,LegalPage}.tsx`、`src/pages/BookingConfirmation/index.tsx`、`src/pages/ScenarioDetailPage/components/BookingNotice.tsx`、`src/components/layout/Footer.tsx`、`src/pages/Settings/pages/CancellationSettings.tsx`と`cancellationSettings/*`、必要最小限の`src/constants/cancellationPolicyDefaults.ts`/`src/lib/publicBookingPath.ts`、`docs/IMPROVEMENT_HANDOFF.md`。`/:organizationSlug/cancel-policy`の明示route分岐1件に限り`src/pages/AdminDashboard.tsx`を追加許可する。`BookingNotice`へのstore伝播だけに限り`src/pages/ScenarioDetailPage/components/BookingPanel.tsx`、`src/pages/PrivateBookingScenarioSelect.tsx`、`src/pages/PrivateBookingRequest/index.tsx`を追加許可し、貸切複数店舗時はnullとして店舗別公開表示へ委ねる。新規は公開ポリシーAPI/hook 1件、共通表示component 1件、対象test、`supabase/rpcs/get_public_cancellation_policy.sql`、YOYAQ-002 migration 1件、`supabase/tests/yoyaq_002_public_cancellation_policy_test.sql`。追加はscope request必須。
- **worker:** task `019f783c-455a-7db2-bf06-c9bae6cbcdd4`、worktree `/Users/mai/.codex/worktrees/2621/mmq_yoyaq-1`、branch `codex/yoyaq-002-dynamic-cancellation-policy`、base `8c68d7dc9d28fa844a0041f94d81f666b0f97f2f`、port 5182
- **PREVIEW:** PO visual OK受領。承認範囲は、予約画面内compact展開、共通`CancellationPolicyView`の通常/貸切条件、選択店舗付き正規link、貸切複数店舗の非暗黙選択、policy/FAQ/scenario/settingsのdesktop/mobile。提示直前に公開4route HTTP 200、mobile 390pxの横overflow 0、console error/warning 0を監督確認済み。worker報告のmobile展開/貸切画像2点は保存先に存在しないため証拠採用せず、監督の公開PREVIEW直接確認で補完した。公開RPC/migrationは未適用。visual OK後は同workerの最終gate・REPORTへ進み、fresh独立検収DONE後にDB先行でstagingへ統合する。Cloudflare tunnel、localhost-only proxy、proxy一時scriptは終了・削除済み。
- **REPORT:** initial commit `ce8977d2c50e0481306bcbb2b1812b870c32e9b8`＋REWORK commit `236ee32d8f60e842e0763f519d885d398f92d365`。累積は承認済み22ファイルのまま。REWORK差分は`CancellationSettings.tsx`、`publicBookingPath.ts`、`publicCancellationPolicy.test.ts`の3ファイル、9 insertions/5 deletionsのみ。認証済み`useOrganization()`のslugから`/{organizationSlug}/cancel-policy?store={storeId}`を生成し、slugがnull/空ならstore queryを付けず`/cancel-policy`へ防御。targeted 4 tests、`npm run verify`、unit 15 files/157 tests、diff/show check、RPC/migration mirrorがgreen。worktree clean、DB/staging/main/push未実施。
- **review:** first fresh HIGH-RISK task `019f7a1c-829a-7900-92cb-f9a3eb0697fc` はREWORK。SQL/tenant/securityと全gateはgreenで、管理設定linkのorganization scope欠落Mid 1件だけを指摘。同worker修正後、別fresh task `019f7a2d-ffd9-7361-b14a-2a739599834a` がexact target `236ee32d8f60e842e0763f519d885d398f92d365`をDONE。REWORK exact 3 files、累積22 files、targeted 4 tests、verify、unit 15/157、multi-tenant base/current 136/136、org-scope 163→162、design増分なし、JST、diff/show、RPC権限・tenant/PII/DB-first契約を確認。SQL integration testはmigration適用済みdisposable local DBがなくNOT RUN。
- **integration:** staging DBへ`20260719140000_get_public_cancellation_policy.sql`をfrontendより先に適用。migration履歴1件、関数`SECURITY DEFINER`、`search_path=public`、ACLはpostgres/anon/authenticatedのみ、Queens Waltz active 12店舗・設定12件、明示店舗1件、別組織/inactive店舗0件、anon RPC 12件を確認。返却契約は組織/店舗表示名とポリシー項目だけで顧客PII・決済情報なし。review targetとtree完全一致の統合commit `41d76c1e`、REWORK commit `997f62f8`を最新`origin/staging=8c68d7dc9d28fa844a0041f94d81f666b0f97f2f`へ直列適用し、dashboard監督記録を同pushへ含める。main/productionは変更しない。
- **PO check:** desktop/mobileで①予約サイト`/:organizationSlug/cancel-policy`を開き通常/貸切の期限・料金基準・料率と店舗名を確認、②FAQのキャンセル回答から同ページへ進めることを確認、③シナリオ予約画面の「キャンセルポリシーを確認」を展開し画面内表示と選択店舗付き「公開ページで確認」を確認、④管理画面「設定 > キャンセル設定」で店舗を選び公開プレビューと組織scope付きlinkを確認する。管理画面で保存する場合は、公開ページ群の内容と最終更新日が同じ設定へ変わり、別店舗/別組織の条件が混入しなければOK。`OK / 修正点`を返信する。

### YOYAQ-003: マイページ貸切キャンセル動線・料金表示・API検証

- **GO/source:** 同上。source task `019f77bb-e598-78e0-b0e9-f301d3626e89`。
- **status/lane:** PREVIEW_REWORK / HIGH-RISK（認証不要・実データ非使用・送信不能・production非公開のPREVIEW-only fixtureを同workerで作成中）
- **scope:** 優先度P2、YOYAQ-001/002のstaging統合後に着手。002の横断棚卸し結果を引き継ぎ、マイページ予約詳細/キャンセルダイアログ、貸切関連ページ、顧客向けメール/通知、料金・期限判定、API/RPCの各ヒットを「動的化」「正当な固定文言」「対象外」に分類した根拠と対応をREPORTへ残す。貸切主催者が「マイページ > 予約 > 貸切」から予約詳細とキャンセル確認へ進める動線を追加する。通常/貸切とも予約スナップショットから受付可否と現在のキャンセル料・金額を表示し、開演後は顧客操作を画面/API双方で拒否する。一般メンバーには貸切全体キャンセルを出さない。顧客キャンセルは予約と貸切グループを既存の原子処理で同期し、メール・GM通知・キャンセル待ち通知を維持する。スタッフ起点の店舗都合キャンセルは顧客期限で阻害しない。キャンセルメールの固定24時間計算を同じスナップショット計算へ統一し、表示・メール・APIの期限/料率/金額/可否を同じ正へ接続する。organization_id/store scopeを維持し、既存予約は後日の設定変更ではなく予約時snapshotを使う。キャンセルポリシー関連以外の設定棚卸しへ拡張しない。対象MyPage/PrivateGroup/API/reservationApi/メール連携/対象テストと`docs/IMPROVEMENT_HANDOFF.md`の完了記録だけを許可。PREVIEW-first。PO visual OK後の実装gate: `npm run verify`、`npm run test:unit`、`npm run check:cancellation-rpcs`、`npm run check:security-guardrails`、`npm run check:jst-date`、`npm run check:multi-tenant`、`npm run check:org-scope`、`npm run build`、`git diff --check`。独立検収必須。
- **allowed files:** 既存は`src/pages/MyPage/hooks/useMyPageDataQuery.ts`、`src/pages/MyPage/components/ReservationsTab.tsx`、`src/pages/MyPage/hooks/useReservationDetailQuery.ts`、`src/pages/MyPage/pages/ReservationDetailPage.tsx`、`src/lib/reservationApi.ts`、`src/lib/cancellationPolicy.ts`、`src/lib/cancellationPolicy.test.ts`、`src/constants/cancellationPolicyDefaults.ts`、`src/lib/templateRegistry.ts`の予約/貸切確定template該当箇所、`api/reservations.ts`、`supabase/functions/send-cancellation-confirmation/index.ts`、`supabase/functions/send-booking-confirmation/index.ts`、`supabase/functions/send-private-booking-confirmation/index.ts`、`supabase/functions/process-booking-email-queue/index.ts`、visual OK後の最終REPORT時だけ`docs/IMPROVEMENT_HANDOFF.md`。新規は`supabase/functions/_shared/cancellation-policy.ts`、`supabase/rpcs/customer_cancellation_policy_guard.sql`、`supabase/migrations/20260719220000_enforce_customer_cancellation_snapshot.sql`、`supabase/tests/yoyaq_003_customer_cancellation_policy_test.sql`。pure coreは環境API/Supabase client/副作用を持たず既存export・値・契約を維持し、`src`へ逆importしない。3取消RPCは信頼済みDB/auth状態でcustomer/staffを判別し、customerだけsnapshot期限・開演後を拒否、貸切はlocked transaction内のjoined organizerを必須とする。staff/admin bypassは顧客期限だけに限定する。client申告`cancellationFee`は信用せずserver snapshotから計算し、group取消とsystem messageを同一transactionで1件だけ作成する。既存signature/GRANT/戻り値、tenant整合、cancelled event参加人数を維持し、migration/RPC mirrorを完全一致させる。PrivateGroup関連画面、RLS、公開policy RPC、check-performance/waitlist、無関係設定は変更禁止。追加は再scope request必須。
- **worker:** task `019f7a38-e35c-7fd0-83dd-37d7df446707`、worktree `/Users/mai/.codex/worktrees/0f0d/mmq_yoyaq-1`、branch `codex/yoyaq-003-private-cancellation-flow`、base `4d9da2747e7cbb959c7f3a6b878509b18f4e8cf6`、port 5184
- **PREVIEW:** `PREVIEW_REWORK`。初回公開HTTPSは3route HTTP 200だったが、PO accountはstagingでしか認証できず、guest/route shellでは変更後のデータ依存UIを視覚検証できないため不採用。同じworkerが、認証不要・実顧客データ/session/service role/DB/API送信を使わず、production build/runtimeでは露出しない明示guard付きPREVIEW-only fixtureを作る。fixtureは主催者の貸切詳細＋キャンセル確認dialog、一般メンバーの全体取消非表示、期限前、期限後/開演後、通常予約snapshotを切替または個別routeで確認可能にする。desktop/mobile 390px、console/overflowと、外部HTTPS上でSPA shellではなく実画面内容を監督確認した後だけ再提示する。現行tunnelはrework中として維持し、visual OK前は未commit、final gate/REPORT/DB/Edge/staging/mainを行わない。
- **REPORT:** 未着手
- **review:** 未着手
- **integration:** 未着手
- **PO check:** 「マイページ > 予約 > 貸切 > 予約詳細」で主催者だけがキャンセルでき、確認画面とメールの料金が公開ポリシーと一致し、キャンセル後に予約・グループ・通知が整合すること。
