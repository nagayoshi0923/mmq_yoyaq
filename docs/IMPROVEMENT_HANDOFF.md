## 2026-10-22 / 管理画面・スケジュール管理が遅い（perf/schedule-network #1211・perf/schedule-render #1212、main 向け hotfix・do-not-merge）

- 計測: 手元 local-repro DB に本番最大組織と同規模の架空組織 perf-org（`scripts/perf/seed-schedule-perf.sql`）。本番の構成（Vercel 関数 iad1・DB 東京）を遅延中継で模して Playwright で計測（`scripts/perf/run-latency-env.sh`・`measure-schedule.mjs`）。記録は Vault 側 `.runtime/性能_スケジュール_計測_2026-10-22.md`。
- 主因 1（判断事項・未対応）: 本番の /api は米国東部（`x-vercel-id: kix1::iad1`）で動き、DB は東京。/api 1 回で DB と 6〜7 往復するので 1 回 1 秒前後。関数を東京（hnd1）相当にした模擬で、キャッシュなしで開く表示まで 6.8 秒 → 2.0 秒。`vercel.json` の `regions` で変えられるが配備設定なので別判断。
- 主因 2（#1211）: 公演データの取得が 4 段の順番待ち、作品の担当を 50 件ずつ直列、同じ取得の重複（org-settings 4・staff 3・組織ID 5）。→ 同時に始める・同時の呼び出しを共有。再読み込みの裏の取得完了 9.0 秒 → 5.0 秒、キャッシュなしの表示 4.9 秒 → 2.4 秒。
- 主因 3（#1212）: 公演の開閉で表全体（セル 657・カード 393）を描き直し（setSearchParams の作り直し）、月移動でシフトが遅れて届き全セルを描き直し。→ 参照を固定・シフトの先読み。
- 残り（提案）: auth/v1/user が初期表示で 7〜14 回（getCurrentOrganizationId などが毎回 getUser）、/api の認証で DB を 3 回直列（api/_lib/auth.ts）、先読み 7 か月分が同じ「公演の無い確定貸切」を 7 回取る、絞り込みは表全体の描き直しが必要（約 60ms・開発版）。保存経路の通信回数は GM 担当 #1210。

## 2026-10-22 / 公演の登録で GM 名が消える・登録が重い（社長報告、hotfix/gm-name-lost、main 向け PR #1210・do-not-merge）

- 報告: 「シナリオを登録した時に重いのと、GM なしの状態の反映が優先されて、GM 名が消える」。具体例なし。対象は公演の追加（スケジュールのセル → 公演ダイアログ → 保存）。作品マスターの登録（シナリオ編集ダイアログ）は schedule_events の担当を書かないため別経路で、今回は未調査。
- 隔離再現（単体試験、修正前で失敗を確認）: (1) `useEventSave.ts` の追加経路は、公演を担当空で作成した直後に表示を保存結果（担当空）へ置き換え、履歴スナップショット取得の往復を待ってから担当を別 RPC で保存していた → その間 GM 名が消えて見える。(2) Realtime の再取得が担当保存より前に始まり後から届くと、保存後の GM 表示を空で上書きする。さらに `useScheduleData.ts` は「取得中なら通知をスキップ」していたため、担当保存の通知を取りこぼし、GM 空の表示が再読み込みまで残る。
- 否定した候補: 公演ダイアログの initForm が編集中に差し替わる件（追加中はダイアログが前面で他の公演を開けない。仮 ID の公演を開く経路は既存の expectedStaff の競合保護で上書き保存されない）。二重保存（isSavingRef・重複警告の続行ガードあり）。DB 側で担当が消える経路は見つからなかった（作成時の引き金は担当を変えない）。ただし担当の保存自体の失敗（同名なし・ロック待ちなど 409）は画面で警告のうえ担当空で残る（従来どおり）。
- 本番の読み取り（21 日間・手入力の公演作成 247 件）: 作成から担当保存まで中央値 1.9 秒。作成後 15 秒〜4 分してから担当を初めて入れ直した公演が 34 件（同じ利用者が作成直後に入れ直している）。作成時に GM を入れていたかは DB に残らないため、実際の担当消失か入力順の運用かは区別できない。
- 修正（初版。DB 変更なし。下の追記で DB 変更あり）: 追加経路で担当保存が終わるまで入力した GM を表示し続け、保存失敗時は DB の値（空）に戻す。作成履歴（差分を持たない）は保存の完了を待たない。GM もスタッフ参加も無い追加では何も変えない担当同期 RPC を呼ばない。月の一覧の取得中に画面側の書き換えがあったら古い取得結果を採用せず取り直す（`createScheduleMonthQueryFn`）。Realtime 通知は取得中でも捨てず、取得完了後に取り直す（`scheduleRealtimeRefetch.ts`）。
- 往復（保存ボタンから閉じるまでの順番待ちの通信）: GM あり 5 → 4、GM 未指定 5 → 3。担当同期 RPC 自体は手元 DB で 3〜13 ms（DB 処理は軽く、重さは往復の数）。
- 確認: vitest 全件（347 ファイル・2458 件）、`npm run verify`、`check:design-tokens`。staging・本番の DB・配備には触れていない（本番は SELECT のみ）。
- 未検証: 実ブラウザでの体感時間、他の利用者の同時編集時の表示、編集経路（今回は変更なし。編集時も履歴スナップショットを待ってから担当を保存している）。
- 追記（Codex 独立レビュー 12c4514 の NG 4 件を補修）:
  P1 作成と担当が別取引のままで、担当保存の失敗を「成功」扱いにしていた → migration `20261022010000_create_schedule_event_with_staff`（rollback 同名）で、公演の作成と既存の `sync_event_staff_participations` を 1 つの取引で実行する関数を追加。API の作成（`api/_lib/schedule/create.ts`）は担当付きのときだけこの関数を担当者の権限で呼ぶ。失敗したら公演は作られず、画面は保存失敗として入力を残す。GM 未指定は従来の INSERT のまま。権限・二重保存の防止・expectedStaff の競合検知・定員の規則は既存の同期関数のまま。手元 DB の本文 md5 `f9c6bee5a83d31b790f1969a081ebbad`（`expected-function-overrides.json` に追加）。
  P2-1 保存中の再取得で表示が消える → 作成の応答待ちの公演（入力した GM を含む）を取り直しの結果にも残す（`holdPendingScheduleEvent`）。応答前に実 ID が届いていても二重に並べない。
  P2-2 先読みが保護を通らない → `usePrefetch.ts`・`useScheduleData.ts` の先読みも `createScheduleMonthQueryFn` に統一。
  P2-3 競合失敗時に他端末の GM 表示を作成時の空へ戻す → 担当保存が作成と一体になり、失敗時は仮表示を外すだけ（他の公演の表示に触れない）。
  隔離試験: 手元 DB の 1 つの取引の中で migration を当て、`supabase/tests/create_schedule_event_with_staff.sql`（11 項目。修正前の 2 段で GM 空の公演が残ることの再現を含む）と test:rpcs の既存 13 本を通し、rollback → 再適用 → 再試験まで行って最後に取り消し（関数は残っていないことを確認）。
  前後比較: 新しい単体・API 試験のうち 12 件が補修前のコードで失敗、補修後に合格。vitest 全件 348 ファイル・2471 件、`npm run verify`、`check:design-tokens`、`check:migration-rollbacks` 合格。本番・staging の DB には当てていない。
- 追記（Codex 再レビュー 2e24bbf の追加 NG 4 件と試験配線）:
  1 仮 ID と実 ID の二重表示 → 取り直しの結果に、表示中には無かった同じ枠（日付・店舗・開始時刻・作品）の公演が届いたら仮を残さない（前からある同じ枠の別公演では仮を消さない）。
  2 遅い作成応答が同じ実 ID の他端末更新を上書き → 応答時に同じ実 ID の行が既にあれば、その確定値を残して仮だけ外す。
  3 作成履歴の確定 → 担当付きの作成は DB 関数が同じ取引で、確定した公演（担当込み）の作成履歴を記録（担当一括保存の履歴より 1 マイクロ秒前の時刻）。画面からは記録しない。作成が成功すれば履歴もある契約（実際の画面離脱は未試験）。担当なしの作成は従来どおり画面から記録。本文 md5 は `11487a3a88db20a880e9f6ec5450a09b` に更新。
  4 確定後の取得失敗を未作成扱い → API は取得を 1 回取り直し、それでも失敗したら保存した値と ID で 201（`read_back: false`）を返す（担当なしの作成も同じ）。SQLSTATE の無い失敗・ID の無い応答は 502（`outcome: 'unknown'`、「作成されたか確認できませんでした」）。画面も通信の失敗・502 以上は「失敗」と断定せず確認を促す。
  試験配線: 通知受け入れ E2E の差し替え（`e2e/fixtures/notification-acceptance-mocks.ts`）に `scenarioApi` が無く、画面が起動しなかった（手元で 7 件失敗を再現）→ 追加して 21 件合格。functional-qa は新しい依存を読まず 20 件合格（別の作業の開発サーバーが 5196 番を使っていたため、手元では番号だけ変えた一時設定で実行）。
  前後比較: 追加の単体・API 試験 10 件が補修前に失敗し補修後に合格。DB 試験は 13 項目（2b・2c が補修前の関数で失敗）。vitest 全件 348 ファイル・2483 件、`npm run verify` ほか合格。
- 追記（Codex 再レビュー 2fa19ac の残り P2 2 件）:
  P2-① 結果不明のあとの保存し直しで二重作成 → 作成に画面が作る要求 ID（UUID）を付け、DB 関数が同じ利用者・組織の同じ要求 ID の公演があればそれを返す（新しい表 `schedule_event_create_requests`。画面・API からは直接読めない。同じ ID の同時送信は順番に処理）。画面は結果が分からなかったときだけ、同じ入力の保存し直しで同じ要求 ID を使う（入力を変えた・確定した失敗・成功のあとは新しい ID）。
  P2-② GM 未指定の作成履歴 → 公演ダイアログからの作成は GM の有無によらず DB 関数を通し、作成履歴を同じ取引で記録。画面からの作成履歴の記録は外した。ダイアログ以外の作成（staff_assignment の無い要求）は従来の INSERT のまま。
  関数の引数に要求 ID を追加（本文 md5 `e329f0dcdbbfc4e35650491f17bb8b5d`）。rollback は表を rollback_backup へ退避してから関数と表を消す。DB 試験 17 項目（同じ要求 ID で 1 件・別 ID なら別に作る・GM 未指定の作成履歴・他人の要求 ID は拒否・表はブラウザから読めない を追加）と rollback → 再適用 → 再試験が合格。前回の 13 項目と既存の DB 試験 13 本の結果は再利用（関数の中身の変更は要求 ID と GM 未指定の分岐のみ）。
  前後比較: 単体・API 試験 7 件が補修前に失敗し補修後に合格。vitest 全件 348 ファイル・2488 件、`npm run verify`、通知受け入れ E2E 21 件合格。
- 追記（Codex 再レビュー 7658a64 の残り 3 件）:
  1 要求 ID の回復: 結果不明の作成（要求 ID・送った入力・要点・時刻）を localStorage に組織ごとに 1 件残す（`src/lib/pendingEventCreate.ts`。使えなければ画面のメモリ）。次の保存で、同じ入力なら同じ要求 ID で送る。違う入力なら先に `find_schedule_event_create_request` で照合し、作成済みなら作らずに知らせ、未作成と確定したら通常の作成へ。照合が通信で失敗したら作らず残す。別の端末・ブラウザとは共有しない。
  2 rollback の復元: 当て直しの migration が rollback_backup の退避から書き戻し、公演が残る行がすべて同じ対応で入ったかを照合（違えば止める。公演が消えた行は戻さない）。`scripts/test-create-schedule-event-restore-db.sh`（行を残した巻き戻し → 当て直し → 書き戻し → 同じ要求 ID の再送で元の公演）を追加。補修前の migration ではこの試験が失敗。
  3 Baseline CI: `expected-table-overrides.json` に新しい表、`expected-function-overrides.json` に照合関数を追加。手元で `scripts/check-db-baseline.sh` 合格。
  2 接続の同時送信: `scripts/test-create-schedule-event-concurrency-db.sh` を追加し、使い捨て DB（基準の再現、PostgreSQL 17.6）で同じ要求 ID の同時送信が 1 件・同じ ID になることを確認。
  気づき: PostgreSQL 17.6（本番と同じ版）で、anon が pg_temp の関数の中から実行権限の無い関数を例外処理つきで呼ぶとサーバーが落ちる（既存の関数でも同じ。17.11 では落ちない）。試験の anon の確認は権限表で行うよう変えた。
  vitest 全件 348 ファイル・2492 件、`npm run verify`、通知受け入れ E2E 21 件合格。DB 試験 18 項目。
- 追記（Codex 再レビュー 929c857 の P2 群。二重作成防止の不変条件「前回の要求は、作成済みと確定するか DB で取り消したと確定するまで捨てない」）:
  遅着: 照合（find）が未作成のとき、その要求 ID を DB に取消済み（event_id なし・cancelled_at あり）として記録してから NULL を返す。遅れて届いた同じ要求 ID の作成は独自 SQLSTATE `MMQC1` で拒否し、API は 409・`outcome: 'cancelled'`。取消済みも rollback の退避・書き戻しの対象。
  利用者の分離と複数件: 未確定の要求は組織＋利用者ごと、要求 ID ごとに複数件保持（他の利用者の要求は読まない・消さない）。違う入力の保存の前に、未確定の要求をすべて照合する。
  保存不能: localStorage に書けなければメモリだけで覚え、「再読み込みや画面を閉じた後は照合できない・この画面のまま同じ内容で保存し直す」と案内する。
  同じ要求 ID の送り直しの失敗（店舗確認などの前処理の 4xx/5xx を含む）では未確定の要求を消さない。消すのは成功・照合の回答・取消済みの応答のときだけ。
  実 DB の前後比較: `scripts/test-create-schedule-event-concurrency-db.sh` の 2)（照合 → 新しい保存 → 元の要求の遅着）が 929c857 の migration で公演 2 件（NG）、補修後 1 件（OK）。1)・3) も合格（使い捨て DB、PostgreSQL 17.6）。DB 試験 19 項目、書き戻し試験（取消済みの書き戻しを追加）合格。
  単体試験: 利用者の分離・前処理失敗で消さない・保存不能時の案内 の 3 件が補修前に失敗し補修後に合格。vitest 全件 348 ファイル・2498 件、`npm run verify`、通知受け入れ E2E 21 件合格。
- 追記（Codex 再レビュー a649ec3 の P2 2 件）: 未確定の要求を要求 ID ごとに別のキー（`mmq:pending-event-create:<組織>:<利用者>:<要求 ID>`、一覧は前置きで走査）へ書き、複数タブで同時に書いても他の要求を消さない。利用者 ID を確認できないときは作成を始めず案内し、仮の利用者として覚えない。単体試験 3 件（書き込みの重なり・利用者 ID 不明で作成しない・取れるようになったら同じ要求 ID）が補修前に失敗し補修後に合格。DB は変更なし。vitest 全件 349 ファイル・2502 件、`npm run verify`、通知受け入れ E2E 21 件合格。
- 追記（Codex 再レビュー 500877b の P2）: 未確定の要求の一覧を、番号で数えながら読む形から、先にキー名を一度に取り出して（`Object.keys(localStorage)`）から読む形に変更。読む途中で別のタブが前の記録を消しても、残りを読み飛ばさない（消えていた記録は除く）。割り込み試験 1 件が補修前に失敗し補修後に合格。DB・API は変更なし。vitest 全件 349 ファイル・2503 件、`npm run verify` 合格。

## 2026-10-21 / リリース統合候補（staging の未反映分 ＋ main の #1202、reconcile migration 付き）（release/2026-10-integration、staging 向け PR・マージしない）

- 目的: staging の未反映分（10/11〜10/21 の 118 コミット）と本番 main（179958be、#1202 = issue #1200 の hotfix）を 1 本の統合候補にし、本番へは統合 PR（staging → main）で出す。#1201（draft）の内容は #1202 経由で入る。#1014・cherry-pick の案は使わない。
- 二重の migration: staging の `20261020210000`（＋ `20261015110000`・`20261020120000`）と main の `20261021144000` が同じ 3 関数（`create_private_group_atomic`・`create_private_booking_request`・`private_group_set_preferred_stores`）を書き換える。reconcile `20261021170000_private_booking_candidate_rule_reconcile`（rollback 同名）で本文を staging の `private_booking_assert_candidate` 経路に決め、#1202 の `private_booking_store_slot_rule` を消す。根拠: assert_candidate（→ `private_booking_slot_store_fit`）が店舗ごとに I10（店舗の平日／土日祝、特別営業日）・I2・営業時間・別枠にかかる受付停止・募集停止・公演・固定開始・所要時間を同じ 1 店舗で全部満たすかを見るので、#1202 の要件を含む（issue #1203 の P1・P2 もこれで解消）。
- 2 起点の隔離試験（手元の使い捨て DB 2 つ。基準 ＋ 本番 / staging の実際の適用済み一覧を本番・staging の `schema_migrations` の読み取りで確認して再現。再現した 3 関数の md5 は本番・staging の実物と一致）: (a) 本番相当 → 29 本 → reconcile、(b) staging 相当 → 144000 → reconcile。3 関数の md5（`e9a9b773…`・`ee6f42bf…`・`7789faef…`）と権限、DB 構造全体（表 156・ビュー 12・関数 441）が一致。`test:rpcs` 15 本（R1〜R43、#1202 の回帰を reconcile 用に直した `private_booking_candidate_slot_rule_all_paths.sql`、データ修正、クーポン系、写真上限、`customer_notice_claim_only_ids` ほか）と yoyaq_004 が両方で合格。
- 戻し: `scripts/test-release-rollback-scope.sh` を統合に合わせた（1 章 31 行・当てる 30 本・戻した後に 144000 を当て直す・DB 構造全体で公開前と一致を確認）。合格。staging では 144000 の rollback を単独で流さない（3 関数が本番の旧本文に戻る）。
- 公開入口の未設定店舗（issue #1203 P2）: `getPublicPrivateBookingSlotOptions` が未設定の店を何店でも合成して渡していた → 渡す店舗が 1 店のときだけ合成（DB の `p_allow_missing` と同じ）。試験を追加（修正前で失敗を確認）。仕様同期の一覧に `publicPrivateBookingSlots.ts`・`privateGroupCandidateSlots.ts`・申込と店舗変更の RPC 正本を追加。
- 手順書: `docs/ops/本番公開の戻し方_2026-10.md` を統合用に改訂（既存の通知は止めない・試験送信はしない・新しい定期実行 3 本と引き金 2 本は同じ取引で無効にして作る・鍵は名前と用途だけで登録は承認待ち・戻した後に 144000 を当て直す）。`docs/ops/平日朝枠の停止_2026-10.md` の cherry-pick 案を廃止。
- 確認: `npm run verify`、vitest 全件（345 ファイル・2448 件）、`check:private-booking-rules`、`check:migration-rollbacks`、`scripts/check-db-baseline.sh`（基準 ＋ 80 本で期待構造を再現）、上の隔離試験。staging・本番の DB・Edge・secrets・Vercel には書き込んでいない（両 DB は読み取りだけ）。
- 残り: Codex の独立レビュー → staging への取り込み（staging DB に 144000 と reconcile を続けて当て、staging.json を取り直す）→ 本番（別 GO）。CI の Drift（staging.json）は staging 適用後に取り直す。
- 追記（Codex 先行レビュー 1b9b0417 の P1「保護が消える窓」）: 30 本を 1 本ずつ当てると `20261011200000`〜`20261020210000` の間（約 30 分）申込が I2 を見ない本文になる。
  1 つの取引で当てる・戻す実行用スクリプトを追加: `scripts/release-bundle-2026-10.mjs`（最上位の BEGIN/COMMIT だけを外して 1 取引にまとめる。文字列・`$$`・コメントを読み飛ばす。前後の md5・履歴・新しい通知の無効を同じ取引で確かめる）、
  `scripts/release-apply-2026-10.sh`（全体を 1 回の問い合わせで送る。前後の照合つき）、`scripts/release-state-snapshot.sql`・`scripts/release-state-compare.mjs`（定期実行・app_config・引き金・バケット・storage のポリシーの前後照合）。
  隔離試験 `scripts/test-release-bundle-2026-10.sh`（本番相当）: 途中失敗・鍵待ち（5.1 秒で全体取り消し）で照合も構造も変わらない／当てる・戻す間に外から 0.1 秒ごとに 86〜88 回観測して公開前・公開後以外 0 回／
  既存の定期実行 20 本・app_config・既存の引き金は不変、新しい定期実行 3 本は無効、web_push の 2 本は D／戻した後は構造・照合とも公開前と同じ（空のバケット private-group-photos だけ残る。SQL から消せない）／
  本番と同じ SQL で取引 0.13 秒、別の接続の読み書きの待ちは最長 49 ms。
  staging のミラー（`scripts/mirror-prod-to-staging.sh`）が引き金を一律 ENABLE にしていたのを、ミラー前の状態（tgenabled）に戻すように直した（同じ試験の 4 で確認）。
- 追記（Codex 独立試験 8fe2360b の P1 2 件）: (1) 「日程がそろいました」の引き金 `private_group_on_date_response`（本番に無い新しい通知。鍵が無くても既存のお知らせメールで実際に送られる）を、
  ほかの新しい通知と同じく必ず無効で作るようにした（20261010130000・作り直す 20261020110000 の直後。SQL の最後の確認と前後照合で D 必須。`--date-aligned-off` は廃止、有効化は手順書 3 章の 4 の別承認）。
  (2) Mac の既定の bash 3.2 と日本語ロケールでは `$rc）` の全角記号が変数名の一部と読まれ、`set -u` で止まっていた（取消後の照合・成功後の表示に届かない）。
  全角記号に接する変数を `${…}` に直した（release-apply・test-release-bundle・mirror・test-release-rollback-scope）。`LANG=ja_JP.UTF-8 /bin/bash` で隔離試験を通し、成功・途中失敗・鍵待ちとも after.tsv と照合まで到達。

## 2026-10-21 / 貸切の朝枠は店舗の枠設定で判定し、昼・夜は開店前の固定時刻でも受け付ける（issue #1200「平日に午前枠が出る」、fix/issue1200-slot-start-open-time、PR #1201・未マージ）

- 旧案の取り下げ: #1201 の最初の案「どの枠も開始を開店時刻より前にしない（作品の開始時刻が開店前なら closed）」は、社長の仕様訂正（「午前」は時刻ではなく朝枠のこと／昼枠は普通に受け付けてよい）で取り下げた。migration `20261021150000_slot_start_not_before_open_time`・rollback は削除（staging・本番には未適用）。
- 正本: 朝枠の可否は店舗×曜日の `business_hours_settings.opening_hours.<曜日>.available_slots`（I2、設定 › 店舗別 › 営業時間の 朝/昼/夜）と作品の `private_booking_time_slots`（I10）。組織共通の `organization_settings.time_slot_settings` は公演スケジュール設定で貸切の判定には使わない。開店時刻は枠の可否を決めない。
- DB は変更なし（現行の関数がすでにこの解釈）。手元の使い捨て DB で、札幌相当（平日 開店 13:00・朝は無効）でも作品の昼 12:00 固定は営業中の範囲が 12:00 から始まるので選べることを確認（例 R39）。
- 画面: 公開トップのリスト・カレンダーの入口（`respectConfiguredHours`）だけが開店時刻を下限にして平日朝を落としていた（#1073）→ 下限を外し、営業設定が無い店舗の既定も DB の合成（3 枠）にそろえた。入口と DB で残る違いは、空の `available_slots`（入口は枠なし・DB は 3 枠）と、営業設定が無い店舗に作品の開始時刻を重ねない従来の動き（R42）。
- 影響: クインズワルツ 7 店の平日朝（設定で有効・10:00）は今までどおり作品ページで選べ、入口にも出るようになる。札幌店の平日朝は不変（出ない）。作者不詳などの平日 昼 12:00 固定は選べる。報告元の店舗・作品・URL・環境は不明のまま。
- 残り: 社長の確認後マージ。コードの反映に DB 操作は不要。
- 追加（同日）: 平日朝を出さない社長の意図は設定（データ）で反映する。データ修正 `supabase/data-fixes/20261021_queens_waltz_weekday_morning_off.sql`（7 店 × 月〜金 = 35 か所の `available_slots` から朝だけを外す。退避表 `archive.business_hours_settings_backup_20261021`（public に置かないので DB 構造の記録・定期 Drift に差が出ない）・照合 `_check.sql`・比較条件付きの復旧 `_rollback.sql`）と試験 `supabase/tests/data_fix_queens_waltz_weekday_morning_off.sql`（(a)〜(i) 合格、`npm run test:rpcs` に追加）。手順書 `docs/ops/平日朝枠の停止_2026-10.md`。**マージでは適用されない。本番で手動適用するまで東京 7 店の平日朝は選べるまま。** 順序: Codex レビュー → staging で確認 → 本番に設定を先に当てて読み取り確認 → main 起点で #1201 だけを cherry-pick した hotfix PR でコードを出す。staging・本番には書き込んでいない（読み取りのみ。両環境の 7 店の値は一致）。

## 2026-10-21 / 公開前再チェック 2 の R1〜R3（限定メール試験の取り出し限定・来店確認の rollback の排他・店舗公開名の書き戻し）（fix/recheck2-r1-r3、staging 向け PR）

- Codex 第 2 回再レビュー（`.runtime/MMQ_公開前再チェック2_結果_2026-10-21.md`）の R1〜R3。
- R1［P1］限定メール試験が試験相手だけに限定されない: 手順書 (7) の「ほかの送信待ちを 1 時間延期 → 送信処理を非同期で呼ぶ → 延期を戻す」は、取り出しの遅れ・延期後の新規 pending・期限切れ sending で他のお客様にも送れた。取り出し段階で限定する方式に変更。migration `20261021120000_customer_notice_claim_only_ids`（同名 rollback）で `claim_customer_notice_emails(p_limit, p_only_ids uuid[] DEFAULT NULL)`（旧 `(integer)` は消して作り直し。引数なしは従来どおり、空配列は何も取り出さない）。Edge `process-customer-notice-emails` は本文 `{"only_ids":[...]}` を `_shared/customer-notice-only-ids.ts` で読み、壊れた本文・空・ID でないものは 400（全件送信に落とさない）。手順書は ID 指定で 1 回呼ぶ形に書き換え、延期の一括加減算をやめた。expected-function-overrides: 旧版 null、新版 `2c937de7f542dca58c1c560c26acd77a`。試験: `supabase/tests/customer_notice_claim_only_ids.sql`（他顧客の pending・後から積んだ pending・期限切れ sending があっても 1 行だけ、空配列 0 行、引数なしは従来どおり 3 行）、`customer-notice-only-ids.test.ts`（deno）。
- R2［P1］来店確認の退避前に同時更新を排他していない: `supabase/rollbacks/20261020130000_coupon_usage_redeem.sql` の冒頭（BEGIN の直後）で `SET LOCAL lock_timeout = '10s'` と `LOCK TABLE public.coupon_usages IN ACCESS EXCLUSIVE MODE`。退避 → 列削除 → COMMIT まで保持。2 接続試験 `supabase/tests/coupon_redeem_rollback_race.sh`（`npm run test:coupon-rollback-race`、手元 DB 専用）: A が 5 件目を更新して 3 秒保持 → B はロック待ちに入り、A の確定後に 5 件退避。A が 15 秒保持 → B は 10 秒で 55P03 になり何も変えない。直す前の版を `ROLLBACK_FILE` で流すと退避 4 件で失敗する（Codex の再現と同じ）。
- R3［P2］退避した店舗公開名を書き戻していない: 手順書 (b) の書き戻し SQL に 4b（店舗 ID と組織が一致し今が空の店だけ `stores.public_name` を戻す）と、来店確認・公開名の照合 SQL を追加。`supabase/tests/coupon_redeem_rollback_backup.sql` を 20261011210000 まで戻す流れに広げ、写す → 戻す → 当て直す → 書き戻しで値が戻ることを確認。
- staging でやること: migration 20261021120000 の適用（md5 は上）、Edge `process-customer-notice-emails` の配備（staging への merge で deploy-supabase が配備）。本番は公開手順 (4)〜(7) に含まれる。
- 第 3 回レビュー N2［P2］: 手順書 2 章 5 の構造照合の 1 行の式は、期待差分で null（消したはずの関数）を「無い」ことまで NG にしていた（理想の構造で A 3 件・B 4 件の偽 NG）。`scripts/check-function-overrides.mjs` に置き換え（null は残っていれば NG、それ以外は存在・本文 md5・権限）。理想の構造で A・B とも 0 件、使い捨て DB に実際に当てた構造でも A（4380f874 の期待差分）133 件・B 134 件 OK。旧 claim が残る・md5 違い・権限違いは NG になることも確認。
- 第 3 回レビュー N3［P2］: 戻す一覧に本番 hotfix 済みの 20261020100000 が入っており、戻すと札幌店の平日朝の枠が復活した。手順書を「2 章の 0 で公開前の適用済み一覧と `private_booking_store_day_slots` の md5（c0bec3c1cd17722fe446b23745ce89b8）を保存 → (c) の 3 で基準に無い版だけを新しい順に戻す → 一覧と md5 が基準どおりか確認」に変更。戻す一覧は 29 本、1 章の表の 19 は「当てない・戻さない」。`scripts/test-release-rollback-scope.sh`（使い捨て DB、約 45 秒）: 基準＋公開分以外＋hotfix → 29 本を当てる → 29 本だけ戻す → 一覧が基準と同じ・md5 が c0bec… のまま。対照で 20261020100000 の rollback を流すと md5 が af118b02… に変わる。「30 本の往復が通った＝公開直前に戻る証明」とは書かない。

## 2026-10-21 / 受付範囲の取得待ちで候補追加カレンダーが 24 か月先へ進む（fix/recheck2-r5-candidate-month、Codex 第2回再レビュー R5）

- Codex の第2回再レビュー（R5、P2）。`AddCandidateDates` の「選べる日が無い月は次の月へ自動で進める」処理が、受付範囲（`horizonDays`）の取得中・失敗（null）でどの月も空に見えるのを空月と取り違え、上限 24 回まで進めていた。
- 直し: 受付範囲が null の間は自動で進めず、開いたときの「最初の月へ戻す」も範囲が分かってから行う。範囲の外（今日から N 日先より後）の月を出していたら最初の月へ戻し、自動で進めるのも範囲内まで（次の月が範囲外なら止める）。手動の「次月を表示」・月送りは従来どおり（null の間は次月ボタンも押せない）。
- 他の画面: 作品ページの貸切フォーム（`usePrivateBooking`）、日付指定の申込、`PrivateBookingSlotGrid` には自動で月を進める処理が無いことを確認（`showMonthOf` は URL の日付の月を出すだけ）。変更は `AddCandidateDates` だけ。
- テスト: `AddCandidateDates.test.tsx` に、受付範囲が取得中・取得失敗で開いても今月のまま、90 日と読めたら範囲内の月、を追加（修正前は 2 年後の月になり失敗）。vitest 全件、`npm run verify`。

## 2026-10-21 / 古い読み込みの組織取得失敗が新しい一覧をエラー表示にする（fix/recheck2-r6-org-generation、Codex 第2回再レビュー R6）

- Codex の第2回再レビュー（R6、P2）。`usePrivateGroupList` の `loadGroups` は組織 ID の解決後に読み込み順（世代）を確かめていなかったため、読み込み A の組織解決が遅れて null で終わると、後から始めて成功した読み込み B の一覧に「組織情報が取得できません」が立ち、画面がエラー側へ切り替わっていた。
- 直し: 組織の解決直後にも既存の世代検査（`current()`）を入れ、古い呼び出しでは error も loading も触らない。
- テスト: `usePrivateGroupList.test.tsx` に、A の組織解決を保留 → B 成功 → A が null で終わっても error が立たず B の一覧が残る、を追加（修正前は失敗）。vitest 全件、`npm run verify`。

## 2026-10-21 / RPC の構成エラー（PGRST202・404）でも申込シートの入力を消していた（fix/recheck2-r4-access-lost、Codex 第2回再レビュー R4）

- Codex の第2回再レビュー（R4、P2）。`isPrivateGroupAccessLost` が HTTP 404 を一律に「権限が無い・グループが無い」と判定していたため、RPC がスキーマキャッシュに無い（PGRST202、配備途中やスキーマ再読み込み待ち）だけでも申込シートの入力を消して「招待が見つかりません」に切り替えていた。
- 判断基準: 404 という状態だけでは権限喪失とみなさない。PostgREST の 404 は「関数が見つからない」（PGRST202・42883）でも返り、グループの不存在の証拠にならないため。消すのは証拠があるときだけ: 401・403（ログイン切れ・閲覧不可）、RPC が明示的に返す 42501（閲覧不可）・P0002（見つからない）・22P02（ID の形が不正）・PGRST301〜303（ログインの鍵が無効）、成功応答でグループが空（`PRIVATE_GROUP_NOT_FOUND`）。それ以外の 404（コード無し・PGRST202・42883）は通信失敗と同じく直前の内容を残して読み直す。初回の読み込み失敗（残す内容が無い）は従来どおり。
- テスト: `BookingRequestSheet.refetchError.test.tsx` に、PGRST202/404・42883/404・コード無し 404 で入力が残り次の成功で戻る、コード無し 403・P0002/404 で切り替わる、を追加（修正前は 3 件失敗）。vitest 全件、`npm run verify`。

## 2026-10-21 / 管理画面のグループ一覧を先に出し、追加情報は後から埋める（perf/private-group-list-progressive、staging 向け PR）

- Codex の点検（改善 6、P2）。貸切・予約 › グループ一覧は、グループ本体を 100 件ずつ全件取り、続けてアンケート設定・予約・履歴・公演・店舗を段階的に取り終えるまで「読み込み中」のままで、検索欄も出なかった（1,311 件の組織で再現）。
- 直し: `readPrivateGroupList` に途中経過の受け取り（`onPage`、100 件届くたびにそこまでの分）を足し、`usePrivateGroupList` は最初の 100 件が届いた時点で一覧（グループ名・作品・状態・主催者・候補日・メンバー）と検索欄を出す。予約・履歴・アンケート設定・確定公演は従来どおり全件そろってから同じ順番・同時 3 件以内で読み、埋まるまで確定公演の行はスケルトン（`details_loaded`）。読み込み中は「読み込み中の分は検索・絞り込みの対象外」「予約番号での検索・確定公演の日程・完了公演を非表示・事前配役公演のみは読み込み完了後に有効」と注記。カードは 100 件ずつ並べ「さらに表示（残り N 件）」、条件を変えたら先頭 100 件に戻す。再読み込み時は前の読み込みの結果を捨てる。途中で失敗したら従来どおり一覧を空にしてエラー表示（欠けた値を正しい値として見せない）。DB・API・常駐処理・キャッシュの変更なし。
- 状態・更新日順のページ分けは見送り: `private_group_read_list` が id 順のキー送りで、並べ替えたページ取得には DB 関数の変更が要るため。並びは従来どおり作成日の新しい順（読み込み中は届いた分の中で並べるので、続きが届くと上に足されることがある）。
- 計測（手元の local-repro DB に合成グループ 1,310 件＋既存 1 件 = 1,311 件。メンバー 5・候補 3・回答 15/件、確定・申請中には予約と公演、3 件に 1 件は旧予約。スタッフ（admin@repro.test）でログイン、画面遷移からの経過、開発サーバー、各 4 回の平均）: 最初の一覧表示まで 修正前 約 2.49 秒 → 修正後 約 0.43 秒。全件完了まで 修正前 約 2.49 秒 → 修正後 約 2.47 秒（ほぼ同じ）。staging はスタッフアカウントが無く計測していない（ネットワーク往復が加わる分、全件完了までは手元より長く、先に出す効果は大きくなる見込み）。合成データは計測後に手元 DB から消した。
- テスト: `privateGroupRead.chunks.test.ts`（100/200/250/99 件の境界で途中経過の回数と並び）、`usePrivateGroupList.test.tsx`（最初の 100 件で表示し後から埋める、追加情報待ちの間も表示、再読み込みで古い結果を捨てる）、`PrivateGroupList.test.tsx`（新規。最初の分の前だけ読み込み中、注記・スケルトン、100 件ちょうど／101 件／条件変更で先頭へ）、vitest 全件、`npm run verify`。
## 2026-10-21 / 貸切の受付範囲を読めないと 180 日で表示を続ける（fix/private-booking-horizon-fetch-failure、Codex 点検 不具合 5）

- Codex の点検。`fetchPrivateBookingHorizonDays` は `get_effective_private_booking_horizon_days` を読めないと既定の 180 日を返していたため、組織が 90 日などのときに画面では 91 日目以降を選べ、保存で DB に拒否されていた。
- 直し: 読めないときは例外にし、180 日は「読めたが設定が無い」ときだけ。`usePrivateBookingHorizonDays` は `{ days, loading, failed, retry }` を返し、まだ分からない間は `days: null`（`privateBookingHorizonMaxYmd(null)` は昨日＝どの日も選べない）。同じセッションで一度読めていれば、読み直しの失敗では最後に読めた値を使う（React Query が前の値を保つ）。各画面（作品ページの貸切フォーム・候補日の追加・貸切リクエストの日付指定・作品選び・リクエスト入力）は `src/components/private-booking/PrivateBookingHorizonNotice.tsx` で「受付範囲を確認しています」／読めなければ再試行を出し、候補の選択と申込ボタンを止める。公開トップのカレンダー・リストは取得失敗で申込枠を出さない（30 秒ごとに読み直す）。
- 方針の理由: 「最後に読めた値」だけでは初めて開いたときに使える値が無く、結局どこかの既定値に頼ることになる。止めて再試行を出すほうが単純で、画面と保存が食い違わない。読み直しの失敗では React Query が前の値を保つので、一度読めた画面が急に止まることも無い。
- テスト: `privateBookingHorizon.hook.test.tsx`（失敗時に 30 日先も 120 日先も選べない・再試行で 90 日が効く・設定なしだけ 180・読み直し失敗で前の値）、`PrivateBookingForm.test.tsx`、`usePublicPrivateBookingSlots.test.tsx`、vitest 全件、`npm run verify`。

## 2026-10-21 / 通信エラーが一度起きると申込シートの入力が消える（fix/private-group-snapshot-transient-error、Codex 点検 不具合 3）

- Codex の点検。`usePrivateGroupSnapshot` の読み直し（15 秒ごと・画面に戻ったとき）が 1 回でも失敗すると、catch で内容を消して「招待が見つかりません」に切り替わり、開いていた申込シートの入力（候補・人数・店舗への連絡・同意）が消えていた。
- 直し: `src/lib/privateGroupRead.ts` の `isPrivateGroupAccessLost` で失敗を見分ける。401/403/404、RPC の 42501（閲覧不可）・PGRST301〜303（ログイン切れ）・P0002/22P02、中身が空（`PRIVATE_GROUP_NOT_FOUND`）だけを「権限が無い・グループが無い」とし、画面を切り替える。それ以外（通信の切断＝status 0・5xx・時間切れ 57014・原因不明）は、直前の内容を残して `reconnecting` を立て、画面上部の小さな通知（sonner）で「接続を確認しています。再試行します」を出す。次に読めたら消える。初回の読み込み失敗（残す内容が無い）は従来どおり。入口の切り替えは `PrivateGroupInvite/inviteScreenGate.ts` に切り出し。#1171 の入力保持はそのまま。
- テスト: `BookingRequestSheet.refetchError.test.tsx`（実際の `usePrivateGroupSnapshot` を使い、1 回失敗→成功で入力が残る・5xx/時間切れでも切り替えない・403/401/404/空で切り替わる）、`usePrivateGroupSnapshot.test.tsx`、vitest 全件、`npm run verify`。

## 2026-10-21 / クーポンの当日判定が日本時間の 0 時をまたいでも切り替わらない（fix/coupon-jst-today-clock、staging 向け PR）

- Codex の点検（不具合 4、P2）。マイページ › クーポンの「もぎる（来店確認）」は描画のたびに `new Date()` で当日を判定していたが、時刻の変化では再描画しないため、公演前日 23:59:59 に開いたまま 0 時を過ぎても無効のままだった（再読み込みで回復）。「この予約に使う」（#1169）も同じ。
- 直し: 日本時間の「今日」（YYYY-MM-DD）を返す共通フック `src/hooks/useJstToday.ts` を追加。次の日本時間 0 時（+250ms）にタイマーで更新し、スリープ明けなどに備えて `visibilitychange`（表示に戻ったとき）・`focus` でも読み直す。常駐の定期処理は持たない。`AppliedCouponsSection`（もぎる）と `CouponsPage`（この予約に使う・候補の「公演当日に使えます」）の当日判定をこの時計にそろえた。`isPerformanceDay` は第 2 引数に YYYY-MM-DD も受ける。サーバー側の判定（`coupon_performance_day`）は変更なし。
- テスト: `useJstToday.test.tsx`（0 時までの残り時間、23:59:59→00:00:01 で切り替わる、visibilitychange・focus で読み直す）、`AppliedCouponsSection.test.tsx`（開いたまま 0 時をまたぐと「もぎる」が押せる、画面復帰で切り替わる）、`CouponsPage.test.tsx`（0 時をまたいで画面に戻ると「この予約に使う」が押せ割引額の確認が走る）、vitest 全件、`npm run verify`。

## 2026-10-20 / 「もぎる（来店確認）」の当日判定を公演の日付にそろえる（fix/coupon-redeem-event-date、staging 向け PR）

- 不具合: #1166 の `redeem_coupon_usage` は `reservations.requested_datetime` の日本時間の日付で当日を判定していた。staging の過去 60 日の予約 1,070 件のうち 31 件は `requested_datetime` が予約を作った時刻（例 260919-8B88: 9/19 12:28、公演 10/11 13:00）で、公演当日に押しても断られる。夕方以降の公演も日本時間で翌日にずれうる。
- DB: migration `20261020220000_coupon_redeem_use_event_date`（rollback 同名＝ 20261020180000 の本文に戻し補助関数を消す）。補助関数 `coupon_performance_day(schedule_event_id, requested_datetime)`（公演の日付、無ければ requested_datetime の日本時間の日付。service_role のみ）を足し、`redeem_coupon_usage` はそれで判定。`use_customer_coupon`（#1169）は同じ式のまま変えず、同じ予約で同じ判定になることを DB テストで確認。expected-function-overrides: redeem `b3e2236054aa3ff2662a633cef642f3f`、補助関数 `6f310d8517d6461d9f6a1929092bcf24`。
- API・画面: `type=all` の使用履歴に予約の公演（`performance_date`・`performance_start_time`）を足し、「この予約に適用済み」の当日判定・表示日時・一覧に出す範囲を公演の日付基準に。「この予約に使う」は元から公演の日付（`type=current-reservations` の `date`）。
- 原因の経路: 31 件はすべて `reservation_source=staff_participation`・`duration=240`・`requested_datetime≒created_at`。公演の詳細画面で GM 役割を「スタッフ参加」にした瞬間に予約を入れる旧ヘルパー `ensureStaffReservation`（`requested_datetime: new Date()`）が作っていた。#640（22dc8ef3a、2026-09-28）で削除され、#641（20260928001200）の `sync_event_staff_participations` が公演の日時（日本時間）で入れるようになったので 9/28 以降は出ていない。同じ書き方が公演の詳細画面の「保存後に追加」の参加者（追加モード）に残っていたので、公演の日付＋開始時刻（+09:00）に直し、`requested_datetime` に保存時刻を入れない検査（`requestedDatetimeSource.test.ts`）を足した。既存 31 件のデータは直していない（判定は公演の日付になったので影響しない）。
- 確認: `supabase/tests/coupon_redeem_event_date.sql`（test:rpcs に追加。作成時刻入りでも公演当日なら可・公演の前後の日は拒否・公演の無い予約は requested_datetime・予約後の使用と同じ判定・補助関数と use の式が一致。旧関数では失敗）、`npm run test:rpcs`、`npm run test:coupon-redeem-db`、vitest 全件、`npm run verify`。
- staging への migration 適用は発注者が行う。適用後に md5(prosrc) が期待値と一致することを確かめ、`supabase/structure/staging.json` を更新する。

## 2026-10-20 / 候補の再取得で申込シート・候補日カレンダーの入力が消える（fix/candidate-refetch-keeps-input、PR #1171）

- Codex の staging 点検（b47cf9377）。グループ画面は読み直しのたびに「読み込み中」に切り替えてシートを作り直していたため、申込シートの送る直前の確認（候補日の時刻が更新されました）で、選んだ候補・優先順・人数・店舗への連絡・電話番号・同意がすべて消えていた。手元 DB・手元画面（customer1、port 5193）で再現し、修正後に入力が残ることを確認。
- 直し: `PrivateGroupInvite/index.tsx` の読み込み中はグループが無いときだけ。申込シート・`AddCandidateDates` は `src/lib/keepSelectionOnRefetch.ts` で、消えた・選べなくなった候補だけを理由付きで外す（候補日カレンダーは DB の時刻にそろえる）。外した店舗・直した電話番号・申込確認画面のお名前等（`useCustomerData`）も読み直しで上書きしない。判定は変更なし。
- テスト: `keepSelectionOnRefetch.test.ts`・`BookingRequestSheet.test.tsx`・`useCustomerData.test.tsx`、vitest 全件、`npm run verify`。

## 2026-10-20 / 店舗への申込と希望店舗の変更で受付判定の一部が抜けていた（fix/private-booking-range-gaps、PR #1168、staging 取り込み済み）

- Codex の staging 点検（b47cf9377）。`create_private_booking_request` は日付（トリガー）と公演・受付停止しか見ず、店舗の曜日の枠・休業日・営業時間・作品の固定開始時刻・時間枠・上演店舗・所要時間を確かめていなかった。`private_group_set_preferred_stores` も公演・受付停止だけで候補を外していた。本店でだけ入る朝の候補を申込シートで二号店（平日の朝は無効）だけに送ると通った。
- 直し: どちらも送る店舗（新しい希望店舗）で `private_booking_assert_candidate` を通す。migration `20261020210000_private_booking_request_full_candidate_check`（rollback 同名）。例 R34〜R36（`private_booking_rules_examples.sql`、修正前に落ちることを確認）。`yoyaq_004` の回帰 SQL に店舗の営業設定を追加。
- staging への migration 適用は発注者が行う。適用後に staging の md5(prosrc) で `expected-function-overrides.json`（手元 DB の値で暫定）と `staging.json` を更新する。

## 2026-10-20 / マイページ › クーポンの「この予約に使う」（予約後の使用）を公演当日だけにする（fix/coupon-use-same-day、staging 向け PR）

- 社長決定（2026-10-20）: 予約したあとで既存の予約にクーポンを当てる操作も公演当日（日本時間）だけ。予約時にクーポンを付けるのは今までどおり日付の制限なし。
- 経路: 画面 `CouponsPage` → `POST /api/coupons?action=use` → `use_customer_coupon`（使用履歴 `coupon_usages` を作り予約の金額を下げる）→ 続けて `redeem_coupon_usage(venue_use)`。予約時の適用は `create_reservation_with_lock_v2` が `coupon_usages` へ直接入れるので `use_customer_coupon` を通らない（呼び出し元は `action=use` だけ）。
- DB: migration `20261020190000_coupon_use_same_day`（rollback 同名＝ 20261007110002 の本文に戻す。手元で md5 が元に戻ることを確認）。公演日は `schedule_events.date`、公演の無い予約だけ `requested_datetime` の日本時間の日付。当日でなければ P0028・HINT `not_performance_day`「公演当日にお使いください」。使用済み（already_used）の返りは日付にかかわらず変えない。expected-function-overrides の body_md5 は手元 DB で適用後の md5(prosrc)（`78fc42309474e4d064466bdb8f94ac48`。適用前は既存の期待値 `594779c5…` と一致）。
  - `requested_datetime` を正にしなかった理由: 予約作成の関数は「日付＋開始時刻」を DB の時間帯（UTC）で解釈して入れるため、夕方以降の公演は日本時間にすると翌日になる。`redeem_coupon_usage`（20261020180000）は `requested_datetime` で判定しているので、夕方以降の公演では当日に「もぎる」が断られるおそれがある（未確認・未修正。staging の実データで `requested_datetime` と公演の日時を読み取りで照らすと確かめられる）。
- API: `use` の断りを 400 と `code`（`not_performance_day`／DB の SQLSTATE）で返す。
- 画面: 確認ダイアログのボタンを「もぎる」から「この予約に使う」に（来店確認の「もぎる」と分ける）。選んだ予約が当日でなければ押せず「公演当日に使えます（M/D）」、当日でない候補の下にも同じ文言。割引額の確認は当日だけ。サーバーの `not_performance_day` は「クーポンは公演当日（M/D）にお使いください」。
- 確認: `supabase/tests/coupon_use_same_day.sql`（`test:rpcs` に追加。当日の昼・夕方は可／翌日 0:30・前日 23:30・2099 年・3 日前は拒否で履歴も金額も不変／使用済みは冪等／予約時の適用は 30 日先でも可。旧関数では失敗することも確認）、`npm run test:rpcs`、`api/coupons.test.ts`、`CouponsPage.test.tsx`、`e2e/coupon-rules.spec.ts`（手元で 4 件通過）、vitest 全件、`npm run verify`。
- staging への migration 適用は発注者が行う。適用後に staging の md5(prosrc) が期待値と一致することを確かめ、`supabase/structure/staging.json` を更新する。

## 2026-10-20 / クーポンの「もぎる（来店確認）」を公演当日だけにする（fix/coupon-redeem-same-day、staging 向け PR）

- 不具合: `redeem_coupon_usage` に日付の確認が無く、先の予約（2099 年でも）に来店確認ができた。マイページの「この予約に適用済み」からも今すぐ押せた。
- DB: migration `20261020180000_coupon_usage_redeem_same_day`（rollback 同名＝ 20261020130000 の本文に戻す）。`customer_present`／`venue_use` とも、予約の公演日（`requested_datetime` の日本時間の日付）が今日（日本時間）のときだけ。それ以外は P0028・HINT `not_performance_day`「公演当日に押してください」。確認済みの冪等な返りは変えない。expected-function-overrides の body_md5 は手元 DB で適用後の md5(prosrc)（適用前の md5 が既存の期待値と一致することを確認）。
- API: `redeem-usage` は断りを 400 と `code`（`not_performance_day`／DB のコード）で返す。`use` で先の予約に使ったときは使用は成功のまま印を付けず `redeemed: false`・`redeem_code` を添える。
- 画面: `AppliedCouponsSection` は当日でなければボタンを無効にし「公演当日に押せます（M/D）」。サーバーの `not_performance_day` は「来店確認は公演当日（M/D）に押してください」と表示。
- 仕様書: `docs/COUPON_RULES.md` に「来店確認（もぎる）は公演当日のみ」。
- 確認: `supabase/tests/coupon_usage_redeem_same_day.sql`（`test:rpcs` に追加。当日可・翌日 0:30／2099 年／前日 23:30／3 日前／venue_use の先日付は拒否・確認済みは冪等。旧関数では失敗することも確認）、`npm run test:coupon-redeem-db`（当日のみ・rollback で元に戻る）、vitest 全件、`npm run verify`。手元（`npm run dev:full`、手元 DB、375px）で試験会員 customer1 に今日と 10/25 の適用済みを仮に入れ、今日は押せて「来店時に確認済み」、10/25 は無効表示「公演当日に押せます（10/25）」、API 直叩きは 400・`not_performance_day` を確認（仮データは削除済み）。
- staging への migration 適用は発注者が行う。適用後に staging の md5(prosrc) が期待値と一致することを確かめ、`supabase/structure/staging.json` を更新する。

## 2026-10-20 / 予約詳細の「取り下げる」にもグループを残すか選ぶダイアログ（feat/mypage-withdraw-keep-group、staging 向け PR）

- 社長決定（2026-10-20）: #1143 のダイアログ `WithdrawRequestDialog` を予約詳細（`/mypage/reservation/{id}`）の「申込の取り下げ」にも出す。マイページの貸切カードの「操作」は #1143 で対応済みだったので、残っていた入口はここだけ（マイページ配下で取り下げを呼ぶのは `usePrivateBookingActions` と予約詳細の 2 か所）。
- 実装: `src/pages/MyPage/pages/reservationDetail/PrivateRequestWithdrawSection.tsx`（説明・ボタン・ダイアログ）。`useWithdrawPrivateRequestMutation` に `keepGroup` を足し、`groupKept` を返す。メンバー数は `readPrivateGroup` で読む（読めなければ人数なしの文面）。グループの無い直接申込は選択肢を出さず従来どおり。失敗時は理由を toast（従来は何も出ていなかった）。取り下げ後は従来どおり `/mypage?sub=private`。
- ついでの修正（`buildPrivateBookingView`）: 同じグループに申込が複数ある（取り下げ→申し込み直し→また取り下げ）と、カードが先に並ぶ古い取消済みの申込に結ばれ「候補日を直して申し込み直す」にならず「申込に進む」になっていた。グループの `reservation_id` が指す申込を優先して結ぶ。
- 確認: vitest 全件、`npm run verify`。手元（staging 接続、5191、375px）で QA 会員 A の 5DIVE グループを申込 → 予約詳細で「申込だけ取り下げる」→ マイページの貸切は「候補日を直して申し込み直す」、キャンセルのタブに「取り下げ」→ グループページの申込シートから申し込み直せた → もう一度予約詳細から取り下げ（グループは残した状態で終了）。「グループも閉じる」の実行は画面では試していない（従来の処理のまま、単体テストで受け渡しを確認）。
## 2026-10-20 / 戦塵Discordの日付別チャンネルにメイン・サブGMを追加

- [x] `gm_roles`・公演の`gms`・同組織の`staff`を照合し、`メインえるサブりんな`形式で命名。複数サブと未定を扱い、不整合・100文字超過は従来名と警告にフォールバックする。
- 本番専用関数 `provision-private-booking-discord` v28へ承認済み配備。既存33公演66チャンネルを改名・再取得確認済み。他67件の名前、全件の権限とカテゴリは不変。予約・スタッフ割当は変更なし。
- このPRは稼働中の変更を通常配備で保持するための保存。認可・既存ルーム再利用・取消・終了処理は変更なし。本番でテスト予約や通知は作成していない。

## 2026-10-20 / マイページのクーポンで使用履歴が空になる（PGRST201）→ 予約の埋め込みに外部キー名を明示（fix/coupon-usages-embed-ambiguity、staging 向け PR）

- 原因: `coupon_usages` と `reservations` の間に外部キーが 2 本ある（`coupon_usages_reservation_id_fkey`＝使用→予約、`reservations_coupon_usage_id_fkey`＝予約→使用。後者を作る記述は migration では 20260214000001 の「列が無ければ REFERENCES 付きで追加」だけで、20261012120000 には外部キーの追加は無い。本番に後者があるかは未確認（本番には触れていない）。staging と手元 DB にはある）。`coupon_usages ... reservations (...)` の素の埋め込みが PGRST201 で失敗し、`/api/coupons?type=all` が使用履歴を黙って空にしていた（使用日時が出ない・「この予約に適用済み」が出ない）。手元 DB（supabase start）でも同じく再現。
- 直し: `api/_lib/coupons/usageSelects.ts` に select 文字列を集め、予約の埋め込みは `reservations:reservations!coupon_usages_reservation_id_fkey(...)` で書く（返却キーは従来どおり `reservations`）。お客様の一覧（`customerReads.ts`）と管理画面の使用履歴 2 か所（`adminReads.ts`、従来は列名ヒント `reservations:reservation_id`）が使う。`reservationCoupons.ts`・`adjustments.ts` は予約を埋め込んでいないので変更なし。逆向き（`reservations` から `coupon_usages`）の埋め込みは API・画面に無い。
- 失敗時: 使用履歴が読めないときは `console.error` に code・message・details・hint を出し、各クーポンに `coupon_usages_error: true` を付けて返す。マイページ › クーポンは「使用履歴を読み込めませんでした」と「再読み込み」を出す。
- 他の組の点検（staging の REST で埋め込みの解決だけ確認）: `coupon_usages`→`customers`（`redeemed_by_member` の 1 本）、`coupon_usages`→`customer_coupons`、`customer_coupons`→`customers`／`coupon_campaigns`／`coupon_usages`、`customers`→`reservations`／`coupon_usages`、`reservations`→`customers`／`stores` はどれも 1 本で曖昧でない。
- テスト: `api/_lib/coupons/usageSelects.test.ts`（ヒント名が入ること、`api`・`src` のコードに外部キー名なしの埋め込みが残っていないことを走査）、`api/couponRedeem.test.ts`（ヒント付きで読む・PGRST201 で `coupon_usages_error`）、DB 側 `supabase/tests/coupon_usage_embed_hints.sql`（外部キーが 2 本でヒント名が実在し向きが正しい、読み取りのみ。`test:rpcs` に追加、手元 DB で PASS）。
- 本番: 次の本番公開にこの修正を含めること。本番に `reservations_coupon_usage_id_fkey` があれば今も同じ現象が出ている可能性があるので、発注者が本番の外部キーを読み取りで確認する。
## 2026-10-20 / 本番 #1140: カレンダーから 180 日より先の貸切を申し込めた → 「貸切を受け付ける範囲」を設定にして全経路で弾く（fix/private-booking-horizon-180、staging 向け PR。main 向け hotfix は hotfix/private-booking-horizon-180-main）

- 事象（スタッフ報告）: 作品ページの貸切は 180 日後までだが、公開カレンダー・リストの「貸切申込」チップは先の月へいくらでも出て、申込ページ（`?date=`）にも DB の保存の検査（`assert_private_booking_candidate_date`）にも上限日が無かった。
- 社長指示（2026-10-20）: 上限は固定値にせず設定で変える。優先順位は MMQ の既定（180）→ 組織 → 作品 → 公演。既存の運営設定（`operating_setting_overrides`・`resolve_operating_setting`）にキー `private_booking_horizon_days` として乗せる（MMQ の既定は `get_operating_setting_default`。`global_settings` は組織ごとの表なので「MMQ の既定」には使わない）。店舗では指定しない。値は 1〜180（181 以上は公開の空き取得 RPC の 180 日の範囲上限も変える必要があるため）。
- DB: `get_effective_private_booking_horizon_days(組織, 作品, 公演)`（未ログインでも読める。作品未選択の入口は組織の値と公開中の作品の個別指定のうち最長）。`assert_private_booking_candidate_date` が今日（日本時間）+ 日数より先を「申し込めるのは今日から N 日先までです」（P0058）で弾く → 候補追加・グループ作成・日時付き申込・空き判定（理由 `too_far`、detail に文面）・作品一覧の日付理由（`too_far`）すべてに効く。空き判定と作品一覧の日付理由は staging と本番で本文が違うため、migration は今の本文に同じ置き換えをする形（同じファイルを両方で使え、再実行しても同じ）。migration `20261020150000_private_booking_horizon_days`（rollback 同名）。例 R31〜R33。
- 画面: `src/lib/privateBookingHorizon.ts` に日付計算と読み込み（`usePrivateBookingHorizonDays`）。公開カレンダー・リストは範囲より先の日にチップを出さず、範囲が月の途中で終わる月は「貸切の申込は今日から N 日先（M/D）までです」。申込ページは `?date=` が範囲より先なら理由を出して進めない。日時から選ぶ作品一覧も同じ。作品ページ（`MAX_FUTURE_DAYS`）・申込ページ（`CANDIDATE_HORIZON_DAYS`）・グループの候補日追加の固定 180 を設定値に。設定画面は 設定 › 貸切予約の受付締切（組織）・作品編集 › ゲーム設定（作品）・公演の個別設定 › 開催判断・準備（公演）。保存したら `private-booking-horizon-days` と `public-private-slots` を無効化して読み直す。変更は管理者だけ（既存の運営設定 API が admin／license_admin に限定）。
- 確認: 手元 DB で migration 適用（2 回流しても同じ）・rollback で元の本文（md5）に戻ることを確認・R1〜R33・空き判定テスト・smoke 通過。vitest 全件、`npm run verify`、`check:private-booking-rules`。staging・本番への適用は発注者が行う。
- 注意: 手元 DB に別の作業（public-pages の `20261020160000_private_group_photo_limit`）が `resolve_operating_setting` を上書きしていた（このキーを含んだ版）。両方が同じ関数を全文で置き換えるので、後から取り込む方でキーの一覧を合わせること。
## 2026-10-20 / 申込の取り下げでグループを残すか選べる（fix/withdraw-request-keep-group-option、staging 向け PR）

- 社長決定（2026-10-20）: 店舗の返事待ちの「申込を取り下げる」で、グループも必ず閉じていたため日程を変えて申し込み直せなかった。確認ダイアログ `WithdrawRequestDialog`（マイページの貸切カードの「操作」とグループページの ⋮ →「操作」・申込内容の箱で共通、`usePrivateBookingActions`）で「申込だけ取り下げる（既定）」／「グループも閉じる」を選ぶ。文面は `withdrawRequestText`。
- 残す場合: `/api/reservations?action=cancel-with-group-lock` に `keep_group: true` → 新 RPC `withdraw_private_request_keep_group`（申込者本人かつ主催者・返事待ちのみ。グループを gathering へ戻してから申込を取消、候補日・回答は残す、チャットに `booking_withdrawn` の 1 行。二重実行は P0054）。閉じる場合は従来の `cancel_reservation_and_group_with_notice`。
- 画面: 残した場合はグループページのまま読み直し、箱とマイページのカードは「候補日を直して申し込み直す」（`rebookAfterWithdrawal`、主ボタンは申込シート）。
- お知らせ: 主催者のベル・控えのメールは「グループはそのまま」の文面（`customer_notice_on_reservation_cancelled`）、店舗の取り下げ通知に「グループは残っています」を 1 行（`enqueue_private_request_withdrawal`）。メンバーへのベル・メールは出さない。
- migration `20261020140000_private_request_withdraw_keep_group`（rollback 同名）。expected-function-overrides は PGlite で適用した md5(prosrc)（旧版の md5 が一致することを確認済み）。DB テスト `scripts/test-private-request-withdraw-keep-group-db.mjs`（CI に追加）。
- 確認: vitest 全件、`npm run verify`、DB テスト（残す・権限・二重実行・状態の食い違い・失敗時の巻き戻し・閉じる流れの文面・rollback→再適用）。手元（staging 接続、5187、375px）でダイアログの表示と選択の切り替え。staging に返事待ちの QA グループが無く書き込みもできないため、実データでの取り下げは migration 適用後に発注者が確認する。
## 2026-10-20 / クーポンの「もぎる」を予約に適用済みのクーポンにも（社長決定 B）・限定クーポンの「全店舗」誤表示（fix/coupon-tear-and-usable-stores、staging 向け PR）

- 1 もぎる（社長決定 B）: 予約時に付けたクーポンは予約確定で消費される（従来どおり）。来店時にマイページのクーポンを開いても一覧に無い／「使用済み」でスタッフが混乱していた。マイページのクーポン（`src/pages/MyPage/pages/CouponsPage.tsx`）と登録後のクーポン案内（`src/pages/CouponPresent.tsx`）に「この予約に適用済みのクーポン」を出す（当日〜30 日先の確定予約に付いた使用、`src/pages/MyPage/utils/appliedCoupons.ts`）。未確認なら「もぎる（来店確認）」→確認ダイアログ→「来店時に確認済み（時刻）」。消費は増やさない。
- DB: migration `20261020130000_coupon_usage_redeem`（rollback 同名）。`coupon_usages` に `redeemed_at`・`redeemed_by_member`（customers.id）・`redeemed_source`（customer_present／venue_use）。RPC `redeem_coupon_usage(p_user, p_usage_id, p_source)`（service_role のみ。本人のクーポン・本人の予約〔貸切の参加メンバー含む、can_use_coupon_reservation〕・確定予約のときだけ。確認済みなら成功で何もしない）。API `POST /api/coupons?action=redeem-usage`。来店時にその場でもぎる従来の使用（action=use）は、使用に続けて venue_use で印を付ける（失敗しても使用は成功）。
- スタッフ側: `GET /api/coupons?type=reservation-coupons`（requireStaff、自組織の予約だけ）。予約一覧の行に「クーポン 来店確認済み／未確認」、展開の予約台帳と予約管理の予約詳細に「クーポン名 ¥割引・来店確認済み（時刻）」。
- 読み取りは来店確認の列が無い DB（migration 適用前）では列なしで読み直す（`isMissingRedeemColumn`）。
- 説明: クーポン受付対応・クーポンの種類のマニュアル（コード内の既定と seedLegacyPages）に「予約時にクーポンを付けたお客さま」を追加。FAQ 貼り替え文にはもぎるの項目が無いので変更なし。
- 2 C1: `couponUsableStores` が対象店舗の指定ありで一致 0 件のとき「全店舗」にしていた。指定あり／なしを先に分け、一致 0 件は「利用できる店舗を確認中です」（マイページでは「使える店舗:」を付けない）。
- 構造の期待値: `supabase/structure/expected-function-overrides.json`（redeem_coupon_usage）と `expected-table-overrides.json`（coupon_usages）を手元の「基準＋変更」の写しから追加（`scripts/check-db-baseline.sh` 通過）。
- 確認: vitest（API・マイページ・スケジュール・マニュアル 250 件）、`npm run verify`、`npm run test:coupon-redeem-db`（PGlite: 冪等・他人のクーポン・他人の予約・取消済み・貸切メンバー・権限・rollback）、既存 `test:coupon-rules-db`。手元（staging 接続、5186）で QA 会員 A にログイン。staging の QA 会員 A はクーポン 0 枚のため、画面の API 応答だけを差し替えて表示（375px・PC 幅、未確認・確認済み・確認ダイアログ）を確認。もぎるは押していない。
- staging への migration 適用は発注者が行う。適用後に `supabase/structure/staging.json` を更新する。

## 2026-10-20 / 外部監査 R3（Discord 再送の 401）・R5（新規データを失わない戻し方）（fix/audit-r3-r5、staging 向け PR）

- R3 原因: `check-performance-cancellation` が追加募集の後に `retry-discord-notifications` を `supabase.functions.invoke` で呼ぶとき、送るのは supabase-js の鍵（`sb_secret_...`）だけ。ゲートウェイが Authorization を自前の JWT に差し替える（ログの `sb_api_key_compatibility=minted`）ため、受け側の `isCronOrServiceRoleCall` は鍵の一致を確認できず 401。staging 24 時間で 133 回、本番でも 91 回（どちらも本文 25 バイト＝`{"only_recruitment":true}`）。5 分毎の cron（pg_net、`x-cron-secret`）は本番で 268 回すべて 200。
- R3 直し: `_shared/security.ts` に `internalFunctionHeaders()`（`CRON_SECRET` を `x-cron-secret` で渡す）。呼び出し側は未設定なら呼ばずにキューへ任せ、失敗は状態コードを記録して止めない（通知は pending のまま cron が送る。受け側で止まった sending は `recover_recruitment_mail_alerts` が 5 分で戻す）。テストは `scripts/edge-security-boundary.test.mjs`。
- R3 別件: staging には `retry-discord-notifications` の cron が無い（本番はある）。staging の Discord キューは追加募集の即時呼び出しでしか流れない。
- R5: `docs/ops/本番公開の戻し方_2026-10.md`。rollback 3 本（`20261010100000`・`20261010130000`・`20261010160000`）は表・列を消す前に非公開スキーマ `rollback_backup` へ写す（同日の二重退避は止まる）。`check:migration-rollbacks` に「2026-10-10 以降で DROP TABLE する rollback は退避必須」を追加。手元 DB（local-repro）で 7 本を 1 取引で流して取り消し、退避 9 表・二重退避の停止・anon から読めないことを確認。
- 本番配備時の secret: `CRON_SECRET`（本番・staging とも設定済み、`app_config.trigger_secret` と同じ値）。新しい secret は不要。

## 2026-10-20 / 外部監査（staging d179ebe98）R1・C2・C3・C4（fix/audit-r1-c2-c3-c4、staging 向け PR）

- R1 申込の確認画面の終了時刻: `src/pages/PrivateBookingRequest/index.tsx` の `enrichSlotEnd` が DB の終了時刻を作品の所要時間で上書きしていた（初期値・候補の追加・送信前の再検証）。特別営業日に DB が 14:00〜18:00 を返しても 14:00〜17:00 になり保存で弾かれた。`enrichSlotEnd` を消し、確認画面を開いた時点で候補の日付の空き状況を DB に問い合わせ、選べる候補は DB の時刻にそろえる（前ページの時刻から変わったら知らせる）／選べない候補は理由を出して送信させない。送信前の再検証も同じ問い合わせを取り直す。URL から来て DB で時刻が決まらなかった候補の仮の終了（`resolvePrivateBookingUrlPrefillSlot`）は空にした（enrichSlotEnd を消すと「14:00 - 14:00」と出るため）。
- C2 グループ作成画面の店舗: `listActiveStoresForGroup` が臨時会場を一律で除いていた → 臨時会場も読み、`isStorePlayableForScenario` で絞る（上演店舗に明示した臨時会場は選べる。指定の無い臨時会場・オフィスは出さない）。
- C3 公開停止の作品: `create_private_group_atomic` に `org_status='available'` と `scenario_kind<>'offsite_only'` を追加、文面「この作品はいま貸切を受け付けていません」。グループ作成画面の作品取得（`findScenarioForGroup`）も同じ条件で絞り、取れなければ同じ文面を出す。migration `20261020120000_private_group_create_requires_public_scenario`（rollback 同名）、DB テスト `supabase/tests/private_group_create_public_scenario.sql`（`test:rpcs` に追加）。`expected-function-overrides.json` の body_md5 を更新。近日公開（coming_soon）も受け付けない。
- C4 DB テスト: `scripts/test-recruitment-targets-db.mjs` に現行の `get_operating_setting_default`・`resolve_operating_setting` と読む表を足した（42883 の解消）。`private_candidate_slot_availability.sql`・`private_booking_rules_examples.sql` は `supabase/tests/fixtures/private_test_group.sql` で試験用の主催者とグループを（無ければ）作る。
- 確認: vitest 全件、`npm run verify`、PGlite の DB テスト（scripts の PGlite 72 本すべて）、新しい手元 DB（基準 + migration + seed を別の番号で 0 から起動）で `test:rpcs` の 5 ファイルすべて通過。C3 は rollback → 新テストが落ちる → 再適用で通ることを確認。C4 の 2 本は修正前に「グループを閲覧できません」「候補日を追加する権限がありません」で落ちることを確認。手元（staging 接続、5185、375px）で日時付きの申込: 選べる日（12/2 夜・11/25 午後）は DB の 19:00〜23:00・13:00〜17:00 のまま、選べない日（11/19 午後）は「この日時は選べません（他の公演と重なります）」で送信不可。staging には未来の特別営業日が無く、14:00〜18:00 の例は画面テストと DB テスト（R25）で確認。
- staging への migration 適用は発注者が行う。適用後に `supabase/structure/staging.json` を更新する。

## 2026-10-20 / staging 点検（貸切の流れ）の公開前修正 12 件（fix/release-blockers-b、staging 向け PR）

- A1 日時から選ぶ作品一覧: その日に申し込めない作品も「貸切できます」で出ていた。作品ごとの日付の理由を返す DB 関数 `private_booking_scenario_date_reasons`（保存と同じ `assert_private_booking_candidate_date`）で「この日は申し込めません（作品の公演期間外です）」と出し、押せなくする。選んだ作品は `private_booking_candidate_slot_availability` で確かめ、だめなら理由をボタンの上に出して進めない（`src/pages/privateBookingSelectModel.ts`）。
- A2 送信失敗の英字コード: `PRIVATE_BOOKING_OUTSIDE_PERFORMANCE_PERIOD` がグループ作成（`usePrivateGroup.createGroup`）からそのまま出ていた。`src/lib/privateBookingErrors.ts` に表を作り（SQLSTATE と英字のコードの両方）、申込確認・グループからの申込・候補日の保存で使う。申込確認ではエラーを送信ボタンの直上に出す。
- A3 開始時刻の食い違い: 作品を選んだ時点で DB の開始時刻を出し（「この作品の開始時刻 18:30 で申し込みます」）、その時刻で確認画面へ渡す。
- A4 希望店舗: `isStorePlayableForScenario` で上演できる店舗だけを出す（臨時会場・指定外の「対応不可」を並べない）。
- B5 日程がそろった通知: 候補日ごとに数えていたため、回答のたびに飛んでいた。全員が全候補日に回答し終え、全員 ○ の日があるときに 1 回だけ。回は「候補日がいちばん最後に追加された時刻」で区切り、重複防止の鍵に入れる（列は足さない）。トリガーの WHEN (response='ok') を外す（最後の回答が × でもそろう）。「夜間」は「夜」。migration `20261020110000_private_group_dates_aligned_once`（rollback 同名）、DB テスト `supabase/tests/private_group_dates_aligned_once.sql`（`test:rpcs` に追加）。
- C6 グループページ（スマホ）: 見出しの下をまとめて 1 つのスクロールにし、箱が見えなくなったら 1 行のバーだけ上に固定（`GroupMemberPage`）。チャットタブは従来どおり。
- C7 候補日の追加: マイページと同じ全画面の部品 `CandidateDatesDialog`（`src/components/patterns/privateGroup/`、AddCandidateDates の dialog 版）を 1 回で開く。
- C8 箱が縮んで表がずれる: 同じタブの間は箱の高さの最大を下限にする（回答後の読み直しで描き直しても覚えておく）。
- D9 「候補日 N 件で申込中」は送った候補の数（申込の candidate_datetimes）。D10 概要の料金は「¥4,500 × 2 名 = ¥9,000」に、何の人数か（いまの参加人数／申込人数）を添える。D11「事前配役アンケート」に統一。D12 LINE 共有・友達を誘う文の絵文字をやめ（`src/lib/shareTexts.ts`）、マイページの画像なし・クーポン・問い合わせの絵文字をアイコン部品に。
- 確認: vitest 全件、`npm run verify`、手元 DB で `test:rpcs` の範囲（smoke・空き判定・R1〜R27・新テスト）、rollback→旧版で新テストが落ちることを確認→再適用。手元（staging 接続、375px）で作品一覧→選択→理由・開始時刻 18:30 の表示。グループページ・通知は staging に書き込めないため、ローカル（scripts/local-repro、staging の構造）で 375px と PC 幅: 固定は 1 行のバーだけ・候補日画面が 1 回で全画面・回答 3 件で通知はベル 2 件（主催者・会員）とメール 1 件、回答し直しても増えない・箱が縮んでも表の位置が変わらない。
- staging への migration 適用は発注者が行う。適用後に `supabase/structure/staging.json` を更新する。

## 2026-10-20 / 公開前点検の止め 2 件: 絞り込みで先頭へ戻る・ログイン切れのマイページ（fix/release-blockers-a、staging 向け PR）

- 1 絞り込みで先頭へ戻る: 店舗トップ `/queens-waltz` と MMQ 全体トップ `/` の「空いている公演を探す」で、今週／来週／今月・カレンダー／リスト・店舗・空席あり・初心者向けを押すたびにページ先頭へ戻っていた。原因はページ移動時に先頭へ戻す `ScrollToTop`（`src/AppRoot.tsx`）が、URL のクエリが変わるとすべて「別の画面」とみなしていたこと（除外は `event`・`count` だけ）。絞り込み条件のキー（`when`・`date`・`stores`・`avail`・`beginner`・`area`・`view`・`people`）を除外に追加。`?tab=` などの切替はこれまでどおり先頭へ戻す（「クエリだけの変更は戻さない」にするとマイページのタブ等が変わるため不採用）。`ScrollToTop` は `src/components/routing/ScrollToTop.tsx`、判定は `src/lib/scrollNavigation.ts` へ移動。
- 店舗の選択リスト（`StorePicker`）に `hideWhenDetached`: ボタンが画面外へ出たら一覧も隠し、スマホで上部に浮いて残らないように。
- 2 ログイン切れのマイページ: `/mypage` は予約シェルとして認証確認前から描画され、`MyPage` が未ログインでもそのまま表示して「ゲスト さん」「予約がありません」になっていた。`RequireLogin`（`src/components/auth/RequireLogin.tsx`）で包み、確認中は「読み込み中」、未ログイン確定（`isInitialized` かつ user なし、URL にトークンが残っていない）なら `/login?redirect=/mypage...` へ。予約詳細 `/mypage/reservation/...` も同じ。
- 確認: `ScrollToTop.test.tsx`（絞り込みで scrollTo が呼ばれない／パス移動と ?tab= では呼ばれる。修正前の一覧では落ちることを確認）、`RequireLogin.test.tsx`、関連 vitest 1170 件、`npm run verify`。手元（staging 接続、5184）で 375px と PC 幅: `/queens-waltz` の各チップ・店舗選択・満席を非表示、`/` の各チップ・店舗選択でスクロール位置が変わらない。未ログインで `/mypage` を開くと `/login?redirect=%2Fmypage`。

## 2026-10-15 / Codex staging 点検（56d943a46 以降）の 5 件（fix/codex-staging-review-5、手元コミットのみ・push なし）

- 1 グループ作成時の空き確認: `create_private_group_atomic` は作品の時間帯しか見ず、画面で選んだ後に公演・受付停止・設定が変わっても保存できた。候補追加と共通の内部関数 `private_booking_assert_candidate`（締切・募集期間・時間帯・店舗ごとの空き・所要時間）を候補ごとに通す。候補追加 `private_group_add_candidate_dates` も同じ関数に置き換え。
- 2 特別営業日: `private_booking_slot_store_fit` は開始時刻だけ特別営業日を土日祝の扱いにし、所要時間・作品の時間帯・作品名の特例は日付だけで決めていた。store_fit が作品の行（jsonb）を受け取り、店舗ごとに土日祝の扱いをまとめて決める（minutes 列・why=slot_not_allowed を追加）。正本 I5。
- 3 臨時会場: 作品の上演店舗の指定が空のとき、申込ページ（`PrivateBookingRequestPage`・`PrivateBookingRequest`）は臨時会場を希望店舗に残し、DB は対象外。逆に作品ページは指定に含まれる臨時会場を出していなかった。`isStorePlayableForScenario`（`src/lib/scenarioStoreHint.ts`）に一本化。
- 4 店舗の引き継ぎ: 作品ページの 3 つのボタン（ヒーロー・貸切タブ本文・料金パネル）を `privateGroupCreatePath`（`src/pages/PrivateBookingStart/paths.ts`）にそろえ、貸切タブで選んでいる希望店舗を常に `stores` で渡す（これまでは本文のボタンだけ、しかも `?stores=` で来たときだけ）。
- 5 空き状況の取得エラー: 作品ページの貸切タブで、読めなかったときは枠を出さず赤い案内＋「空き状況を再読み込み」。グループの候補追加にも再読み込みボタン。
- migration `20261015110000_private_booking_create_validate_special_open_day`（rollback 同名）。例 R25〜R27。expected-function-overrides は手元で適用した md5(prosrc)。
- 確認: 手元 DB で migration 適用→回帰 SQL（R1〜R27）・空き状況テスト・smoke 通過、rollback→旧版で R25 が落ちることを確認→再適用。vitest 全件、`npm run verify`。staging・本番への適用と実画面の確認は未実施。

## 2026-10-15 / 作品の貸切開始時刻は絶対・本番へ #1021 #1023 を単独反映（hotfix/candidate-slot-rule-to-main、main 向け PR #1125 と staging 向け PR）

- 事象: 本番の貸切候補日が古い規則（午後は夜の枠の開始までに終わる）のままで、「祝福のアルカディプス」（土日祝の午後 14:30・所要 270 分・夜 18:30）の申込が 14:00（平日 13:00）に繰り上がっていた。
- main へ #1021・#1023 だけを cherry-pick。main の申込の確認画面（PrivateBookingRequest）とカレンダーから開く申込ページ（PrivateBookingRequestPage）が旧来の画面計算で候補時刻を見直していたため、DB の private_booking_candidate_slot_availability に置き換えた（送信前の再検証で 14:30 が 14:00 に戻らないように）。
- 社長決定（2026-10-15）: 作品に貸切開始時刻がある枠はその時刻を絶対とし、入らなければずらさず選べない（理由 start_fixed）。private_booking_slot_store_fit に fixed 列、保存 RPC はその時刻以外を「この作品の開始時刻は HH:MM です」で弾く。migration 20261015100000_scenario_slot_start_is_absolute（rollback 同名）。例 R22〜R24。
- 確認: 手元の使い捨て DB（基準＋migration）で構造の再現・回帰 SQL（R1〜R24）・rollback→旧テスト通過→再適用を確認。staging・本番 DB への適用は発注者が行う。

## 2026-10-15 / 貸切を始めるページ: 店舗を選ぶ → 作品を選ぶを 1 ページで（fix/private-org-picker-page、staging 向け PR）

- 社長指摘: #1122 の「参加店舗から選ぶ」でトップの貸切の欄の下に枠が開くのはおかしい。押したら画面遷移して。追加指示: 新しいページで希望店舗と作品まで選べるように。
- 対応: 新ページ `/private-booking/select-organization`（`src/pages/PrivateBookingStart/`、見出し「貸切を始める」）。上で組織カードを押すと選択状態になり、複数店舗なら「希望店舗」のチップ（どれでも可／各店舗。複数可。臨時会場・オフィスは除き、お客様向けの店舗名）。下にその組織の貸切できる作品（`PrivateScenarioGrid`、検索・人数のチップ）。希望店舗を選ぶと、その店舗で上演できる作品（`available_stores`）だけに絞る。選んだ組織と店舗は URL（`?org=&stores=`）に残し、作品ページから戻ると同じ状態。
- 作品を押すと `/{org}/scenario/{slug}?tab=private&stores=ID,ID`。作品ページは `stores` を貸切タブの希望店舗に 1 回だけ反映し、「まずはメンバーを招待して貸切グループを作成」で `/group/create?...&stores=` に渡す。グループ作成は `stores` を希望店舗の初期値にする（作品の対象外の店舗は読み込み後に外す。読み込み前は外さない）。
- `/{org}/private-booking-select` は日付・時間帯なしなら同じページを組織を選んだ状態で開く（「別の店舗を選ぶ」は新ページへ）。カレンダーからの `?date=&slot=` の流れは従来どおり。組織が 1 つだけなら選んだ状態で開く。
- MMQ 全体トップ: 「参加店舗から選ぶ」は新ページへのリンク。`?pick=private` の枠、`OrganizationDirectory` の `mode="private"`、`organizationCardPath`、作品一覧の `from=mmq` は削除。組織カードの材料は `buildPlatformOrganizations` / `fetchPlatformOrganizations`（公演は読まない）に分けた。
- 経路: `adminDashboardRouting`（`private-booking-start`）、`profileGate`（見るだけのページ）、`AppRoot`（`private-booking` を全体の先頭の区切りに）、`STATIC_PUBLIC_META['private-booking-start']`、sitemap。
- 確認: `PrivateBookingStart/index.test.tsx`（9 件）、`PlatformTop/index.test.tsx`、`PrivateBookingScenarioSelect.test.tsx`、`PrivateGroupCreate/index.test.tsx`（初期値 2 件）、`adminDashboardRouting.test.ts`、`npm run verify`。手元（staging 接続）で 375px と PC 幅: `/` →「参加店舗から選ぶ」→ 新ページ → クインズワルツ → 大塚店 → 作品 → 作品ページの貸切タブで希望店舗が大塚店 → グループ作成（未ログインなのでログイン画面の戻り先に `stores` が付くところまで）。ブラウザの戻るで組織・店舗が選ばれた状態、「別の店舗を選ぶ」で一覧に戻る。375px で横はみ出しなし。

## 2026-10-15 / 全体トップの貸切の入口: 店舗を選んだら貸切できる作品の一覧へ（fix/platform-private-entry-to-scenarios、staging 向け PR）

- 社長指摘: MMQ 全体トップ「友だちと貸切で遊ぶ」→「参加店舗から選ぶ」→ 店舗を選ぶと、組織のトップページに行っていた。
- 対応: 「参加店舗から選ぶ」は、ページ内の通常の「参加店舗」へ送るのをやめ、貸切の欄のすぐ下に「貸切する店舗を選ぶ」一覧（`OrganizationDirectory` の `mode="private"`、id `private-organizations`、URL `/?pick=private`）を開いてそこへ送る。組織カードの行き先は `/{org}/private-booking-select?from=mmq`（`src/pages/PlatformTop/utils/organizationCardPath.ts`）。「今月 N 公演に空きあり」は貸切と関係ないので貸切用の一覧では出さない。「閉じる」で一覧と URL の印を消す。通常の「参加店舗」は組織トップのまま。
- 貸切できる作品の一覧（`PrivateBookingScenarioSelect`）は `from=mmq` のときだけ「別の店舗を選ぶ」（`/?pick=private`）を出す。リンクで来たときは一覧まで送り、ブラウザの「戻る」では送らない（元の位置に戻す）。
- 貸切の流れのページの「1. 貸切を始める」に、MMQ トップからは店舗を選ぶ→作品を選ぶ、の一言を足した。
- 確認: `src/pages/PlatformTop/index.test.tsx`（3 件）、`PrivateBookingScenarioSelect.test.tsx`（2 件追加）、`npm run verify`、手元（staging 接続）で 375px と PC 幅: `/` →「参加店舗から選ぶ」→ クインズワルツ → 貸切できる作品 → 作品ページの貸切リクエストのタブ、「別の店舗を選ぶ」で戻ると一覧が開いた状態。375px で横はみ出しなし。

## 2026-10-14 / 貸切できる作品の入口を作品カードの一覧にする（fix/private-booking-entry-page、staging 向け PR）

- 社長指摘: トップ「友だちと貸切で遊ぶ」の「貸切できる作品を見る」で開く `/{org}/private-booking-select` は、日付・時間帯を選んだ人向けのページだったため、日付なしで開くと「選択された日時」が空、作品はプルダウンだけ、確認ボタンも押せなかった。
- 対応: 日付・時間帯が無いときは見出し「貸切できる作品」で、貸切を受け付ける作品（`isScenarioAcceptingPrivateBooking`、公開用の作品一覧）を作品カード（`ScenarioCard` に `note`・`selected` を追加）の一覧で出す。作品名・作者の検索と人数のチップで絞れる。カードを押すと作品ページの貸切リクエストのタブ（`/{org}/scenario/{slug または id}?tab=private`）へ。日時あり（カレンダー・リストの貸切申込チップ）は見出し「{日付} {時間帯} の貸切: 作品を選ぶ」、同じカードの一覧から選ぶと下に人数・料金・希望店舗と確認ボタン（従来どおり）。一覧の部品は `src/components/private-booking/PrivateScenarioGrid.tsx`。
- 公開用の作品一覧 API（`PUBLIC_FIELDS`）に `slug` を追加（DB 変更なし）。staging の配備前の手元確認では slug が無いので id で開き、作品ページが slug の URL に置き換える。
- MMQ 全体トップの貸切の欄は、店舗ごとに申し込む案内と「参加店舗から選ぶ」（参加店舗の欄へ）にした。貸切の流れのページの「1. 貸切を始める」を新しい導線の文に直した。
- 確認: `src/pages/PrivateBookingScenarioSelect.test.tsx`（日付なし・ありの 4 件）、全 vitest、`npm run verify`、手元（staging 接続）で 375px と PC 幅: 店舗トップ →「貸切できる作品を見る」→ 作品 → 作品ページの貸切リクエストのタブ（「まずはメンバーを招待して貸切グループを作成」あり）、カレンダーの貸切申込チップ → 作品を選ぶ → 貸切リクエスト確認ページ。

## 2026-10-13 / 再送ループ対応の 2 系統の統合: Codex の #1106（main）を staging にそろえる（fix/merge-codex-retry-concurrency、staging 向け PR）

- 経緯: 同じ高負荷の件に 2 系統が並走した。(a) Claude: 失敗経路の `pg_sleep(2)`（20261013120000、社長承認）＋ #1103（20261013130000 古い日程回答を飛ばして成功、API 層 `writeFailureLimiter` と画面側 `repeatFailureBackoff` の回数制限）。main には #1104 で反映。(b) Codex: #1106（main に squash 済み 470b00011）。20261013130001（advisory lock で同じ利用者・公演の並列保存を即時拒否、`pg_sleep` 除去）、20261013130002（スタッフ保存の古い expected は例外ではなく 40001＋最新内容を返し、旧画面の例外再送を止める）、画面側の再送抑制の書き換え。Codex は 130001・130002 を staging/本番 DB に先行適用済み。
- 途中で本番 4 関数に 2 秒待ちを重ね直したが（11:15 UTC ごろ）、その後の 130002 適用（11:25 UTC ごろ）で再び外れた。社長判断で **2 秒待ちは戻さない**（本番の失敗の巻き戻しが毎秒 0 件で落ち着き、130002 で解決したため）。
- 統合: Codex のコミット 470b00011 を staging にそのまま取り込んだ（衝突は `supabase/structure/prod.json` のみ。live の本番から読み取りで作り直した値と一致）。staging DB には適用済みなので db:push はしていない。`db:status:staging` 746 件・未適用なし、`db:drift:staging`・`db:drift:prod` とも差分なし。
- 画面側の再送抑制は **Codex 版の `src/lib/repeatFailureBackoff.ts` を残し、呼び出し側（`apiClient` の writeWithBackoff、`privateGroupGuestSession`）は #1103 のまま**にした。同じファイルを Codex が書き換えたので、モジュールは 1 つ。理由: 「同じ要求が 3 回続けて失敗したら 10 秒空ける」は満たしたうえで、#1103 版の「待ってから古い内容を送る」をやめて即時に断る（古い回答を後から送らない）、同じ操作の同時送信を 1 件に絞る、localStorage と Web Locks で別タブ・再読み込み後も数を引き継ぐ（保存内容・認証情報は残さない）点が上回るため。API 層 `writeFailureLimiter` も Codex 版（処理中の枠を確保し finally で解放）を採用。main と staging でこれらのファイルは同一。
- 検証: 関連 vitest（repeatFailureBackoff・writeFailureLimiter・reservations の特性テスト・privateGroup 系）、全 vitest 2203 件、`npm run verify`、`npm run test:rpcs`、`check:migration-rollbacks`、架空 DB の `scripts/test-staff-participation-seats-db.mjs`・`scripts/test-private-group-access-db.mjs`（取り下げ済み候補を含む日程回答は飛ばして成功）、`scripts/test-retry-concurrency-db.py`（docker の network none の PostgreSQL 17 で 2 接続の競合。python 標準ライブラリだけで動くので残した）。
- main 向けの追加 PR は作らない（#1106 で取り込み済み）。

## 2026-10-13 / 再送ループの恒久対応: 古い日程回答は飛ばして成功、失敗が続く送り元を待たせる（fix/stale-writes-skip-and-rate-limit、staging 向け PR）

- 社長決定で、上の止血（20261013120000）の恒久対応のうち 2 と 4 を行った。
- **2. 古い日程回答を無視して成功を返す（DB）**: migration `20261013130000_private_group_date_responses_skip_stale.sql`。`private_group_member_action` の `date_responses` は、配列の要素のうち、候補日がそのグループに無い・存在しない・取り下げ済み（`withdrawn_at IS NOT NULL`）・不採用（`status='rejected'`）・回答値が不正・形が不正なものを**エラーにせず飛ばし**、有効なものだけ保存して `true` を返す（全部飛ばしても成功）。配列でない／100 件超は従来どおりエラー。2 秒待ちの止血（`EXCEPTION WHEN OTHERS`）はそのまま。トリガー `guard_withdrawn_private_group_response` は変えない（RPC で飛ばすので通常は届かず、届いたら従来どおり拒否）。`sync_event_staff_participations` は「期待値の不一致」が正しい保護なので変えない。staging 適用済み（md5 `8a4137e9…`）。staging の実データ（問題のグループ 5c12352b…）で、取り下げ済み＋存在しない＋有効の 3 件を送ると成功し有効な 1 件だけ保存されることを、巻き戻す取引の中で確認。
- **4. 失敗の回数制限（DB ではなく API 層と画面側）**: DB の中で数えると、失敗した取引ごと数が巻き戻って残らない。別接続で記録する `dblink` は staging で使えるが（未導入）、Supabase の `postgres` は superuser ではなく、パスワード無しの自己接続は「password or GSSAPI delegated credentials required」で拒否された（巻き戻す取引の中で 3 通りの接続先を試験、鍵を SQL に埋める案は不採用）。そこで指示どおり次に切り替えた。
  - API 層 `api/_lib/writeFailureLimiter.ts`: スタッフ参加の保存（`sync-staff-participation`）で、キー `event:<公演>:<ユーザー>:<IP>` ごとに 10 分の窓で失敗を数え、5 回を超えたら最後の失敗から min(10, 2×(回数−5)) 秒は DB へ送らず 429＋`Retry-After` を返す。成功で数を消す。数はサーバーの各インスタンスのメモリ（インスタンスが替われば消える歯止め）。
  - 画面側 `src/lib/repeatFailureBackoff.ts`: `privateGroupMemberAction`（グループの全操作）と `apiClient` の書き込み（POST/PATCH/DELETE、GET は対象外）で、同じ宛先・同じ内容が 3 回続けて失敗したら、次からは前回の失敗から 10 秒空けて送る。成功で数を消す。
  - 限界: 日程回答は画面から Supabase の RPC を直接呼ぶので API 層の制限は通らない。古い版の画面には画面側の対策も届かない（2 の「成功を返す」でループの原因自体を断つ）。スタッフ参加の古い画面は API 層の 429 で抑える。
- テスト: `scripts/test-private-group-access-db.mjs` の「別グループの候補日を含むと全体を巻き戻す」を新仕様（飛ばして成功・有効なものだけ保存・配列でない／101 件はエラー・rollback で元の厳しい判定に戻る）に変更。`api/reservations.characterization.test.ts` に 429 の試験、`src/lib/repeatFailureBackoff.test.ts` を追加。
- 本番で必要な手順: リリース時に `db:push:prod`（20261013120000 と 20261013130000 が入る）→ `db:structure:prod`・`db:drift:prod`、Vercel の本番反映（API 層と画面側の制限）。2 秒待ちの止血を外すかは、本番反映後に失敗件数が落ち着いてから判断する。

## 2026-10-13 / 本番 DB の混雑の止血: 失敗する保存を即座に再送し続ける端末（fix/throttle-failing-writes-hotfix、staging 向け PR）

- 事象（2026-10-13 午後）: 本番 DB で失敗する要求を即座に再送し続ける端末が 2 つあり、毎秒約 700 件の失敗・巻き戻しが起きてサイト全体が重くなった。送り元は (1) 貸切グループ `5c12352b-6f5d-4f86-ba76-9e9e1b105af6` への日程回答の保存（`private_group_member_action` の `date_responses`、トリガー `guard_withdrawn_private_group_response`・`guard_private_group_browser_write`）、(2) スケジュール画面のスタッフ参加の保存（`sync_event_staff_participations`）。
- 止血: 本番の 4 関数を直接書き換え、**失敗するときだけ 2 秒待ってからエラーを返す**ようにした（成功時の動き・結果・エラー文は同じ）。`private_group_member_action` と `guard_private_group_browser_write` は本体全体を `EXCEPTION WHEN OTHERS THEN PERFORM pg_sleep(2); RAISE;` で包む（`date_responses` の「回答対象の日程が見つかりません」は手前でも 2 秒待つので、この失敗は合計 4 秒）。`guard_withdrawn_private_group_response` は取り下げ済み候補日と lock_not_available の 2 つのエラーの前に 2 秒。`sync_event_staff_participations` は既存の lock_not_available と、ほかのすべての失敗で 2 秒。
- 記録: migration `20261013120000_throttle_failing_private_group_and_staff_writes.sql`（同名 rollback は待ちを入れる前の staging の定義）、`supabase/rpcs/` の 3 ファイルも同じ変更。staging 適用済み。本番と staging の `md5(prosrc)` は 4 関数とも一致（f271968e… / f0ee74b7… / 10bb4df1… / 44a3eab8…）。違いは `guard_withdrawn_private_group_response` の search_path だけ（本番 `public`、staging `public, pg_temp`。migration は staging の版を基準）。ほか 3 関数は staging と本番の元の本文が同じだった。
- 本番の扱い: この番号は本番の `schema_migrations` に登録していない（本番 DB へは書き込まない方針）。リリース時の `db:push:prod` で同じ本文が再適用されるだけで無害（guard_withdrawn は search_path が staging に揃う）。`prod.json` は直接書き換え後の本番から取り直し、`db:drift:prod` は一致。
- 確認: `scripts/test-staff-participation-seats-db.mjs` に新しい定義を足して流し、全項目合格・失敗はすべて約 2 秒（成功は即時）。`scripts/test-private-group-access-db.mjs` の手元版でも、存在しない候補日 4 秒・空メッセージ 2 秒・直接書き込みの拒否 2 秒・正しい回答は即時を確認（既存の 2 本は古い migration を読むので、そのままでは新しい定義を通らない）。
- **恒久対応の候補（未着手）**: (1) 画面側の再送ループを特定して止める（グループページの日程回答の保存と、スケジュール画面のスタッフ参加の保存。失敗時に自動で再送している箇所、react-query の retry・effect の依存の回り続けを疑う）。(2) 失敗時の待ち時間を固定の 2 秒から設定値にする（または失敗の回数に応じて伸ばす）。(3) 原因が直ったら 2 秒待ちを外すかを判断する（`EXCEPTION WHEN OTHERS` は失敗のたびに副トランザクションを作るので、負荷が落ち着いたら外す価値がある）。

## 2026-10-12 / RPC の点検で以前から落ちていた 2 件（fix/rpc-tests-cancellation-fee、staging 向け PR）

- `npm run test:rpcs` の失敗 2 件は、どちらもテストではなく DB 側の古い関数が原因。値の食い違いではなく「呼ぶと必ずエラー」だった。
- `calculate_cancellation_fee(uuid)`: reservations に無い列 `is_private_booking`（この列は schedule_events 側）を読み、作られた 20260404100000 から一度も動いていない（42703）。中身も現行の規定と違う（通常の既定が 24 時間前 50%・開演 100%、貸切も参加者合計で計算、予約時に固定した規定ではなく今の店舗設定を読む）。どこからも呼んでいない。キャンセル料の正は予約時の固定規定（`reservations.cancellation_policy_*`）と `src/lib/cancellationPolicy.ts` の `calculateCancellation`（請求は `cancellationBilling.ts`、お客様の取消可否は DB の `assert_customer_cancellation_policy`）。直さずに消した。
- `admin_recalculate_reservation_prices(uuid)`: 20260201210000 で、既にあった `(uuid, text[] DEFAULT NULL)` 版と並べて作られ、引数 1 つで呼ぶと版を決められず（42725）呼べなかった。サーバー（`api/_lib/reservations/update.ts`）は 2 つの版を呼ぶ。1 つの版を消し、1 引数の呼び出しも組織確認つきの 2 引数版に届くようにした。`scripts/staging_security_test.sql` D.2 はこれまで「版を決められない」エラーで PASS になっていた（見かけの合格）。今後は FORBIDDEN_ORG で拒否されて PASS。
- DB: migration 20261012140000（同名 rollback は消す前と同じ中身・権限で作り直す。手元で 削除→戻す→削除 の往復と md5・権限の一致を確認）。staging 適用済み。`smoke_test_rpcs.sql` の 3 は「古い版を作り直していない」確認に変更。`expected-function-overrides.json` の値 `null` を「migration で消した関数」と読むよう `scripts/check-db-baseline.sh` を変更。
- 確認: `test:rpcs` 全件、`verify`、取消規定まわりの単体テスト 6 ファイル 47 件、`db:status:staging`、`db:drift:staging`（#1089 の取り込み後に staging.json を取り直して差なし）。
- 予約確認画面の表示（`cancellationSummary.ts`・`useBookingCancellationTerms`）と計算の一致: 表示の規定は `get_public_cancellation_policy_for_context`、予約時の固定は `set_reservation_cancellation_policy_snapshot` で、どちらも `resolve_operating_setting` を同じ順（組織→店舗→作品→公演）で解く。料率の段の判定（開演までの時間 ≤ hours_before）と「無料で取消できる期限」（受付期限と料金が始まる時刻の遅くない方）は `calculateCancellation`・`evaluateCustomerSelfCancel`・DB の `assert_customer_cancellation_policy` と同じ。
- **本番で必要なこと**: migration 20261012140000 を本番へ（本番の 2 関数は staging と同じ中身。どこからも呼ばれていない）。本番適用の日に `supabase/structure/prod.json` から 2 関数を外し、`expected-function-overrides.json` の null 2 件を外す。

## 2026-10-12 / 公開前検証の指摘（fix/release-audit-findings、staging 向け PR・未取り込み）

- 出典: 独立検証の報告（`release-audit-report.md` の「現コードの問題と根拠」）。受付連動（公開トップの貸切入口）は別担当（fix/private-entry-availability）なので触っていない。
- P1 取消規定を確認できないまま予約できた: `useBookingCancellationTerms` が `status: 'loading' | 'ready' | 'error' | 'fallback'` を返す。確定できるかは `cancellationTermsGate`（同ファイル）だけで決め、`ready` になるまで「予約を確定する」を押せない（「キャンセル規定を読み込んでいます…」）。取得失敗・既定値（`isFallback`。店舗の規定が未設定の場合も含む）は赤い案内「店舗のキャンセル規定を取得できませんでした。再読み込みしてください」と再読み込みボタンを出し、既定値（48 時間）で案内しない。48 時間以内の同意（#1063）は `ready` の値で判定。E2E の予約確認の試験台（`e2e/fixtures/functional-qa-mocks.tsx`）は店舗の規定を返すようにし、`terms-error` の場合を追加。
- P2 通常予約の詳細が割引前の金額だった: マイページの予約詳細はサーバー確定金額 `final_price` を合計に出し、内訳（単価×人数・割引・合計）を `src/pages/MyPage/utils/reservationPriceBreakdown.ts` で作る（割引＝割引前−合計なので必ず一致）。予約の読み取りに `discount_amount` を追加。予約完了画面（`useBookingSubmit` の `final_price`）とマイページ一覧（`final_price`）は元から同じ計算元。人数変更の「いまの合計」も `final_price` に統一。
- P2 ゲストの「この端末から退出」後に情報が残った: ゲスト由来の state（名前・メール・電話・回答・PIN 入力・PIN の誤り表示・発行した PIN・新規参加の印）を `src/pages/PrivateGroupInvite/guestDeviceState.ts` の `useGuestDeviceState` にまとめ、退出・グループから抜ける・本人確認の期限切れで `reset`。端末の保存は `clearGuestDeviceStorage` で参加情報（名前・メール）・本人確認の印（トークン）・このグループの「同じメンバーで次の貸切」の記憶を消す。退出前の memberId を含む取得結果（react-query）も消す。「参加した印」（名前もメールも含まない）は点検 57 どおり残す（次に開くと「PIN で入る」）。
- schema 同期（DB の変更なし）: `stores.sql` に `public_name`（列・公開列の権限・コメント）と `kit_fixed`、ビュー `stores_public.sql` を新設（README に登録）。staging の構造（`supabase/structure/staging.json`）と列を照合し、ほかに未同期だった列も同期: `global_settings`（20260523030000 の 11 列・20260526000000 の `kit_transfer_offsets`）、`organization_scenarios`（20260523000000/010000 の 4 列）、`private_groups.scenario_master_id`（20260411000000）、`reservations`（`confirmed_at`・`cancelled_by`・`arrived_late`）、`scenario_masters.is_shared`、`private_group_message_photos.byte_size`（20261012110000）。`customers.sql` から 20260519000000 で削除済みの 4 列（notes・visit_count・total_spent・last_visit）を外した。ビュー 3 本は列の照合で差なし。
- 確認: `verify`・`test:unit`（299 ファイル/2,129 件）・`check:design-tokens`・`check:org-scope`・`check:jst-date`・`check:cancellation-rpcs`・`check:migration-rollbacks`・予約確認の試験台 E2E（20 件）。375px（作業メモの `shots/relfix_*.png`: 予約確認の読込中・取得失敗、割引後の予約詳細、退出後の再参加欄（新規・PIN））。画面は実コンポーネント＋架空データ。
- **残り（別作業）**: 人数変更のサーバー処理（RPC `update_reservation_participants`）は `final_price = 単価×新人数` に直すため、割引のある予約で人数を変えると割引が合計から外れる（`discount_amount` は残る）。画面の人数変更には「いまの予約の割引（−¥1,000）は、変更後の合計に含めていません」と出して実際の動きと合わせた。直すには DB の変更が必要。規定を読めない店舗は予約確認で確定できなくなる。staging を読み取りで確認した結果（2026-10-12）、クインズワルツ（queens-waltz）の有効な店舗はすべて読めたが、札幌（queenswaltz-sapporo）は予約サイトの公開状態が `approved` でなく取消規定（reservation_settings）も無いため読めず、札幌の公演は確定できない。本番反映前に、本番で札幌の予約サイトを公開しているか・取消規定が設定済みかの確認が必要（本番は見ていない）。

## 2026-10-12 / クーポンの「使える店舗」から店舗数を外す（fix/coupon-store-count、staging 向け PR・未取り込み）

- #1070 の「使える店舗: クインズワルツ（東京・埼玉 7 店舗）」がトップの「6 店舗」と食い違った（点検 33 の再発。トップはレンタルスペースを数えない）。数は出さず「使える店舗: クインズワルツの全店舗（東京・埼玉）」にし、押すと店舗名の一覧（お客様向けの名前、馬場(レ)を含む。臨時会場・休止中は除く）が開く（`src/pages/MyPage/components/CouponUsableStores.tsx`）。
- API は `usable_stores_label` に加えて `usable_store_names` を返す（`src/lib/couponUsableStores.ts` の `couponUsableStores`）。使える店舗を絞ったクーポンは今のまま店舗名を並べ、押せない。
- 決まり: お客様向けの画面で店舗数を出すときは `countPublicStores`（トップと同じ数え方）だけを使う。別の数え方の数は出さない。

## 2026-10-12 / クーポンを使える店舗の案内（fix/faq-coupon-scope、staging 向け PR・未取り込み）

- 社長要望: 「本店のクーポンは札幌店では使えない」ことが分かるように。お客様向けの文に「運営」の語は使わない（社長指示）。
- FAQ: 共通（コードの既定 `COMMON_FAQ_DATA` と貼り替え文 A15）に「クーポンはどの店舗で使えますか？」、クインズワルツ個別（B8）に「クインズワルツのクーポンは札幌店で使えますか？」。`docs/ops/FAQ_貼り替え文_2026-10.md` の SQL 1（15 件）・SQL 2（8 件）も更新。前回の手順にあった番号の誤り（A12 → A13）も直した。
- マイページのクーポン: 各カードに「使える店舗: クインズワルツ（東京・埼玉 7 店舗）」。`/api/coupons?type=all` が `usable_stores_label` を付ける（`api/_lib/coupons/usableStores.ts`、文の組み立ては `src/lib/couponUsableStores.ts`）。店舗数は臨時会場・休止中を除き、レンタルスペースは含める（社長指定の 7 店舗。予約サイトのトップの「6 店舗」とは数え方が違う）。対象店舗を絞ったクーポンは店舗名（お客様向けの名前）を並べる。読めないときは表示しない。
- 予約確認画面: 候補（`/api/coupons?type=available&event_id=`）は公演の組織のクーポンだけに絞っている（`handleAvailable` の `organization_id` 条件）ため、別の組織のクーポンは元から出ない。変更なし、テストを追加（`api/coupons.test.ts`）。
- **残り**: staging への SQL（調整役）、本番の貼り替え（社長の承認後）。

## 2026-10-12 / FAQ の社長決定の反映（fix/faq-decisions、staging 向け PR・未取り込み）

- 社長決定: 開催判断の時刻はキャンセルポリシーが正（公演開始の 4 時間前）。「車で行けますか？」は共通 FAQ から外してクインズワルツ個別 FAQ へ（回答「駐車場はありません。公共交通機関でお越しください。」）。
- `docs/ops/FAQ_貼り替え文_2026-10.md`（#1065 で追加した文書を更新）: 共通 14 件（A）と個別 7 件（B）の完成文、本番の手順、staging 用 SQL を「共通」「個別」の 2 ブロックに。個別は「開催判断」を直し、誤字「問い合わせにてに」も直した。
- コードの既定 FAQ（`FAQPage.tsx` の `COMMON_FAQ_DATA`）: 「車で行けますか？」を外し、「オープン公演の開催・中止はいつ決まりますか？」（キャンセルポリシーの時刻、多くは 4 時間前）を追加。
- **残り**: staging への SQL（調整役）、本番の貼り替え（社長の承認後）。

## 2026-10-12 / 貸切・グループ・ゲストの仕上げと写真容量の見える化（fix/group-guest-polish、staging 向け PR・未取り込み）

- 点検 `脱落ポイント点検_2026-10-11.md` の 50・51・52・53・54・55・56・57・58・35・42・43・44・46・28。49 は #1026、配役・申込は #1035/#1042/#1044 で済み。44 は #1028 で解消済み（希望店舗は「日程と場所」の 1 か所、料金は「料金」欄）を手元で確認、変更なし。
- 50・42: 申込済み・確定後は日程タブの自分の列を押せる見た目にせず「店舗へ申込済みのため、日程の回答は締め切りました」。主催者の空欄は申し込んだ候補日を ○ とみなす（`buildAnswerTable` の `organizerRequested`。直接申込の主催者が「未回答」に見えていた）。メンバータブ・マイページのメンバー管理の「未回答」は申込後は出さない（「申込済み」）。マイページの進み具合（招待・候補日・回答を済み扱い）は元のまま。
- 51: 参加前の招待ページに「このグループのいま」（募集中／店舗の返事待ち／確定・候補日・1 人あたりの料金。`invitePreviewModel.ts`）。確定日時・会場は参加前の読み取り（preview）では返さない決まり（#659）なので「参加後に確認できます」。上の「開催日時・日程調整の状況はグループ参加後に…」は参加前には出さない。
- 52〜54・56: ゲストの参加欄を `GuestJoinPanel.tsx` に。はじめては「名前だけで参加できます」→「すでに参加した方は PIN で入る」→ 会員のログイン・新規登録（小さく 1 か所。上の大きい新規登録カードは削除）。再訪（この端末で参加した印 `private_group_guest_joined_<招待コード>`・PIN メールのリンク `?sheet=pin`）は「PIN で入る」を大きく、新規参加は畳む。PIN 画面には「参加する」を出さず、例は「例: 1234」を薄く。見出しと入力欄を `htmlFor` で結んだ。名前欄に「ほかのメンバーに表示されます（ニックネームでも可）」。同じメールで参加しようとしたら PIN 画面へ（メール欄を入れておく）。
- 55: チャットの入力欄の上に「メッセージを長押しすると、返信・リアクション・コピーができます（パソコンは右クリック）」。× で閉じると端末に記録して出さない。
- 57: ゲストの ⋮ に「通知はメールで届きます（日程の確定などはすぐ、未読は毎朝 9 時）」と「この端末から退出（グループには残ります）」。退出後は招待ページの再訪の形（PIN で入る）。
- 58: 会員が参加したら本人のベルに「次にやること」（候補日に回答／候補日を待つ／店舗の返事待ち／日時を確認）。DB: migration 20261012100000（同名 rollback。`customer_notice_on_group_message` の member_joined の分岐だけ変更）。参加完了画面に「次は、日程に回答しましょう」などと主ボタン（日程に回答する → 日程タブ）。状態の箱は元から「日程に回答する」。
- 28: 参加完了画面の PIN を一番上に、「PIN はメールでもお送りしました（メール）」。絵文字を削除。
- 35: 申込シートの確認段・作品ページからの貸切申込の確認・申込完了・確定後の概要（申込内容の箱）に「マイページから取り消せるのは公演の30日前までです。それより後の取消は店舗へご連絡ください（7日前からはキャンセル料がかかります）」（`src/lib/privateCancelNotice.ts`。既定の受付期限・料金の段から作る）。期限は変えていない。
- 43: 作品ページからの貸切申込の完了画面を `PrivateBookingRequest/components/PrivateBookingRequestSuccess.tsx` に分け、店舗の返事の目安（通常 2〜3 日）・メンバー招待（リンク・コピー・LINE）・取消の案内。概要の参加メンバーに、1 人だけのとき招待の一言。
- 46: 端末が通知を止めているとき（許可が拒否）はトーストではなく案内カード（iPhone／Android／パソコンを切り替えて手順。既定はいまの端末。`pushBlockedHelp.ts`）。
- 写真容量（社長決定）: 管理画面の貸切グループ一覧の上に「チャット写真の容量」（総容量・今月の増加量・枚数・50GB の目安の棒）。サイト全体が 50GB を超えたら赤い注意。DB: migration 20261012110000（同名 rollback）で `private_group_message_photos.byte_size`（元画像＋小さい版、追加時にトリガーで storage.objects から）・既存分の埋め・集計 `private_group_photo_storage_usage()`（スタッフ・管理者だけ）。
- DB は 2 本とも staging 適用済み・本番未適用。`staging.json`・`expected-function-overrides.json`（既存の権限の記録は残し本文の md5 を更新、新しい 2 関数を追加）・`expected-table-overrides.json`（写真の表）。手元で baseline 再現 OK。Edge Function `send-guest-pin`（メールのリンクに `?sheet=pin`）は staging に配備済み。**本番反映は DB 先行**（画面が新しい集計関数を読むため）。
- 確認: 手元（vite 5182 ＋ ローカル Supabase）で 375px（作業メモの `shots/g10_*.png`: 招待ページ はじめて・店舗の返事待ち・再訪・PIN、参加完了、参加後の日程タブ、ゲストの ⋮、チャットの案内、貸切申込の確認と完了、管理画面の容量）。ベルは手元 DB で参加を試し、文面を確認。
- **残り**: 申込済みグループの参加前の「候補日」は申し込んだ候補日だけに絞れていない（preview は申込の中身を返さないため、グループの候補日をそのまま出す）。店舗ごとに取消期限を変えている場合でも案内文は既定（30 日・7 日）のまま。

## 2026-10-12 / 公開ページの文言と案内（fix/public-pages-text、staging 向け PR・未取り込み）

- 点検 `脱落ポイント点検_2026-10-11.md` の 21・22・31・32・6（残り）。DB 変更なし。
- 21 キャンセルポリシー: 組織のページは、規定の中身が同じ店舗をまとめて 1 回だけ出し「対象店舗（N店舗）」に店舗名を並べる（`src/lib/cancellationPolicyGroups.ts`。比べないのは店舗の id・名前・最終更新日だけ。最終更新日はまとめた中で一番新しい日）。店舗名はお客様向けの名前（`stores_public.public_name` → 組織名を外した名前、臨時会場は「特設会場」）。staging の queens-waltz は 12 件 → 2 件。全体の `/cancel-policy` は組織ごとのページへのリンク一覧。
- 22 使い方ガイド: 今の画面に合わせて全面的に書き直し（1,459 行 → 252 行）。ログイン不要の画面は staging につないだ手元の 375px の実画面（`public/guide-images/*.webp`、`/guide` と重ならないよう別名）。マイページの貸切カードとグループページの上部は、ログインが要るため実際の部品（`PrivateBookingCard`・`GroupStatusBox`・`GroupTabBar`）に見本の値を入れて出す（`src/pages/static/guide/GuideDemos.tsx`、押しても動かない）。画面を変えたら画像を撮り直す。
- 31 予約完了メール: 店舗が文面を設定していないときの既定文面に「キャンセルについて（無料で取り消せる期限の日時）」「当日のお支払い（税込・店舗で現金またはカード。店舗が支払い案内を設定していればそれ＋税込）」「マイページへのリンク」を追加。期限は実際の取消判定と同じ設定（`resolve_operating_setting` で公演 → 作品 → 店舗 → 組織）から `supabase/functions/_shared/booking-confirmation-guide.ts` で計算（画面の `freeSelfCancelHours` と同じ考え方、テストで一致を確認）。店舗の独自文面でも `{cancel_deadline}`・`{payment_note}`・`{mypage_url}` を書けば差し込まれる（管理画面の既定テンプレも同じ 3 つを使う形に）。Edge Function の配備は `npm run functions:deploy:staging`（send-booking-confirmation）。
- 32 利用規約: 案だけ `docs/legal/利用規約_改訂案_2026-10.md`（ゲスト・PIN、チャットと写真、事前配役アンケート、通知、主催者の引き継ぎ、キャンセルと人数変更。法務に確かめてほしい 8 点つき）。画面（`TermsPage.tsx`）は変えていない。
- 6（残り）FAQ: 本番・staging の「設定 › FAQ」（queens-waltz の `common_faq_items`）に貼る完成文と staging 用 SQL を `docs/ops/FAQ_貼り替え文_2026-10.md` に。誤字 2 か所・貸切 14 日前・変更は人数とキャンセル・期限後は問い合わせフォーム・「事前配役アンケートとは」を追加。ついでに、個別 FAQ の「開催判断は前日 23:30〜24:00 頃」がキャンセルポリシーの「公演開始の 4 時間前」と食い違うことを記載（要判断）。
- 確認: 手元（vite 5181 → staging）で 375px。`shots/public_cancel_policy_*.png`・`shots/public_guide_*.png`（作業ツリーのみ、コミットしない）。
- **残り**: 予約完了メールの実送信の確認（staging 配備後）。利用規約は社長・法務の確認後に画面へ差し替え。FAQ の本番貼り替えは社長の承認後。

## 2026-10-12 / 予約の確認・詳細・取消の情報と店舗への連絡手段（fix/booking-cancel-info、staging 向け PR・未取り込み）

- 点検 `脱落ポイント点検_2026-10-11.md` の 34・2・20・39・41・5・18・14・13・36・38・37・30・40・29。社長決定: 人数を減らせる期限はキャンセルポリシーの「24 時間前」、店舗の電話番号は出さず問い合わせフォーム、料金注記は「税込。当日、店舗で現金またはカードでお支払いください。」（`src/lib/priceNote.ts`）。
- 予約確認画面: キャンセル規定の要点（`src/lib/cancellationSummary.ts`、店舗の規定は `fetchPublicCancellationTerms`＝RPC 1 本。読めないときは既定値）。無料の期限を切った公演は赤い注意と同意チェック、チェックするまで「予約を確定する」は押せない。
- 予約詳細: 「無料で取消できる期限: 10/27(火) 19:00 まで」、取消できないときは「店舗に問い合わせる」（貸切と同じ `PrivateGroupInquiryDialog` を `kind="booking"` で。予約番号・作品・日時・会場入り）。合計金額。取消確認は公演・日時・人数・予約番号・キャンセル料、スマホでは「やめる」が上・赤が下（`ConfirmDialog` の危ない操作も同じ並び・スマホ 44px）。店舗のアクセス欄（フッター）と参加団体一覧にも「問い合わせる」。
- 人数を減らせる判定: 取消期限（48h）→ 予約時に固定した変更期限（`reservation_change_deadline_hours_snapshot`、無ければ 24h）。DB のトリガーは元から変更期限で止めているので DB 変更なし。FAQ の既定文も合わせた（日付は変えられない旨も）。
- 待ち時間（36）: 予約は空席・締切・組織・料金・休日・顧客の確認を並列にし、保存できたらメールを待たず完了画面（メール欄は「送っています…」→結果）。取消・人数変更は保存できた時点で画面を進め、メール・キャンセル待ち通知は裏で同じ順に送る（`resolveWhenSaved`）。送信中にタブを閉じようとするとブラウザの確認（`src/lib/pendingNotifications.ts`）。予約詳細の読み込みも並列化。同じ待ち時間を与えた模擬計測（読み 0.3 秒・保存 2 秒・メール 2.5 秒）で、予約 6.9→3.2 秒、取消 7.0→2.0 秒、人数を減らす 8.5→2.6 秒（実環境はログイン操作ができず未計測）。
- スマホ: 作品ページは公演を選ぶと「予約確認へ進む」を画面下に固定（合計金額付き）。マイページのタブに文字、右下のボタンに「公演を探す」、予約カードをリンク扱い、ヘッダーの「ログイン」に文字、作品一覧のハートに読み上げ名。
- 確認: 手元の模擬画面で 375px（作業メモの `shots/booking_*.png`）。DB 変更なし。
- **残り**: 実環境（staging）でのログイン後の通し確認と秒数の実測。注意事項を「要点 3 つ＋すべて見る」に畳む案（18 の後半）は未着手。

## 2026-10-12 / 新規登録・ログインの戻り先と、選んだ公演の引き継ぎ（fix/signup-login-return、staging 向け PR・未取り込み）

- 点検 2026-10-11 の 1・3・12・48・24・9・10・11・25・26。社長決定: プロフィールの必須項目（お名前・電話・都道府県・生年月日・パスワード・同意）は減らさない。
- 戻り先の決まりを `src/lib/authReturn.ts` に集約。戻り先は URL（`/login?redirect=`・確認メールのリンクの `/complete-profile?next=`）に載せる。タブ内の `returnUrl` は Google ログイン用だけ。ログイン画面を戻り先なしで開くと古い `returnUrl` を消す（クーポン受け取りだけは `state.keepReturnUrl` で残す）。
- 1: 新規登録の `emailRedirectTo`（再送も）に `?next=` を付けた。別タブでリンクを開いても、登録後は選んでいた公演（作品・公演・人数）や招待ページに戻る。クーポン画面を挟む場合は、使い方より上に「元の画面に戻って続ける」。Google で新規登録はプロフィール登録画面へ直接戻し `next` へ。
- 3: 作品ページ上部の「貸切リクエストを作成」は未ログインなら押した時点でログインへ（戻り先付き）。`/group/create` の「ログインが必要です」に「新規登録」「作品に戻る」。
- 12・48: 作品ページで選んだ公演・人数は `?event=&count=` に書き戻す（ブラウザの戻るで消えない。`count` 変更で画面上へ飛ばないよう ScrollToTop の除外に追加）。予約確認画面は `?step=confirm`（再読み込み・戻るで消えない。「戻る」ボタンは履歴を戻る）。
- 24: 元のカレンダーで公演を押すと `?event=` 付きで作品ページを開く（リストと同じ）。
- 9: AppRoot のプロフィール必須ガードを、見るだけのページ（トップ・作品ページ・カタログ・店舗一覧・案内ページ。`src/lib/profileGate.ts`）では止めない。予約確認（`step=confirm`）・貸切申込・グループ作成・グループ参加（ログイン中の新規参加）で登録を求め、登録後はその画面に戻る（`useRequireCompleteProfile`）。
- 10: 例の文字に「例:」を付けて薄く。必須の残り数を上と送信ボタンに表示。同意は登録完了画面の 1 回だけ（新規登録画面の「同意したものとみなされます」を削除）。お知らせメールの既定は変更なし。
- 11: リンクが期限切れ・使用済み（URL の `error_code=otp_expired` など）は「リンクの期限が切れました」＋再送ボタン。「同じブラウザで開く」の案内は削除。
- 25: 新規登録に「この後の流れ」を 1 行。ログイン・新規登録画面に予約中の作品名・日時・人数（同じタブ内の説明。戻り先が一致するときだけ）と「元の画面に戻ります」。ヘッダーの「ログイン」「新規登録」も今の画面を戻り先にする。
- 26: 登録完了画面の文言（2 秒・行き先）は #1026 のまま。クーポン画面のボタンを行き先に合わせた。
- 確認: 手元（vite 5181 ＋ ローカル Supabase。Mailpit に届いた確認メールのリンクを verify に通し、メールに載った戻り先で開いた）で 375px。公演と人数を選ぶ → 新規登録 → 別タブでリンク → プロフィール登録 → クーポン → 元の公演（人数 3 のまま）。ログインの戻り先・確認画面の再読み込み・カレンダーからの選択も確認（作業メモの `shots/signup_*.png`）。E2E `e2e/auth-return.spec.ts` を追加。DB 変更なし。
- 注意: 手元の Supabase は戻り先 5173 しか許さないため、5181 で動かした今回はリンク先の画面を手で開いた。staging・本番は `/**` で許可済み（supabase/config.toml・管理画面の Redirect URLs）。
## 2026-10-12 / 残席の表記を「予約済み/定員」にそろえる（fix/seat-format-unify、staging 向け PR・未取り込み）

- 社長決定: お客様向けの残席はカレンダーの「2/8」＋「残少」（残席 1〜3）・「満席」に統一。`src/lib/seatLabel.ts` を追加し、トップの一覧カード・残りわずか・全体トップ（`seatState`）、リスト、作品ページの公演一覧・申込パネル、予約確認、全国版の作品ページ、マイページの遊びたいリストを置き換え。キャンセル待ち・エラー文は据え置き。単体試験を更新（`seatLabel.test.ts` 追加）、機能 QA の E2E は手元で通過。
- 確認: staging 接続の手元で 375px（作業メモの `shots/seatfmt_*.png`）。DB 変更なし。

## 2026-10-12 / カレンダー・リストを元の本番の見た目に戻す（fix/calendar-list-original-look、staging 向け PR・未取り込み）

- 社長決定: カレンダーもリストも元のほうがよい。#1074（空き枠チップの店舗一覧廃止・行を詰める）は中止して閉じた。#1053/#1056/#1059/#1061 で変えた内部の見た目を取り消し、7c312a77c の `CalendarView.tsx`・`ListView.tsx` に戻した。
- 変えたのは: 店舗名（`storeShortDisplayName`: public_name → 略称。臨時会場はその日の会場名か「特設会場」）、上の操作列のチップ（`BookingFilters`）、カレンダーの過去日の文言なし（#1057）、作品画像の比率（`KeyVisualThumb`）。元の `text-[10px]`・`text-gray-*` は同じ値のクラス `ts-10`・`ts-8`・`fg-gray-*`（index.css）に置き換え（デザインガード対策、見た目は同じ）。
- リストの公演を押すと元どおり作品ページ（公演は選ばない）。空き枠の「貸切申込」は元どおり（その日・時間帯・店舗を選んだ状態で `private-booking-select`）。
- 提案（未実施）: リストとカレンダーの残席表記を「残 N」にそろえるか、元の「2/8」のままか（今は元のまま「2/8」「残6」が混在＝元の本番と同じ）。
- 確認: staging 接続の手元で 375px・1280px（作業メモの `shots/orig_calendar_*.png`・`orig_list_*.png`）。DB 変更なし。

## 2026-10-12 / リストの空き枠に「貸切で申し込む」（fix/list-empty-slot-private、staging 向け PR・未取り込み）

- 社長要望: リストで空き枠に貸切申込ができると分かるように。各時間帯の行末に紫のチップ「○○店 空き ・ 貸切で申し込む ›」、3 店舗以上は「空き N 店舗」にまとめて押すと店舗の一覧、全店舗が空きの時間帯も行を出す。押すと `private-booking-select?date=&store=&slot=&time=`。
- 判断: 空きは「公演・貸切・社内の予定が無い」「今日以降かつ受付締切の日数より先」「前の時間帯の終わりから 1 時間後が枠の終わりより前」（元のリストの貸切申込ボタンと同じ目安）。#1023 の DB の空き判定は作品（所要時間）が要るため、作品を選んだ先の画面で行う。臨時会場・オフィスは出さない。
- 確認: staging 接続の手元で 375px・1280px（作業メモの `shots/listempty_*.png`。受付締切 14 日のため 11 月で確認）。DB 変更なし。

## 2026-10-12 / リストの朝・昼・夜を行に（fix/list-slot-rows、staging 向け PR・未取り込み）

- 社長指示（見本 `ListRows.dc.html`）: リストを「日付の見出し（固定）→ 朝／昼／夜の行 → 店舗名付きの公演カードを縦に」へ。貸切は行末の灰色チップにまとめ、何も無い時間帯は出さない。会場の列は廃止。満席は薄く「満席・キャンセル待ち」。押すと作品ページを公演選択済みで開く（手元で「選択中」を確認）。PC はカード 2 列。操作（年月・店舗・満席を非表示・体験済みを非表示）はそのまま。`ListView.tsx` を作り直し（元のデータの組み立て `useListViewData` はそのまま）。
- 元のリストにあった空き枠の「貸切申込」ボタンは無くなった（見本に無いため。カレンダーには残る）。
- 確認: staging 接続の手元で 375px・1280px（作業メモの `shots/listrows_*.png`）。横はみ出しなし。DB 変更なし。

## 2026-10-12 / 元のカレンダー・リストの手直し（fix/calendar-list-polish、staging 向け PR・未取り込み）

- 「体験済みを非表示」（ログイン中だけ）をカレンダー・リストの操作列に戻した（チップ。体験済みの作品は `usePlayedScenarios`）。
- カレンダーの今日より前の日: 「店舗を選択して貸切申込」を出さず薄い地色だけ、過去だけの週は低く（PC も同じ）。今日以降で公演の無い日は小さく 1 行「貸切申込」→ `/{組織}/private-booking-select?date=`。
- 確認: staging 接続の手元で 375px・1280px（作業メモの `shots/polish_*.png`）。ログイン中の「体験済みを非表示」は画面では未確認（型・試験のみ）。DB 変更なし。

## 2026-10-12 / カレンダー・リストを元の実装に戻す（fix/restore-original-calendar-list、staging 向け PR・未取り込み）

- 社長決定: カレンダーとリストは元のほうがよい（画面への収まりも）。#1051・#1053 の刷新版は廃止し、#1046 より前の `CalendarView`・`ListView`・`useCalendarData`・`useListViewData`・`bookingViewPersistence` を履歴（7c312a77c）から戻した。「作品名 2 行」の PR #1055 は閉じた。
- 置き場所: 「空いている公演を探す」のチップを「今週末／今日／明日／来週／カレンダー／リスト」に（切り替えタブと「日付を選ぶ」は廃止）。絞り込み行はカードのときだけ。カレンダー・リストは元の操作（年月・店舗・満席を非表示。チップの見た目に作り直した `BookingFilters`）。旧 URL はそれぞれのチップで開く（E2E 更新）。
- 見た目だけ新しいトップに合わせた（角丸・枠線・チップ・残席の色・「貸切」・店舗名の字・画像の比率）。寸法・列数は元のまま。店舗名は `storeDisplayName`（リストの店舗列は省略せず折り返し）。`text-gray-`・`text-[` は使わず `ts-micro`（10px）。
- 削除: `StoreCalendarView`・`StoreListView`・`TimetableDayTable`・`publicTimetable`・`DatePickerPopover`。
- 確認: staging 接続の手元で 375px・1280px（作業メモの `shots/restore_*.png`）。DB 変更なし。

## 2026-10-11 / 店舗トップの見方「一覧／カレンダー／リスト」（feat/top-search-views、staging 向け PR・未取り込み）

- 社長の方向修正: 元のカレンダーとリストは無くさず刷新して残す。見本 `TopViews.dc.html`。「空いている公演を探す」の絞り込みの下に 3 つの見方の切り替え（`?view=calendar|list`）。絞り込みは共通。#1051 の「点だけ」のマス目は置き換え。
- カレンダー: マスは日付・作品の小さな画像 2 枚・「+N 空き／満席」だけ。日を押すと下にその日の時間割。リスト: 店舗 × 朝昼夜、日付の見出しは固定、貸切の枠は「貸切」、公演なしの店舗は畳む、7 日ずつ「次の 7 日 ›」。部品 `components/top/StoreCalendarView.tsx`・`StoreListView.tsx`・`TimetableDayTable.tsx`、組み立て `src/lib/publicTimetable.ts`。旧 `/{組織}/calendar`・`/list` は各見方へ（E2E に追加）。
- 判断: カレンダー・リストでは「空席あり」で満席を隠さない（見本どおり満席を灰色で見せる）。375px の時間割は作品名が 2〜3 文字で省略される（PC は全文）。
- 確認: staging 接続の手元で 375px・1280px（作業メモの `shots/views_*.png`）。横はみ出しなし。DB 変更なし。

## 2026-10-11 / トップのカレンダー表示を戻し、キービジュアルの比率を崩さない（fix/top-calendar-and-kv、staging 向け PR・未取り込み）

- 社長指摘: カレンダー表示は無くさない。店舗トップ「空いている公演を探す」に「一覧／カレンダー」（`?view=calendar`、旧 `/{組織}/calendar` もここへ）。月のマス目は日付と公演数の点だけ（空きあり＝緑、満席のみ＝灰、選んだ日＝赤枠）、日を押すとその日の公演を一覧と同じカードで下に出す。月送り・今日。絞り込みも効く。部品 `components/top/StoreCalendarView.tsx`、日ごとのまとめ `calendarDaySummaries`（単体試験あり）。全体トップは一覧のみ。
- キービジュアル: 横長の画像が 3:4 の枠で大きく切り抜かれていた（WORLD END・裂き子さん・野槌など、元の比率 1.5〜1.8）。`KeyVisualThumb` で読み込み時の比率を見て、横長は全体を収めて余白は薄い地色、縦長は中央で切り抜き。枠は公演カード・残りわずか（横長の枠→3:4）・作品から探すとも 3:4。作品の画像に位置・拡大率の設定は無い（キャラクター画像だけ）。
- 確認: staging 接続の手元で 375px（作業メモの `shots/fix_top_cal_*.png`: calendar・day_selected・kv_before_*／kv_after_*）。DB 変更なし。

## 2026-10-11 / トップ刷新の続き: 作品の検索・遊びたい／体験済み、DB とメールの店舗名、問い合わせの種別（fix/top-followups、staging 向け PR・未取り込み）

- 作品から探す（店舗トップ・全体トップ）: 見出しの下に「作品名・作者で検索」（欄内で絞り込み、カタログへは `?q=`。`/{組織}/catalog` も `?q=` を読むようにした）。ログイン中だけ各カードの右上に「遊びたい」「体験済み」（`useScenarioMarks`。体験済みは従来の登録ダイアログ）。
- DB: migration 20261011220000（同名 rollback）。`public.customer_store_name(店舗, 日付, 予備)` を追加（画面の storeDisplayName と同じ決め方。公開してよい名前だけを返す）し、お客様に届く 11 関数の店舗名を置き換え（一覧は方針書「店舗名」）。各関数は staging の現物から店舗名の部分だけ変更。staging 適用済み・本番未適用。`staging.json`・`expected-function-overrides.json`（既存の権限の記録は残し、本文の md5 だけ更新）。手元で baseline 再現 OK。
- Edge Function（staging 配備済み）: `_shared/customer-store-name.ts` を追加し前日メール・旧経路の貸切確定メールで使用。`send-cancellation-confirmation` は店舗 ID から `customer_store_name` を引く。`send-contact-inquiry` の日本語の種別名も配備。配備: send-contact-inquiry, send-cancellation-confirmation, auto-send-reminder-emails, schedule-reminder-emails, notify-gm-private-booking-confirmed, send-private-booking-confirmation, reconcile-private-delivery, provision-private-booking-discord。
- **本番反映は DB → Edge Function → 画面の順**（Edge Function が `customer_store_name` を呼ぶため）。
- 確認: staging 接続の手元で 375px（`shots/fu_*_scenario_search.png`）、`/queens-waltz/catalog?q=ウサギ` が 1 件。ログイン中の「遊びたい」「体験済み」は画面では未確認（型・試験のみ）。メールの実送信はしていない（DB 関数を staging で直接呼び、「高田馬場店」「フォレスト①」「特設会場」などになることを確認）。

## 2026-10-11 / トップページ刷新（店舗トップ・MMQ 全体トップ）とお客様向けの店舗名（feat/top-pages-redesign、staging 向け PR・未取り込み）

- 社長承認の見本 `Top.dc.html`・`TopMMQ.dc.html`（追加指示: 全体トップに「残りわずか」「作品から探す」、貸切の位置）。方針書 `docs/product-spec/トップページ刷新_2026-10.md`。点検 2026-10-11 の 7・15・16・19・23・24・33 を対象。
- 店舗トップ `/{組織}`: 3 タブを廃止し、上の帯 → 空いている公演を探す（日付チップ・月カレンダー・人数・店舗・空席あり・初心者向け、条件は URL）→ 残りわずか → 貸切 → 作品から探す → はじめての方へ。旧 `/calendar`・`/list` は `?when=date` へ。旧部品（CalendarView・ListView・LineupView・BookingFilters・SearchBar・ScenarioCard ほか）は削除。
- 全体トップ `/`: 横断検索（エリア・日付・人数）→ 公演一覧（組織名＋店舗名）→ 残りわずか → 貸切 → 作品から探す（全国、`/scenario` へ）→ 参加店舗 → はじめての方へ → 店舗の方へ（`/contact?type=partnership`）。公開ビューだけを読む（公演は 1000 件ずつ最大 5 回）。旧の遊びたい・体験済みボタン、ブログ欄は見本に無いため外した。
- 共通部品 `src/components/public-top/`、決まり `src/lib/publicPerformanceSearch.ts`（日付範囲・残席の言い方・検索・残りわずか・作品ページの URL）、`src/lib/publicStoreName.ts`（店舗名・店舗数・地域）。単体試験あり。
- 作品ページ: `?event=&count=` の人数を残席までに収め、選んだ公演の位置まで送る（24）。
- 店舗名（社長決定）: DB に `stores.public_name`（お客様向けの名前、NULL 可）。migration 20261011210000（同名 rollback。`stores_public` の末尾に列を追加、`GRANT SELECT (public_name)` を anon/authenticated に）。staging 適用済み・本番未適用。`staging.json`・`expected-table-overrides.json`・新設 `expected-view-overrides.json`（`check-db-baseline.sh` がビューの差し替えも読むよう変更）。管理画面の店舗編集に「お客様向けの名前」。`/api/stores` の読み書き列に追加。**本番反映は DB 先行**（画面が `public_name` を読むため）。
- 設定が必要な店舗: クインズワルツ仮設店① → フォレスト①、仮設店② → フォレスト②（staging は統括が SQL で入れる。本番は DB 反映後に管理画面の店舗編集で入力）。
- 数字の統一（33）: 店舗数は `countPublicStores`（臨時・休止・オフィスを除く）。`/scenario` の件数から休止中の組織の作品を外し、全体トップの「全国 N」と一致（staging で 188）。
- `/stores`（参加店舗一覧）が未ログインでログイン画面に飛ぶ件（7）: AppRoot の旧管理 URL 判定から公開の `/stores` を除外。フッターの文言「参加団体」→「参加店舗一覧」。
- 問い合わせ: 種別「MMQ への参加（店舗の方）」（partnership）。Edge Function `send-contact-inquiry` の種別名の表に、画面の種別をすべて追加（未配備。配備までメールの種別は英字のまま）。
- 未対応: グループページ・マイページ貸切カードで RPC が返す店舗名、DB 関数・Edge Function が組み立てるメールの店舗名は従来の name。/guide の本文は旧 3 タブの説明のまま（別作業）。
- 確認: staging 接続の手元（vite --mode staging）で 375px・1280px を撮影（作業メモの `shots/top_*.png`、見本 `top_mock_*.png`）。横はみ出しなし（375px で scrollWidth=375）。

## 2026-10-11 / 申込シートの参加人数を「作品の人数」で決める形に（fix/request-sheet-participants、staging 向け PR・未取り込み）

- 社長決定: 申込の人数はお客様が増減するものではない。#1042 の＋−と「登録メンバー N 名＋当日来る M 名」をやめた。
- 作品の人数が固定（最低＝最大）: 項目を出さず「参加人数 6 名（作品の定員）」の 1 行、その人数で申し込む。人数可変: 最低〜最大のチップ（既定は最大人数＝従来の申込と同じ）、注記「料金は参加人数分です。当日の人数が変わる場合は店舗にご連絡ください」。料金の目安は選んだ人数。申込後の人数の自動変更は作らない。
- 判定は `requestSheetModel.participantChoice`（作品の人数が読めないときは登録メンバー数で固定）。DB 変更なし。
- 確認: 手元 DB で 375px（固定「六人の館」・可変「揺れる人数」）。作業メモの `shots/g9_request_participants_*.png`。

## 2026-10-11 / 店舗への申込を 1 つの入口にし、候補日を複数選んで優先順を付けて送る形に（feat/booking-request-sheet、staging 向け PR・未取り込み）

- 社長の指摘: 日程タブの行ごとの「この日で申し込む」→ 次の画面で複数選べる、の二段構えが分かりにくい。見本 `RequestSheet.dc.html`（A 日程タブ・B 申込シート）。詳細は方針書 `docs/product-spec/グループページ刷新_2026-10.md` の末尾「申込の入口を 1 つに」。
- 入口は「候補日を選んで店舗に申し込む」: 状態の箱の主ボタン（チャットタブの 1 行は「申し込む ›」）、日程タブの表の下（社長の追加指示。その下に「候補日を追加・編集」「未回答の人に知らせる」）、マイページの貸切カード（`?sheet=booking`）。行の申込ボタンは削除。箱・カードの本文に「複数の候補日を送ると、店舗がその中から 1 つ確定します」。
- 申込シート `groupPage/booking/BookingRequestSheet.tsx`（全画面）: 候補日の複数選択（初期値は全員○の日＋それ以外で○最多の日、選んだ順＝優先順、ドラッグ・上下ボタンで並べ替え、× の日の注記）、希望店舗のチップ（空きは `private_booking_candidate_slot_availability` を店舗ごとに。空きなしは灰色で送らない）、参加人数の＋−（既定は登録メンバー数を作品の人数に収めた数）、店舗への連絡、料金の目安 → 2 段目で電話番号・注意事項とキャンセル規定・同意 → 送信（従来の `submitGroupBookingRequest`）。旧シート `BookingSheet`（GroupChatSheetPanels）は削除。
- DB（migration 20261011200000、同名 rollback、staging 適用済み・本番未適用）: `create_private_booking_request` の候補の `order` を送られた並び（優先順）に、グループ経路の希望店舗を「完全一致」から「グループの希望店舗の中から 1 店舗以上」に。`expected-function-overrides.json`／`staging.json` 更新。DB の試験 yoyaq_004 に 2 件追加。
- 参加人数は従来「作品の最大人数」固定で送っていたのを、シートで決めた人数に変更（申込後のメンバー追加は作品の最大人数で止めており、予約の人数では止めていない）。
- 確認: 手元 DB（qa-customer の local supabase。グループ「試験作品・揺れる人数」に候補日 1 件・回答・希望店舗 2 つ・二号店の既存公演を手元だけに追加、migration も手元に適用）で 375px を撮影（作業メモの `shots/g9_request_*.png`）。送った予約は order 1〜3 が選んだ順、第 1 希望が requested_datetime。確認メールは手元からは送れない（従来どおり）。

## 2026-10-11 / 事前配役アンケートの回答画面を全画面シートの形に（feat/survey-sheet-ui、staging 向け PR・未取り込み）

- 社長承認の見本 `SurveySheet.dc.html`（375×812）に合わせ、回答フォーム `SurveyResponseForm` を全画面シートに作り替えた（読み書き・診断記録は `useSurveyResponse.ts` に分離）。入口は従来の `?tab=survey`（メール・通知のリンク）に加え `?sheet=survey` も同じ画面。マイページの貸切カード（その場で開く）とチャットの予備の枠も同じシート。会員・ゲスト（PIN）共通。
- 上に固定: 「事前配役アンケート」・作品・開催日時・店舗・回答期限・×、緑の帯「回答は店舗と GM にだけ届きます。配役は当日お伝えします。」。下に固定: 「回答を送る」／回答済みは「回答を変更する」と「送ったあとも期限までは変更できます」。
- 1. やってみたいキャラクター: 店舗の設問のうち character_selection を先頭に、カード 2 列（画像・名前・性別の注記）。押す順に第 1／第 2 希望（`surveyCompletion.toggleCharacterPick`）、「どのキャラクターでもよい（おまかせ）」。配役方法が survey でない・作品にキャラクターがいない・店舗が character_selection の設問を作っていないときは出さない（必須でも問わない）。
- 保存形式: その設問 id に第 1 希望のキャラクター id（従来どおり・配役確定時の一括保存と互換）。**第 2 希望は回答の jsonb のキー `character_second_choice`**（列は足さない。RPC `upsert_survey_response_for_member` は受け取った回答をそのまま保存するため DB 変更なし）。開き直すと復元。キャラクターの設問を出さない・第 1 希望が無い・おまかせのときは送らない（`stripHiddenSurveyAnswers`）。おまかせは文字列「おまかせ」。店舗の回答一覧（`SurveyResponsesTab`・`SurveyResponsesView`）は `characterAnswerLabel` で「第 1 希望 A／第 2 希望 B」「おまかせ（どのキャラクターでもよい）」と出す。注意: 配役方法の選び直しで DB が消すのは設問 id のキーだけなので、古い `character_second_choice` が残ることがある（第 1 希望が無ければ画面・一覧とも出さない）。
- 店舗の設問: 単一・複数選択と 5 段階はチップ、自由記述は枠、必須／任意の印。
- 期限: 回答期限（survey_deadline_at、無ければ公演日から survey_deadline_days 前）を過ぎたら「回答期限を過ぎました」で送れない（従来は「目安」で公演日まで送れた。社長の見本どおりに変更。DB 側では止めていない）。公演日を過ぎたら受付終了の表示。
- 送ったあと: シートを閉じ、`group-survey-settings`・`group-casting-status` を読み直す。状態の箱は開催の文に「事前配役アンケートは回答済みです（N/M 名が回答）」と「回答を変更する」（`groupPageModel` の `surveyAnswered`）。マイページは `mypage-private-survey-status` も読み直す。
- 名称の一括置換（社長決定「事前配役アンケート」）: お客様向けの画面・マイページのカード・チャットの案内、スタッフ向け管理画面（サイドバー・マニュアル・回答一覧・作品の設定）、ベル・メール（DB 関数 `customer_notice_on_group_message`・`customer_notice_on_survey_reminder` の文面を migration 20261011190000〈同名 rollback〉で置換、staging 適用済み・本番未適用、`expected-function-overrides.json`／`staging.json` 更新）、Edge Function のメール（`survey-reminder-email.ts` の件名「【事前配役アンケートのお願い】」・本文、貸切確定の案内文。staging に配備済み）、方針書・お客様向けマニュアル。古い migration・baseline・作業記録の文は変えていない。「アンケート」単独の一般名詞は残した。キャラクター画像の部品は `casting/CharacterImage.tsx` に分けた。
- 確認: 手元 DB（qa-customer の local supabase）の作品「試験作品・事前の手紙」に試験用の設問（希望キャラクター＝必須、得意・苦手なこと＝任意）を手元だけに追加し、会員（customer2）とゲスト（PIN）で 375px を撮影（作業メモの `shots/g8_survey_*.png`。開いた直後・キャラクター選択後・送信後の箱と概要・開き直し・マイページ、第 2 希望の復元 `g8_survey_member_reopen_second.png`）。送るボタンの下端 775px/812px。

## 2026-10-11 / 配役の確定で作品の人数にそろっていなくても確定できるように（fix/casting-confirm-min-players、staging 向け PR・未取り込み）

- 社長決定: グループに登録していない同行者（当日来る人）がいるのは普通で、作品の人数に満たないと主催者が配役を確定できなかった。条件は「登録メンバー全員に配役が入っている」「重なりが無い」の 2 つだけにし、最低人数に満たないときは確定画面に注意だけ出す（「登録メンバーは 3 人です（作品は 5 人）。登録していない同行者の配役は当日店舗が決めます」。最低〜最大が違う作品は「作品は 4〜5 人」）。
- 画面だけでなく DB の `private_group_confirm_characters` も「作品の最大人数にそろっていること」を求めていたため、migration 20261011180000（同名 rollback）でその条件だけ外した（staging 適用済み・本番未適用）。DB の試験 `scripts/test-private-group-confirm-characters-db.mjs` に「人数に満たなくても確定できる・取り消すと戻る」を追加。

## 2026-10-11 / チャットの自動お知らせをすべて灰色の 1 行にし、カードを流さない（fix/chat-system-lines-only、staging 向け PR・未取り込み）

- 社長決定: **グループチャットには自動のカードを流さない**。吹き出しは人の発言と写真だけ、自動のお知らせはすべて灰色の小さな 1 行。行動が要るものだけ末尾に小さなリンクを 1 つ（既存の `?tab=`／`?sheet=`）。今後チャットにカードを足さない。詳細は方針書 `docs/product-spec/グループページ刷新_2026-10.md` の末尾「チャットにはカードを流さない」。
- 対象: 候補日の追加・未回答の人に知らせる・店舗の確定／却下／取消・事前配役アンケート・事前読み込み・店舗からのお知らせ・個別お知らせ（引き継ぎの依頼は宛先本人だけに「› 確認する」）・次の貸切のお誘い・配役。DB の文面・種類は変えていない。
- 配役の操作カード（決め方・希望・確定）はチャットから外し、`CharacterAssignmentCards.tsx` は削除（操作は #1035 の「いまの状態」の箱と全画面シートへ移った）。チャットは状態の 1 行だけ: 主催者「配役の決め方を選んでください › 選ぶ」（`?sheet=casting-method`）、自分たちで決める・未選択の人「やりたいキャラクターを選んでください › 選ぶ」（`?sheet=casting-pick`）、確定「配役が確定しました › 概要」（`?tab=overview#casting`）。#1035 の「未回答の人に知らせる」の種類（事前配役アンケート・キャラクター）も 1 行にし、名前が挙がった本人に「› 回答する」「› 選ぶ」。
- 名称は「事前配役アンケート」（社長決定。既存文の一括置換は別作業）。
- 「日程がそろった」はチャットのお知らせが存在しない（ベル・メール・プッシュのみ）ので対象外。
- 確認: 手元で 375px の主催者・メンバー・ゲスト（`shots/fix_chatlines_*.png`）。

## 2026-10-11 / 概要タブに「配役」欄・配役の操作を「いまの状態」の箱と全画面シートに（feat/overview-survey-section、staging 向け PR・未取り込み）

- 社長要望と修正: 配役（決め方の選択・自分たちで決める・事前配役アンケート）の操作の入口は「いまの状態」の箱（チャットタブの 1 行、マイページのカードも同じ段階）だけ。概要タブの「配役」欄（`#casting`、日程と場所の次）は状態の確認と主催者の「変更する」の入口。見本 `StatusBox.dc.html` ④-a〜④-d・`Casting.dc.html`。お客様向けの名称は「事前配役アンケート」（新しく書いた文だけ。既存の「公演前アンケート」の置換は別担当）。
- 段階（`privateBookingModel.decideGroupAction` に追加。マイページとグループ画面で共通）: 確定後・キャラクター（NPC 除く）のいる作品で、配役が未確定のとき ① 主催者「配役の決め方を選ぶ」（事前配役アンケートが使える作品だけ。従来のチャットの条件と同じ）→ ② 自分たちで決める・未選択の人「やりたいキャラクターを選ぶ」→ ③ 選んだ主催者「配役を確定する」→ その後は従来どおり アンケート未回答／開催。色は緑。
- 全画面シート `?sheet=casting-method|casting-pick|casting-confirm`（`groupPage/casting/CastingScreen.tsx`）。保存は既存の RPC（private_group_set_character_method・member_action の character_preference・private_group_confirm_characters）のまま。③ は重なりを琥珀色で警告、全員分・重なりなし・必要人数そろいまで押せない（DB と同じ規則）。
- DB（migration 20261011170000 と同名 rollback、staging 適用済み・本番未適用）: `private_group_casting_status(group, member, guest_token)` を追加（参加中の本人だけ。決め方・確定済みか〈チャットの配役カードと同じ判定〉・アンケートの回答済み／対象人数・自分の回答の有無・未回答の名前は主催者だけ。回答の中身は返さない）。`private_group_chat_action` の remind_unanswered に kind（dates／survey／casting）。survey は未回答、casting は未選択の人に絞り、灰色 1 行（date_answer_reminder＋kind）。チャット側は文面の切り替え 1 か所だけ変更（`groupChatMessages.noticeLineText`）。
- structure: staging.json は staging の実物で更新。今回の 2 関数のほか、web_push_outbox／web_push_subscriptions の auth.users への外部キーが「NOT VALID」に変わっている（毎晩の本番→staging の写し `scripts/mirror-prod-to-staging.sh` が auth 参照の外部キーを NOT VALID で作り直すため。2026-10-10 21:27Z の実行で発生）。これを入れないと Drift check (staging) が落ちる。
- 未対応: チャットの配役カードは #1034 で灰色 1 行にし部品を削除済み。回答画面の見た目（見本 SurveySheet.dc.html）は別 PR。
- 確認: 手元 DB で主催者・メンバー（customer2）・ゲスト（手元で作った一時の印）の 3 視点を 375px で撮影（作業メモの `shots/g7_survey_*.png`）。必要人数（5 人）に満たない試験データのため、確定後の表示は手元 DB に確定のお知らせを入れて確認。

## 2026-10-11 / 候補日の追加・編集を 1 枚のスクロールにし、保存ボタンを常に見える位置に（fix/candidate-dates-editor-ux、staging 向け PR・未取り込み）

- 社長の指摘: マイページ貸切タブ → 操作 → 候補日を追加・編集 で、ダイアログのスクロールの中にカレンダー枠のスクロールがあり、「候補日を保存」が画面外で見えない。見本 `CandidateEditor.dc.html`（375×812 全画面）に合わせた。
- 部品 `PrivateBookingSlotGrid` から枠表の内側スクロール（max-height・fillContainer）を廃止。月の切り替えと案内の帯（押して選ぶ・灰色は押すと理由・○件選択中）は `stickyHeader` 指定時だけ上に貼り付く。日付の列は横スクロール時も固定、各枠は高さ 56px（min-h-14）で揃え、2 行目に時刻／追加済み／選べない理由（1 行）／「○〜○ に調整」を出す。
- `AddCandidateDates` に `layout`（dialog / embedded）。dialog は開いた直後からカレンダー、末尾に登録済みの候補日（`belowCalendar`）、下に「選択中 N 件」チップ列と「キャンセル／候補日を保存（N 件）」を sticky（safe-area 対応、中身が短くても下端）。キャンセルはダイアログを閉じる。embedded（グループページ日程タブ）は貼り付けず、カレンダーを全部出し保存列はその直下、外枠は省いて幅をカレンダーに回した。
- `PrivateGroupInPlaceDialog` の dates だけ、スマホ（〜640px）は全画面、PC は sm:max-w-lg・max-h-[90vh]。見出し（題名＋作品名・希望店舗）は固定、本文 1 つだけがスクロール。希望店舗名はグループ画面と同じ問い合わせ（同じ queryKey）。
- 作品ページの貸切申込フォームも同じ部品なので内側スクロールがなくなった（貼り付けなし）。
- 見本との差: 最大件数は業務上の上限（グループ 100 件・作品ページ 6 件）をそのまま表示。登録済み候補の操作名は既存部品のまま「削除」（見本は「外す」）。
- 同じ PR で社長の訂正（グループページ概要タブの料金欄 `overview/PriceSection.tsx`）: 合計は定員ではなく「いまの参加人数 N 名の合計」（会員＋ゲスト＝回答表の memberCount）で出し、最低人数（作品の player_count_min）未満なら「あと ○ 名で成立」を添える。補助文は「税込。当日、店舗で現金またはカードでお支払いください。料金は参加人数分です。参加人数が最低人数（○名）に満たない場合は公演不成立となります。」（候補日で変わる注記は先頭のまま）。「定員分の料金」は削除。確定後もグループ保存の 1 人あたり × いまの参加人数（保存済みの合計 total_price は使わない）。手元で 3 名・最低 5 名の表示を確認（`shots/fix_price_group_375.png`）。
- 確認: 手元 DB（seed）で 375px のダイアログ（開いた直後・途中・末尾・3 件選択）、PC ダイアログ、グループ日程タブ、作品ページ、見本を撮影（作業メモの `shots/fix_dates_ui_*.png`）。ダイアログ内の縦スクロールは本文 1 つだけ、保存ボタン下端 800px/812px を計測。

## 2026-10-11 / 確定した貸切・予約に「カレンダーに登録」「地図を開く」（feat/calendar-and-map-buttons、staging 向け PR・未取り込み）

- 社長要望: 貸切が確定したら日程をカレンダーに登録するボタンと地図のボタン。一般公演の予約にも付けた。詳細は方針書 `docs/product-spec/グループページ刷新_2026-10.md` の「段階 6」。
- 置き場所: グループページの「いまの状態」の箱（主ボタンの下、会員・ゲストとも）、概要タブ「日程と場所」（段階 5 の文字リンクをボタンに）、マイページの貸切カード（確定・公演前）、一般公演の予約詳細（日時の下）、予約完了画面（カレンダーだけ）。
- 部品は 1 つ: 生成は `src/lib/calendarEvent.ts`（単体テストあり、JST → UTC。.ics は CRLF・75 バイト折り返し・文字の逃がし）、画面は `src/components/patterns/schedule/`。概要タブの `mapUrl` はこちらへ統合。
- 終了時刻は店舗が登録した公演の終了時刻（開演＋所要時間）。読めなければ作品の所要時間、無ければ 3 時間。予約詳細の公演の読み取りに `end_time` を追加（DB 変更なし）。
- 店舗に地図 URL の列は無いので住所で Google マップ検索（部品は地図 URL を渡せば優先）。
- 確認: 手元で 375px、確定済みグループ（主催者・PIN のゲスト）、マイページの貸切カード、一般公演の予約詳細、予約完了画面。.ics・Google カレンダー・地図の URL を照合。スクリーンショットは作業メモの `shots/g6_*.png`。iPhone 実機で .ics を開く動きは未確認。

## 2026-10-11 / グループページの概要タブを刷新（作品情報・登場人物・日程と場所・料金・やりとり）（feat/group-page-scenario-info、staging 向け PR・未取り込み）

- 社長要望: グループページで作品の情報・キャラクター・作品ページへの導線が分かるように。あわせて概要タブを 作品について → 登場人物 → 日程と場所 → 参加メンバー → 料金 → 店舗とのやりとり → 注意事項とキャンセル規定 の並びに組み直した（見本 GroupOverview.dc.html）。詳細は方針書 `docs/product-spec/グループページ刷新_2026-10.md` の「段階 5」。
- 作品の情報とキャラクターは作品ページと同じ公開用の読み取り（/api/scenarios?id&org_id、お客様・ゲスト・未ログインは公開用の列だけ）。キャラクターの正は organization_scenarios.characters。`public.scenario_characters` は staging で 0 行・会員だけ読める・秘密の列を持つ古い表なので使わない。RLS・DB は変更なし。
- 希望店舗は「日程と場所」の 1 か所だけ（点検 44 番）。BookingSummaryBox に embedded（日時・会場・候補日・希望店舗を省く）を追加。料金は貸切申込の画面と同じ計算（calculatePrivateCandidateFees × 定員）。注意事項は BookingNotice を流用、「店舗に問い合わせる」は既存の問い合わせダイアログ。
- 作品ページへの導線は組織の slug 付き（/{slug}/scenario/{作品}）に統一（見出しの作品名・概要・思い出タブの「公演の記録」）。招待ページ（参加前）にも「作品について」の短い版（点検 51 番の一部）。
- 共有にした部品: `src/components/scenario/scenarioFacts.ts`（人数・所要時間・難易度・キャラクター画像の位置。作品ページも使う）、`SensitivityCheck` を作品ページから移動。`privateGroupPageReadApi.findGroupOverviewExtras` は `findOrganizationSlug` に置き換え。
- 見本との差: 配慮が必要な表現の項目名は出さない（作品ページと同じネタバレ防止）。ギャラリー画像は公開用のビューに列が無いため出さない。難易度は作品ページでは非表示だがここでは出す。
- 確認: 手元 DB だけに試験データ（キャラクター・あらすじ等）を入れ、375px で申込前・返事待ち・確定後の概要タブ・登場人物・未ログインの招待ページを確認（作業メモの `shots/g5_*.png`）。

## 2026-10-11 / 新しい版はお知らせを出さずに自動で切り替え・チャット入力欄がスマホで切れる（fix/silent-update-and-chat-input、staging 向け PR・未取り込み）

- 社長指示: 「新しいバージョンが利用可能です」のお知らせ（スマホで 1 文字ずつ縦に潰れる、点検 4 番）をやめ、自動で新しい版に切り替える。
- 前提の確認: 画面用の Service Worker は使っていない（vite-plugin-pwa は依存にあるが vite.config.ts で未使用。main.tsx はプッシュ通知用 `/sw.js` 以外の SW を解除している）。新しい版の検知は従来どおり `initVersionCheck`（index.html のハッシュを 30 秒ごと・タブ復帰時に比較）。そのため skipWaiting は不要で、`registerType` も変えていない。
- 新設 `src/lib/silentAppUpdate.ts`: 検知したら「切り替え待ち」にし、①次の画面遷移（react-router の pushState を包み、遷移先 URL をそのまま読み込む。`location.state` で値を渡す遷移は除外）②戻る・進む ③タブ復帰時・10 秒ごと（途中の入力が無く、10 秒操作していないとき）に再読み込み。途中の入力とみなすのは、作品ページ（予約確認が同じ URL）・貸切申込／日時選択・プロフィール登録・新規登録・ログイン・パスワード・グループ・クーポン受取・マイページ、値の入った入力欄、開いているダイアログ。`main.tsx` の `showUpdateBanner` は削除。スタッフ用の画面（`ADMIN_PATHS` の管理画面・`scenarios-edit`・シナリオマスタ・開発用ページ。組織なしの `/stores` はお客様向けなので除く）は、タブ復帰・操作なしでは切り替えず、画面遷移のときだけ切り替える（社長判断: スケジュール表を見ながら電話対応している最中に画面が変わると困る）。
- チャット入力欄（点検 45 番）: 原因は高さの自動調整。スマホではチャット以外のタブを開いている間、入力欄が非表示で高さ 0 と測られ `height: 0px` が入り、チャットを開いた直後は 18px に潰れていた（1 文字打つと直る）。測れないときは高さを指定しない・表示されたら測り直す（ResizeObserver）・最低 38px・枠線分を足す、に変更。ページは既に `100dvh`。入力欄の下に `env(safe-area-inset-bottom)` の余白を追加（いまの viewport 設定では 0）。
- 確認: 本番ビルド＋preview で、作品ページ（途中のページ）は新しい版を検知しても再読み込みせず、アプリ内リンクで遷移した時点で新しい版になる／トップで検索欄に文字があるうちは待ち、消して 10 秒後に切り替わる／何もしていないトップはタブに戻った時点で切り替わる。375px のチャットで、概要タブから切り替えた直後も入力欄が 38px で全部見える・高さ 480px（キーボード相当）でも 4 行まで伸びて見える。スクリーンショットは作業メモの `shots/fix_update_*.png`・`fix_chatinput_*.png`。実機のキーボード表示は未確認。

## 2026-10-11 / 貸切候補日の空き判定を前後の公演から逆算する方式に（feat/candidate-slot-gap-based、staging 向け PR・未取り込み）

- 社長決定: 枠の名前（午前／午後／夜）ではなく、その店舗のその日の前後の公演・受付停止・営業時間から逆算し、所要時間＋準備時間が入れば受け付ける。逆向き（夜を標準より前に繰り上げる）も同じ規則。
- 仕様の正本を新設: `docs/product-spec/貸切受付ルール.md`（入力の一覧・判定の手順・理由コード・例の表 R1〜R21・変更の決まり）。例の表はそのまま `supabase/tests/private_booking_rules_examples.sql`（`npm run test:rpcs` に追加）。
- DB: 内部関数 `private_booking_slot_store_checks` を `private_booking_slot_store_fit` に置き換え（占有区間を int4multirange で作り、隙間ごとに開始時刻の範囲を出す。開始は標準に最も近い 15 分刻み）。`private_booking_pick_start`・`private_booking_minutes_text` を追加。空き状況の関数 2 つに `detail`（「空き 2 時間・必要 5 時間」）と `adjusted`（標準からずらした）列を追加。保存 RPC も同じ関数で、画面が返した開始時刻をそのまま検証し、`conflict` に補足を付けて弾く。
- 旧方式との違い: 平日の午前が空いていれば選べる／平日の午後が夜にかかっても夜に公演が無ければ選べる／夜は前に公演が無ければ繰り上げ（旧「23:00−所要時間」の特例は一般則に吸収、R6・R18 で同じ結果）／受付停止はその枠の時間帯全体を占有（#1021 の「午後枠を夜にずらすと夜の受付停止を通り抜ける」課題は解消）／貸切募集停止期間を保存でも弾く／理由は店舗ごとに conflict → blocked → closed の順。
- 画面: `PrivateBookingSlotGrid` は DB の開始〜終了を出し、ずらした時刻に「に調整」を添える。灰色の枠の理由に補足を付ける。
- 見ないと進めない仕組み: `npm run check:private-booking-rules`（`scripts/check-private-booking-rules-doc.mjs`）。文書冒頭の「判定に関わるファイル」の一覧のどれかを変えて文書を変えていないと失敗。pre-commit と CI の Verify に追加（CI の checkout は fetch-depth: 2）。AGENTS.md に 1 行。判定の SQL・画面の先頭コメントに正本を明記。
- DB: migration `20261011120000_private_booking_candidate_slot_gap_based`（rollback 同名。手元で rollback → 旧テスト通過 → 再適用 → 新テスト通過を確認）。staging 適用済み、`staging.json`・`expected-function-overrides.json` は staging の実物で更新。本番は未適用。
- 確認: 手元で ①隙間ぴったり ②隙間不足 ③夜の受付停止に午後がかかる ④夜に公演なしで午後が夜にかかる、を作品ページ（375px）で確認。スクリーンショットは作業メモの `shots/fix_gap_*.png`。

## 2026-10-10 / 候補日カレンダーの空き判定を DB と一本化（fix/candidate-slot-availability、staging 向け PR・未取り込み）

- 事象: 貸切グループ「告別詩」（希望 6 店、作品の上演可能店舗との共通は 高田馬場・仮設①・仮設②）で、候補日の追加画面が 10/30 夜・10/31 夜を選べる枠として出すのに、保存で「選択した候補日時は現在受付できません」と弾かれた。DB の判定は正しく、画面の独自計算（availabilityMap）が上演可能店舗の絞り込み・他公演との重なり（準備時間込み）・受付停止を同じ条件で見ていなかった。
- 直し方: 店舗ごとの判定を内部関数 private_booking_slot_store_checks に切り出し、保存 RPC private_group_add_candidate_dates と、新しい空き状況の関数の両方から呼ぶ（保存の判定は変えていない。切り出し前後で同じ結論になることを手元の回帰 SQL で確認）。
  - private_booking_candidate_slot_availability(組織, 作品, 希望店舗[], 開始日, 終了日): 作品ページ（グループ作成前）用。日付 × 午前・午後・夜ごとに available・reason・start_time・end_time。reason は no_store_for_scenario / conflict / blocked / closed / slot_not_allowed / past_deadline / not_recruiting / outside_period。
  - private_group_candidate_slot_availability(グループ, 開始日, 終了日[, メンバー, ゲスト印]): グループ用。参加者（会員・ゲスト）・主催者・店舗スタッフだけ（authorize_private_group_read）。追加済みは already_added。
  - 空き表示では店舗の貸切募集停止期間（store_recruitment_pauses）も「受付停止」とする（保存 RPC はこれを見ていない。従来の画面と同じく、表示側だけ厳しめ）。
- 画面: 候補日の追加（グループ画面・マイページの候補日ダイアログ）と作品ページの貸切申込フォームは、この関数の結果だけで枠を出す。選べない枠は灰色、押すと理由（他の公演と重なります／この作品を上演できる店舗が希望店舗にありません／受付停止中／営業時間外 など）。クライアントの独自計算（availabilityMap、usePrivateBookingSlotData）は削除。作品ページの廃止予定の private_booking_blocked_slots は見なくなった（保存側も見ていない）。
- 希望店舗の注意: 希望店舗と作品の上演可能店舗に共通が無い／一部の希望店舗で上演できないとき、日程タブの「希望店舗」欄と候補日の追加画面の上に「この作品は ○○・△△ で上演できます…」を出す。
- 保存で弾かれたときの文面に理由を添える（例「選択した候補日時は現在受付できません（10/28 夜: 他の公演と重なります）。空き状況を更新して選び直してください」）。弾かれたら空き状況を読み直し、選べなくなった枠は選択から外す。
- DB: migration 20261010170000_private_booking_candidate_slot_availability（rollback 同名、手元で戻すと保存 RPC が元の定義と一致・再適用を確認）。staging 適用済み・本番未適用。structure（staging.json・期待構造）を更新。回帰 SQL supabase/tests/private_candidate_slot_availability.sql。
- staging で「告別詩」の 10/30・10/31 を確認: 10/30 は昼・夜とも conflict、10/31 夜は conflict で選べない表示になった。
- 残る課題（判断待ち）: 10/31 は「午後 18:00〜23:00」が選べる判定になる（仮設①②は夜だけ受付停止で、午後枠を夜にずらすと停止を通り抜ける）。保存 RPC も同じく通すため、受付停止を時刻で見るかは別途決める。作品ページから進む申込確認画面（PrivateBookingRequest）は従来の計算で候補を見直しているので、時刻がずれる場合がある。
## 2026-10-10 / お知らせメール送信（process-customer-notice-emails）の定期実行の合言葉を専用 secret で確かめる（fix/customer-notice-cron-secret、staging 向け PR）

- 背景: 段階 3（#1017）の作業中に「staging の secrets の CRON_SECRET と DB の app_config.trigger_secret が別の値」と気づいた（上の段階 3 の項）。定期実行は x-cron-secret に trigger_secret を送るため、値が違う環境では 401 になりメールが送られない見込みだった。
- 確認（2026-10-10 20:00、値は表示せず secrets list の digest と DB 値の sha256 を比較）: staging・本番とも CRON_SECRET の digest = trigger_secret の sha256 で一致していた（APPROVAL_DELIVERY / SURVEY_DELIVERY / RECRUITMENT / REMINDER の各 CRON_SECRET も同じ値）。段階 3 の時点で不一致だった原因は追えていない（その後に secrets が更新された可能性）。現時点では 401 は出ない。
- 直し: 値が将来ずれても止まらないよう、send-web-push（WEB_PUSH_CRON_SECRET）と同じ形にした。_shared/customer-notice-auth.ts の isCustomerNoticeCronCall が専用の CUSTOMER_NOTICE_CRON_SECRET（= trigger_secret）を先に見て、無ければ従来の CRON_SECRET / service role（isCronOrServiceRoleCall）に落ちる。単体テスト customer-notice-auth.test.ts（recruitment-auth.test.ts と同じ形。`npx deno test --no-check --allow-env supabase/functions/_shared/customer-notice-auth.test.ts`。--no-check なしは @types/node が無く既存テストも同じく落ちる）。
- staging: secrets に CUSTOMER_NOTICE_CRON_SECRET（DB の trigger_secret をそのまま、値は表示せず投入）を追加し、関数を配備。DB から定期実行と同じ net.http_post で呼び、net._http_response で status 200・{"success":true,"sent":0,"failed":0} を確認（request 43407）。cron 'process-customer-notice-emails' は 5 分ごとに succeeded。送信待ちは 0 件（customer_notice_email は staging も 'on'）。
- 本番で必要な手順（本番の secrets・関数・DB は未変更）:
  1. 本番 DB の app_config.trigger_secret を値を表示せずに読み、`supabase secrets set --project-ref cznpcewciwywcqcxktba CUSTOMER_NOTICE_CRON_SECRET=<その値>`（任意だが推奨。無くても CRON_SECRET が一致している間は動く）。
  2. main 反映時に `npm run functions:deploy:prod`（この関数を含む）。
  3. 反映後、本番 DB で `SELECT status_code, left(content,120), created FROM net._http_response WHERE content LIKE '%sent%' ORDER BY created DESC LIMIT 3;` などで 200 を確認。401（body「サーバーからの実行が必要です」）が出たら secrets と trigger_secret の不一致なので 1 をやり直す。
  - 補足: 本番 DB には既に cron 'process-customer-notice-emails' と表 customer_notice_emails があり、customer_notice_email も 'on'（migration 20261009140000 は本番にも適用済みの状態。段階 4 の項の「本番未適用」は古い）。

## 2026-10-10 / 貸切グループページ刷新 段階 4 公演後の思い出・写真のサムネイル（feat/group-page-phase4、staging 向け PR・未取り込み）

- 方針書 docs/product-spec/グループページ刷新_2026-10.md の「段階 4」。見本 GroupAfter.dc.html（③ 公演後・思い出）。
- 公演後（確定した公演の終了時刻〔無ければ開始時刻〕を過ぎた、または予約が completed）は、緑の「開催しました」の箱（写真を共有する／感想を書く／同じメンバーで次の貸切）と、思い出／メンバー／チャットのタブ（初期は思い出、日程タブは出さない）。
- 思い出タブ: 写真（このグループのチャットの写真すべて、3 列。拡大・自分の投稿は削除・まとめて保存）、公演の記録（作品・開催・店舗・参加人数・アルバムの登録状況）、公演後アンケート（感想）。
- 感想: 表 private_group_feedback（5 段階＋自由記述、1 人 1 件で書き直し可）。書くのは参加者本人の RPC private_group_after_action、読むのは店舗だけ（private_group_feedback_staff）。メンバー同士・主催者には見えない（手元で確認）。貸切予約管理のカード（リクエスト・グループ一覧）に「感想 N件（平均）」、押すと一覧。
- アルバム: 主催者は予約で自動。メンバーは「アルバムに登録する」で手動の体験履歴を作る（自動では書き込まない）。マイページのアルバムの作品に、そのグループの最新の写真（小さい版）を重ねて出し、押すと思い出タブへ。
- 同じメンバーで次の貸切: もとのグループをこのタブ（sessionStorage）に覚えて店舗の作品一覧へ。新しいグループを作ると、もとのグループのチャットに「次の貸切のお誘い」（参加ボタン付き）を流す。メンバーを招待済みの状態で作るのはやめた（本人の同意なく参加させないため）。
- サムネイル: 送信時に長辺 400px（JPEG 0.8）も作り {n}_thumb.jpg に保存（thumb_path）。一覧・2 枚以上の格子・アルバムで使う。既存の写真は元画像を縮めて出す。削除で小さい版も消える。
- 翌日 10 時（JST）に「写真を共有しませんか」をベル＋プッシュで会員に 1 回（private_group_memories_notice、定期実行 private-group-memories-notice 毎日 1:00 UTC、3 日前までを拾う、dedupe で 1 人 1 回）。ゲストには送らない。
- 気づいて直したもの: 貸切グループ作成画面で、読み込み中に希望店舗の絞り込みが再描画を繰り返していた（Maximum update depth の警告）。
- DB: migration 20261010160000_private_group_memories（rollback 同名、手元で戻して再適用を確認）。staging 適用済み・本番未適用。structure（staging.json・期待構造）を更新。Edge Function の変更なし（/api/private-group-photos は Vercel）。
- GM の名前は出していない（お客様に公開してよい GM 名の仕組みが無いため）。店舗の外部アンケート URL（organizations.post_performance_survey_*）は設定があればリンクを出すが、staging では設定している組織が 0。

## 2026-10-10 / 貸切グループページ刷新 段階 3 ウェブプッシュ通知（feat/group-page-phase3、staging 向け PR・未取り込み）

- 方針書 docs/product-spec/グループページ刷新_2026-10.md の「段階 3」。見本 GroupChatMenus.dc.html の「通知の届き方」と ⋮ の「通知 ON／OFF」。
- 外部サービスなしの Web Push（VAPID）。送信は Edge Function send-web-push（Web Crypto だけで暗号化と署名。_shared/web-push.ts、単体テストあり）。DB のトリガーが送信待ち web_push_outbox に積み、pg_net で関数を呼ぶ。毎分の定期実行 process-web-push は取りこぼし用。
- 届けるもの: 新しい発言（30 秒以内の連続は「○○さんほか N 件の新着」に 1 通）・自分宛ての返信・写真、日程がそろった（新規: 主催者にベル＋メール、会員のメンバーにベル）・店舗の確定・却下・引き継ぎ依頼（既存のベルを合図に送る。ベル・メールは二重に作らない）。発言はベルに出さない。チャットを見ている人（presence）・既読の人には送らない。
- ゲストはプッシュ無し。毎朝 9 時 JST に未読があればメール（customer_notice_emails。送るのは customer_notice_email が on の環境だけ）。
- 許可の導線: 参加した直後・初めて発言した直後に案内カード。「今はしない」で 30 日出さない。iPhone の Safari はホーム画面に追加の手順。⋮ に「通知 ON／OFF」（グループごと、既定 ON）。
- サービスワーカー public/sw.js（通知だけ。キャッシュしない）と manifest.webmanifest・アイコンを追加。main.tsx の古いサービスワーカー解除は /sw.js だけ残す。
- 段階 2 の積み残し: 未読の赤丸から灰色の 1 行のお知らせを外した。入力中のチャンネル名を招待コードのハッシュに。受信に参加者の印を要求するのは、ゲストが JWT を持たないため不可（方針書 段階 3 の 5）。
- DB: migration 20261010130000・20261010130100（補助関数の権限をそろえる）（staging 適用済み・本番未適用）。structure（staging.json・期待構造）を更新。
- staging: send-web-push を配備。secrets に VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY / VAPID_SUBJECT / WEB_PUSH_CRON_SECRET を入れた（鍵は Keychain の mmq-vapid-staging）。画面の VITE_VAPID_PUBLIC_KEY（Vercel）は未設定。
- 気づいた点（本件の範囲外）: staging では Supabase secrets の CRON_SECRET と DB の app_config.trigger_secret が別の値。段階 4 の process-customer-notice-emails は CRON_SECRET で確かめるため、そのままでは DB からの呼び出しが 401 になる見込み（本番は未確認）。send-web-push は専用の WEB_PUSH_CRON_SECRET で回避した。

## 2026-10-10 / 貸切グループページ刷新 段階 2 チャット強化と写真（feat/group-page-phase2、#1015 staging 取り込み済み）

- 方針書 docs/product-spec/グループページ刷新_2026-10.md の「段階 2」。見本 GroupChat.dc.html・GroupChatMenus.dc.html（通知の届き方は段階 3）。
- GroupChat.tsx（992 行）を chat/ に分割し、既読の人数（人数だけ）・返信（引用 30 文字）・リアクション（5 種＋40 種、1 人 1 種類）・写真（10 枚まで、端末で長辺 2,000px・JPEG 0.85 に縮小）・拡大と保存・長押しメニュー・ピン留め（主催者）・削除（自分の発言、写真の実体も消す）・入力中（Realtime broadcast、DB に書かない）を足した。
- 既読は DB（private_group_read_states）に置き換え、スマホと PC でそろう。段階 1 の localStorage の未読は廃止。
- 「未回答の人に知らせる」は主催者だけ、灰色の 1 行（system: date_answer_reminder）に直した。
- ⋮ メニュー: メンバー・招待リンク／写真の一覧／ピン留めの一覧／操作。
- 写真: 非公開バケット private-group-photos（Storage ポリシー無し）。表示とアップロード先は /api/private-group-photos が参加者本人を RPC で確かめてから署名付き URL（1 時間）で出す。スタッフ・未参加者は 403 を手元で確認。
- DB: migration 20261010100000・20261010100100（補助関数の権限をそろえる）（staging 適用済み・本番未適用）。structure（staging.json・期待構造）を更新。
- 既知（本件の範囲外）: ゲストで global_settings の読み取りが 401、会員で scenarioApi.getById が 400 の記録がコンソールに出る（段階 1 以前から）。

## 2026-10-10 / 貸切グループページ刷新 段階 1 骨格と日程の回答表（feat/group-page-phase1、#1013 staging 取り込み済み）

- 方針書 docs/product-spec/グループページ刷新_2026-10.md（段階 1〜4 の正本）。社長承認の見本 GroupDates.dc.html（スマホ）・GroupPC.dc.html（PC）に合わせた。
- 参加中の人のグループページを「見出し → いまの状態の箱 → タブ（概要／日程／メンバー／チャット）」に作り直した。PC は同じ並びを左に、チャットを右列に。右上のアイコン 3 つ・日程/招待シート・右パネルは廃止。招待リンクを開いただけの人の参加画面は従来どおり。
- 状態の箱のラベル・色・説明文はマイページの貸切カードと同じ判定（privateBookingModel.ts の decideGroupAction・labelOf・groupDescription・toneOf を共有）。
- 日程タブの回答表: 自分の列を押すと ○→△→×→○ で即保存（既存の date_responses）。最有力の行を薄紫、主催者は「この日で申し込む」で申込シートをその日を選んだ状態で開く。「未回答の人に知らせる」はチャットに 1 行。
- チャット: 自動のお知らせ（参加・外れた・候補日追加など）は灰色の 1 行にまとめ、回答が要る候補日追加・アンケート・引き継ぎなどだけカード。未読数は端末ごと（localStorage）。
- 不具合: 「候補日程が追加されました」のカードで後から候補日を消すと空の白い箱になる → 「（削除済み）」を出し、全部消えたら箱を出さない。
- DB 変更なし。

## 2026-10-09 / 通知ベルの数字を「新着」に・操作ボタンのてんてんを縦に（fix/bell-badge-seen、staging 向け PR・未取り込み）

- 課題: ベルの数字＝未読件数で、1 件ずつ押すか「すべて既読」まで消えず「見たのに消えない」。社長承認で「新着」と「未読」を分けた。
- ベルの数字＝最後にベルを開いた時刻より後に作られた通知の件数。開いた瞬間に 0（表 `user_notification_views`、利用者ごとに 1 行、RLS は本人だけ）。時刻が無い人は従来どおり未読件数。書き込みは同じ人で 5 秒に 1 回まで、失敗はログのみ。端末の時計が遅れても見えた通知が新着に残らないよう、記録時刻は「今」と表示中の最新通知の遅いほう。
- 一覧の赤い点・太字（is_read）は従来どおり。お客様・スタッフ共通。aria-label は「通知（新着 N 件）」。
- 貸切カードの「操作」ボタンのアイコンを横の … から縦の ⋮ に（グループ画面の歯車は変えない）。
- DB: migration 20261009150000（staging 適用済み・本番未適用）。users に列を足さなかったのは、本人更新に役割・組織の書き換え防止条件があり、ベルのたびの書き込みを混ぜたくないため。

## 2026-10-09 / マイページ改修 段階 4 通知の整備（feat/mypage-phase4、staging 向け PR・未取り込み）

- 方針書 docs/product-spec/マイページ改修_2026-10.md の 21〜27。承認済みの一覧どおり、通知ベルとメールをそろえた（棚卸し表は 22）。
- ベルは DB のトリガー（予約の申込・取消・人数変更、貸切グループのシステムお知らせ、開催決定・リマインドの送信済み、クーポン付与、アンケートのリマインド）で作り、`metadata.dedupe_key` の一意索引で二重を防ぐ。取消のベルは Edge Function から DB に移した。
- メールが無かったもの（日程確定のメンバー・取り下げ・グループを閉じた・外された本人・引き継ぎ）は送信待ち `customer_notice_emails` → `process-customer-notice-emails`（5 分ごと）。送信は app_config `customer_notice_email`=on の環境だけ（staging は off）。
- お知らせ「マイページが新しくなりました」は `SELECT public.announce_mypage_update_2026_10();` で 1 回だけ（冪等）。
- DB: migration 20261009140000（staging 適用済み・本番未適用）。Edge Function 2 本を staging に配備済み。

## 2026-10-09 / マイページ改修 段階 3 主催者の引き継ぎ（feat/mypage-phase3、staging 向け PR・未取り込み）

- 方針書 docs/product-spec/マイページ改修_2026-10.md の 14〜20（案 B: 新主催者の同意で成立する申込者の交代。申込前・申込後・確定後とも可）。
- 元主催者がメンバー管理シートの会員の行で「主催者にする」→ 新主催者に通知ベル・チャットの本人だけのお知らせ・マイページの「あなたの対応が必要」。確認画面（?sheet=handover）で連絡先・注意事項・キャンセルポリシー（固定済みなら固定版）を確かめて同意。
- 同意で主催者・予約の申込者（customer_id・氏名・電話・メール）・チャット・店舗への知らせ（private_cancellation）・同意の記録を 1 トランザクションで切り替え。断る・取り消し・72 時間の期限切れ（読み取り時に判定）は両者に通知ベル＋チャット記録。承認画面に申込者の変更履歴。
- 段階 2 の積み残し: メンバー自身が抜けたときも申込後・確定後は店舗へ人数変更を知らせる（確認文にも明記）。
- DB: migration 20261009110000 / 20261009120000 / 20261009130000（staging 適用済み・本番未適用）。メールは段階 4。

## 2026-10-09 / マイページ改修 段階 2（feat/mypage-phase2、staging 向け PR・未取り込み）

- 方針書 docs/product-spec/マイページ改修_2026-10.md の 7〜13。貸切カード右上とグループ画面の歯車に共通の「操作」メニュー（状態と立場で出し分け、赤い操作は確認ダイアログで影響を数字表示）。
- メンバー管理シート（外す＝チャットに記録、申込済み・確定後は店舗の貸切キャンセル共有チャンネルへ人数変更）。問い合わせは予約番号などを入れた共通部品。グループ画面右パネルに「申込内容」の箱。
- 「グループをキャンセル」「グループを削除する」は「グループを閉じる」1 つに（cancel_unrequested 側、履歴を残す）。delete_private_group は画面から使わない。
- DB: migration 20261009100000（staging 適用済み・本番未適用）。メンバーへのメール等の通知は段階 4。

## 2026-10-09 / マイページ改修 段階 1（feat/mypage-phase1、staging 向け PR・未取り込み）

- 方針書 docs/product-spec/マイページ改修_2026-10.md（段階 1〜4 の正本）。予約タブを「一般公演／貸切／キャンセル済み」にし、貸切は 1 貸切 = 1 カード（グループと予約を結合）、ヘッダーは次にやること。
- キャンセル済みで貸切の候補日を日付として出さない。理由ラベル（取り下げ／店舗都合でキャンセル／キャンセル）は cancellation_reason で判定。ヘッダーの「顧客」バッジをお客様に出さない。
- クーポンタブはマイページを開いた時点で読み始め、紐付け候補の予約は待たない（400ms 遅延の模擬で 1.3 秒 → 0.08 秒）。バッジの意味統一・遊びたいの次の公演・aria-label。
- DB 変更なし。seed.sql に取り下げ・却下・メンバー参加・アンケート・一般予約・遊びたいを追加。段階 2（操作メニュー）・3（主催者の引き継ぎ）・4（通知）は未着手。

## QW-20261008 / キャンセル待ち配送の監査確定

- 追加レビュー4213874446: Resend受理後の監査更新失敗で配送ackしない。配送キーに対応する固定監査IDをpayloadタグとログに使い、再試行/Webhookの監査行重複を避ける。既存固定payloadは変更しない。送信前の監査準備失敗は未送信としてleaseを解放する。
- 外部通信なしの実handler/監査helper回帰8ケースを追加、CIのEdge境界検査に組み込み。

## QW-20261008 / 保存済み貸切候補の取り下げ

- main fd0862a / staging35de2aで既存候補が選択不可、削除UI/RPC/列未包含を確認。主催者・申込前のみ二段階確認で取り下げ、回答履歴を保持する旧ローカルpatchを独立ブランチで統合。追加済み表示と読取フィルタを追加。
- 対象42テスト、全1756テスト、verify、隔離PGlite権限/回答履歴/古い回答拒否/rollback確認。ブラウザ保存→再編集→削除回帰は外部遮断の架空APIで検証。実顧客更新なし。
- DB先行が必要。公開DB構造記録の許可待ちを迂回せず、共有環境適用・push・deployは未実施。

## QW-20261002-006 / 整備残件の消化（2026-10-02 午後）

- #730 完了: 表示人数の規則を「有効予約の人数合計、出どころ不問」に統一し、矛盾する制約 schedule_events_participants_check を外した（20261002140000、staging・本番適用、PR #739）。demo 7 件は定員に揃え、ずれ 0 件。
- #733 完了: staging だけの 8 本は取り込み 4 本・履歴除外 4 本。staging の関数権限を本番に揃え staging.json 更新。
- #738 完了: 画面・部品・hook からの supabase.from() / rpc() を ESLint で禁止。許可リストは ESLint の実検出から作る（grep だと漏れる）。
- #734 コード側完了: GM 費用計算の照合を担当表の ID に揃えた（PR #741、resolveGmCostIdentity）。給与画面と売上側で役割の解釈が食い違う 4 行は #734 に記録、判断待ち。
- #721: 金額の正本は計画 第5節 5-2 に整理（3 画面の出どころ・本番件数・推奨）。社長判断待ち。
- CI の不安定（予約 RPC 認可テストが初期化中の一時 PostgreSQL に接続）を PR #740 で修正。
- 本番反映は release PR #736（merge commit）。main == staging。CI / E2E / Deploy Supabase 成功。
- DB パスワード回転: staging は完了。本番は社長が誤ってリセットしたため、夜間ミラー用 Secret SUPABASE_DB_PROD_PASSWORD と手元 Keychain の更新待ち（アプリ本体は API キー接続で影響なし）。接続失敗を繰り返すと Supabase が接続元を自動ブロックするので、確認は 1 回ずつ行う。
- #712 の原因と表示修正は #744 で main 反映済み。運用判断（スタッフが明示的に選んだときは MMQ から送るか）は社長待ち。
- 夜間ミラー: CI はセッションプーラー経由（IPv6 不可のため）、pg_dump 17 を明示、デッドロック再試行、ai_manager_work_stores の migration 記録（#745 #747 #748）。
- 夜: #644（GM 確定の Discord 連絡が組織全体の Discord 設定で見送られていた）を修正し 39 件を再送、通知設定の未使用スイッチを撤去。#757（未送信メールの記録）、Phase 4 の rollback 対検査、Phase 2 の1本目（公演・予約の書き込み 13 か所）を実施。#724 を閉じ、#723 は実データ待ち。
- Codex レーンへ: 通常の不具合修正は再開可。Phase 2 の続き（画面側の直接書き込み 114 か所、docs/MMQ_SEIBI_PLAN_2026-10.md 第3節）は「1 ファイル 1 PR・挙動不変」で進める。#722〜#727 の受入は実環境確認が必要。

## QW-20261002-006 / 整備 Phase 1 の区切りと以後の決まり（2026-10-02）

- Phase 1 の DB 変更3本（参照ゼロ28表の archive 退避 / 人数差の安全な再計算 / 旧GM配列の全員再計算）を staging と本番に適用し、構造の写し（supabase/structure/prod.json、138表）とアトラスを更新した。drift チェックは毎日 07:30 JST に本番・staging を記録と比較する。
- 整備期間（書き込みの Claude 窓口への一本化）は本日で終了。Codex レーンは通常の不具合修正・機能開発を再開してよい。残件は issue（#721〜#727、#730、#733、#734、#716）で通常の作業として進める。
- 以後の決まり: (1) migration は rollback と対、staging と本番へ同じ日に適用、適用環境の supabase/structure/<env>.json を同じ PR で更新。(2) drift チェックが落ちたら当日中に migration で記録するか DB を戻す。(3) staging と main の取り込みは merge commit。7日以上開いた PR は閉じる。(4) 完了判断は docs/MMQ_SEIBI_PLAN_2026-10.md 第3節の表。「全体IN_PROGRESS」は書かない。

## QW-20261002-006 / 整備 Phase 0 着地と QW-20260917-001 の閉鎖（2026-10-02）

- 社長の着地点（意図しない変更を無くす・DB をアトラス基準で適正化・開発しやすく）に合わせ、整備の正本を docs/MMQ_SEIBI_PLAN_2026-10.md に置く。完了は同書第3節の数値表だけで判断し、「全体IN_PROGRESS」の追記はやめる。
- QW-20260917-001（全領域整理・58項目）は本日で閉じる。受入済み項目はそのまま。未完の項目は GitHub issue で個別に追跡し、ずれたデータの補正は同書第5節で社長が判断する。
- 本日の実施: 下書きPR 10本の取捨（#713/#709/#706 マージ、#703 衝突解消、#700/#708/#584/#431 閉鎖、#707 維持）、リモートブランチ334本削除、本番 DB migration 6本適用（未適用なし）、main→staging 取り込み PR #715。
- Codex 窓口への依頼: 58項目の正本一覧（コード・一言説明・状態）を issue #716 のコメントへ貼る。整備期間中（Phase 1 完了まで）、mmq_yoyaq への書き込みは Claude 窓口だけが行い、Codex レーンは読み取り・調査・一覧提出に限る（AGENTS.md 参照）。
- 進め方の変更: 挙動を変えない PR は CI 緑で即マージ。7日以上開いた PR は閉じる。整備中に mmq_yoyaq へ書くエージェントは1つ。migration は rollback と対で出す。

## QW-20260917-001 / 店舗承認待ち判定のWeb・API・Discord共通化（2026-09-28、検証中）

- B26：一覧/件数は1人の回答だけ、Discordは全て不可でも店舗確認待ちに進めていた。共通判定で同候補・在籍・同組織・必要人数・別々の主副GM資格を確認する。全予約/回答/担当のページング、欠落時の判定停止も統一。
- 保存済みstatusではなく最新判定でGM確認中/店舗承認待ちを分け、必要人数が崩れた古いpending_store等も見誤らない。件数は回答/担当/在籍変更と定期取得で更新し、失敗時は「!」で未確認を示す。遅延応答とユーザー切替の古い結果を表示しない。
- 本番の状態遷移関数で降格/直接pending_store遷移が禁止と確認。GM回答による状態更新はpending/pending_gmだけをgm_confirmedへ進め、他の承認段階/確定/取消状態を保持。Discordは取得statusで比較更新。回答保存後の反映失敗は保存済みと明示。
- 39テスト、verify、DiscordのDeno型検査成功。独立レビューP2を修正し再レビュー追加P1/P2なし。Edge/画面の本番反映と受入は未完。
- A11 DB01300は本番も適用済み。関数hash・既存権限・trigger・履歴読戻し成功。13件の既存人数差は意味未確認のため補正せず、A11全体受入とはしていない。

## QW-20260917-001 / 人数再集計の同時保存競合（2026-09-28、検証DB適用済み）

- A11：本番と同じ関数を隔離PostgreSQLで実行し、予約2件の同時追加で合計2人に対して集計1人になる競合を再現。別文で公演をNO KEY UPDATEロックしてから集計し、移動元・先もUUID順に取得する。
- 修正後は2接続で合計2人を保持し、逆方向の同時公演移動も両方commit・両集計一致。状態別計数、人数変更、取消、削除、NULLリンク、失敗rollback、既存値未補正、逆DDL/再適用も成功。独立レビューP1/P2なし。
- DDL01300をstagingへ適用し、関数本文・既存ACL・SECURITY DEFINER/search_path/row_security設定・履歴を読戻し。本番未適用。過去の不一致は意味を確認せず補正しない。
- A04の貸切削除とA29の組織登録は、取得済み本番定義と実テスト対象の一致および認可/途中失敗/逆DDL検証を確認し、当初の限定範囲で受入済み。58項目=受入20/実装済み受入待ち20/監査待ち18。全体IN_PROGRESS。
- PR641 headca851de4はCI全件成功。ブラウザ実機受入は自動承認レビュー利用上限により拒否されたままで、本番フロント/DB01200は未反映。

## QW-20260917-001 / GM回答後の担当条件判定（検証中）

- 担当表が未登録/取得失敗でもメイン・サブ両方可能とする推測を廃止。在籍中・同組織の担当表を取得し、同じ候補で別々のメイン1名・残りのサブが揃うことを確認する。1人GMもメイン条件を確認。
- 予約/作品/担当/在籍の読取失敗は不成立や成功に変換せずthrowし、既存の「回答は保存済み・反映未確認」経路へ渡す。役割二重計上・候補違い・未登録・退職・各読取失敗を含む11テストとverify成功。
- B26の件数badgeは従来の「1名以上の候補回答あり」条件が別に残るため、本件で全体受入とはしない。画面受入・本番反映は未完。
- CIの承認並行テストは固定20ms待ちが不安定だったためRPC開始待ちへ変更し、全1148テスト成功。機能側の再試行条件は変更していない。

## QW-20260917-001 / 貸切履歴の予約番号検索（検証中）

- B06/#374：グループ一覧が予約番号を検索対象に含まず、保存された完了非表示で過去・取消案件を隠していた。組織・グループで絞った予約番号を過去の再申込分もページング取得し、検索対象へ追加。
- 検索時は完了非表示を一時解除し、状態/事前配役の明示フィルターは維持。全件数と表示件数を表示し、リセットで追加フィルターも解除。完了判定の日付をJST固定。
- hook・検索・ページング14テストと型検査成功。画面受入/本番配備は未完。報告の具体的な予約番号は未提示であり、物理削除や旧グループ未紐付けデータの復旧まで完了とはしない。
- A03は本番関数/一意索引を読み戻し、同定義を使う隔離PostgreSQLの2接続で会員/ゲストの重複参加と残席競合の4ケース成功。運用データ変更なし、隔離領域削除済み。限定した要件範囲で受入済み。

## QW-20260917-001 / スタッフ参加の人数内・追加席と一括保存（2026-09-28、検証DB適用済み）

- B03：スタッフIDごとに既存予約人数内か追加1席かを明示。予約人数内では元の人数・金額を変更せず、名前の一致による人物・予約の推測を廃止。過去のstaff_entry/手動予約は一括移行しない。
- 担当役割・参加席・監査/公演履歴を同じRPCトランザクションで保存。古い画面の担当・参加情報はexpected照合で拒否。定員超過や後半の失敗で先行取消だけ残らない。
- 予約の取消・減員・移動・削除後はリンクを再確認状態として扱い、画面で選び直す。変更済み追加予約を自動取消せず、明示的な再選択で紐付けを更新。予約の削除はFKで妨げない。
- 新規テーブルevent_staff_participationsと認証付き取得/同期RPCのみ追加。既存RLSポリシー変更なし、既存データ補正なし。DDL01200をstaging適用。PGliteで人数/認可/古い保存/後半失敗/役割rollback/予約保持/再確認/復元再適用成功。実staging隔離schemaの2接続で片方のみcommit、二重追加なし、領域削除済み。画面/保存11テスト成功、独立レビューP2修正後追加P1/P2なし。
- verify成功。標準test:rpcsはローカルSupabase/PostgreSQL未起動とnpmキャッシュ権限で実行不能（成功扱いにしない）。追加RPCは隔離PGlite・実staging PostgreSQLで検証済み。DB関数hash/ACL/RLS/空テーブルを読み戻し。CUA getStateは再試行も10秒timeoutで画面受入不可。
- PR641 head7c989145のCI全件とstaging5e2e1aa5のVercel配備成功を確認。本番未適用。実環境の受入・ER更新は残る。全体IN_PROGRESS。
- ダッシュボードから開く公演編集も担当表正本の取得へ統一。初回だけの保持を廃止し、再表示時に最新情報を取得。取得失敗では編集を開かず再試行を案内する。担当取得関連4テストとverify成功。ブラウザ接続は復旧したが、検証サイトへのアクセスは自動承認レビューの利用上限で拒否され、画面受入は未実施。
- 前段PR640はmain22dc8ef3・Vercel成功、staging094868c2同期済み。B21/B23/A16を当初範囲で受入済みへ更新し、Docs・共有台帳読戻し済み。58項目=受入17/実装済み受入待ち21/監査待ち20。

## QW-20260917-001 / スタッフ参加の保存前書込を廃止（2026-09-28、ローカル検証中）

- 編集中のGM役割変更・担当削除で、予約を即時追加/削除する旧ヘルパーが残存。INSERTエラーを確認せず参加済みにし、同名顧客の先頭一致と手動staff_participation予約の削除も行っていた。
- 役割変更はフォーム内だけに留め、保存時の専用同期へ統一。既存の手動予約はGM役割変更で自動削除しない。未保存の追加は参加予定表示のまま。
- component操作と既存保存同期の7テスト成功。予約人数を減らす変更・人物統合・実データ更新なし。既存予約人数内と追加席の明示、複数追加の原子性はB03残件であり、この変更だけで全体完了にはしない。

## QW-20260917-001 / スタッフ監査履歴の改名・組織対応（2026-09-28、ローカル検証済み）

- 本番audit_staff_changesは改名を監査せず、INSERT/UPDATE/DELETEでorganization_idも記録していなかった。本番のstaff監査14件は全て組織NULL、既存RLSでは組織管理者に見えない。
- 今後のログに所属組織を保存し、改名前後の名前を追加。退職/再雇用等の既存監査は維持し、派生担当配列だけの更新は監査対象を増やさない。過去14件の所属を推測で補完しない。
- 実関数の隔離DBで改名・退職・再雇用・削除、他組織非表示、派生更新の無駄な記録なし、逆DDL属性一致/再適用を確認。RLS変更なし、DB本番未適用。


## QW-20260917-001 / 担当情報の先読みと通常表示の統一（2026-09-28、ローカル検証中）

- 先読みだけが担当取得エラーを空の担当一覧に変換し、通常表示・スケジュールと共有するキャッシュを汚していた。通常表示と同じ取得関数を使い、初回失敗はエラー、再取得失敗は確認済みデータを保持する。
- 先読みの初回失敗・既存データ保持・正本の主副GM反映と既存編集の7テスト成功。DB変更なし。本番反映/受入は未完。
- 前段PR637はmain8ec3df01へマージ、DB01000/01001本番適用・定義照合・Vercel配備成功、ER v24更新済み。B01全体の受入は継続中。

## QW-20260917-001 / 担当表正本・旧staff配列の派生化（2026-09-28、検証DB適用済み・本番未適用）

- 本番の旧双方向同期、列UPDATE権限、本人/管理者RLS、アカウント変更ガードを確認。アカウントガードは担当配列だけの変更を止めない。APIの旧配列廃止だけではDB入口が残る。
- 旧配列更新で担当を増減する機能を正本照合へ置換。担当表からの同期は全件再集計し、DELETEも扱う。旧配列は読取互換用として保持、RLS/テーブル/列/過去データは変更しない。
- 本番取得の関数定義とトリガーで正確な復元SQLを用意。隔離SQLで旧更新/INSERT拒否、主副GM保持、改名、担当削除/体験フラグ、rollback/reapply成功。検証DB01000適用・定義/トリガー読戻し成功。実atomic担当RPCの追加回帰も成功。本番未適用。旧GM配列のみの差は19スタッフ176件（154件は組織取扱にも不在）。既存配列の一括補正や担当復活は行わない。

- 独立レビューで直接upsert時のFK KEY SHARE→FOR UPDATE昇格による競合を確認。適用済み01000を変更せず01001でFOR NO KEY UPDATEへ修正。検証DBの隔離スキーマ・2接続で旧関数のデッドロックを再現し、修正後は両方commit・キャッシュ2件保持を確認、テスト領域削除済み。

## QW-20260917-001 / 体験履歴の全画面判定統一（ローカル実装・未配備）

- 作品詳細2画面のcompleted/checked_in除外、作品一覧のpending混入、マイページ直近50件制限による履歴欠落を確認。確定済み4状態かつ過去の予約を共通取得し、500件単位で全履歴を取得する。
- 未体験指定は予約・手動登録の両方より優先し、管理画面でも手動履歴へ未体験表示を付ける。履歴の元データは保持。取消後は残る手動登録があれば体験済みを維持する。
- 予約一覧の表示上限とアルバム/参加数の母集団を分離。DB/RLS変更なし。全体はIN_PROGRESS、検証/本番反映は未完。

## QW-20260917-001 / 配送予定を作らない旧却下入口の閉鎖490（ローカル検証中）

- 現行API/画面/Edgeは配送記録付き入口へ移行済み。旧reject_private_booking_with_noticeの直接呼出しはなく、両環境の旧関数ACLは所有者/authenticated/service_role、他public関数からの参照なしを確認。
- 旧入口のPUBLIC/anon/authenticated実行を取り消し、所有者/service_roleを保持。既存RLS・データ・関数本文を変更しない。復元SQLは実ACLへ戻す。
- 実420/440/450/460/470を使う隔離DBで、匿名/有効管理者の旧入口拒否、新入口の一括保存/同一世代再試行/記録保持、復元再適用を確認。既存の通常モードも成功。DB490未適用、全領域IN_PROGRESS。

## QW-20260917-001 / 候補日追加481（2026-09-27、ローカル検証済み・未配備）

- PR611のCursorレビューで、画面では除外する平日午前/午後を保存側が受け付けるP2を確認。本番画面の反映を保留し、適用済み480を変更せず481で関数を更新する。
- 通常尺は午後、長時間作品は午前という条件を、同一店舗の午後/夜開始時刻と準備時間で判定。準備時間0を保持し、複数店舗の時刻を混ぜない。土日祝・独自休日は対象外。
- 隔離DBの追加拒否/長尺/0/独自時刻ケース、画面計算10テスト、verify成功。独立レビューの最早店舗選択P2を修正し、再レビューで追加P1/P2なし。修正後の型/対象lint/テストも成功。DB481は未適用、PR611は未マージ。全域IN_PROGRESS。

## QW-20260917-001 / 貸切却下メールの永続配送470/471（2026-09-27、未配備）
## QW-20260917-001 / 候補日追加480（2026-09-27、ローカル検証済み・未配備）

- 候補日時・チャット通知・再送記録を一括保存し、申請状態/組織/作品/希望店舗/締切/営業時間/準備時間を保存時に検証。順序はグループロック下で採番し、途中失敗では全件戻す。同じ送信番号での再試行は重複保存しない。
- 候補の選択を失敗時に保持し、二重送信を抑止。顧客画面の独自休日を対象組織の公開RPCから取得し、取得失敗時は保存しない。長時間作品の枠延長も閉店時刻までとし、作品名による週末夜開始補完も保存側と揃える。
- 実締切継承/祝日/準備時間resolver/候補日triggerを使用する隔離SQLで認可・申請状態・0と継承・日跨ぎ・複数店舗・途中失敗・再送・復元再適用を検証。UI/hook/API/SQL営業枠対照44件成功、verify成功、独立再レビューP1/P2なし。実PostgreSQL複数接続の並行検証はローカルサーバー未導入で未実施、PGliteの逐次検証と区別する。
- DB480→フロントの順で配備する。既存RLS/過去の候補は変更せず、新規内部再送記録だけRLSを有効化してブラウザ直接アクセスを拒否。旧直接経路はクライアント移行後の閉鎖対象。全領域はIN_PROGRESS。


- 新しい却下入口で予約・公演・候補・チャットとメール送信予定を一括保存。取消世代単位の一意化、宛先/本文の保存、旧取消の送信不明保留。旧入口は切替まで維持する。
- 配送はリース/CAS、固定本文/送信アカウント、プロバイダーの重複防止キー、厳密な履歴保存、23時間以内の限定再試行を使用。結果不明・期限超過は要確認で停止。未要求の失敗だけ登録連絡先で再試行できる。
- 同組織管理者/有効スタッフ専用の状態RPCを画面へ接続。旧送信Edgeも新予定がある世代を直接送信しない。DBと共通cronキーが異なる環境では配送専用キーを使用し、既存共通キーを変更しない。定期配送は5分間隔、DB470→Edge2本→DB471→API/画面の順に配備する。
- 隔離SQL・配送・API/hook・画面・Edge認証・cronを検証済み。配送結果とメール履歴を同一TXで確定し、履歴更新失敗と応答切断も検証。最終verify成功、独立再レビューのP2解消・追加P1/P2なし。実環境受入は未完。新規配送テーブルだけRLSを有効化しクライアント向けポリシーなし。既存RLSは変更せず、実顧客への試験送信なし。過去の通知を自動で再送しない。

## QW-20260917-001 / 旧貸切却下同期の直接入口閉鎖460（2026-09-27、検証中）

- PR608/main fdcfd582の一括保存はDB450両環境・本番配信・画面/認証確認まで受入済み。実顧客の却下・メール送信試験は未実行。
- 画面/API/Edgeと両環境のDB関数参照を確認し、旧mark_private_group_rejected_after_booking_rejectionは新一括保存からの内部呼出しだけ。PUBLIC/anon/authenticatedの直接実行を閉じ、所有者とservice_roleを保持する。
- 本番の適用前ACLにPUBLICはなく、検証だけPUBLICがある。復元SQLは本番基準、検証への復元時は明示した追加GRANTも実行する。
- 実420/440/450関数を使う隔離DBで旧入口の直接拒否、新一括処理の正常/再承認/再試行/全体rollbackと両ACL復元再適用が成功。verify（型・静的検査・ビルド）成功。DB460未適用。RLS/テーブル/業務データは変更しない。

## QW-20260917-001 / 貸切却下の一括保存450（2026-09-27、実装・検証中）

- 予約取消・貸切公演中止・グループ差戻し・候補却下・チャット通知を一つのスタッフ専用RPCへ集約。途中失敗で全件巻き戻す。組織/現在予約/状態/他予約の存在を保存前に検証する。
- 通知IDを予約IDと取消日時で固定し、同じ本文での再試行では通知を重複せず新しい候補も保持。再承認後の新しい却下は別通知として履歴を残す。別内容・ID衝突は上書きしない。
- 画面の旧同期RPCとチャット直接保存を除去。メールは保存後に送信し、送信未確認を保存失敗や送信済みと表示しない。グループなしの旧貸切も対象。料金記録では組織側の却下として扱い、既存外部通知経路を保持する。
- 隔離DBの実取消関数を含む正常/拒否/再試行/失敗巻戻しが成功。画面・API36テスト、verify、独立再レビューP1/P2なし。再承認後の別通知、本文変更再試行、通知ID衝突も検証。DB450未適用、本番未反映。永続メール送信管理は残件。

## QW-20260917-001 / 貸切却下メールの権限と予約対応（2026-09-27、実装・検証中）

- 実本番Edgeソースに匿名許可と入力宛先への送信を確認。認証必須へ変更し、同組織管理者または有効スタッフだけが通知できるようにする。
- 取消済み貸切予約、同組織公演、現在の予約参照とdate_adjusting状態を確認。保存済み予約の宛先・氏名・作品・候補日を使用。画面の宛先優先順も合わせる。
- 全文編集のテキストは維持し、HTMLはエスケープ。実verifyAuthと実handlerを使う隔離8テストと共通セキュリティ9テスト・verifyが成功。DB/RLS変更なし。本番未反映。永続的な送信重複防止と予約・公演・通知の一括保存は引き続き残件。

## QW-20260917-001 / 貸切却下後同期の入口保護（2026-09-27、実装中）

- 旧RPCは幹事本人や他組織管理者が予約の取消前でもグループ・候補日を変更可能。実本番定義を確認し隔離DBで再現。anonに実行権はあるが、本番is_org_adminはfalseを返すため匿名バイパスとは断定しない。
- 同組織の管理者・有効スタッフ、取消済み予約、グループ組織と現在の予約参照をロック下で検証。取消済みグループの復活を拒否。再試行で追加候補を再却下しない。ACL/RLSは保持。
- 隔離実DDLで旧挙動、拒否、正常同期、候補更新失敗の全件巻戻し、復元再適用を検証。DB440未適用。予約・公演の取消とチャット通知も含む全体一括保存は次の残件。

## QW-20260917-001 / 公演中止の一括取消と部分失敗表示（2026-09-27、実装・検証中）

- PR599: 同じ公演の予約を直列で取り消し、公演行のNOWAITロック競合を回避。取消がfalse/例外の予約にはメールを送らず、残りの予約処理を続行する。
- 取消失敗と取消済みメール未確認を分け、予約番号と次の確認先を表示。送信APIのerror・success=false・宛先不足・手動返信待ちを「送信済み」と扱わない。予約保存時の宛先を優先し、実際の取消件数を成功表示へ使用。
- 結果表示後に部分更新も再取得。再取得失敗で取消の結果を上書きしない。隔離hook/helper 9件・verify成功。DB/RLS変更なし。本番未反映。実予約取消やメール送信を試験として実施しない。公演中止と全予約を一つのDBトランザクションにする作業は別途残件。

## QW-20260917-001 / 旧貸切予約入口の直接実行を閉鎖（2026-09-27、準備中）

- 全画面の申込処理を通知付き入口へ移行した後、旧create_private_booking_requestのPUBLIC/anon/authenticated実行権限を取り消す。新入口の所有者経由の実行とservice_roleを保持。
- 実DBの関数参照とsrc/API/Edgeの呼出元を照合。実際の画面2経路は新入口だけを呼び、旧名称は教材例/コメントのみ。
- PR581の本番配信・受入後に検証環境へDB350を適用。実authenticated/anonの旧入口実行拒否、新入口所有者/service権限保持を確認。隔離DBの新入口予約/通知成功・逆DDL、verify成功、独立レビューP1/P2なし。本番350未適用。既存RLSとテーブル権限は変更しない。

## QW-20260917-001 / 貸切予約申込の通知保存（2026-09-27、実装中）

- 本番の既存予約RPCでは予約とグループ状態が既に一括保存されることを確認。新しい認証付き入口でその処理と申込チャット通知を同じトランザクションにし、通知失敗でも予約だけ残る状態を防止。
- 組織の定型文と保存済み候補数を使用。主催者メンバー行がなくても通知を保持。申込済み/確定済み/取消済みや未取消予約の再申込をグループロック下で拒否。
- 2つの予約画面と完了画面の重複した状態更新・通知保存を除去。確認メールは従来どおり保存後。配信中の旧画面との互換性のため、旧RPC権限の閉鎖は移行後に行う。
- 隔離DBで実予約RPCを含む全体rollback/定型文/匿名拒否/二重申込拒否、hook2+既存UI2、verify成功。独立レビューP1/P2なし。DB340検証/本番環境適用、実ロールで確定済み/他者/匿名拒否を確認。PR581/main7c6174e5本番配信成功、貸切招待のチャット/入力/4名表示正常・エラーなしを受入確認。実予約作成・通知送信の試験は実施しない。RLS/既存テーブル権限の変更なし。

## QW-20260917-001 / 希望店舗と候補日の一括保存（2026-09-27、実装中）

- 店舗だけ保存して候補日削除の失敗を無視していた経路を、管理権限付きRPCへ移行。編集中の店舗変更、組織外/非対応/非稼働店舗、申請済み/確定済みグループを拒否。
- 全希望店舗で利用できない候補日の整理と希望店舗変更を同一トランザクションで保存。予約申請と同じ募集停止枠・準備時間・前日からの深夜公演を判定。180日より先の候補も判定し、却下済み候補は保持。
- 作品設定取得失敗を全店舗対応と誤認しない。過去の希望店舗取得も組織・稼働状態を限定。編集開始時の店舗を固定し、競合時は再読込を案内。
- 隔離DB/保存処理6テスト/verify成功。独立レビューの同時店舗移動の判定混在を単一SELECT化で修正し、再レビューP1/P2なし。DB330は検証/本番へ適用し、実ロールで古い確認元/他者/匿名の拒否を確認。PR580/main4a2d9153本番配信と招待画面の希望店舗欄・チャット・入力・4名表示、エラーなしを受入確認。実顧客の候補日削除・通知は試験実行しない。既存RLS/テーブル権限の変更なし。

## QW-20260917-001 / 貸切参加者の削除・退出（2026-09-27、実装中）

- 幹事/組織スタッフによる参加者削除と、ログイン本人の退出を認証付きRPCへ移行。対象グループをロックし、権限をDBで判定する。一般参加者・別組織・退職スタッフによる他者削除を拒否。
- 幹事本人の退出を拒否。過去の重複参加行は本人分だけ同じトランザクションで削除し、途中失敗時は全件戻す。主催者行の管理削除は既存のスタッフ限定条件を保持。
- 保存失敗を画面へ伝え、読み込み状態を解除。実顧客の削除・退出を試験実行しない。DB/RLSの既存テーブル権限は変更しない。隔離DB/画面3件/verify・独立レビューP1/P2なし。DB320検証/本番適用済み、実authenticated/anonで幹事退出/無効対象/未ログインの拒否を確認。PR579/main7f1e214f本番配信成功、貸切招待のチャット/入力/4名表示正常・エラーなしを受入確認。

## QW-20260917-001 / 配役方式変更の一括保存（2026-09-27、実装中）

- 方式変更/リセット、配役初期化、キャラクター質問の回答削除、通知を同一RPCで保存。本人/スタッフの管理権限と確認元状態、組織内作品を検証し、途中失敗時は全件戻す。
- キャラクター以外の回答と過去通知は保持。古い確定通知がある場合も、方式変更後に改めて配役できるよう判定を修正。
- 招待画面の2経路を統一し、方式保存失敗はエラー表示。隔離DB/画面5件・verify・独立レビュー通過。DB310検証/本番適用、実authenticated/anonで無効方式/他者/未ログイン拒否を確認（実データ変更なし）。PR578/main291074d8・本番Vercel成功。貸切招待（告別詩）チャット・入力・4名表示正常、コンソールエラーなしを受入確認。

## QW-20260917-001 / 個別通知の宛先と送信（2026-09-27、実装中）

- 個別通知を本人・管理スタッフにだけ返す。認証済みゲストとuser_idでの再作成メンバーへの通知を保持し、他人のmember_idを指定しても取得不可。履歴の絞り込みはページング前。
- 送信はスタッフ専用RPC。宛先・作品資料・共通/個別定型文・表示名を組織内の現在値から解決し、実際の保存ID/日時を履歴に使う。
- 隔離DBで認可・本人/幹事/スタッフ/ゲスト・宛先偽装・古いメンバーID・不正JSON/通常文・ページング・送信条件と定型文継承を検証。画面回帰3件・verify・独立レビュー通過。DB300は検証環境へ適用し、実ロールで宛先フィルタ/送信拒否/無効宛先を確認（実データ操作なし）。本番未反映。
- 既存テーブルの直接取得権限は、他の書込経路も移行してから閉じる。全域残件は継続。

## QW-20260917-001 / 貸切配役の一括確定（2026-09-27、実装中）

- 配役確定・アンケート回答・システム通知を同一RPCへ移行。途中失敗時は全件rollbackし、成功表示を出さない。
- 幹事/組織スタッフの認可、全参加者・重複なし・作品キャラクター・必要人数・確認開始時点からの変更を検証。
- 隔離DBで通知失敗時の全件rollback、認可/入力/競合の拒否、幹事/スタッフの成功、逆DDLを検証。
- DB290は検証環境へ適用。実authenticated/anonで権限と古い確認元の拒否をROLLBACK内で確認（実データ更新なし）。画面回帰3件・verify・独立レビュー通過（会員実名を通知へ出さない修正含む）。本番未反映。個別通知・方式変更など他の書込経路と直接読取閉鎖は残件。

## QW-20260917-001 / 貸切の認証付き読取へ移行（2026-09-27）

- [x] 招待は最小プレビュー、参加者は本人連絡先、スタッフ・幹事は認可範囲のsnapshot。スタッフ表示名とアンケート一覧はスタッフ限定。
- [x] 招待・管理・マイページ・予約一覧・チャット・通知履歴・アンケートの主要取得経路を共通RPCへ移行。UUID/日時カーソルで一覧と履歴の件数欠落を防止。
- [x] 認証変更・期限切れ・旧リクエストの遅延を検証。自動更新で未保存回答を上書きする回帰を修正。独立レビューの氏名表示回帰も修正済み。
- [x] DB280を検証環境へ適用。実authenticated/anonロールで取得・拒否・最小プレビューを確認（ROLLBACK、実データ更新なし）。PGlite、型・lint・ビルドのverify成功。
- [x] PR575/main 59a6566f、本番DB280→フロント配信成功。検証657グループ/590予約、本番1,136グループ/1,040予約がDB件数と一致。履歴正常・consoleエラーなし。ローカルtest:rpcsはDocker未起動のため未実行。
- [ ] 保存・通知送信など残る直接アクセスを移行後にテーブル読取権限を閉鎖する。今回RLS・テーブル権限は変更していない。全領域の整理は継続中。

## QW-20260926-006 / 設定整理の残項目

- 売上の公演別費用を一度計算し、概要・店舗別・作品別・日別・公演明細へ共用。役割別報酬、明示0円、GMテスト、公演日時点の報酬、交通費を統一。
- 作品未選択時の公演時間を組織共通／店舗個別で設定。旧店舗値を保持し、共通に戻す操作を提供。作品選択後は作品の時間を優先。既存公演の時刻は変更しない。
- 予約時クーポン選択とサーバーでの事前確認を実装。本人・対象・使用期限・人数別の料金を確認し、確定前には消費しない。
- 営業時間は店舗の物理的制約として維持。一括保存と共通継承の違いを画面に明記。通知先・権限も作品上書きの対象にしない。
- 過去の完了状態を2026-09-26の共有案件台帳とmain履歴で照合して訂正。下記の未確認操作を完了扱いにしない。
- 型・lint・build・単体テスト、隔離DB、画面E2E2件（人数/対象切替・対象外理由・継承保存・390px）を検証。検証DB3変更を適用し、旧店舗2行の実効値変化0件を確認。本番反映は未実施。
- 予約確認メールもDB確定後の割引後金額を使用し、全額割引0円を保持。給与支払のstaff_id移行は別案件のまま。

## QW-20260926-005 / クーポンの条件・対象・適用経路を統一（2026-09-26）

- [x] 店舗・導入作品の選択UI、併用/同作品の再利用、配布と利用の区別、配布済み条件の保持。
- [x] 組織→店舗→シナリオ→公演のクーポン受付設定と予約時保存。貸切申込時の作品設定も反映。
- [x] 予約RPCとマイページを共通DB判定へ統一。割合計算・予約金額上限・二重減算・再試行・取消を修正。本人/組織のチェックと行ロック後の再判定。
- [x] 単体584件・隔離DB回帰・verify・Node API実ビルド・PC/スマホ編集画面検証。ステージングDB適用と1,177件の条件保持、DB実行検証rollback。
- [x] PR512と本番DB migration反映済み。期限内の配布終了クーポン、今後の予約候補、取得失敗の回帰を追加。
- [x] PR513（8144baed）で表示修正・本番画面確認を完了。期限切れ除外、併用案内、配布済み条件を確認。共有案件台帳005は完了。詳細 `docs/COUPON_RULES.md`。

## QW-20260924-004 / 予約の追加人数・件数制限を廃止（2026-09-24）

- [x] 店舗の予約設定から参加人数欄を削除し、1回の人数上限と顧客の同日件数制限を予約前チェックから除去。関連する説明も修正。
- [x] 公演定員・残席・締切の保護と取得失敗時の拒否を維持。旧設定値が残っていても利用しない。DB列は互換性のため保持。
- [x] 本番・検証DBを読み取り照合。現行予約RPC2種は2つの旧設定列を参照しておらず、DB移行は不要。本番の定員・残席ロック処理を確認。
- [x] PR503の本番反映と表示確認、unit487件・画面5件・CI成功。会社Driveの案件QW-20260924-004へ証跡記録。
- [x] 追加承認：未使用の電話番号認証スイッチ・旧料金設定・旧売上レポート設定を整理。現行電話入力必須・作品料金・売上機能は保持。旧URLは設定一覧へ転送。
- [x] 追加3項目はPR504で本番反映済み。後続PR505/507/509/511を含む設定継承整理の完了証跡は共有案件台帳004・Drive実装記録に保存済み。

## QW-20260924-003 / 設定画面の左端を統一（2026-09-24）

- [x] 通知設定など19画面でフォーム外側の自動左右余白を削除。設定の見出し・範囲説明・フォームを左揃えにし、最大幅は維持。
- [x] verify（既存57警告）、設定画面の既存Playwright 5件、差分検査が成功。DB・設定値・保存処理に変更なし。
- [x] PR500本番反映・通知設定の左端一致を確認。完了証跡は会社Driveの案件QW-20260924-003へ記録。
- [x] 追加訂正：左揃えを維持し、設定一覧・個別設定共通の外側余白を10pxからPC24px／スマホ16pxへ拡張。
- [x] PR502（fe28bd7c）本番反映済み。PC24px／スマホ16pxと横はみ出しなしを確認し、共有台帳003へ記録済み。

## QW-20260921-004 / 共通・個別の追加募集対象（2026-09-24）

- [x] 既存ゲーム設定を維持し、設定→運用と案内→開催判断・追加募集へ共通値を追加。シナリオ単位で共通/個別、人数/割合を指定。
- [x] 割合は最低開催人数に対する不足上限。floor(最低人数×割合/100)。7人・50%なら不足3人、参加4人以上。0人になる場合は不足1人も対象外と明示。例を入力に即時追従。
- [x] 認証組織に限定したAPI、管理者限定保存、楽観ロック、履歴を実装。DB実判定も同じ式を使用。既存個別設定と案内済みの不足上限・期限を維持。
- [x] unit467件、verify、隔離DB（移行/権限/組織境界/競合/実判定/条件凍結）、画面操作2件（共通・個別、保存、390px幅）成功。
- [x] PR496（9f37c7c1）と対象DB変更を両環境へ反映。本番の共通値・個別対象表示を確認。共有台帳QW-20260921-004で完了済み。

## QW-20260921-003 / 不備キットの未配置警告（2026-09-21）

- [x] 原因：移動計画は良好キットだけを使う一方、公演一覧・編集は状態を無視して所在地を数えていた。
- [x] 両画面で共通の使用可能な配置抽出（condition=good）を使用。破損・修理中・欠けあり・引退・未知の状態を警告解除に使わない。同一キットグループの正常キットは利用可能として維持。
- [x] キット配置管理を閉じる際に一覧の配置データを再取得。公演編集も開くたびに再取得する。
- [x] 不備キットを未登録と誤説明せず「使用可能なキットがありません」と案内。レイアウト・色は変更しない。
- [x] 追加15件を含むunit451件、verify（型・lint・build・security/RPC）、diff検査成功。DB/API変更なし。
- [ ] 検証環境【スケジュール管理→キット配置管理】良好→破損へ変更して閉じ、公演カード・警告一覧にキット未配置が出ること。良好へ戻すと消えること。
- [ ] 検証環境【スケジュール管理→公演を開く→公演内容】不備キットのみの店舗で警告、良好な共有グループのキットがある店舗では警告なし。出張・場所貸し・MTGは従来どおり対象外。
- [x] PR495（fef70fab）本番反映済み。固定staging配信問題も後続案件で解消済み。上の個別操作手順の実施証跡は本記録では未照合。

# MMQ 全体改善 指示書（Codex 引き継ぎ用）

## QW-20260917-001 / 給与・売上の公演日別給与条件（2026-09-17）

- [x] Studio保存元のMMQ構造アトラスとソースを照合し、第1段階の実装GOを受領。
- [x] 組織別に期間開始前の直近履歴と期間中の変更をまとめて取得し、給与・売上の時給計算と受付報酬に公演日時点の条件を適用。現在設定へのフォールバックを廃止。
- [x] 履歴不存在・不完全・取得失敗を画面に表示し、失敗時のキャッシュ済み金額表示と給与CSV出力を防止。受付0円を維持。
- [x] 認証済みsales APIへ履歴・給与集計入力・売上費用入力の取得を集約し、JWTの組織で絞り込む。組織指定偽装/顧客/未認証を回帰検証。クライアント直フィルタは163→162へ削減しorg_scopeガード通過。組織別キャッシュキー・組織必須チェックを追加。設定保存日をJSTとし、履歴保存失敗を成功表示せず、保存成功後は給与・売上を再取得。
- [x] 追加23件を含むunit 436件、verify（型検査・lint・build・セキュリティ・既存RPC検査）、diff検査が通過。lintの既存56警告は維持。
- [x] 本番をREAD ONLYで照合。対象組織は履歴1件（2020-01-01開始）、最新履歴と現在設定の給与8項目に差なし。開催済み・非中止・GM配置ありの公演で適用履歴のない件数0。過去の改定履歴が実際に完全であったことまでは保証しない。
- [x] 第1段階はPR488で本番反映済み（31c4931c）。給与・売上の公演日別条件と画面表示を確認。
- [x] 第2段階の公演staff_id保持、改名時の役割保護、未確認担当・役割の表示を実装。PR493で検証中。
- [x] DB変更あり：20260921120000をstagingに適用。未登録/重複履歴を保持。続く20260921123000は既存の役割キーずれを未確認扱いにする補強。
- [x] 未確認公演・担当・役割がある給与CSVを停止。月次インポートはDB書込み前に担当名と重複を検証し、修正が必要な公演を表示。
- [ ] 第2段階のstaging新版画面を確認。固定URLのキャッシュが旧版を返す問題を切り分け中。
- [ ] 第2段階は本番DBへ両migrationを適用・読戻し確認した後にmainを反映する。DB先行が必須。本番未適用。
- [ ] 作品不明の9/1・11・15・24・25公演、未登録担当、役割キーずれは根拠確認待ち。旧配列廃止・予約側ID入力専用化は未実施。

第2段階の移行・検証・復旧手順：`docs/reports/QW-20260917-001-event-staff-identity.md`。


既存のシナリオ固有報酬・交通費・GM未配置時の見込計上などのルールは今回変更していない。売上ランキングのGM費用欠落はQW-20260926-006で集計を統一する。


## QW-20260917-001 / 追加の構造修正（2026-09-21）

- [x] 本番定義とAPI利用を確認し、ライセンス集計のJOIN増幅、予約の重複索引、キット移動の未完了ID移行を修正。
- [x] PGlite回帰とstaging実DBのロールバック試験を実施。既存の業務データを消さず、型・権限・キット属性を保持。
- [x] DB変更20260921121000・20260921122000・20260921124000はstaging適用済み。
- [ ] kit APIの入力エラー表示を含むstaging新版画面確認と、本番DB先行適用・main反映。
- [ ] 5つの無題公演と不明な過去担当/役割は根拠確認後に修正する。契約版/確定請求やキット個体の新設、旧列削除は要件未確定で今回含めない。

詳細・復旧: `docs/reports/QW-20260917-001-structure-cleanup.md`。GM ID保持のPR493とは別差分。

## QW-20260912-017 / Discord参加リンク（2026-09-16）

- [x] 本番の参加・観戦リンクがgatewayのJWT要求で401になることを確認。
- [x] HTML実行を必要とする旧処理を、Discord認証への302転送と認証コード交換に変更。
- [x] 関数設定と両環境の配備リストへ公開OAuth入口の設定を追加。Discord本人確認は維持。
- [x] 利用者承認後、当該関数のみ本番v8へ配備。参加・観戦とも302、不正リンク400を確認。
- [x] 配備前の設定検査、配備後の無認証GET検査、旧障害を検出する回帰テストを追加。検査結果を90日保存する。
- [x] 本番だけの修正とGit側設定の不一致、更新後検査の不足を配備スキルへ追記。
- [x] 利用者訂正により初参加者のメール再オープンを廃止。identify + guilds.joinの本人同意後、サーバー参加→該当チャンネル権限付与→チャンネル転送を一連で実行。既存リンク・招待を保持。参加失敗・確認失敗・旧同意・認証失敗を含む24件の回帰検証。
- [ ] 顧客本人のDiscord認証後の入室確認。メール送信・招待削除は実施していない。


## QW-20260914-003 / Issue #469 平日・土日料金（2026-09-14）

- [x] 本番の読み取りと隔離DBで、通常公演・貸切受付・貸切確定が土日料金を使わない原因を確認。
- [x] 通常公演の予約RPCと公開APIを修正。明示的な土日祝設定と受付日JSTによる適用期間を使う。
- [x] 貸切の候補日別見積もりを表示・保存。受付時の料金・独自休日・適用日を非公開テーブルへ保持し、承認時に確定日の金額を採用する。申込メールも保存済みの見積もりを使う。
- [x] 390 unit tests、隔離DBの通常/貸切旧不具合再現と修正後検証、verify、独立レビューが通過。
- [x] ステージングのDB2件と申込メールを適用。実関数を読み戻して隔離DBで再検証。6作品の平日/土日計算、既存の募集停止条件、テーブル権限を確認。
- [ ] 本番反映。利用者が本番修正まで明示承認済み。最終状態は共有案件台帳 QW-20260914-003 を参照。

SQL: `20260914120000_fix_weekend_booking_pricing.sql` と `20260914121000_fix_private_weekend_pricing.sql`。承認RPCは既存定義の4箇所を検証して変更し、環境固有の別案件の条件を保持する。受付時スナップショットのない既存予約は金額を維持するため、過去の予約に対する追徴・一括金額修正は行わない。

作成: 2026-07-02（Claude / 全体監査 12エージェント・実測ベース）
実装担当: Codex (GPT-5.5)　設計・検収: Claude / オーナー

この文書が**唯一のタスクリスト**です。フェーズ順に、**1タスク=1コミット**で進め、
完了したらこの文書のチェックボックスを `[x]` に更新して**同じコミットに含める**こと。
🔍 マークのタスクは実機確認が必要 → push 後に「確認してほしい画面と手順」を報告して**停止し、オーナー確認を待つ**。

---

## 0. 絶対ルール（AGENTS.md に加えて）

1. **staging ブランチで直接作業**。main への直接コミット・プッシュ禁止（AGENTS.md 参照）。
2. 各コミット前に必ず: `npx tsc --noEmit` / `npm run lint` / `npm run build:fast` / `npm run test:unit` すべて green。
3. **DB を触るタスク**: SQL 全文を提示→承認後に `npm run db:push:staging` → 確認クエリの結果を報告 → staging 実機確認後にオーナー判断で prod。**DB変更→フロントデプロイの順序厳守**。
4. このプロジェクト固有の罠（過去に実際に事故ったもの）:
   - **React Query**: グローバル既定が `refetchOnMount:false`＋`staleTime:5分`（`src/AppRoot.tsx:41-55`）。mutation 後に**別画面**のリストを更新するときは `invalidateQueries({queryKey, refetchType:'all'})` を必ず付ける（ヘルパー: `src/lib/queryInvalidation.ts` の invalidateEverywhere を使う）。
   - **RPC**: この DB の RPC は失敗時に例外でなく `{success:false}` を返すものがある。**戻り値の success を必ず判定**（手本: `api/reservations.ts:699-709`）。
   - **トリガー内 INSERT**: `ON CONFLICT (col)` を書く前にその col に UNIQUE があるか確認。複数 INSERT は内側 `BEGIN/EXCEPTION` で隔離。
   - **新規テーブル**: prod は既定で authenticated に ALL（TRUNCATE 含む）を付与する。作成時に必ず REVOKE（テンプレ: `supabase/migrations/20260630130000_create_customer_played_overrides.sql`）。
   - **数値の falsy**: `value || default` は 0 を潰す。`??` を使う。
   - 日付表示は `src/utils/jstDate.ts` を使う（`toLocaleDateString` 直書き禁止）。
5. 実機確認を依頼するときは「**どのメニュー→どのページ→どのタブで、何をどう操作して、何が見えれば OK か**」を必ず書く。
6. 指示書にない変更・「ついでに」改善は禁止。迷ったら手を動かさず質問する。

---

## 1. 全体ロードマップ

| フェーズ | 内容 | リスク | 目安 |
|---|---|---|---|
| 0 | 安全網（本番権限 REVOKE / CI にテスト追加 / 列DROP / RPC握り潰し修正） | 低 | 半日 |
| 1 | 小粒バグ一掃（B2〜B6） | 低 | 半日 |
| 2 | temp-ID 予約編集の fix 再適用（B1） | 中 | 1バッチ |
| **D** | **デザインシステム統一（オーナー重点①）** ※Codex の担当は D-0/D-3/D-5 のみ。**ページUI改装は Claude 担当**（→ docs/design/ADMIN_UI_REDESIGN_PLAN.md） | 中 | 数日〜 |
| **P** | **性能改善（オーナー重点②）** | 中 | 数日〜 |
| M | メンテ・掃除台帳 | 低〜中 | 随時 |

D と P は独立性が高いので交互に進めてよい。

---

## 2. フェーズ0: 安全網

### - [x] S1: 本番テーブル権限の最小化 migration 🔍(確認クエリのみ)
本番実測で以下に authenticated への ALL（TRUNCATE/TRIGGER/REFERENCES 含む）が残存。`store_travel_times` と `store_scenario_license_contracts` は **anon にも ALL** が付いている。TRUNCATE は RLS の対象外なので RLS だけでは守れない。

新規 migration `supabase/migrations/20260702XXXXXX_minimize_table_privileges.sql`:
```sql
-- 既定権限で付与された過剰GRANTの剥奪（RLS対象外のTRUNCATE等を含む多層防御）
-- テンプレ: 20260630130000_create_customer_played_overrides.sql
REVOKE ALL ON public.store_travel_times FROM anon;
REVOKE ALL ON public.store_scenario_license_contracts FROM anon;
REVOKE TRUNCATE, TRIGGER, REFERENCES ON public.customer_memos FROM authenticated;
REVOKE TRUNCATE, TRIGGER, REFERENCES ON public.store_travel_times FROM authenticated;
REVOKE TRUNCATE, TRIGGER, REFERENCES ON public.store_scenario_license_contracts FROM authenticated;
REVOKE TRUNCATE, TRIGGER, REFERENCES ON public.coupon_campaigns FROM authenticated;
REVOKE TRUNCATE, TRIGGER, REFERENCES ON public.customer_coupons FROM authenticated;
REVOKE TRUNCATE, TRIGGER, REFERENCES ON public.coupon_usages FROM authenticated;
REVOKE TRUNCATE, TRIGGER, REFERENCES ON public.manual_play_history FROM authenticated;
```
DML（SELECT/INSERT/UPDATE/DELETE）は剥がさない（アプリが RLS 経由で使用中）。
適用後の確認クエリ（staging→prod 両方で実行し結果を報告）:
```sql
SELECT table_name, grantee, string_agg(privilege_type, ',' ORDER BY privilege_type) AS privs
FROM information_schema.role_table_grants
WHERE table_schema='public' AND grantee IN ('anon','authenticated')
  AND table_name IN ('customer_memos','store_travel_times','store_scenario_license_contracts',
                     'coupon_campaigns','customer_coupons','coupon_usages','manual_play_history')
GROUP BY 1,2 ORDER BY 1,2;
```
期待値: anon は対象2テーブルで行なし、authenticated は `DELETE,INSERT,SELECT,UPDATE` のみ。

### - [x] Q1: ci.yml にユニットテストを追加
`.github/workflows/ci.yml` の typecheck の後に 1 ステップ追加するだけ:
```yaml
      - name: Unit tests
        run: npm run test:unit
```
現状 vitest のテスト12ファイルが CI で一切実行されていない（壊れても green になる）。

### - [x] D1: `email_settings.private_cancellation_template` 列の DROP
宙浮きテンプレの後始末（コード参照0・フロントは prod 反映済み＝いつでも実行可）。
migration `20260702XXXXXX_drop_private_cancellation_template.sql`:
```sql
ALTER TABLE public.email_settings DROP COLUMN IF EXISTS private_cancellation_template;
```
staging→（オーナー確認後）prod。詳細経緯: `docs/refactoring/template-editing-triage-plan.md`。

### - [x] S2: api/staff.ts のスタッフ改名同期で RPC 戻り値を無視している箇所の修正
`api/staff.ts:405-408` が `database.rpc('admin_update_reservation_fields', ...)` の error も `{success:false}` も判定せず破棄 → 完全サイレント失敗。
`api/reservations.ts:699-709` と同じ判定を入れ、失敗時は `console.error`（ベストエフォート同期なのでループは継続、レスポンスに warning を含められればなお良い）。

---

## 3. フェーズ1: 小粒バグ一掃（各1コミット）

### - [x] B2: キャンセル締切 0 時間が 24 に化ける falsy 罠
`src/pages/MyPage/hooks/useReservationDetailQuery.ts:49` — `cancellation_deadline_hours || 24` → `?? 24`。
DB で締切=0（直前までキャンセル可）の店舗があり、顧客のキャンセルを不当にブロック中。

### - [x] B3: 参加人数変更後にマイページ一覧が更新されない
同ファイル `useUpdateParticipantCountMutation` の onSuccess（:131-133）が詳細キーしか invalidate していない。
同ファイルの cancel 側（:97-102）と同じく `queryClient.invalidateQueries({ queryKey: ['mypage-data'], refetchType: 'all' })` を追加。

### - [x] B4: 予約詳細に謎の「0」が出る
`src/pages/MyPage/pages/ReservationDetailPage.tsx:347` — `{reservation.unit_price && (` → `{!!reservation.unit_price && (`。

### - [x] B5: スタッフ参加予約の「決済済み」を「スタッフ参加」表記に 🔍（仕様確定済み）
スタッフ参加予約は仕様上 ¥0＋`payment_status='paid'` で自動作成され、顧客マイページで「決済済み」と出る。
`reservation_source === 'staff_participation'` のとき、`ReservationDetailPage.tsx` の支払いバッジ（:217-219）と支払方法表示（貸切分岐 :344 / 通常分岐 :359）を「スタッフ参加」表記に差し替える。
※ `useReservationDetailQuery` の select に `reservation_source` が含まれているか確認し、無ければ追加。
🔍 マイページ→予約詳細（スタッフ参加予約 例: 260612-RARK 形式の予約番号）で「スタッフ参加」表示になること。

### - [x] B6: シナリオマスタ編集ギャラリーの D&D アップロード不動作 🔍
実機切り分け済み: **ドラッグ中のオーバーレイは出る**（dragover は届く）**が保存されない** → drop / dataTransfer 側の問題で確定。
- 場所: `src/components/modals/ScenarioMasterEditDialog.tsx:202-223`（handleDragOver/Drop）と
  `ScenarioMasterEditDialog/ScenarioMasterTabContent.tsx:179-183`（gallery タブの結線）。
- ボタン経由アップロードは同じ `handleFilesUpload`（:145）で動く＝アップロード処理自体は白。
- 調査手順: handleDrop 先頭にログ → ①handleDrop 自体が発火するか ②`e.dataTransfer.files.length` が 0 でないか ③ファイル種別フィルタで弾いていないか、の順に特定して修正。
🔍 シナリオ管理→シナリオマスタ編集→ギャラリータブで画像 D&D→アップロードされること（ボタン経由も退行なし）。

### - [x] B7: 公演モーダルの初期化完了前に保存できてしまうレースの恒久修正 🔍（根本原因特定済み 2026-07-02・mmq-impl 実装/Claude レビュー済み）
**症状**: 公演の新規作成モーダルを開いた直後に保存すると店舗ID空で保存が走る（現在は 3f3ce042 の対症ガードでトースト停止するが、レース自体は残存）。
**原因（確定・独立2調査が収束）**: `PerformanceModal.tsx` の `initForm` が async で、add モードは `await getEmptySlotMemo(...)`（:611、Supabase往復）の**後**に `setFormData({venue: initialData.venue, ...})`（:632-646）を呼ぶ。この往復中は formData.venue が初期値 `''` のままだが、保存ボタン（`performanceModal/sections/PerformanceFooter.tsx:48`）に初期化完了ガード・二重送信ガードが無い。
**修正仕様（見た目は不変・🔒制約と矛盾しない挙動修正）**:
1. `PerformanceModal.tsx` に `isFormInitializing` state を追加し、`initForm` の冒頭で true / 完了時に false（**try/finally** で確実に落とす）。
2. `handleSave` 実行中フラグ `isSaving` を追加（二重送信防止。handleSave 冒頭で立て、onSave 完了/失敗で落とす）。
3. `PerformanceFooter` に prop を1つ追加し、保存ボタンを `disabled={isFormInitializing || isSaving || 既存条件}` に（既存の disabled スタイルをそのまま使用。文言・レイアウト変更禁止）。
🔍 スケジュール管理→セルの＋→モーダルが開いた**瞬間**に保存を連打→保存されない（ボタン非活性）→ 一呼吸おいて保存→正常に1件だけ作成されること。

**経緯**: fix `974adc56`（useEventModalState に temp→実ID 同期 effect を追加、23行）は revert `d707e519`（2026-06-26）で削除されたまま再適用されていない。
- [x] `git show 974adc56` で当時の diff を確認し、現在の `src/hooks/eventOperations/useEventModalState.ts` に**逐語で**再適用（ファイル構成が変わっていれば等価に移植）。
- [x] 追加ガード（別コミット可）: `src/components/schedule/modal/reservationList/useReservationListData.ts:102` の通常公演分岐が temp-ID を素通しでサーバに送る。貸切分岐（:56-58）と同様に `event.id.startsWith('temp-')` は fetch をスキップ。
- temp-ID は `src/hooks/eventOperations/useEventSave.ts:284` で生成される楽観 ID。sync/timing 系なので**保守的に・挙動を変えない最小差分**で。
🔍 スケジュール管理→公演を新規作成→保存直後（採番前）にその公演を開いて予約者を編集→400/500 にならないこと。

---

## 5. フェーズD: デザインシステム統一（オーナー重点①・Claude 設計）

### 5.0 実測サマリ（なぜやるか）
- 本文サイズが text-xs 722回 vs text-sm 579回でページ毎に基準が逆転（貸切管理は xs:sm=90:35、予約確認は 36:16）。
- カード余白は CardContent 既定の上書き率 80%（94箇所中75・25通り）＋手書き箱が p-2/p-3/p-4/p-6 の4流派。
- 空状態6流派・ローディング3方式（自作スケルトン3種/スピナー81ファイル/「読み込み中…」62ファイル）・検索バー27箇所コピペ12変種・ステータスバッジ4実装・角丸3流派。
- 色は `text-gray-*` 1,516回 vs セマンティックトークン 1,578回のほぼ50:50。
- 一方で **PageHeader は管理画面41ファイルに普及済み＝統一の成功例**。`src/index.css:240-249` に ts-* タイポスケール、Settings に「bg-white rounded-xl border p-6」定型（50箇所）という「種」が既にある。
→ **新規約をゼロから作らず、この成功例を全ページに横展開する。**

> **🔒 保護対象（オーナー指定 2026-07-02）**: `src/components/schedule/PerformanceModal.tsx`（公演モーダル）と
> 公演カード（PerformanceCard / TimeSlotCell まわりの見た目）は作り込み済みの**基準デザイン。見た目の変更は一切禁止**。
> 逆に、モーダル統一（5.6 D-5）ではこの公演モーダルの構造・作法を「標準」として他のモーダルへ展開する。
> （※docs/REFACTORING_PLAN.md 5-4 の「挙動不変のコード分割」は別トラックであり、見た目に影響しないため矛盾しない）

### 5.1 デザイン規約（新規コード・移行済みページはこれに従う）

**管理画面:**
| 項目 | 規約 |
|---|---|
| ページ骨格 | `PageHeader`（既存）必須。ページ直下コンテナは `space-y-6` |
| 見出し | h1=PageHeader / セクション=`text-base font-semibold` / サブ=`text-sm font-medium text-muted-foreground` |
| 本文 / メタ | `text-sm` / `text-xs text-muted-foreground`。**`text-[10px]` 等の任意サイズは新規禁止**（例外: ScheduleManager の公演カード=情報密度優先で現状維持） |
| 箱 | セクション=`rounded-xl border bg-card p-6`・**影なし** / リスト行=`rounded-lg border p-3` |
| 角丸 | カード・セクション=`rounded-xl` / 行・コントロール=`rounded-lg` / バッジ=`rounded-md`。bare `rounded` 新規禁止 |
| 色 | セマンティックトークンのみ（`text-muted-foreground` / `bg-muted` / `border`）。`text-gray-*`・hex 直書き新規禁止。状態色は Badge variant 経由 |
| 間隔 | 行内 `gap-2` / カードグリッド `gap-4` / リスト `space-y-2` / セクション間 `space-y-6` |
| コントロール | 検索=`SearchInput`(h-9) / フィルタ=`FilterBar`(h-8 text-xs) / 行アクション=`Button variant="outline" size="sm"`＋アイコン＋文言（7a7ce5f5 で確立したスタイル） |

> **🚫 禁止パターン（オーナー指定 2026-07-02）**: カード左ボーダーのステータスアクセント（`border-l-4 border-l-{color}` 系）は
> 「AIっぽい」ため**全面禁止・新規使用不可**。状態表現はステータスバッジ＋薄い背景 tint（`bg-*-50/30` 程度）まで。
> 既存の使用箇所は各ページの改装バッチで除去する（⚠ 🔒公演カード内の使用だけは保護対象なので触らない）。

**顧客向け（MyPage / PublicBookingTop / ScenarioDetail / BookingConfirmation）:**
- スクエア（borderRadius:0）＋THEME 色は**意図的なブランドなので見た目は維持**。ただし inline style（150箇所）をやめ、顧客レイアウトのスコープで CSS 変数（`--radius: 0` 等）と Tailwind テーマに**トークン化**する。見た目を変える提案はオーナー承認後。
- 本文サイズは ts-*（`ts-body` = text-base md:text-sm）に統一（ScenarioDetailPage が既に採用済みの方式を他3ページへ）。

### 5.2 D-0: 共通部品の新規作成 — 🔵 **Claude 対応中（2026-07-02〜）: Codex は着手不要**
Claude が別ブランチ `claude/ui-parts`（worktree）で部品7点＋ComponentGallery 掲載＋COMPONENTS_GUIDE 追記＋CardTitle 既定サイズを実装中。
staging へのマージ後、D-5a（ConfirmDialog）等からこれらの部品を参照してよい。**Codex はこのセクションのコンポーネントを自作しないこと。**
- [~] `src/components/patterns/` に以下 7 点を作成し、`src/pages/dev/ComponentGallery.tsx` にカタログ掲載、`src/components/ui/COMPONENTS_GUIDE.md` に 5.1 の規約を追記する。（Claude 実施中）

1. **EmptyState** — `{ icon?, title, description?, action? }`。`py-12 text-center`、icon は `h-10 w-10 text-muted-foreground/50`、title は `text-sm font-medium`、description は `text-xs text-muted-foreground`。文言規約:「該当する◯◯がありません」。
2. **ListSkeleton / TableSkeleton** — `{ rows?: number, variant?: 'row'|'card'|'table' }`。`ui/skeleton.tsx` を組み合わせ、行高 h-14 の縦積み。既存3重複スケルトン（ReservationManagement.tsx:312-376 / CustomerManagement/index.tsx:86-109 / OrganizationScenarioList.tsx:605-634）の置き換え先。
3. **SearchInput** — 虫眼鏡絶対配置＋Input の定型（27箇所コピペ・12変種の統一）。規格: `h-9`, `pl-9`, `bg-white`, `max-w-md`（props で width 可変）。
4. **FilterBar / FilterSelect** — 常時表示 flex-wrap、`FilterSelect` は `h-8 text-xs`、右端に「リセット」ghost ボタン内蔵（値が既定と違う時のみ表示）。
5. **StatCard / StatGrid** — `{ label, value, icon?, tone? }`。`CardContent p-4`、ラベル `text-xs text-muted-foreground`、数値 `text-2xl font-bold` 左寄せ。StatGrid は `grid gap-4 grid-cols-2 md:grid-cols-4`。
6. **予約ステータス Badge の一元化** — `src/lib/constants/reservationStatus.ts` を作り、`status → { label, badgeVariant }` のマップを1箇所に。`ui/badge.tsx` の既存 variant（success/warning/gray 等）を使う。現在4実装（ReservationManagement.tsx:148-166 / PrivateBookingManagement/components/StatusBadge.tsx / ReservationRow.tsx:166,173 の手書き span / CustomerRow の Badge）を順次これに寄せる。
7. **ListRow** — 展開式リスト行の定型 `{ media?, title, subtitle?, meta?, badges?, trailing?, expanded?, onToggle? }`。`rounded-lg border p-3`、展開部は `bg-muted/20 p-4`。CustomerRow / EmailLogs 行 / ReportGroupCard / MyPage 予約カードの共通化先。

- [~] **CardTitle の既定サイズを定義**（🔵 Claude 対応中・claude/ui-parts に含む）: `src/components/ui/card.tsx:35` の CardTitle に `text-base font-semibold` を追加。既存の className 上書き15種は移行バッチで順次削除。🔍 全体スモーク（見出しサイズが変わるため、パイロット確認に含める）

- [x] **デザインガード CI**: `scripts/check-design-tokens.mjs` を新設。`text-gray-` / `text-[` / `style={{ borderRadius` / bare `rounded"` の出現数をベースライン JSON と比較し、**増えたら fail**（減るのは OK・ベースライン自動更新）。ci.yml に追加。

### 5.3 D-1/D-2: 管理ページのUI改装 — ❌ **Codex 対象外（Claude 担当・後日）**
オーナー判断（2026-07-02）: 管理ページの見た目の改装（特にサイドバーの「**貸切・予約**」「**売上・管理**」「**設定**」「**MMQ運営**」グループ配下のページ）は **Claude が後日実施**する。計画書: `docs/design/ADMIN_UI_REDESIGN_PLAN.md`。
**Codex はページ単位のUI再設計・レイアウト変更に着手しないこと**（他の管理ページ含む）。Codex のデザイン領域の担当は D-0（部品作成）/ D-3（顧客向けの見た目不変トークン化）/ D-5（モーダル・確認ダイアログ統一）のみ。
- D-5c の確認ダイアログ置換は上記ページ群のファイルにも触れるが、「素の confirm を標準 ConfirmDialog に差し替える」**局所変更のみ**（ページレイアウトには手を付けない）なので Codex が実施してよい。
- [x] `src/components/patterns/table/index.ts` から未使用の DataTable / MobileResponsiveTable の export を削除（参照ゼロ確認済み・機械的な死コード削除なので Codex 可）。正は TanStackDataTable に一本化。

### 5.5 D-3: 顧客向けのトークン化（見た目は変えない）🔍
- [x] MyPage 系の `style={{ borderRadius: 0 }}`（150箇所）と THEME 定数 inline color を、顧客レイアウトスコープの CSS 変数＋Tailwind テーマへ移す。**ピクセル単位で見た目不変**が検収条件（before/after スクショ比較）。
- [x] PublicBookingTop の ScenarioCard の hex 直書き（:197 `#DC2626` 等）→ トークン化。
- [x] 顧客4ページの本文サイズを ts-body 系へ統一（PublicBookingTop=xs主体 → ScenarioDetail=ts-body → BookingConfirmation=sm主体、と現在3段階に割れている）。

### 5.6 D-5: モーダル・確認ダイアログの統一 🔍（オーナー指摘・実測済み）

**実測（2026-07-02）**: DialogContent 86箇所で max-w が**12種類**・高さ制御**11パターン**。`ui/dialog.tsx` には size プロップ（sm/md/lg/xl、max-w-[95vw] フォールバック付き）が完備されているのに採用は 9/86。確認ウィンドウは**ブラウザ素の confirm/alert/prompt が34ファイル・47箇所**（confirm 42 / alert 3 / window.prompt 2）＋ ConfirmModal(4箇所) ＋ AlertDialog(3ファイル・角丸なし bg-black/80 で Dialog と見た目が別物) ＋ 都度実装 Dialog の**5方式混在**。直近コミット ce0af571 でも confirm() が新規追加されており、lint ガードが無い限り増え続ける。なおフッターの並び順（キャンセル左→保存右）と variant（キャンセル=outline / 保存=default）は既にほぼ統一されている＝直すのは方式の乱立の方。

**標準仕様（= 🔒公演モーダルの作法を全体へ展開する）:**

| 項目 | 規約 |
|---|---|
| サイズ | `ui/dialog` の **size プロップ（sm/md/lg/xl）に一本化**。max-w / px 直指定（425px 等）は新規禁止 |
| 大型編集モーダル | 公演モーダルの「固定高さ3層」構造: `flex flex-col p-0 gap-0`＋ヘッダー `border-b shrink-0`＋本文 `flex-1 min-h-0 overflow-y-auto`＋フッター `border-t shrink-0`（**本文だけ**スクロール） |
| フッター | [削除=outline+destructive色・`mr-auto` で最左] → [キャンセル=outline] → [実行=default]。左端スロットは「削除」専用。DialogFooter を使う |
| タイトル | `text-base`＋DialogDescription に1行説明。アイコンは任意（付けるなら h-4 w-4） |
| 軽量確認 | 新設 **ConfirmDialog**: 小型 Dialog `sm:max-w-sm`・タイトルは質問形「〜しますか？」・影響の説明 text-sm・[キャンセル=outline 左][実行=default または destructive 右]（手本: `performanceModal/dialogs/PerformanceConfirmDialogs.tsx`） |
| 破壊的＋可変長リスト | **2ステップ型**（手本: `src/components/schedule/DeleteEventCancelDialog.tsx`。冒頭コメントに設計原則明文化済み。赤ボタンは最終ステップに1個だけ・途中は「まだ実行されません」を明示） |
| 影響ゼロ・可逆な操作 | 確認なし |

タスク（上から順に）:
- [x] **D-5a: ConfirmDialog を新設**（patterns/modal/）。PerformanceConfirmDialogs の見た目を部品化し、既存 ConfirmModal の欠点（onConfirm 直後に無条件クローズ＝async の pending 表示・二度押し防止が不可）を解消: `onConfirm: () => void | Promise<void>` 対応・実行中はボタン disabled＋スピナー。ComponentGallery に掲載。既存 ConfirmModal 4箇所・AlertDialog 3ファイルをこれへ移行し、BaseModal / ConfirmModal / ui/alert-dialog は最終的に削除方向（patterns/modal/index.ts も整理）。
- [x] **D-5b: ESLint ガード**を先に入れる: `no-alert` ＋ `no-restricted-globals`（confirm / prompt / alert）を error で追加。既存47箇所は `// eslint-disable-next-line` で一旦許容し、置換のたびに disable を削除（=残数が lint で可視化される）。
- [~] **D-5c: native confirm/alert/prompt 47箇所の段階置換**（1画面系統=1コミット・各コミット🔍）。進捗: 1=✅(Codex 557dbd67) / 2 顧客向け=✅（D-5c-1 `3497c092` マイページ2箇所 + D-5c-2 貸切グループ系7箇所）/ 3 管理画面=D-5c-3 進行中（2026-07-02・実装=mmq-impl/レビュー=Fable）:
  - ✅ **D-5c-3a スケジュール管理系**: InputDialog 部品新設 `6538e207`（patterns/modal/・window.prompt 代替・async対応・IME変換中Enter無視・ComponentGallery 掲載）＋ ScheduleModals の臨時会場 confirm×2 / prompt×2 と ScheduleManager/index の修復系 confirm×2 を置換 `5e6a6f1c` **✅スモークOK（2026-07-03。D-5c-1/2 も同時にOK）**。**:299 期間一括満席化は D-5d で 2ステップ化するため据え置き**。
  - ✅ **D-5c-3b 設定・売上レポート系（10箇所）**: 設定系4箇所（カテゴリ・作者/予約時注意事項/ブログ/組織設定の招待取り消し）`f6778531` ＋ 売上レポート系6箇所（制作費/雑収支/外部売上/レポート一括送信/外部公演報告/レンタル報告）`caf2bbf8`。SendReports・報告フォーム2種はハンドラ分割方式。**✅スモークOK（2026-07-03 オーナー全項目確認）**。旧 stash「WIP バッチB書きかけ」は drop 済み。※ProductionCostDialog は外側 Dialog 内に ConfirmDialog を重ねる入れ子構成（公演モーダルの子確認 Dialog と同型・スモークで開閉確認）
  - ✅ **D-5c-3c 顧客・貸切・スタッフ・シナリオ編集系（13箇所）**: 顧客管理2箇所 `f264aa62` / 貸切5箇所（hook 方式含む）`e4e8236f` / スタッフ系3箇所（hook 方式含む）`a493f7d7` / シナリオ編集3箇所＋却下理由 prompt×2→InputDialog(multiline・required) `2da2c286`。GameInfoSectionV2 のカテゴリ削除は grep 追加発見分として含む。**✅スモークOK（2026-07-03。シナリオ削除の説明文を「組織の一覧から削除・マスターは残る」に補強 `4f67dd68` 系）**。メモ: useBookingApproval の handleDelete（申込完全削除）は**呼び出し元 UI が無い既存デッドコード**（ダイアログ配線済み・ボタン復活時にそのまま使える）。
  - ⚠ **保留（単純置換不可）**: eventSyncHelpers.ts:17（貸切予約変更のメール送信確認）は sync boolean 返却ヘルパーで、呼び出し元（公演保存フロー）の async 化が必要 → 別途設計（🔒公演モーダルの挙動に絡むため慎重に）。
  - メモ: ScheduleManager/index.tsx の `handleFixAllData`（全期間データ修復）は**呼び出し元なしの既存デッドコード**（confirm 置換済みだが到達不能。掃除はフェーズM）。
- ✅ **D-5d: 2ステップ原則違反の是正** — **✅完了・スモークOK（2026-07-03）**: 満席化2ステップ `178b8038`（＋オーナーFBでプレビューをカテゴリ別内訳化） / 店舗削除の紐づきチェック `c774b6cd` / グループ削除2ステップ `760cfc85` / アカウント削除文言 `f1b63348`。仕様からの逸脱1点: グループ削除の影響サマリーは**メンバー数/候補日数の2種のみ**（メッセージ件数はロード済み state に無く追加 fetch 禁止を優先。最終確認の文言でメッセージも消える旨は明示）。当時の確定仕様（履歴用）:
  1. **期間一括満席化（FillSeatsModal＋ScheduleManager/index.tsx:298 handleFillAllSeats）**: FillSeatsModal に step（'input'|'preview'）を追加。input=現行フォームのまま・フッター[キャンセル][対象を確認(default)]。「対象を確認」で対象公演数を count（handleFillAllSeats 冒頭の schedule_events_staff_view SELECT と同条件の count 専用クエリ。orgId 必須）→ preview へ。preview=「{開始}〜{終了} の {カテゴリ名} で中止以外の公演 **N 件**を満席（参加者数=定員）にします」＋フッター上に「まだ実行されません」灰色テキスト・[戻る(outline)][満席にする(destructive)]。N=0 は実行不可＋「対象の公演がありません」。:301-302 の素 confirm と eslint-disable を除去。実行本体（実行時の再fetch含む）は不変。
  2. **店舗削除（StoreEditModal:747→790 ConfirmDialog）**: 「この店舗を削除」押下時に当該店舗の schedule_events / reservations / performance_kits を count fetch（client の count:'exact', head:true。公演は schedule_events_staff_view 経由＝**中止・過去も含め全行を数える**（FK は行で数えるため）。reservations/performance_kits は管理画面の既存読み取り経路を踏襲）。いずれか>0 → 削除不可の説明「公演 N 件・予約 N 件・キット N 件が紐づいているため削除できません。先にこれらを整理してください」＋[閉じる]のみ（実行ボタン無し。現状は DB の RESTRICT で 500 になるだけ＝誤誘導の解消）。全て 0 → 現行 ConfirmDialog(destructive) のまま説明に「営業時間・料金などの店舗設定も一緒に削除されます」を追記（可変長リスト無しのため 2 ステップにはしない）。count 失敗時は安全側（削除実行不可＋エラー表示）。
  3. **貸切グループ削除（GroupChatSheets:1114 ConfirmDialog）**: 2ステップ化（手本=DeleteEventCancelDialog の step 方式）。step1=影響サマリー「メンバー N 人／候補日 N 件／メッセージ N 件」（すべてロード済み state から・追加 fetch 不要）＋「まだ削除は実行されません」・[キャンセル][次へ(default・赤くしない)]。step2=「この操作は取り消せません。」・[戻る(outline)][削除する(destructive)]。削除可能条件（gathering/cancelled のみ・:587-616 のガード）は不変。RPC delete_private_group は上記下調べどおり取りこぼしなし。
  4. **アカウント削除（MyPage SettingsPage:395-447）**: 既に「メール一致入力→ConfirmDialog→実行時 blocking check」の実質2ステップ＋不可逆ガード構成。ConfirmDialog の説明文に「予約履歴・クーポン・体験済み記録を含む全データが完全に削除され、復元できません」を明記するのみ（追加 fetch なし・挙動不変）。
  **下調べ済み（2026-07-02 scout 実測。再調査不要）:**
  - 手本 `src/components/schedule/DeleteEventCancelDialog.tsx`: `step` state で画面切替 / 赤 destructive ボタンは最終ステップに1個だけ / 途中ステップのフッター上に「まだ実行されません」灰色テキスト / 影響リストは ul＋件数バッジ。
  - アカウント削除（SettingsPage:395-447）: 既にメール一致入力（:905）→ ConfirmDialog（:927）の実質2ステップ。実体は Edge Function `delete-my-account`（userApi.ts:101-117、auth.users 削除→public.users CASCADE）。未来公演予約の検出 `checkBlockingPerformanceReservations`（:91-106）実装済み → 残タスクは影響サマリー（予約件数等）の表示のみで薄い。
  - 貸切グループ削除（GroupChatSheets:1111 → PrivateGroupInvite/index.tsx:725 の RPC `delete_private_group`）: date_responses→candidate_dates→messages→members→groups を順次 DELETE（migration 20260507010000）。ダイアログ時点で `group.members.length` / `group.candidate_dates.length` 等ロード済み＝**件数表示は追加 fetch 不要**。✅ 確認済み（2026-07-03 scout）: `private_group_booking_requests` というテーブルは**実在しない**。RPC（20260507010000 が唯一の定義・再定義なし）は date_responses→candidate_dates→messages→members→groups を明示 DELETE、依存テーブルは全て ON DELETE CASCADE ＝取りこぼし懸念なし。
  - 店舗削除（StoreEditModal:790-800 → storeApi.delete → /api/stores DELETE）: 影響件数（その店舗の schedule_events / reservations 数）は**画面に無い＝open 時に count fetch の追加が必要**。✅ FK 確認済み（2026-07-03 scout）: api/stores.ts:235-239 は事前チェック無しの直接 DELETE（requireAdmin）。`schedule_events` / `reservations` / `performance_kits` の store_id が **ON DELETE RESTRICT** → 紐づく行が残る店舗は DB エラー→API 500 で失敗（現状エラーメッセージも不親切）。設定系5テーブル・store_travel_times・store_scenario_license_contracts・audit_log は CASCADE。→ 仕様は「count 表示＋RESTRICT で消せないケースは削除ボタン無効化 or 事前説明」が必要。
  - 期間一括満席化（FillSeatsModal＋handleFillAllSeats）: モーダルは1ステップ構造（開始/終了日＋カテゴリ→実行）。**FillSeatsModal に step state を足し、ステップ2で対象件数プレビュー（handleFillAllSeats 冒頭の schedule_events_staff_view SELECT を先読みに流用）が自然**。:299 の素 confirm はこのとき除去。
- [x] **D-5e: alert() のエラー通知3箇所** → `showToast.error` に置換済み（CouponsPage / useBookingApproval / StoreEditModal。文言不変・disable コメント削除）。
- [ ] **D-5f（低優先）**: 影響ゼロ・可逆操作の confirm 除去（BasicInfoSectionV2.tsx:135 キービジュアル削除=フォーム state を消すだけ / CharactersSectionV2.tsx:97 キャラクター行削除）。
- [ ] **D-5g（新規モーダルのみ・既存は触らない）**: サイズ指定を size プロップへ寄せる規約の運用開始。既存86箇所の一括変換は**やらない**（見た目が変わるため、D-2 の各ページ改装バッチ内で個別に）。
- ❌ **やらないこと**: 未保存警告（ダーティチェック）の追加。全モーダル未実装だが挙動追加になるためオーナーが明示的に依頼するまで着手しない。🔒公演モーダルには一切触らない。
🔍 置換した画面ごとに「どの操作でどの確認ダイアログが出るか」を報告して実機確認（キャンセル/実行の挙動が変わっていないこと）。

---

## 6. フェーズP: 性能改善（オーナー重点②）

### - [x] P1: 顧客管理ページのデータ層改修 → **対応済み `3b1f1a10`・✅スモークOK（2026-07-03 オーナー確認）**
RPC は staging 適用済み（権限=service_role のみ・**集計値の手計算突合 0 差分・total_count 一致を staging 実測で確認済み**）。
アカウント管理内の顧客タブ（CustomerManagementContent）も共有 hook のため同時にページング化。
**⚠ prod 反映時は DB→フロントの順**（/deploy が保証。RPC 未適用のまま先にフロントが出ると顧客管理が 500）。
発見した既存負債（未対応・報告のみ）: ① `npm run db:status` は CLI が JSON 出力のとき awk が空振りして常に「✅全適用済み」と誤報告 ② pre-commit の check:multi-tenant は HEAD でも exit 1（フロント直読み 239 件・S4 と同根）③ supabase/schemas/customers.sql の organization_id NOT NULL が実DBと乖離（20260519000000 で DROP 済み）。
現状: `useCustomerData.ts`（実体は src/pages/CustomerManagement/hooks/）が全顧客(1000件ずつ直列)→全予約(100件チャンク直列二重ループ)→全クーポン(同)をDLしてクライアント集計。顧客5,000人なら**約105回の直列クエリ**。さらに全件を仮想化なしで map 描画。
**仕様確定（2026-07-03 Fable・scout 実測に基づく。DB→フロントの順で実装）:**
1. **新 RPC `get_org_customers_with_stats(p_org_id, p_search, p_limit, p_offset)`**（migration 新規）:
   - 母集団 = `customers WHERE organization_id = p_org_id`（現行画面は RLS 直読みで platform 顧客(org NULL)は**元々見えていない**＝母集団を変えない。予約経由で拾う既存 `get_org_customers` の拡張はしない）。検索は name/email/phone の ILIKE 部分一致（現行クライアント filter と同一フィールド・`%_\` はエスケープ）。ソートは created_at DESC 固定（現行と同一・UIにソータ無し）。`count(*) OVER ()` で total_count。
   - 集計は**ページ内の顧客だけに対して** LEFT JOIN 集計（全顧客集計をしない）。定義は現行 useCustomerData:49-116 の逐語移植:
     reservation_count=count(status IN confirmed/gm_confirmed/completed かつ org一致) / total_paid=sum(total_price) 同条件 / last_visit=max(requested_datetime) 同条件 / visit_count=count(status='completed') /
     クーポン3値=customer_coupons×coupon_campaigns.max_uses_per_customer（**status フィルタ無し・org フィルタ無し**＝現行どおり。campaign 欠損は 0 扱い）。
   - SECURITY DEFINER + `SET search_path = public`。**REVOKE ALL FROM PUBLIC/anon/authenticated・GRANT EXECUTE TO service_role のみ**（API 経由専用。関数のデフォルト PUBLIC EXECUTE を必ず剥がす）。
2. **API**: `api/customers.ts` の routeGet に `action=listWithStats`（search/page/pageSize、pageSize は 10..100 に clamp・既定50）を追加。orgId は既存どおり requireStaff から導出（クライアントの org 指定は受けない）。戻り値 `{ customers: [...], totalCount }`。
3. **フロント**: useCustomerData を API 呼び出し＋サーバページング(50件/頁)・サーバ検索(debounce 300ms)に書き換え（先例: EmailLogsSettings のページャ＋useReservationData:93-104）。**CustomerRow の props と couponStats マップの形は変えない**（hook 内で RPC の集計フィールドから合成）。行展開時の個別 fetch は現状のまま。UI は現状レイアウト踏襲＋ページャ追加のみ。
4. **検収**: staging db:push 後、RPC の集計値と現行クライアント集計が同一顧客で一致すること（SQL で数件突合）。🔍 初期表示が速い/検索/ページング/行展開/集計値一致。
   ※現行との既知の差分1点（許容）: RLS の `user_id = auth.uid()` 分（スタッフ自身の customer レコードが org 外にある場合のみ一覧から消える。実運用では org 内レコードのため影響なし）。
🔍 顧客管理ページ: 初期表示が速い/検索/ページング/行展開（メモ・クーポン・体験済み操作）/集計値が改修前と一致。

### - [x] P2: 予約統計の 1000 行キャップ（正確性バグの疑い）→ 対応済み `b4bc07ae`
`src/hooks/useReservationStats.ts` の件数6項目を count クエリ並列化。**残課題**: monthlyRevenue（金額合計）のみ当月スコープの実データ集計（当月1000件超で再発しうる）→ 恒久対応は SUM の集計 RPC（DB変更を伴うため別タスク・低優先）。

### - [x] P3: 売上・年間分析のサーバ集計化 → 対応済み `843bc3fb` **✅スモークOK（2026-07-03 オーナー実機・数値一致）**
`api/sales?type=annual-analysis` にサーバ集計を追加し、フックは API 呼び出しのみに。集計ロジックは逐語移植（数値不変）。
🔍 売上管理→年間分析タブ: 数値が改修前と一致すること・表示が速くなったこと。

### - [x] P5: AdminDashboard チャンクのハブ化解消 → **対応済み `e9dd0b08`・✅スモークOK（2026-07-03 白画面なし・体感悪化なし）**
**結果実測**: AdminDashboard 参照 83→**30** / BlogDetailPage・ReservationDetailPage 等の顧客チャンク=**clean** / AdminDashboard チャンク 128.5kB→**52.3kB(-59%)** / vendor-react 空チャンク(33B)→実体化(143kB)。
**採用判断のトレードオフ**: modulepreload 込み初期先読みは 261.6→294.3kB gzip（+12.5%）。ただし増分の中身は共有レイアウト＋date-fns（顧客も直後に使う）で、従来顧客ページが遅延 DL していた管理チャンク 128.5kB raw が消えるため**ページ到達までの総転送は同等〜改善**＋vendor/layout チャンクの長期キャッシュ化。変則2案（date-fns 除外/対象絞り）は実測で不採用（先読み改善せず or 参照数悪化）。
**任意の後続 P5b**: date-fns 全量が先読み対象になる残課題は NotificationDropdown の formatDistanceToNow 遅延化（ソース変更）で先読みから外せる見込み。低優先。
**確定した根本原因**: AdminDashboard.tsx を import するファイルは**ゼロ**（export はコンポーネント1個）。83チャンク参照の正体は、Rollup が共有レイアウト（Header→NotificationDropdown→date-fns 21箇所）を AdminDashboard のチャンクに同居させたこと。object 形式 manualChunks の副作用で vendor-react も 33バイト空チャンク（実体は vendor-ui 側に吸収）。
**実装方針（vite.config.ts:44-54 のみ変更・ソース import 構造は触らない）**:
1. manualChunks を **function 形式**に書き換え: node_modules を正規表現で振り分け（react/react-dom/scheduler→vendor-react、date-fns→vendor-datefns、lucide-react+@radix-ui→vendor-ui、@supabase→vendor-supabase、@tanstack/react-table→vendor-table、chart.js系→vendor-chart。その他 node_modules は自動分割に任せる）。
2. それで AdminDashboard 参照が残る場合のみ、共有レイアウトの明示チャンク（Header/NotificationDropdown/AppLayout/PublicLayout の4ファイル程度を 'shared-layout' に。**AdminSidebar は含めない**＝顧客に管理ナビを配らない）を追加して再計測。
**検収（ビルド出力で客観判定）**: ① `grep -l "AdminDashboard-" dist/assets/*.js | wc -l` が 83→ひと桁（特に PublicLayout/BlogDetailPage/ReservationDetailPage 等の顧客系チャンクから消える） ② vendor-react が実体を持つ ③ 初期ロード（index-*.js+css）gzip 合計が悪化しない（before 実測: js 90.2kB + css 20.4kB gzip） ④ build/test green。
**⚠ 実機スモーク必須**: チャンク分割変更は module 初期化順が変わり TDZ/循環 import エラーが出ることがある → staging で顧客ページ（公演一覧・予約詳細・ブログ）と管理ページ（スケジュール・顧客管理）を開いて白画面が無いこと。
実測: `AdminDashboard-*.js`（125.5kB）を **82 チャンクが静的 import**。PublicLayout / ReservationDetailPage（顧客ページ）まで依存し、date-fns ごと全ページに配られている。ルート lazy 化自体は良好（eager ページ import 0）なので、原因は共有ユーティリティが AdminDashboard チャンクに同居していること。
1. `vite.config.ts:44-54` の manualChunks を修正（`vendor-react` 指定が機能せず **33バイトの空チャンク**になっている点も直す）。date-fns / 共有 utils を独立チャンクへ。
2. ビルド後 `dist/assets` で `grep -l "AdminDashboard-" *.js` が顧客系チャンク（PublicLayout 等）から消えることを検収。before/after の初期ロード gzip 合計を報告（現状 約235kB gzip + CSS 126kB）。

### - [ ] P6: 画像最適化の復活 🔍（顧客ページの体感に直結）
`src/utils/imageUtils.ts:40-46` の `getOptimizedImageUrl` が **no-op**（過去 d73de23d で実装→b8d420d0「画像が読み込めなくなる」で撤去）。現在キービジュアル等は**アップロード原寸**を常時配信、srcSet 20行も実質無効。
1. まず Supabase Storage の画像変換（`/storage/v1/render/image/public/...?width=&quality=`）が**現プランで有効か URL 1本を curl で確認**（b8d420d0 の退行原因の切り分け）。
2. 有効なら: storage URL のみ変換対象＋`onError` で原寸フォールバック付きで再実装。`ui/optimized-image.tsx` と ScenarioCard から適用。無効なら: アップロード時サムネイル生成が必要になるため**設計をオーナーに相談**（勝手に進めない）。
🔍 予約トップ・シナリオ詳細で画像が全て表示される＋ DevTools Network で転送サイズ縮小を確認。

### - [x] P7: リスト全行再レンダーの解消 — バッチ1（スケジュール画面）**完了 `29a700a8`・✅本番スモークOK（2026-07-03）**。バッチ2（顧客管理行・予約者タブ）は低優先で残。仕様（当時）:
**実測**: 月表示は約450セル・公演カード約675枚。PerformanceCard(:395)/TimeSlotCell(:260) は **React.memo 済みだが**、ScheduleTable(:273-339) が毎レンダ新規のハンドラ参照（カード6個/セル9個）＋ categoryConfig 新規オブジェクトを渡して memo を全滅させている。
**方針（バッチ1）**: **カスタム memo 比較関数は使わない**（ハンドラを比較除外すると event 更新漏れバグの温床）。渡す側の安定化のみ:
1. ScheduleTable が子に渡すハンドラ群を useCallback、categoryConfig 等のオブジェクト props を useMemo 化（exhaustive-deps を disable せず正しい deps で）。
2. 必要なら useEventOperations 側の未 useCallback ハンドラも安定化（サブフック側は一部対応済み）。
**やらないこと**: CustomerRow（P1 の50件/頁化で優先度低下・後続候補）/ ReservationRow・予約者タブ（リファクタ本線 Phase 5-4 の対象範囲＝そちらで実施）/ カスタム比較関数 / 🔒公演カード・PerformanceModal の見た目変更。**触るのは ScheduleTable.tsx / useEventOperations.ts（＋サブフック）のみ**＝進行中の 5-4（PerformanceModal）とファイル非重複。
**検収**: tsc/lint（新規 disable なし）/test green ＋ 🔍実機でスケジュール画面の全操作（追加・編集・削除・中止・復活・D&D移動/コピー・仮公演・予約トグル・満席化）が従来どおり。

### - [x] P8: jszip を dynamic import に → 対応済み `34146535`
`exportSchedule.ts` を `await import('jszip')` 方式に。jszip 約97kB が独立チャンク化（ビルドで確認済み）。

### - [ ] P4: invalidate ヘルパーの導入
invalidateQueries 60箇所中 `refetchType:'all'` は1箇所のみ（既定 refetchOnMount:false のため非アクティブ画面に伝播しない）。`src/lib/queryInvalidation.ts` に `invalidateEverywhere(queryClient, keys)` ヘルパーを作り、**まず新規コードから**使用。既存60箇所の一括置換は挙動変更を伴うためやらない（個別バグ対応時に置換）。

---

## 7. フェーズM: メンテ・掃除台帳（優先度低・随時）

| # | 内容 | 備考 |
|---|---|---|
| M1 | ✅ 対応済み（2026-07-02）: REFACTORING_PLAN のスモーク済み4項目クローズ＋旧チェックリスト4本を docs/archive/ へ git mv | — |
| M2 | console.log 61件 → `src/utils/logger.ts` 経由に、vite の esbuild `drop: ['console']` 追加 | hotspot: useKitManagementHandlers(14) / GroupChat(12) |
| M3 | ESLint 8(EOL)→9、`react-hooks/rules-of-hooks` warn→error、`--max-warnings` 縮小 | rules-of-hooks 違反は実行時クラッシュ級 |
| M4 | Edge Functions 掃除: 残骸4関数（discord-simple / notify-shift-request-discord-simple / sync-shifts-to-google-sheet-test / test-resend-webhook）削除＋本番から undeploy、corsHeaders 41重複→ `_shared/` 集約 | deploy-supabase.yml が全関数一括デプロイする点に注意 |
| M5 | org_scope API 化の残4箇所: scenarioMasterApi.ts:317,341 / scenarioApi.ts:96 / storeApi.ts:82 | prod RLS で境界は保たれており緊急ではない |
| M6 | CI grep ガード: `.eq('organization_id')` の新規増加を fail に（check-multi-tenant.sh は pre-commit のみで CI 未実行） | |
| M7 | 60分インターバルのハードコード: computePrivateBookingSlots.ts:118,154,380 / privateBookingStoreSlotFeasibility.ts:84 → `PRIVATE_BOOKING_EVENT_INTERVAL_MINUTES`（privateBookingScenarioTime.ts:63）に寄せる | UI 文言3箇所も連動 |
| M8 | supabase/migrations のタイムスタンプ無し野良SQL 22件（debug_*.sql 等）を migrations 外へ隔離 | 適用順の不透明性解消 |
| M9 | api/scenarios.ts の到達不能ハンドラ（type=paginated / all-stats）削除＋最終 knip | REFACTORING_PLAN Phase 7-2 と同時 |
| M10 | useCustomHolidays に realtime 購読なし（schedule_blocked_slots と同型） | 低優先・docs/HANDOFF.md:18 |
| M11 | 依存メジャー更新: vite 5→8 → tailwind 3→4 → react 18→19 の順 | リファクタ完了後に別トラックで |
| M12 | （オーナー作業）Supabase key rotation / 本番 SMTP の Resend 化 / 重複マスタ「白いうさぎ/白いウサギ」統合 | Codex 対象外 |

## 7.5 GitHub issue 棚卸し（2026-07-03・open 21件を全クローズ。生きているものはここに移管）

**対応済みでクローズ**: #264（メールログ本文表示=実装済）/ #266（キャンセル・却下理由の全文編集=実装済）/ #269（顧客メモ＋予約者タブ顧客台帳=実装済）/ #271（グループ 5TPW5DFQ 削除実行。紐づき予約1件はリンク解除で残存）/ #273（なめこ様の白ウサギ未体験 override 登録・重複マスタ2件とも）/ #201（後継=org_scope ロードマップ＋M5/M6 に分割済み）/ #268（内容特定不能・具体化されたら再依頼）

**バグとして継続（→ あとで対応バグ台帳 #9/#10）**: #272（シナリオ別タブのキット数が更新で消える）/ #263＋#94（貸切カレンダーの空き表示不具合・実例 2026-08-09 大塚店）

**機能要望として継続（M 追加行）**:
| # | 内容 | 元issue | 備考 |
|---|---|---|---|
| M13 | マイページのアイコン上限 2MB 緩和 or クライアント側圧縮 | #270 | P6（画像最適化）と同時にやると一石二鳥 |
| M14 | text-only メールの HTML 化＋開封トラッキング | #265 | email_logs に opened_at 列は既にある |
| M15 | キット移動日の曜日指定（現状 週2固定） | #87 | |
| M16 | 組織登録フォームの slug 重複リアルタイムチェック | #132 | RPC案が issue 本文にあり |
| M17 | customer プロフィール強制ガードの AppRoutes 直書き解消 | #199 | Phase7（ルート宣言化）と同時 |
| M18 | authenticated のカラムレベル権限分離（S1 の続き・大掛かり） | #57 | 要設計・低優先 |

**セキュリティ・設計として継続（S 追加行・優先度高め）**:
| # | 内容 | 元issue |
|---|---|---|
| S6 | handleGetById/handleGetBySlug の他組織シナリオ機密漏洩の可能性を検証・修正 | #192（高） |
| S7 | 他組織マスタの master_status 昇格可能＋org_status 変更での自動昇格副作用の撤廃 | #194 / #197 |
| S8 | isAdmin が license_admin を内包し組織スコープが曖昧な件の整理 | #198 |

**デザインとして継続**: #274（グループチャットに「店舗は原則内容を確認しない」旨を明示）→ DESIGN_ISSUES.md **DI-36**

**リファクタ本線**（docs/REFACTORING_PLAN.md: GroupChatSheets/GroupInviteView サブ分割 → 親フック化 → 5-4 PerformanceModal）は別トラック。担当をオーナーが決めるまで**このリストからは着手しない**。着手する場合は byte 逐語・1スライス毎実機の規律（同文書冒頭）を厳守。

---

## 8. 検収基準（全タスク共通）

1. `npx tsc --noEmit` / `npm run lint` / `npm run build:fast` / `npm run test:unit` すべて green。
2. コミットメッセージは既存の慣習（`fix(mypage): …` / `refactor(schedule): …` 形式・日本語）に合わせる。
3. 🔍 タスクは push 後に確認手順を報告して停止。オーナー OK 後に次へ。
4. DB タスクは SQL 提示→承認→staging 適用→確認クエリ報告→prod はオーナー判断。
5. この文書のチェックボックス更新を忘れない（進捗の唯一の記録）。

---

## 9. YOYAQ 自動配送記録

### - [x] YOYAQ-002: 管理設定から顧客向けキャンセルポリシー表示を動的統一 🔍

管理画面の店舗別キャンセル設定を、公開ポリシー・FAQ案内・通常/貸切予約画面・管理プレビューの共通表示へ接続。公開取得はactiveかつ公開承認済み組織/active店舗だけを返す最小列のSECURITY DEFINER RPCとし、`reservation_settings`へのanon SELECTは追加しない。複数店舗時は任意の先頭店舗を採用せず店舗別表示、予約画面は通常予約の選択店舗または貸切の単一選択店舗を明示する。2026-07-19にdesktop/mobileのPREVIEWをPO確認済み。worker REPORT後の独立検収とstaging直列統合、migration適用は未実施で、適用時はDB→frontendの順を厳守する。

### - [ ] QW-20260907-005: 公演ごとの追加募集期限

管理者API・service role専用RPC・期限を守る判定処理・隔離DBテストを実装。詳細は `docs/RECRUITMENT_DEADLINES.md`。実環境の定義照合とDB適用、開始時メール・無料辞退・AI条件設定の接続は未完了。本番稼働済みと扱わない。


## QW-20260907-005: あと1人の追加募集を開始90分前まで延長（2026-09-07）

- [x] 4時間前の最低開催人数まであと1人なら、予約増加履歴に関係なく90分前まで延長。対象組織のみ設定で有効化。
- [x] 開始通知・最終開催/中止・無料辞退の確認をDB outboxに確保し、リースと送信冪等性キーで再試行。
- [x] メール専用ページから、開催判断待ちの間だけ無料辞退。閲覧では変更せず、確認後に予約全員分を処理。
- [x] 予約DBトリガーでも90分期限を検証。発端のキャンセル者・後から予約した顧客は無料辞退の対象外。
- 検証: 隔離PostgreSQLの既存期限テスト・新規あと1人テスト、unit 261件、verify（型・lint・build・security）、公開ページを含むE2E 8件を実施。CIの画面起動用非機密設定も補完。
- 配備: migration `20260907100000_one_seat_extension` をDB先行。stagingでは実顧客への二重通知を避け自動実行を無効のまま検証し、本番のWeb/Edge配備後にQueens Waltzだけ有効化する。


## QW-20260907-005: あと2人も開始90分前まで延長（2026-09-07）

- [x] あと1人/2人の上限を組織設定で指定し、3人以上へ無承認で拡張しない。
- [x] 通知文面に延長開始時点の不足人数を反映。既存キューはあと1人として互換維持。
- [x] あと1人への減少や無料辞退による不足増加で、案内済み期限を変更しない。
- 検証: 現行本番RPC本文との一致確認、既存SQL回帰・新規あと2人SQL、通知文面テスト、verify。
- 配備順: migration `20260907110000_two_seat_extension`（上限1を維持）→ Edge → 本番上限2。stagingでは実顧客への自動送信を有効化しない。復旧SQLは `docs/RECRUITMENT_DEADLINES.md`。


## QW-20260907-005: 再確定後の再欠員（2026-09-07）

あと1〜2人の再欠員は案内済みの期限で再募集する。90分期限到達後は延長せず中止。周回ごとに通知と辞退リンクを分離し、古い未送信通知・旧リンクを復活させない。DB migration `20260907120000_reopen_recruitment` を両環境へ先行適用し、対象Edgeだけを配備する。Web変更なし。

検証: 隔離DBで初回/再確定/再欠員/再確定/期限到達中止、二重通知、旧リンク拒否、現周回の無料辞退、3人不足へ未承認拡張しないことを確認。既存あと1人/2人の回帰も確認。

復旧時は新しい周回列・通知履歴を削除しない。判定RPCの「再確定後の再欠員」ブロックだけを除いた定義へ戻し、新規周回を止める（進行中の期限判断と通知の周回保護は維持）。予約受付の確定後期限、削除FK、運営向け通知/履歴は別の残件。


## QW-20260907-005: 開催判断と予約受付締切を分離（2026-09-08）

開催決定は最低開催人数への到達であり、満席とは限らない。追加募集の開催判断期限（90分前）と、開催決定後の空席の予約受付締切を分離する。シナリオ設定を標準とし、シナリオ未設定時だけ従来の締切を保持する。公演別 `booking_cutoff_minutes` 指定はそれらを上書きする。NULLは標準継承、0は開始まで、1〜1440は開始前の分数。既存値を一括書換しない。

シナリオ編集「基本情報」に予約受付締切を追加。公演詳細「募集・締切」で両期限・判断状態・標準値・公演別設定を表示。管理者のみ独立保存でき、組織境界とupdated_at競合を検査する。開催判断期限はこの保存で変えない。顧客の予約確認画面にも現在の受付締切を表示する。DBと予約送信前チェックは共通の締切RPCを使い、activeの追加募集だけ案内済み期限を優先、開催決定後は通常受付へ戻る。

検証: 対象SQLと既存追加募集回帰、API9件（権限/組織/競合/入力）、画面の指定保存と標準復帰・390px横溢れなし、型/lint/build。migration `20260908010000_booking_cutoff` はDB先行。対象はDBとWeb、Edge変更なし。

復旧は旧予約トリガー定義とWebコードへ戻す。追加列は値と履歴を保持して残す。公開RPCは顧客/社内理由を返さない。


2026-09-08追加決定: 最低開催人数まであと3人以上の場合は通常の4時間前判断とし、特別な延長設定を追加しない。自動で90分前まで延長する対象はあと1〜2人のみ。

設定元の修正: シナリオ別 `organization_scenarios.booking_cutoff_minutes` → 公演別上書きの順に優先。シナリオ未設定時だけ従来値を維持。migration `20260908020000_scenario_booking_cutoff` を続けて適用する。API11件・シナリオ継承SQL・画面のシナリオ保存を追加検証。


## QW-20260907-005: 追加募集メールの失敗・復旧・運営引継ぎ（2026-09-08）

初回送信失敗を既存開催/中止通知と同じDiscordへ通知する。自動再送は継続し、成功時も知らせる。再送上限・再送不能時は運営担当へ電話やDM等での連絡を依頼する。送信成否であり、顧客の受信・既読を保証しない。

既存Discordキューへ通知ID・段階別に永続登録し、新通知種別だけ送信権を取得する。直後に既存workerを対象種別に絞って呼ぶ。最終試行やDiscord通信断を回収する。顧客メールは本文に入れず内部予約参照を使う。

検証: 隔離DBの初回・繰返し・復旧・最終試行通信断・運営依頼・個人情報非掲載・通知先・Discord回収、対象Edge構文。migration `20260908030000_recruitment_mail_alerts` をDB先行、対象2関数だけ配備。両環境とも従来からverify_jwt=falseで、関数内のサービス認証は変更しない。復旧はqueue_recruitment_mail_alertトリガーを外し旧Edgeへ戻す。追加列・履歴は保持する。

## QW-20260907-005 予約締切UIの調整（2026-09-08）

- [x] シナリオの予約受付締切を基本情報からゲーム設定へ移動。既存カード、ラベル、入力欄、補足文のスタイルを再利用し、公演詳細の募集・締切も統一。
- 検証: npm run verify、保存・標準復帰のPlaywrightテスト、390px表示確認。

### - [x] QW-20260908-007: 補償クーポンの6暦月期限と公演制限

GM都合中止の固定額クーポンで、付与からの月数とマダミス公演限定を設定できる。月数はDB付与トリガーで日本時間の暦月として計算（月末は翌月末へ丸める）。通常公演・貸切かつ作品登録済みを対象に、利用記録のDBトリガーでも判定する。顧客の公演選択と付与メールに条件を反映。既存の付与済み期限は変更しない。

検証: npm run verify、既存ユニット296件、ステージングのロールバック付きSQL（末日・閏年・対象区分・予約なし拒否・実付与と利用）を通過。今回の移行2件は既存履歴差分に触れず個別適用。実顧客への付与・メール送信なし。

### - [x] QW-20260908-008: 貸切補償の共通受け取りURL

中止済み貸切予約から、人数枠を固定した共通URLを作成できる。GM都合の確認を必須とし、中止日時で補償額を選ぶ。参加者はログイン後に自分のアカウントへ1枚取得する。同じ中止公演・同じアカウントの二重取得はDBで防止し、URLごとの人数上限を行ロックで守る。URLは発行から3暦月、クーポンは受け取りから6暦月。再度のURL作成では同じURLを返し期限や人数枠をリセットしない。

管理画面の「貸切のお詫びクーポン受け取りURL」で作成する。URLを知る参加者が受け取る方式であり、複数アカウントを同一人物とみなす本人照合は行わない。URLを第三者へ公開せず、代表者から対象参加者へ共有する。API・DBの本人は検証済みログインIDから決定し、顧客IDは入力として受け付けない。

検証: verify、299 unit tests、stagingのrollback SQL（重複・人数上限・3か月期限・6か月期限・権限）成功。実際の予約へのURL発行や顧客送信はしていない。通常まとめ予約の代表者一括付与フローは別途残る。

## QW-20260908-009（2026-09-08 利用者依頼）

- [x] MMQ公開ページの初期HTML・固有canonical・robots配備除外・公開リンク・GA4計測を修正。verify成功、309テスト成功。
- [ ] Vercel preview / staging / main / 本番固定URL検証。自動承認レビューがアップロード承認不足でpreviewを拒否。詳細: `docs/SEO_RELEASE_QW-20260908-009.md`。

### - [x] QW-20260907-003: キャンセル料と受付期限の時間基準を明示

公開ポリシー・予約画面・管理プレビューで共用する表示を日数から時間へ変更。48時間前から50%、24時間前から100%という現行計算を変えず、区間の終端を「24時間前になるまで」として重複を避ける。DB・料金計算・保存済み予約条件は変更しない。

## 2026-09-09 QW-20260909-010 / PR400
貸切受付OFFの画面・DB拒否を最新stagingへ統合。組織を解決できない公開URLでは他組織への検索を行わない。DBは最新の参加上限50人・認証チェックを保持した新migration 20260909190000でP0044を復元。helper 4件とverify成功。staging DB適用済み。本番DBはリリース前に適用する。
### - [x] QW-20260909-010 / #383: ニックネーム保存後の表示を更新

顧客行の表示順を更新日時・作成日時・IDで固定し、保存後にマイページの非表示クエリも再取得する。旧PRに含まれた同一ユーザーの顧客行削除・統合SQLは、移行番号衝突と履歴の集約方法を別途確認するため分離した。DB関数・既存顧客レコードを変更しない。検証: npm run verify成功（既存57 warnings）。


### QW-20260911-002: 貸切取消の担当GM通知

DBで取消・中止・削除を捕捉し永続キューへ統一。顧客メールから独立、取消世代による重複防止、復活通知抑止、担当組織絞り込み、再送・失敗記録を追加。詳細と検証: `docs/releases/QW-20260911-002-private-cancellation.md`。

### QW-20260911-004: 貸切・オープンのリマインド復旧

貸切専用列・設定欄・送信分岐を追加し、混在本文をQW限定でハッシュ照合して分離する。料金・期限の設定変更や顧客への試験送信なし。詳細: `docs/releases/QW-20260911-004-reminder-restore.md`。

### QW-20260909-011：店舗設定の保存修正（分離第1段）

PR431からの一括取込を避け、営業時間設定の特別営業日・休業日の読込と保存を修正。旧holidaysの保持、保存失敗の安全停止、組織・店舗絞り込み、共通処理の抽出を実施。unit375件・verify・模擬APIによる画面試験3件成功。サーバーの店舗APIで認証組織を強制し管理者だけ保存可能。本番未反映。店舗編集への集約、募集停止、貸切時刻、GM解除・取消連動は残る。詳細：`docs/releases/QW-20260909-011-store-settings.md`。
## QW-20260914-002 / Issue #467 貸切キャンセル失敗

- [x] 通知トリガーのevent_id変数と予約列の衝突（42702）を再現・修正。正規RPCと前進migrationを更新。
- [x] 本番同様の旧event_id列を含むfixtureで、取消・復元・削除・通知重複防止・組織境界を検証。
- [x] ステージングDBに対象関数のみ適用し、migration履歴と定義を読み戻し。
- [ ] 本番DB適用・main反映・管理画面での取消確認（本番操作の明示承認待ち）。

詳細: `docs/releases/QW-20260914-002-cancellation.md`。

### QW-20260914-004: シナリオ切替後の担当混入とGM同期の再帰

シナリオ編集を作品ID・開閉ごとの独立した状態に変更。過去の取得結果を無視し、担当取得失敗時は保存を止める。料金などの保存で未変更GMを再保存せず、選択・役割の明示変更だけ保存する。保存処理全体の二重実行も防ぐ。

DBの担当→staff旧配列→担当という再帰で、メインのみがメイン・サブ両方に変わる現象をlive関数から再現。`sync_staff_to_assignments`の再入時のみ逆同期を抑止し、正規の担当フラグを保持する。直接の旧配列更新は維持する。

検証: hook回帰6件、全unit396件、verify成功。`PGLITE_MODULE=<PGlite module path> node scripts/test-gm-assignment-sync-db.mjs`で旧関数の不具合再現と修正後のmain/sub・昇降格・別作品削除時の担当維持を確認。DB適用は20260914163000。担当データの復旧は共有案件台帳とaudit_logsの案件IDで記録し、コード修正とは完了判定を分ける。全体ロールバックは利用者から禁止されているため、シナリオ削除や料金等の必要な変更を維持する。


## QW-20260914-004 追加再発防止（2026-09-14）

- スタッフ基本情報保存で担当を再保存しない。担当編集は読み取った役割を保持し、画面をスタッフIDと開閉単位で隔離する。
- スタッフ担当作品の保存は読み取り時の担当と照合し、古い画面からの上書きを409で拒否する。
- 担当一括更新とシナリオ削除をservice_role限定RPCで原子的に実行。削除済みシナリオへの担当再登録もDB側で拒否する。
- 既存の孤児担当267行は今回整理しない。変更なしで渡されたものは保持し、新規/変更した利用不可作品の担当は拒否する。
- 担当INSERT/UPDATEの変更前後も監査へ保存。既存DELETE監査は維持。
- PGliteで途中失敗・競合・削除・テナント境界を検証するテストをCIへ追加。
- 最終の適用・検証状態は会社Drive共通案件台帳QW-20260914-004を参照。

- 追加検証: 408 unit / verify / DB回帰成功。独立レビューのbaseline欠落・作品同時追加競合を修正。staging隔離schemaで2接続の同時保存を検証し、新規GM書込は一括保存commitを待ち役割を保持、古い一括保存は拒否。検証用schemaは削除済み。

- 最終呼出元照合でStaffEditFormも同じ変更時保存へ統一。全担当baselineを使用し、体験済み・全falseも保持。空配列の全解除を旧string[]マージ経路に流さない。413 unit / verify / 15 E2E成功、再レビュー重大指摘なし。

## QW-20260924-001 / 設定の対象・適用範囲（2026-09-24）

- [x] 組織共通・店舗別・作品別・公演別の分類とMMQ全体管理の分離、既存画面からの導線を実装。
- [x] 時間帯/通知の組織・店舗の分離、選択店舗と保存先の一致、作品共通参照の保持と解除を実装。
- [x] 隔離した画面操作・保存先・共通参照・組織切替を検証。
- [ ] 本番反映（今回の実装指示とは別に追跡）。詳細: `docs/releases/QW-20260924-001-settings-structure.md`。


## QW-20260924-004：貸切締切の共通値とシナリオ上書き（2026-09-24）

- 利用者承認：貸切受付締切は組織共通値を持ち、シナリオで上書き。NULL は継承、0 は当日まで。共通値変更を追従し、設定元と適用値を表示。
- 設定一覧の組織共通に「貸切予約の受付締切」、シナリオ編集のゲーム設定に共通／個別指定を追加。作品詳細・貸切申込・グループ候補日追加の読取りに作品IDを渡す。作品未選択の入口は受付可能な作品を隠さない最小日数、選択後は作品の締切で判定。
- 店舗の予約設定は支払い案内へ整理。旧事前予約可能日数・当日締切を画面と予約チェックから除去。DB の通常予約判定も店舗の旧締切を参照せず、作品／公演の締切を維持。
- migration 20260924180000。組織共通値は旧 RPC と同じ予約可能店舗の最大日数を移行し、作品の新列は NULL。旧列・値は維持。実行前に本番／staging の現行関数を比較済み。
- staging には他案件の migration があるため、リモート適用済み版の一覧と今回の SQL のみで構成した一時bundleを使用。dry-runで今回1件のみを確認して npm run db:push:staging -- --workdir /private/tmp/qw-deadline-staging-db --yes を実行。履歴を修復・削除していない。
- 検証：verify成功（既存警告57件）、単体499件、画面6件、DB fixture transactionで共通値変更・0日上書き・解除・組織分離・未登録作品拒否・anon取得を検証しROLLBACK。本番未反映。
- 他設定の棚卸し：追加募集の対象人数は共通／作品上書き済み。追加募集の有効／期限は作品ごとの値、開催判断4時間は固定。通常予約締切は公演→作品→従来値で組織共通の編集欄がない。これらを一括して継承対応済みとは扱わない。

- 自動レビュー対応：貸切候補日・予約の保存時にも実効締切をDB triggerで検証（migration 20260924181000）。期限内INSERTと期限外INSERT/UPDATE・貸切予約INSERTの拒否をfixture transactionで確認。通常のシナリオ保存と独立して競合検査できるよう、個別締切はupdated_atではなく読込み時の締切値を比較する。既存の予約／候補日は遡及変更しない。
- 承認回帰対策：受付済み候補の状態変更・削除を締切再検査から除外し、日付の追加／変更だけ検証。共通締切を延ばした後も既存候補の承認JSON更新が成功し、新候補は拒否されるDB回帰試験を追加。

## QW-20260924-004：通常予約・追加募集の継承（2026-09-24）

- 貸切の先行対応はPR505、本番73497569、migration180000/181000適用・画面確認済み。
- 通常予約締切に組織共通0分を追加。公演指定→シナリオ指定→組織共通の順。0分は明示値、NULLで上位へ戻す。旧時間設定が実効値だった公演だけ旧値を公演指定へ移行（実DB対象0件）。
- 追加募集の延長有効・期限を組織共通（true/90分）から参照でき、人数基準とは別々にシナリオ上書き・解除可能。従来の非初期値は個別指定として保持。通常の開催判断は開始4時間前の固定ルールを維持。
- 実行時の自動判断が継承値を使い、案内済みの期限・人数上限は保存済み値を維持。メールサンプルも適用値を使用。組織側の自動処理許可を迂回しない。
- migration20260924210000をstagingへ適用済み。実DB関数を取得して差分を限定。新RPCはservice_roleのみ、旧APIの個別保存も互換wrapperで保持。
- 検証：verify、単体516件、設定画面9件成功。DB fixtureは専用仮組織だけで通常締切の継承・0分・公演優先・解除、募集期限の共通/個別、保存競合、権限、別組織、案内済み期限維持を確認し全ROLLBACK。実予約・通知送信なし。独立レビューで移行時の継承固定化と更新キーを修正。
- 旧DB関数の戻し手順: docs/rollback/qw-20260924-004-operating-inheritance.sql。新しい共通設定を利用後の全体ロールバックは行わず、値を保全した前進修正を優先する。
- 追加レビュー修正：共通へ戻した際の個別値をDBの行ロック内で温存。非表示の未保存入力は検証・書込対象外とし、再び個別指定すると以前の値が戻る。migration211000、API/DB/画面回帰を追加。517unit・verify、既存3画面回帰も成功。独立再レビュー重大指摘なし。

### QW-20260926-007 公演保存時の定員超過を具体的に案内

実装済み・本番未反映。公演更新とスタッフ参加登録のAPIで、DBの定員判定と同じ優先順位（max_participants → capacity）を使い、超過時に定員・参加人数・予約とスタッフ参加の重複確認を案内する。他組織の公演は人数判定前に拒否する。事前確認後の人数制約違反にも専用メッセージを返す。保存失敗時は公演モーダルの入力を保持し、スタッフ参加登録エラーを成功扱いにしない。DB・予約・アカウントの変更は含まない。

本番反映前の追加検証：満席のスタッフ交代は旧自動枠を先に解除。公演作成済みで参加登録だけ失敗した場合は部分成功を明示して追加モーダルを閉じ、再試行による重複作成を防止。時間重複の続行結果を元の保存Promiseへ返し、保留参加者の保存を継続。単体606件・npm run verify成功。

QW-20260926-006 本番反映前の補完：全額割引の確定金額0円を売上に保持し、定期リマインドも確定金額を使用。3人目以降のGMにはgm3以降の個別報酬を適用。クーポン確定失敗時は選択とプレビューを更新し、P0028を利用者向けエラーとして返す。公演時間設定の上限を従来の480分へ戻した。単体624件・verify・クーポンDB回帰成功。


### QW-20260917-001 全領域整理（利用者指示：本番反映まで）

全体は進行中。個別PRの完了を全体完了と扱わない。共有正本の棚卸しA01〜A28/B01〜B20を追跡する。
第1変更は貸切PIN：10回失敗で15分ロック、旧RPCも同じ判定、既存PINの無認証上書き拒否、画面案内、PIIログ除去。migration 20260927001000。検証環境は適用済み。実PostgreSQLで10並列失敗・ロック・旧RPC・期限後復帰を確認し、隔離fixtureを削除済み。本番DB・画面はPR521（bbe5b61c）で反映済み。本番mmq.gameの配布JSにv2とロック文言を確認。グループの書込権限/参加RPC/スタッフ権限等は後続であり、本変更だけで全体の認証整理完了とはしない。

### QW-20260917-001 スタッフアカウントの整合性（進行中）

連携/解除/役割変更/停止/削除とusers権限を同一transactionで同期。停止は顧客権限へ、休職は業務権限維持、license_adminは独立維持。staff_account_accessで解除済み由来を保持し旧APIの遅延書込による再昇格を拒否する。直接の本人role変更をDBで拒否。付替はservice_role専用RPCに集約し、メールや旧スタッフ情報を削除しない。招待も他組織・別アカウントを変更前に拒否し、先にstaffへ昇格しない。

migration20260927002000はstaging適用済み、本番未適用。644単体・verify、PGlite DB回帰、招待境界9件成功。独立レビューのAuth内部接続と解除後の遅延再昇格を修正して再確認済み。既存inactive+業務権限不整合は両環境0件。全体は未完了。

追加発見：組織登録の権限取得に所有権チェック不足（handle_new_user / claim_organization_as_admin）。新規組織の作成者と検証トークンに限定する修正を次に行う。今回のスタッフ修正だけで認可全体の完了とはしない。

### QW-20260917-001 A29 — 組織登録の所有権検証（2026-09-27）

組織UUIDや自己申告の `invited_as` だけで管理者権限を取得できた経路を廃止。登録時に32byteの登録証明を返し、DBはハッシュ・登録者メール・ログイン済み作成者・30分の期限を保持する。新規組織のみ取得でき、登録済み組織の取得・他人の未登録組織の削除を拒否する。Authプロフィール/管理者staffの作成失敗はAuth登録と証明消費を同時にロールバックする。一般のstaff/license_admin metadataは権限の根拠にしない。旧/register画面の未使用登録実装を削除し/startへ統一。

- 変更: 20260927003000/004000、OrgSignup、旧register入口、DB回帰/CI。
- 検証: PGliteの所有権/NULL証明/偽装/期限/再利用/失敗原子性/020連携/rollback・再適用、644 unit、verify、独立レビュー指摘なし。staging実DBでもAuthトリガー・所有者制限・失敗時の原子性を確認、全fixture rollback。
- 状態: staging DB適用済み。本番DB/画面反映・画面受入は未完了。旧タブの匿名登録は証明を送れず拒否されるため再読み込みが必要。
- 登録時customers生成失敗は、削除済みvisit_count/total_spent列への書き込みが原因と確認。04000で除去し、現行スキーマのローカルDBとstaging実DBで顧客行の作成まで検証済み（警告解消）。過去に欠落した顧客行の補完は別途確認する。
- スタッフA05/A06: PR522、main4dd8ff81、本番DB020/Edge invite-staff/Vercel反映済み。実配備Edgeソース一致、匿名API/Edge401を確認。スタッフ全域の監査や他の残件の完了とは区別する。

### QW-20260917-001 #523 — 退職・休職と組織権限（2026-09-27）

画面のresigned/on_leaveが本番status制約に合わず保存できなかったため、休職をon-leaveに統一、退職resignedを追加する。表示・フィルタ・型・旧API入力互換も統一。停止/退職/連携解除/削除は顧客権限と所属なしへ同一transactionで変更し、復帰時はstaffから復元する。DB組織解決のstaff fallback、APIとクライアントのfallbackも停止者を除外。ライセンス管理権限は雇用状態と独立して保持する。

再招待でプロフィールの組織所属を先行書込せず、停止後の遅延org単独更新も抑止する。招待メールは大小文字非依存かつ記号を文字として照合。元スタッフの新規組織登録は、登録証明を消費した同じDB transactionだけ昇格でき、過去証明や遅延APIでは復活しない。旧組織のstaff行に連携が残る場合、別組織への付替は引き続き拒否する。

- migration 20260927005000。既存PR525の030番号衝突と不足を修正した後継変更であり、PR525をそのまま配備しない。
- 650unit/verify、DBスタッフ・登録連携回帰、招待境界13件、独立レビュー完了。staging DB適用済み。実DBの退職保存/停止org失効/休職復帰/削除/遅延書込/ライセンス保持、登録プロフィール作成を確認（全fixture rollback）。本番はまだ未適用。
- rollbackでは退職状態や登録transaction監査列を消さず、関数を前定義へ戻す。原文migrationのrollback/reapplyテスト済み。

### QW-20260917-001 A02/A03: private-group member authentication

- PIN v3 issues a 30-day random guest credential; only its hash is stored in DB. A member UUID alone no longer authorizes dates, chat, survey, character preferences, or leave. Expiry restores the PIN entry flow.
- Joining locks the group and atomically saves the member, PIN, credential and join announcement after duplicate/capacity checks.
- Legacy member RPC grants are revoked; direct browser writes are guarded for the actual member, organizer or same-organization staff. Existing RLS policies are unchanged.
- PIN mail requires the guest credential, derives scenario/link from DB, and redacts the PIN in email history. Existing mail history is not deleted.
- 2026-09-27: DB060/061 applied to STAGING ONLY. Verified DB regression, legacy bypass rejection, real staging RLS/survey RPC, 4 simultaneous requests for 1 remaining slot (1 success/3 capped), and CUA PIN login/chat/expired-session recovery. Test fixtures cleaned; no email sent.
- Whole QW-20260917-001 remains in progress. Private-group create/delete atomicity, read visibility, existing data consistency, other domains and ER remain separate open work.

## QW-20260917-001 — 貸切グループ作成の原子化（2026-09-27）

作成途中の幹事保存失敗を無視し、候補日時保存失敗時にグループが残る経路を廃止。`create_private_group_atomic` が認証ユーザーを幹事に固定し、組織・作品・店舗を検証した上でグループ、幹事、候補日時、組織設定の初回メッセージを同一トランザクションに保存する。既存の候補日締切triggerも適用され、失敗時は全件戻る。日程未定の作成を維持。招待コードは暗号学的乱数16byteを使用。

- DB070はstaging適用・実Auth/PII/候補日締切triggerを含むROLLBACK検証済み。本番未適用。
- 657 unit、verify、既存PIN/ゲストDB回帰、新規作成DB回帰（異組織店舗拒否、途中/最後の失敗で全件rollback、戻し/再適用）成功。
- 全体案件は進行中。予約申込までの一括処理・管理画面の完全削除経路は別の残件として継続。

## QW-20260917-001 — 貸切申込の完全削除を一括化（2026-09-27）

管理画面の独立したDELETE連続実行を`delete_private_booking_request_atomic`へ統一。同組織の有効なスタッフ権限を確認し、申込とグループをロックして監査・予約・関連グループを同一トランザクションで処理する。公演/支払履歴、別予約と共有するグループ、請求・補償・通知等の制限FKがある申込は理由を表示し、取消による履歴保持へ案内する。失敗時に成功扱いにしない。

- 既存承認/取消RPCは予約→グループのロック順のため、新削除ではグループ取得後の予約ロックをNOWAITとし循環待ちを回避。実staging別接続で競合案内と予約保持を確認。
- DB080 staging適用。実Auth/監査/予約履歴/PII/cascadeのROLLBACK検証、DB権限・早期/後半失敗の全体rollback、実hookの成功/失敗表示2件を検証。
- 本番DB080/mainは未反映。既存PR531作成一括化はmain fc5b58e6、本番配信usePrivateGroup-R4byVEii.jsまで確認済み。
- 全体案件は進行中。予約申込までの原子性、他の棚卸し残件とER/共有記録は継続。

## QW-20260917-001 — 祝日の繰越・日付境界料金（PR476）

本番で2026-05-06が平日判定になることを再現。連続祝日の後の振替休日をSQLと画面で統一し、料金表示APIのCDNキャッシュを次のJST深夜までに制限する。表示用独自休日の取得失敗で予約処理を止めず、予約RPCが単価を再確定する経路を維持。

2026年公式祝日一覧（国立天文台 https://eco.mtk.nao.ac.jp/koyomi/yoko/2026/rekiyou261.html ）を使うDB回帰、通常日との料金差、復元・再適用を検証。694 unit/verify成功。staging DB20260914140000適用、本番未適用。既存予約金額は変更しない。live関数の適用前定義を取得し復元SQLを追加。

## QW-20260917-001 — クーポン履歴の表示期限と利用日時（PR515）

期限切れの保持基準は個別期限とキャンペーン期限の早い方に統一。旧PRの個別期限優先による延長は採用しない。使用済みはcoupon_usages.used_atの最新日時で表示・保持を判定し、無関係な設定更新日を使用日と見なさない。利用履歴が取れない場合は隠さず「使用日時を確認できません」と表示。月末から1か月前の判定はJSTの前月末へ丸める。

公式の利用期限・割引計算を変更せず画面の履歴整理に限定。708 unit/verify成功（最新main535上）。期限切れ・旧更新日・実利用日時・月末境界を検証。staging/mainの配信は次の確認対象。
## QW-20260917-001 — クーポン確定失敗後の再検証（PR520）

確定失敗後に成功済みのプレビューキャッシュを削除する。実useBookingCouponとQueryClientProviderを使い、初回割引成功→失敗リセット→同じクーポン再選択→応答待ちは割引0/確定不可→再検証不許可でも確定不可を確認。旧invalidateQueriesへ戻すと再選択後にcouponReadyがtrueのままとなり、この回帰テストが失敗することも確認した。

最新main535へ統合し701 unit/verify成功。全額割引の0円、3人目以降GM報酬、公演時間480分上限の既存修正テストを保持。DB変更なし。staging/本番画面の配信は次の確認対象。

## QW-20260917-001：追加募集通知の再送整理（2026-09-27、検証中）
- PR483を最新mainへ統合。DBの現物を取得してmigrationを再生成し、組織・作品の設定継承、開催判断時刻、案内済み締切を保持。
- extensionもdispatch対象にする。未送信expiredだけを再キューし、snapshot・トークン・試行回数は変更しない。failedの待機、送信済み、辞退済み、上限到達、過去周回を維持。
- `scripts/test-settings-hierarchy-db.py recruitment-requeue` に一時表だけの回帰を追加。staging実DBの一時表で既存判断継承＋再送境界を実行、ROLLBACK成功。実予約・通知は未操作。711 unit/verify成功。
- DB・Edgeの適用は未実施。送信前確認と認証の追加テスト、dispatchの確認、rollback/reapply、DB先行適用・Edge配備・本番検収が残る。
- 追加検証：送信直前の読み取り専用ガード13件、実Deno環境で専用/共通Cronキー・不一致・空白の認証テスト成功。取得後の辞退・送信・リース変更を検査し、送信結果更新も元リースで条件付きにした。
- 定期dispatchは一時表＋HTTP代替関数で、extensionのみの失敗再試行、試行上限、送信済み、無効組織を確認。rollback→再適用の関数定義一致も実DBトランザクションで確認済み。
- migration `20260927011000` と対象Edgeをstagingへ適用。724 unit/verify・Edge compile成功。Deno型検査は変更していないsecurity.tsの既存RPC型推論5件で失敗するため、ランタイムテストはno-checkで別途実施（未解決事項として保持）。本番DB/Edgeはまだ未適用。

## QW-20260917-001：追加募集通知の公演整合性・期限確認（2026-09-27）
- PR483の後続レビューで、予約振替後・公演中止直後の送信条件と、期限切れextensionだけで毎分dispatchされる問題を確認。
- 送信前に予約のschedule_event_id一致、公演の未中止を確認。dispatchは現周回・active・締切前・未辞退のextensionだけを対象にする。
- 送信前16件を含む727 unit/verify、Edge compile成功。実DB一時表で期限切れ・旧周回・募集終了・辞退のdispatch除外を確認。関数の適用・復元一致・再適用をROLLBACK内で検証。
- DB migration20260927012000と対象Edgeをstagingへ適用中。本番反映・受入確認は追跡を継続。

## QW-20260917-001 カレンダー貸切日時の引き継ぎ（PR491）
- URLのtimeを作品選択から確認画面へ渡し、営業時間の計算結果が空でも選択済み日時を保持。受付停止・競合の送信前検証は維持。
- 不正な時分秒と継承プロパティ名のslotを拒否。非同期の候補充填時も作品所要時間で終了時刻を更新。
- 実ページの非同期読込→候補props、貸切受付停止作品の拒否を検証。現行mainへ一時差替した試験で候補消失を再現し、修正後は成功。
- staging/main配信と実画面受入は継続中。DB変更なし。
- 追加受入で、締切読込中90日→確定14日の変更が停止枠queryKeyに含まれず、停止表示が更新されない問題を再現。検索期間をキーへ追加し、実コンポーネントで旧キー失敗・修正後送信不可を確認。
- 送信前に停止枠・公演・営業時間を再取得し、時刻変更時は候補更新と再確認だけを行う。取得エラーは空き扱いにしない。実コンポーネント試験でグループ作成/予約送信が呼ばれないことを確認。

## QW-20260917-001 貸切GM通知の組織・作品・有効スタッフ境界（PR474）
- Edgeは予約IDから保存済み内容を読み、本文の組織・作品・顧客情報を採用しない。直接呼出の管理者所属と退職状態を検証する。
- 担当作品マスタ・組織・activeのスタッフだけに未回答行と通知を作る。Discord未設定の担当者も回答対象には残す。
- 個別再送のキュー削除は当該組織・予約・選択チャンネルに限定。全体メンションを廃止しDiscordの許可対象を明示。
- 旧PRの20260914120000は既存の料金移行と番号が重複するため削除し、現物取得から20260927013000へ集約。予約の両作品IDにmasterを保存し同組織のactive担当者を選ぶ。既存予約の一括変更なし。
- 実RPCのPGlite試験（legacy/master入力、main/sub、退職/他組織/担当外除外、rollback/reapply）とEdge共有ヘルパー試験を追加。DB130はstaging適用済み。本番適用・Edge配備・受入は継続中。

## QW-20260917-001 / 共通Edge認証境界（2026-09-27）

- service_roleを自己申告するJWT payloadを認証根拠から除外。環境に設定したservice JWT/secretキーまたはcron秘密との一致のみ許可する。
- checkRateLimitのSupabaseClient型を明示しDeno型検査のneverエラーを解消。取得失敗時の拒否を維持。
- 偽造JWT、未知・空キー、正規キー各別名、cronヘッダー、レート制限正常/超過/例外を検証。Deno check成功。本番配備は別途受入記録まで未完了。

## QW-20260917-001 / 中止公演の募集終了同期（2026-09-27）

- 中止確定と同一トランザクションで、同じ組織・公演の募集中deadlineをcancelled、未送信の追加募集通知をexpiredへ同期する。送信済み履歴・予約・公演内容を保持する。中止解除で募集を自動再開しない。
- migration 20260927014000をstaging・本番へ適用し、本番の既存4件を補正。中止公演のactive募集・未送信追加募集通知は各0件。
- PGliteで既存補正・中止時同期・組織境界・送信履歴保持・中止解除・復元再適用を検証。実stagingでも復元→再適用→ROLLBACK成功。verify成功。全体案件は継続中。

- 追加受入：Supabase内部用serviceキーと外部API旧JWTが異なる環境に対応。`MMQ_LEGACY_SERVICE_ROLE_KEY`へ同一プロジェクト管理APIの既存service_roleキーを設定し、secret metadataのdigestで保存を確認。新規キー発行なし。旧JWTをローテーションした際はこの設定も更新する。名前付き`SUPABASE_SECRET_KEYS`も検証対象。9テスト・Deno check成功。staging実Edgeで正規キーは認証通過後の対象検証403、偽造JWT/不正キーは認証401を確認。

## QW-20260917-001 / 貸切人数の作品定員照合（2026-09-27）

- 固定50人の応急上限を廃止し、作品マスターと組織導入作品の上書きから実効最小・最大人数を解決。NULL/0/負数/範囲外は拒否。不正な作品人数設定は別エラーで案内する。旧店舗人数制限は復活させない。
- DB150をstaging・本番へ適用。本番受付対象230作品の人数設定が有効であることを事前確認。既存予約は変更しない。適用直前の本番関数をrollbackへ保存。
- 実RPCを使うPGliteで境界値、組織上書き、master/導入作品ID、未設定、失敗時の予約未作成、rollback/reapplyを検証。実stagingのAuth・顧客・グループで人数検証を確認し、全fixtureをROLLBACK。verify成功。
- 共通Edge認証PR541はmain2f748d6c、本番関数配備36266714005成功。46関数の共有コード一致、49関数の既存JWT設定保持、正規外部キー通過・偽造/不正キー401を確認。Vercel7r8paAmPUHk5xPpRRb7tdYxSPHZw成功。全体案件は継続中。

## QW-20260917-001 / 貸切の初回店舗確定時の変更期限（2026-09-27）

- 店舗未確定の新規貸切申込に限り、初回店舗確定時に店舗・作品・公演の実効変更期限を補完する。キャンセル規定の既存固定マーカーを使い、店舗解除・再設定による再固定を防ぐ。変更期限専用version列で新規NULLと導入前の制限なしNULLを区別する。既存の非NULL時間数も導入済みの証拠として初回補完の対象にし、導入前履歴と店舗確定済み予約の期限は保持する。一括更新しない。
- 顧客による人数変更の締切チェックは初回店舗確定時にも維持。店舗/公演の組織不一致は拒否。0時間と未設定の解決結果もそのまま保存する。
- PGlite実trigger、実stagingの実効設定/キャンセルtrigger連携（公演24時間、後の0時間設定や店舗付替えでも24維持）、既存変更期限回帰を検証し全fixtureをROLLBACK。既存回帰runnerは不要な過去DDL再実行をやめ一時表へ限定。verify成功。DB160の永続適用・本番反映は継続中。

- 追加レビューで、承認RPCが新規公演へ作品IDを保存しないため初回補完と衝突することを発見。DB160適用後の期限関数は両環境で直前へ復元。170で承認公演へ予約由来の作品IDと同組織導入IDを保存し、初回確定と顧客人数変更が同時なら旧/新両期限を検査する。実stagingの承認RPC→実resolver→trigger全経路、PGlite申込→承認の統合、厳しくなる期限の拒否を追加検証。専用列は保持、既存13046予約は一括変更しない。独立レビュー170のP1/P2なし。

## QW-20260917-001 / 作品APIの管理情報境界（2026-09-27）

- GETで顧客にも管理カラムを返し、リクエストのorg_idを信用していた認証分岐を共有認証へ統一。停止・退職スタッフの降格も共通判定を使用する。管理情報/編集は本人の組織に限定する。
- 顧客と別組織スタッフが作品詳細・公開一覧を閲覧する場合は、ログイン済みでも公開カラム/available/有効組織のみ。同組織スタッフの編集用詳細を保持する。
- 実handlerで顧客/不明role/別組織/停止スタッフ/書込/公開詳細/同組織/非公開組織の9回帰。旧コード8失敗・修正9成功。DB/RLS変更なし。

## QW-20260917-001 / 報酬計算の共通化（2026-09-27）
- 給与・売上・公演CSV・作品統計の未記録費用を共通計算へ統一。組織作品の所要時間、個別報酬、明示0円、GM3、受付、交通費、公演日別履歴を適用。旧タイトル照合も組織設定を保持し、異なる作品IDで同名の場合は未解決とする。
- 保存済みGM費用は0円を含め保持。DB180は新規未入力の初期値のみNULLへ変更し、既存値は変換しない。過去保存額の意味は確認待ちで、過去給与の正しさや支払確定を保証しない。
- 776 unit/verify、実handler CSV・統計と給与hook、DB rollback/reapply、実stage新規NULL/明示0円を検証。独立レビュー指摘を修正後、新たなP1/P2なし。DB180はstage適用済み、本番と配信後受入は継続中。
- 先行B24 PR546はmain eb339ec5、本番配信成功。実stage顧客の管理403/公開200、匿名401、同組織管理画面を確認。全体案件は進行中。

## QW-20260917-001 / 顧客一覧のクーポン集計（2026-09-27）
- 自組織の発行枚数・実使用回数・有効な残り回数を分離。キャンペーンの現在の付与回数との差分から使用回数を推測しない。発行元と予約の組織を照合し、失効・取消・開始前・期限切れを残回数から除外。予約ごとの作品等の条件は予約時に判定する。
- 使用履歴を先に集計して残回数のJOIN増幅を防止。利用期間は発行済みsnapshotと個別期限で判定し、キャンペーンの発行期限とは混同しない。
- PGlite実関数で組織境界・状態・期間境界・個別回数・キャンペーン改定・復元再適用を確認。verify成功、独立レビューP1/P2なし。本番適用・受入は継続中。顧客金額A20/母集団A21は別残件。
- 先行PR547はmain bdd295f8・本番Vercel H1mPze7xaw5je7NWeS6XTJRuqZPm成功。stage実給与/公演CSV8500円一致、本番給与の参考値・未解決4公演のCSV抑止を確認。DB180で既存14960行の金額hash不変。全体案件は進行中。

## QW-20260917-001 / 顧客詳細のクーポン使用履歴（2026-09-27）
- PR548本番配信・DB190・実画面の発行/使用/残回数を確認。詳細だけ直接DB取得のためstaff権限で使用履歴なしになる別経路を発見。
- 顧客別の履歴APIを追加し、スタッフ認証と発行/企画/予約の全組織条件をサーバーで固定。ページング付きで集計と同じ範囲を返す。読込中・失敗・空結果を分離し再試行を追加。
- 共通handlerの非同期処理をawaitし、権限不足を403へ正しく変換。実stage PostgRESTで取得成功/3組織条件を確認。APIと実UIの23回帰成功。DB/RLS変更なし。本番反映は継続中。

## QW-20260917-001 / GM回答の組織境界（2026-09-27）
- Gateway・貸切管理・GM回答一覧・人数充足判定で回答とスタッフの組織を照合。Gateway/GM本人の取得では予約の所属も確認する。
- DB200はスタッフ/予約の複合FKを追加し、新規・参照変更・親所属変更による不一致を防止。既存7件は5月の未回答で予約所属は一致し、経緯未確認のため更新しない。スタッフFKはNOT VALIDのまま残す（新規参照は強制）。予約FKは検証済みにする。RLS変更なし。
- 実stageで既存行hash不変・復元/再適用をROLLBACK検証。stageのみ200適用済み、旧/新PostgREST join互換を確認。PGliteで参照変更/親所属変更/削除連動/旧履歴保持を検証。本番は未適用。
- 先行PR549はmain801e80ec、本番Vercel7RFry4qKwdX6XScp537FmSYxaRgV成功。stage/prodで顧客クーポン使用2回/履歴2件を確認しconsoleエラーなし。全体は進行中。
- CIのorg_scopeガードが直接組織フィルタ増加を検出したため、画面のGM回答取得を`/api/reservations?type=gm-responses`へ集約。組織/本人スタッフIDをサーバー側で決め、ブラウザーからorgを受け取らない。1000行上限をページングで回避し、本人画面の失敗表示/再試行も追加。baselineは変更しない。本番未反映。

### QW-20260925-001: FC貸切売上の0円表示（2026-09-27）

旧web_private予約でtotal_price>0・discount_amount=0・final_price=0の初期値が残る場合だけ、保存済み合計額で売上を集計する。全額割引・割引額未確認・通常web予約の0円は保持。期間別売上とスケジュールCSVで割引額を取得して同一判定を使用する。大宮2026年8月の貸切4件×40,000円と公開62,500円を回帰ケースとする。DB書換えなし。本番反映待ち。

## QW-20260917-001 / 顧客の組織接点による表示統一（作業中）

- 本番の通常取得RPCは、自組織所属または自組織への予約・貸切参加の接点がある顧客を対象とする。一方、集計一覧とメール・電話検索は所属条件が異なり、別組織予約のある顧客2人が不一致の対象。
- 集計一覧と検索を通常取得RPCの対象へ統一。集計は従来どおり予約組織を限定し、金額・クーポンの定義は変更しない。検索失敗は未登録扱いにしない。
- 閲覧条件によってPATCH/DELETE権限を広げない。共通プロフィールの変更・削除権限の整理は別途継続中。
- 隔離DBで所属・予約接点・貸切参加・接点なし・他組織金額除外・検索・復元再適用を確認。API回帰5件成功。ステージング・本番は未適用。

## QW-20260917-001 / 顧客削除の管理者・所属境界（作業中）

- 顧客削除APIは編集用の接点判定を流用しており、staffや共通顧客に対してDBポリシーより広い削除を許していた。
- requireAdminを追加し、DELETE自体をJWT由来のorganization_idと顧客IDで限定。0行・DB失敗を成功と返さない。
- 編集・作成の権限とRLSは変更しない。実顧客の削除は実施しない。API回帰で一般スタッフ・他組織・共通顧客・管理者・削除失敗を確認。まだ本番未反映。
## QW-20260917-001 / 顧客画面の組織別キャッシュ（作業中）

- 顧客一覧のキャッシュキーに組織IDを追加。組織未確定時は取得せず、組織をまたぐ旧データの仮表示を防止。
- 組織変更時はページ・開いている顧客編集・詳細をリセット。取得失敗時は古い顧客・集計を表示せず、再試行を提供。組織取得の失敗も再試行対象。
- DBと顧客データの変更なし。本番反映は未実施。顧客編集のAPI集約・共通プロフィール変更権限は別途継続。

### QW-20260917-001: 顧客詳細の予約履歴
- 予約履歴を認証済み組織・顧客で限定するAPIへ集約。表示に必要な列のみを返し、500件ずつ安定順で全ページ取得。1000件の暗黙打切りと途中失敗の部分成功を防ぐ。
- 履歴の読込中・取得失敗・空結果を分離し、再試行を追加。顧客切替や折りたたみ後の予約/クーポンの旧応答を破棄する。
- 1001件取得・全ページの組織条件・後続ページ失敗・顧客切替旧応答・失敗後再試行を検証。830unit/verify成功、独立レビューP1/P2なし。DB/RLS変更なし。本番反映は継続中。

### QW-20260917-001: 顧客編集の保存判定と権限
- 顧客管理の新規/編集ダイアログを `/api/customers` に統一。組織IDはJWTから確定し、staff行未作成の管理者も既存APIの権限で新規作成できる。
- PATCHは検証済みユーザーJWTのクライアントで実行し、既存RLSが更新時点で自組織/本人/接点ある共通顧客/license_adminを判定する。RLSポリシーの変更なし。サービス権限での事前判定→更新の隙間と貸切参加のみの接点漏れを解消。
- 更新0行は404。UIは保存済みID確認後だけ成功通知・再取得・閉じる処理を行い、権限/保存エラーではフォームを保持する。
- API5件/UI4件追加を含む833単体テスト、verify成功。独立レビューP1/P2なし。本番受入は反映後に別途記録。実顧客を試験目的で作成/変更しない。

### QW-20260917-001 / B29 体験済み履歴の認可移行（第1段階）
- 本番の旧manual_play_history/customer_played_overridesポリシーはスタッフ行の存在だけで全顧客を操作できる。新RPCで本人、有効な組織スタッフと顧客接点、license_adminを確認。別組織所有の接点顧客は閲覧のみ。
- 全ブラウザーの履歴読取/追加/削除/日付変更/除外操作をRPCへ移行。顧客行ロックで手動2000件上限を保存時に適用。NULL操作を明示拒否し、更新/削除対象0件を判別。
- 顧客管理の予約由来履歴は組織API、作品選択も組織固定。取得失敗は空履歴と区別し再試行。顧客本人の組織横断履歴と既存の体験済み判定を保持。
- DB240は新関数のみ。旧テーブル権限は新フロント配信後の第2段階で閉じるため、このPRだけでB29完了ではない。RLSポリシー変更なし。
- 842単体テスト、verify、PGlite認可/上限/日付変更/NULL拒否/復元再適用、全src直接アクセス0件検査成功。独立レビュー初回NULL操作指摘を修正後P1/P2なし。
- DB240ステージング適用済み。手動4950件/除外2件の全行hash不変、実admin snapshotとNULL拒否をTXで確認。本番は未適用。
- 追加CIのorg_scopeガードに合わせ、管理画面の作品選択も`/api/customers?action=playedScenarioOptions`へ集約。組織・公開状態・全ページ取得をAPIで固定し、フロント直フィルタのbaselineを変更せずガード成功。作品選択API回帰2件・verify成功。

### QW-20260917-001: アンケート通知の配送記録と承認再試行
- 手動案内は現在の予約・公演・組織設定から本文/宛先を確定し、チャット・期限・配送予定を原子的に保存。承認要求IDと内容を記録し、通信再試行で公演・通知を再作成しない。意図した再承認は新しい要求で可能。
- 配送は期限付きロック、保存済み本文、プロバイダー冪等キー、履歴との原子的な完了確認を使用。結果不明・有効期限超過・変更済み公演への送信を停止。画面は送信待ち/受付済み/未送信/不明を区別し、未解決の案内の重複を拒否。
- 実承認/設定継承を使う隔離DB、配送SQL/二重実行/履歴障害/再送、UI16件、ワーカー認証4件、cron/rollback/reapply、verify成功。独立レビューP1/P2なし。
- PR614/main afdbf897でDB500/501・Edge・画面を両環境へ反映済み。本番配信6690310810成功、定期実行・認証拒否/正規dryRun・画面の履歴更新/取消/未予約送信不可を確認。新2表のRLS・ブラウザー直接権限なし・匿名RPC拒否を確認。既存RLSポリシー変更なし。実メールの試験送信なし。旧承認入口は新画面配信後に別途閉じる。
- アンケート以外の承認確定メール/GM通知は既存背景処理のままで、全領域監査の別残件。今回の配送保証と混同しない。

### QW-20260917-001: 配送予定を保存しない旧承認入口の閉鎖
- PR614の本番画面受入後、DB510で旧approve_private_booking_with_noticeへのPUBLIC/anon/authenticated直接実行だけを閉じる。正規配送入口の所有者経由とservice_roleを保持。既存データ・RLSポリシー・関数本体を変更しない。
- 両環境の実ACLとDB参照を照合し、画面/API/Edgeの旧直接呼出元がないことを確認。実承認と配送の隔離DBで旧入口拒否・新規承認保存・要求再試行・ACL復元再適用・記録保持を検証。verify成功。DB510は未適用。

### QW-20260917-001: グループ一覧の表示名・現在予約・取得失敗
- 幹事・参加者の表示名は認可済みsnapshotを使用し、全ユーザーIDを指定した顧客テーブル再取得を除去。予約はgroup.reservation_idに一致するものだけを取得し、現行公演の日時・店舗・担当を表示。旧予約のGM文字列をUUID検索へ渡さない。対応不明は警告し、古い候補・別予約で補完しない。
- 参照先取得は組織で限定し、1要求50件・最大3要求の並行取得に制限。取得失敗を空データとして握り潰さない。アンケート設定も全件の存在を確認し、順次取得の待ち時間を削減。
- 表示名・現在公演・不整合リンク・取得失敗・同時実行上限/順序・アンケート/予約フェーズ重複防止の6回帰テストとverify成功。本番の既存一覧RPCは100件173.662ms（読取専用TX）で、全画面の遅延は別途検証環境で計測する。本番未反映。

- PR617追加レビュー対応: アンケートと予約の取得フェーズを直列化し、複数の最大3要求バッチが重ならないようにした。7141846eの検証画面で657件・幹事名・現在公演の担当・不整合警告を確認済み。上限修正後の配備/画面確認は未完了。

### QW-20260917-001: 公演日時と予約・貸切候補の原子同期520（未配備）
- PR617/main b2fded99の貸切一覧は本番1137件・表示名/現在公演/担当・エラーなしを受入済み。
- 公演保存後のブラウザ別更新・失敗の握り潰し・同日先頭候補への推測同期を廃止。イベント更新トリガーで同組織予約日時と現在予約に対応する完全一致候補だけを同一TXで同期し、曖昧候補は拒否する。取消予約/旧予約の候補は保持する。
- 新規候補の受付締切を維持し、既に確定済みの現在予約/公演と新日時が一致する内部同期のみ例外。予約/グループ/候補のNOWAITとAPI409で再承認との逆順ロック待ちを回避する。
- 旧ブラウザの二重同期を防ぐため候補テーブルUPDATEだけanon/authenticatedから取消。実本番のUPDATEはテーブル権限のみ・個別列権限なし、既存候補RPCは所有者SECURITY DEFINERであることを確認。RLS変更なし、他の直接権限閉鎖は別残件。
- 実PGliteで完全一致/他候補保持/旧予約/取消/他組織/途中失敗全体rollback/復元再適用、実締切resolverと候補追加RPCの互換・確定公演変更・旧browser拒否を検証。verify成功、独立再レビューで追加P1/P2なし。実PostgreSQL複数接続での競合試験は未実施。DB520/フロント未配備、全域IN_PROGRESS。

- 520復元手順: 検証環境anonは既にSELECTのみ、本番anonはUPDATEありという差を現物確認。適用前のUPDATE可否を新関数コメントに保存し、復元時は各環境の元権限を再現する。両権限パターンの隔離回帰成功。

### QW-20260917-001: 貸切一覧の幹事名と欠席公演（PR619追加修正・本番未反映）
- 現在予約がno_showでも現行公演の日時・店舗・担当を表示し、不整合警告と取り違えない。
- snapshotにstaff専用の幹事名を追加。グループの組織認可後にorganizer_id本人だけを解決し、共通/別組織プロフィールも既存参加者表示と同様に扱う。顧客所属で絞る草案の漏れを修正。幹事メンバー削除後も顧客名が取れ、顧客がなければ幹事本人メンバーの入力名のみを使用する。
- 本番/検証の関数現物とrollback本文の一致を確認。実認可関数を使用する隔離DBでNULL/他組織所属プロフィール、幹事メンバー削除、名前fallback、プロフィールなし、staff限定投影、別組織/退職者拒否、rollback/reapplyを確認。フロント6回帰テスト成功。RLS/業務データ変更なし、DB/画面は未配備。
- 前項PR620/DB520は両環境適用済み。実PostgreSQL別接続で3種ロック競合の即時拒否/部分更新なし/解除後再試行成功を確認。main29514fa7・本番Vercel成功、検証/本番の既存公演編集の読取/取消・console errorなしを受入済み。実公演の保存/通知試験なし。
- B09追加残件:公演編集の所要時間footerが270hと表示される。両環境で再現、別修正で単位を整える。全領域はIN_PROGRESS。

### QW-20260917-001 / B09 公演編集の所要時間単位
- 公演編集サマリーは分単位のscenario.durationにhを付け、270分を270時間に見せていた。単位を分へ修正。保存値・公演時刻・レイアウトは変更しない。
- 検証/本番画面で270hを再現し、シナリオ型/入力の分単位と照合した。局所表示修正のため実装をなぞるテストは追加せず、verifyと配信後の画面表示で確認する。本番未反映。

### QW-20260917-001 / A02 旧貸切管理画面の整理
- 旧/group/manageはgroup読取後/group/inviteへ転送するが、到達不能の管理画面とメール招待処理が残っていた。旧URLの転送・読取失敗表示だけを維持し、現行のチャット/招待リンク/メンバー管理は変更しない。
- PR622初稿は旧UserSearchInviteを現役と誤認し、招待RPC3件を検証DBだけに追加した。本番未適用。初稿のコード/RPC追加を撤回し、20260927105500で検証環境の不要関数を取り消す。本番では存在確認付き削除のみで履歴データは保持する。
- 機能削除ではなく既存転送後に到達不能だったコードの除去。旧URLの転送/認可エラー/ロード中を回帰検証する。全域IN_PROGRESS。
- PR621はmainffdb32f5/本番配信成功、270分表示/日時保持/キャンセルを受入済み。
- 追加確認: アプリ内ブラウザの検証環境で更新案内ループ、Chromeは正常。JS206件の配信HTTP/content-type正常。原因未確定として継続する。
- 配備レビュー対応: 検証適用済み105000は無操作の履歴ファイルを残し、通常db pushのremote-only versionを防ぐ。105500 rollbackのニックネーム取得は同組織だけへ限定し、復元時の境界も維持する。

### QW-20260917-001 / アンケート設問の一括保存（検証中）
設問の取得失敗を空一覧と扱う処理と、削除/upsertの独立保存・失敗の握り潰しを廃止。組織/有効スタッフ認可、取得版の照合、他作品ID拒否を行うRPCへ画面・コピー・回答表示の読取を統一する。コピー元の遅延応答と失敗を区別し、設定を無効にしても編集中の設問は保存する。既存回答JSONは変更しない。
DB110000/rollback、単体8件、PGliteの原子性/認可/版/復元回帰、実PostgreSQL別接続の旧書込競合55P03・コミット後40001・再読込後成功、verify成功。独立レビューP1/P2なし。DB/画面の配備・実機受入は未完了。設定画面全体の複数保存を原子化したという意味ではない。
PR622はmain f734e95e、本番配信成功。旧管理URLから統合inviteへの遷移・招待リンク/既存参加者・パネル開閉を本番確認済み。全体案件はIN_PROGRESS。

### QW-20260917-001 / 貸切の直接アクセス権限整理（PR626・本番受入済み）
- PR624/main7d3f37d4はDB/本番画面受入済み。GLORIA12問・期限14日前・コピー元/MERCHANT9問を保存なし確認。共有Docs/台帳更新済み。
- 貸切6表と設問/旧招待のブラウザ直接権限を表・列とも取消し、認証付きRPCとservice_roleを維持する。RLS/保存済みデータ変更なし。旧未使用ヘルパー2本を除去。
- 本番の依存ビューはservice_roleのみ、INVOCER依存は既存ブラウザ書込guardのみ。設問/招待ポリシーのcore参照は該当2表も閉鎖して整合させる。現行srcの直接参照/Realtime購読なし、API/Edgeはservice_role。
- rollbackは環境ごとの元の表/列権限とGRANT OPTIONを保存して復元。隔離DBで直接アクセス拒否、サービス維持、正規ゲスト参加/チャット/退出と招待プレビュー/会員/スタッフ読取の回帰を検証済み。DB113000を両環境へ適用し、本番画面の読取受入を完了。

### QW-20260917-001 / Approval notification delivery (PR627 deployed and accepted)
- PR626/main7683f03c accepted in production; the full audit remains IN_PROGRESS.
- Approval/history/customer and GM delivery jobs are saved atomically. Legacy endpoints enqueue the same jobs; service correction requests require a stable UUID requestId and reject content conflicts.
- Email idempotency, frozen payloads, Discord uncertain-result stop, provider receipt reconciliation, unsent-only retry and verified preparation resumption are separate operations. Preparation resumes only when the matching stored Discord room exists and no email send began.
- Rollout: preparation migration 20260927120000, seven Edge functions and dedicated cron secret, activation 20260927120100, then frontend. Rollback preserves queued jobs and workers.
- Actual SQL fixtures cover atomicity, authorization, compatibility deduplication, correction conflicts, reconciliation, and preparation recovery. Transport/worker/receipt tests, Edge checks and npm run verify pass. Staging DDL transaction rehearsal passed and rolled back. Independent review findings resolved; no additional P1/P2. No real customer writes or notifications used for tests.
- Completed: staging/production DB120000/120100, seven Edges, frontend and read-only acceptance. ER version20 and canonical Docs/ledger updated. The complete audit remains IN_PROGRESS.

### QW-20260917-001 / PR627 follow-up (PR628 deployed)
- PR627/main e7e297f6: production DB/Edges/frontend deployed; private booking list and notification history read-only acceptance passed. Late automated review added three findings; workflow success did not mean no findings.
- Explicit workflow_dispatch release_phase=prepare-edges verifies preparation migrations while deferring only registered activation migrations. Apply activation after successful Edge deployment via selected npm DB workflow, then run complete. Ordinary push/default complete still requires all changed migrations; arbitrary migrations cannot bypass the guard.
- Delivery history exposes retry/preparation-resume only for the current booking generation. Provider receipt reconciliation remains available for stopped attempted deliveries. Discord targets normalize individually; invalid fallback no longer blocks a valid primary. No data backfill or real notifications for tests.

### QW-20260917-001 / 設定の版表示と受入照合
- PR628/main37a440ecはCI/E2Eと本番Vercel配信成功。DB130000・workerは両環境で定義確認とdryRunを通過。ER version20公開、Docs/共有台帳の保存を読み戻し確認済み。
- A05/A06スタッフの停止・権限・連携、A14初回店舗確定時の期限固定は本番関数と隔離テストの一致を確認して受入済み。全58項目の受入は9項目、26項目は実装あり照合待ち、23項目は要件監査待ち。未実装件数ではない。
- B13: キャンセル設定の未保存プレビューが当日を最終更新日として表示する残件を修正。更新日は手入力設定にせず、公開ページでDBの保存日時から自動表示する。
- 関連64単体テストとnpm run verify成功。検証環境の既存RPCで貸切締切・通常予約締切・追加募集の継承/版競合/共通復帰保持をROLLBACK付きで確認。実顧客への通知・予約変更なし。本修正の画面配備は未完了。

### QW-20260917-001 / 顧客の予約金額（配備前）
- A20: 顧客一覧の累計支払額はtotal_price集計のまま。本番760件の差分中759件が旧貸切/未入金/final_price0/割引なしであり、0円や入金実績とは推測しない。
- v2集計は割引後の予約金額を返し、金額未設定または不整合な0円を含む顧客はNULL（要確認）。正当な全額割引0円と予約なし0円を保持。取消・他組織は除外。入金/返金実績ではない旨を画面に表示。旧列は互換用に維持し、予約データの補正はしない。
- SQL隔離検証で割引/無料/未確定/合計保留/組織境界/権限/復元再適用を確認。DB140000を両環境へ先行適用し、その後API/画面を配備する。ロールバックは旧APIを先に戻し、その後v2 RPCを削除する。

### QW-20260917-001 / 顧客金額の追加レビュー対応（配備前）
- PR631はab153717で本番マージ。追加レビューでアカウント管理側の旧見出しと予約後クーポンの未控除を確認。use_customer_couponは履歴を追加し、final_priceを更新しないため、集計時に後付け利用分も控除する。
- reservations.coupon_usage_idが示す予約時利用はfinal_priceに含まれるため二重控除しない。他組織は除外、後付け使用取消は控除解除、過大な控除は要確認。保存予約金額は推測補正しない。アカウント管理側にも同じ見出しと意味の説明を適用。
- 追加SQL隔離テストで予約時/後付け/全額0円/取消/組織外/過大控除を確認。141000をDB先行で配備する。全体は未完了。

### QW-20260917-001 / B17 顧客一覧の全件検索（配備前）
- Issue319の全件ソート/数値/日付フィルターを新しいsearch_org_customersで実装。組織接点・クーポン・金額の既存v2集計を使用し、フィルター/ソート後にページング。空ページでもtotalCountを保持。日本時間の最終来店日範囲、NULL金額末尾・数値条件対象外を明示。
- 顧客管理とアカウント管理の操作部・列ソートを共通化。条件変更で1ページ目へ戻り、前条件のキャッシュ表示を抑止。アカウント管理側の取得失敗を空一覧と混同せず再試行を表示し、組織変更時に顧客詳細を閉じる。
- DB隔離テストでページ横断/各ソート方向/数値/クーポン/日付境界/空ページ/組織境界/権限を検証。対象UI/API20テストとverify成功。DB150000先行適用後に画面を配備する。全B17の体験履歴優先順位等は別途受入照合が必要。
- 同じB17照合で、体験済み管理がcompleted予約を除外していたため修正。過去の完了予約を表示し、取消・未確定・未来予約を除外する回帰テストを追加。実予約データは変更しない。
- PR635レビュー対応: 最終来店日が将来の確定予約を含んでいたため、visit_countと同じcompleted予約だけの最大日時に統一。未来予約があっても過去の来店日フィルターから脱落しないこと、旧定義へのロールバック/再適用で挙動が切り替わることを隔離DBで確認する。DB150100追加。

## QW-20260917-001 / #642 リマインドの関数間認証（2026-09-28）
- 本番cronは稼働・実効設定も有効だが、送信関数が403を返し、配送38件がfailed。9/25は送信履歴あり、9/26以降なし。
- PR643の既定ON・日程補完migration・DBトリガーsecret追加許可は撤回。既存のMMQ_LEGACY_SERVICE_ROLE_KEYで送信先へ明示認証し、関数ごとのruntimeキーを使わない。HTTP失敗コードだけを記録し宛先/本文をログに出さない。
- 両環境で配置済み共有キーのdigest一致、存在しないdeliveryを使った409到達を確認。実送信なし。認証境界3件・日程/runner10件、verify成功。
- DB変更なし、通知設定の変更なし、過去失敗分の強制再送なし。本番配備と通常cronの復旧確認はこれから。

## QW-20260917-001 担当保存エラーの識別（原因調査継続）

担当作品の保存失敗でAPIの利用者向けmessageを表示し、401/403/通信エラーを区別する。DB保存失敗はサーバーログへスタッフID・組織ID・エラーコードと理由を記録する。担当一覧・権限・既存データは変更しない。この変更だけで渚咲さんの保存不具合の解消とはしない。

追調査：9/28・9/29の本番ログで削除確認409の後に保存500。対象スタッフに全フラグfalseの旧担当行が8件あり、StaffProfileの体験済み切替が既存行を残して同一作品を追加する不具合を再現。DBの重複拒否と整合する（本人が変更した作品は未確認）。既存行を更新する処理に修正し、旧処理で失敗する回帰テストを追加。既存担当の書換え・削除、DBスキーマ変更は行わない。

## QW-20260917-001 編集画面の部分保存対策（配備準備）
- スタッフ管理の基本情報＋担当を1つのRPCで保存し、作成/編集とも片方の失敗時は全変更と履歴を戻す。操作者はAPI認証情報から渡す。
- シナリオ編集のGM追加・解除を1つのRPCへ集約し、読込時の全担当行と照合して他の編集の上書きを防ぐ。基本情報とGMは別保存であり、GM失敗時はその違いを画面に明示する。
- 既存の組織/権限検査、孤児行の無変更保持、担当解除確認の作品名と担当変更履歴を維持。migration 20260929170000をDB先行適用する。rollbackは新規3関数のみを削除。
- 実SQLを使う隔離DBで2件目失敗・プロフィール失敗・作成失敗・履歴の巻戻し・競合・組織境界・権限・再適用を確認。実際の利用者による元報告の再試行確認と全体整理は未完了。

## QW-20260917-001 / B05 GM回答と候補表示の整合（配備準備）
- Webの保存・初期表示・再編集を候補配列の0始まり位置で統一し、表示orderの欠番や並び違いで別候補へずれないようにする。再編集は保存済み選択で一括置換し、複数選択の欠落と未保存変更の持越しを防ぐ。
- 管理画面も同じ保存位置を参照。確定後に元候補を復元した表示では過去回答との対応を推測せず「要確認」とし、対応不明の候補を手動回答として保存しない。
- 関連22テスト・verify成功、独立レビューの候補欠落時クラッシュ指摘を修正済み。DB・Edge・運用データ変更なし。
- 旧Web回答の位置補正、候補編集と回答保存の競合、Issue401報告者の再試行確認は未完了。B05全体や全体案件を完了扱いにしない。

## QW-20260917-001 / B05 候補変更中のGM回答保存（配備準備）
- PR655はmain5f0880fc5で本番反映・読込確認済み。続いて、選択開始時の候補配列と既存回答の版を固定し、予約行ロック下で両方を照合するservice専用RPCを追加する。本人/管理者のAPI認可と有効スタッフの組織境界を維持。
- Webの自動再取得で既存の編集中baselineを入れ替えず、新規依頼だけ初期化。管理手動入力はフォーム開始時の日時を表示・保存に使う。競合時は再選択を案内する。
- Discordボタンへ候補日時のhashを付ける。旧ボタンや日時変更後のボタンは回答を保存せず最新候補を再表示。回答保存の成功後に選択済みを表示する。実通知は検証で送らない。
- 15対象テスト、DB隔離試験、Deno両Edge型確認、verify、独立レビュー成功。staging DB190000適用・serviceのみ実行可能を確認。実DBの保存/候補競合/回答競合/別接続ロックを全ロールバック試験し既存行不変を確認。
- 本番DB→Edge→画面の順で配備する。rollbackは呼出元を戻してから新関数を削除。過去の回答を候補変更後へ再対応付けする残件や全体案件を完了扱いにしない。

## QW-20260917-001 / 顧客の確定公演時刻（配備準備）
- 11/1テセウスは公演/予約15:30、申請候補19:00が残り顧客画面に混在。本番将来確定467件中43件で申請候補と公演日時が不一致。候補は履歴として保持し、認可済みグループ読取に同組織の現在の確定公演を追加する。
- チャット/通常/日程シートへ確定日時・店舗を表示し、旧候補は申請時履歴と明示。アンケートの公演日も確定日を優先。公演変更は次の読取で反映し、取消/組織不一致は誤った候補へfallbackしない。
- クーポン判定は既存どおり公演参照。現行実装にない3時間前制限の案内を画面/FAQ/メールから訂正。保存済manual_pages/manual_blocks該当旧文面0件を本番確認。クーポン消費・外部送信は検証で行わない。
- 22対象テスト、実SQL権限/日時変更/取消/別組織/rollback、verify・Deno成功。既存業務データを書換えず読取の正を統一する。DB先行→画面/メール配備→3経路の受入を行う。GM回答履歴draftは別保留で混ぜない。
- PR657追加レビュー対応：no_showも確定公演を返し、未参加previewは取得不能警告ではなく参加後確認案内にする。DB213100、回帰SQL/UI/verify成功。新規業務データ変更なし。

## E1 同組織参照のAPI互換準備（2026-10-01）
- 複合FK追加に先立ち、スタッフ予定・クーポン公演の2SELECTで既存FK名を明示。返却項目/組織filter/inner結合は維持。人工PostgreSQL17/PostgRESTで追加前後/復元の14ケースを確認済み。
- Vercel廃止済みNode20を、PR709で検証済みのNode24指定へ更新。依存バージョン変更/取消画面変更/Edge/権限変更は含めない。
- このbranchのCIとstaging配信成功後、承認済み2index/2NOT VALID FKだけをstagingへ適用する。本番・既存行補正・全9候補公開は保留。

## 2026-10-01 取消後の一覧即時反映＋Node24指定（専用branch候補）

- 実A受入で取消直後だけ旧カード残存、reloadで正常化。取消成功時の一覧再取得を待たず遷移する経路を修正。
- 取消前の進行中取得を停止し、API保存済み取消行を一覧/詳細cacheへ遷移前に反映。再取得は背景で継続し、取得失敗を取消失敗にしない。
- 局所回帰2件（進行中旧取得の後着/成功、一覧・詳細再取得失敗）と型確認成功。全unit/E2E/実予約の再実行無し。
- 独立候補のみ。commit/push/deploy/共有DB変更無し。A試験fixture閉鎖/取消履歴保持を維持。
- 追加承認によりpackage/lock・CI/E2EのNode指定だけ24.xへ整合。依存更新なし。専用branch CI/previewのexact SHA結果を別記録へ回収する。
## MMQ / 本番後機能QA追加（2026-10-01、ローカル検証）

- 基準本番26fdcf8b、担当作品と予約確定を実UI＋明示API/Authモックで検証。全ページ/全機能の実受入済みとはしない。
- 既存のメール未確認でも送信済み表示、同tick二重送信、同時刻重複判定TZ不一致を局所修正。保存失敗の同一予約番号再試行と保存成功の維持を検証。
- 台帳/残件: `docs/testing/MMQ_FUNCTIONAL_QA_20261001.md`、網羅表 `docs/testing/MMQ_PAGE_FUNCTION_MATRIX_20261001.csv`。
- 今回はローカルのみ。追加配備は未承認。実Auth/実DB一続き予約導線は専用stagingfixtureと通知抑止を確認するまで保留。

## 2026-10-01 / 構造設計A：予約RPCの本人・組織認可（ローカル検証済み・未適用）

- 顧客ID一致だけの人数変更と匿名ゲスト作成を、UID必須・予約顧客の本人照合・対象組織の有効業務権限へ変更。旧作成wrapperと旧日程変更の匿名NULL／無所属管理者例外も閉じる。
- 既存main5d3ad337から独立。関数の現物hashで未知の変更を拒否し、staging独自の募集停止を保持。PUBLIC/anon EXECUTE撤去候補、authenticated/serviceはactor文脈付きで維持。RLS・既存データの補正なし。
- PostgreSQL17の人工fixtureで130ケース（未解決6項目の特性確認を含む）、実ロール・2接続競合・拒否時不変・安全互換down/up成功。API追加21件、全体1308件、verify成功。API全体strictにはmainでも再現する既存nullable型エラー2件が残る。
- 9再現の1/2/9を閉鎖、3〜8と構造計画B〜Gは残件。実Auth・全trigger統合・共有staging/本番適用・CI/previewは未完了。認可欠陥を戻す自動rollbackは用意せず、API旧版と安全互換DBで戻す。
- 詳細・反映対象・承認案：`docs/testing/MMQ_RESERVATION_RPC_AUTH_20261001.md`。旧定員patch・保留GM・PR703/706は混ぜていない。

## 2026-10-07 顧客QA 19件修正（ローカル・未配備）

- main `5814b1e5b2e73941166525bcc3b419fb6efcb4a7` の独立コピーで初回QA F-01〜F-19とC-02/C-03に対応。元dirtyツリー・本番変更なし。
- クーポン本人認可/保存、店舗公開読取、通知型・失敗伝播、同番号予約、URL・人数・期間・満員人数・履歴・入力・チャット等。SQL5組とrollback。匿名の私有テーブル権限は追加しない。
- 単体245ファイル1734件、verify、対象実DB/Auth/API/ブラウザ、12並列、rollback/up合格。全体RPCスモークの変更外2件は未完了（復元元と同一定義）。
- 詳細: docs/testing/MMQ_CUSTOMER_QA_FIX_20261007.md。push/PR/merge/deployは禁止のため未実施。実配送・実決済・実機は未検証。

## 2026-10-07 顧客QAレビュー是正（配備前）

PR964/965の追加10論点を独立mainベースで是正。契約、回帰、段階DB/Edge有効化、forward復旧は `docs/qa-review-closure-20261007.md`。CI/全レビューを確認してからstaging→本番へ反映する。現在は配備前。

- PR967のd738追加5指摘：旧キュー排他切替、宛先単位の不明結果保留、非更新actor認可とUID単位制限、他notice通知済みの完了判定、固定payloadとログ一致を是正。実SQL55、別PG接続ロック、実Auth/Edgeの31拒否・テンプレート変更・混合宛先回帰、完全DB再構築・verify成功。次headの全CI/独立レビュー待ち、今回の共有反映なし。

- PR967最新追加3指摘：他noticeの直近不明/期限切れ送信を別keyから保留、配布停止済み保有couponの利用維持、プロバイダー受理ログをDB ackより先に確定。実SQL59、実Auth/Edge ack障害・第二key送信停止、実Auth/DB配布停止後12適用/8解除を検証。最新CI/独立レビュー完了前に共有適用しない。

- PR967追加2指摘：非JSON拒否も確定失敗、同一公演/組織の顧客ID・正規化メール単位で通知保留と重複leaseを防止。内部service helperは非更新・end user公開権限なし。実SQL64、実Auth/Edge非JSON回復と重複2行1送信、別顧客の混合安全配送を確認。最新CI/レビュー前に共有適用しない。

追加レビュー3件を是正。通知は最古の優先順位を維持し最新登録の宛先へ送信、provider非2xxの拒否ackを結果確認付きで再試行、貸切は他メンバーを含む同予約全体でクーポン併用判定。SQL69件と隔離実Edge回帰を追加。

追加レビュー: 重複再登録の最新希望人数を空席適合とメールpayloadへ使用。最古の受付順位・固定配送keyは維持。1→4名で不足席の通知を抑止し待機を保持、席増加後に4名として1通送る回帰を検証。

追加レビュー: claim時点の待機行ID集合を私有配送行へ記録し、固定payloadの再試行中も保持。配送ackはその集合だけを通知済みにし、送信開始後の4名再登録はwaitingに残す。追加列はuuid配列、外部キーや顧客公開権限を追加しない。

追加レビュー: claim内の集合保存後に新しい登録が入っても、entryの宛先・人数は保存済みID集合からだけ取得。lease更新後の再登録を強制する隔離トリガーで旧1席→新4名誤通知を修正前再現し、同じ窓で修正後は旧1名宛先・新4名waiting保持を検証。

PR967最新追加レビューを判定。4207396828は確定貸切メンバーDELETE前にprivateなtriggerでクーポンusage・回数・予約請求を復元、本人退出/主催者削除を実Postgres認証RPCでROLLBACK検証し他メンバー割引を保持。SQL76・完全構造再構築・verify。4207396837の通知人数上限提案は15d7577efe（2026-02-16）の明示的一斉通知仕様に反するため採用せず、実Edgeで1席/4宛先全員通知・再実行0通を確認。冒頭の古い順番待ちコメントだけ仕様に合わせる。新規waiting行は既存cohort ackの対象外、通知は席確保を保証しない。今回の共有適用0、最新CI/独立レビュー確認後に承認済み段階反映へ進む。
顧客QAの先行反映単位（DB/Edge変更なし）。複数customer行でも予約・貸切申込の連絡先更新がmaybeSingleで中断しないよう、本人の既存行を安定選択。体験済み履歴は本人の全顧客IDを集約し、再登録時の未体験override解除と手動履歴追加を順序付け、同tick二重操作を抑止。既存認証付き履歴RPCだけを使用。通常予約・貸切申込の保存/通知契約は変更なし。PR967の通知/クーポン/予約retry DB依存群は別単位として保留。単体1740/247files、verify成功。stagingと本番の反映後は読取検証のみ、実予約・送信なし。

2026-10-08追加独立指摘：通常use_customer_couponは最新請求更新を維持し同一usage再試行は更新0。staff restoreは通常/貸切の請求とmember割引・回数を同じTXで復元し再試行false。主催者削除/本人退出はG→identity→CID→coupon→memberの順で確定と揃えた。実PG staff restore/leave/removeと4対並行確定/削除、同一UID別CID coupon競合PASS。評価は旧メール依存RLSの読取隠蔽/直接DELETE0を再現し、本人UID照合のcustomer_rating_actionに変更、他人42501拒否/本人read更新解除PASS、全ROLLBACK。RLS変更なし、認証ユーザー限定EXECUTE。既存prepare03に追加、全SQL123チェック・単体1759/250files・verify成功。先行970から外した顧客identity/profile変更はこの後続群に保持。共有適用/本番追加0、最新CIと独立全レビューを確認後だけ段階反映。

追加4209569683：旧useの履歴だけ存在する利用を取消した際の請求過加算を防止。新通常/貸切/予約時使用は私有coupon_usage_billing_appliedへ実反映額を同TX記録し、復元はその額だけ。旧履歴で請求未控除（discount0/final>=total）と確定できる場合は請求更新0で回数/履歴を復元。反映不明/他割引あり/台帳不整合はP0061で全変更を拒否し要確認を明示、旧データを推測で一括補正しない。この既存usageの手動請求確認は未実施。私有台帳はRLS有効/全end-user/service直接権限0。隔離実PGの未控除復元/曖昧拒否/新staff貸切復元と132実SQL合格、全ROLLBACK。共有DB未適用。

追加4209768024：旧請求discount/final/totalのNULLと予約欠落は補完せずP0061で保留。3NULL各ケースのusage/回数不変を141実SQL・実PG全ROLLBACKで検証。最新CI/独立レビュー待ち、共有DB未適用。

全件回収補正：4209767994/4209872227は通常couponも実final_priceで控除を上限制限し、usage/請求/台帳を同額へ。残額500/coupon1000の実PG取消後500保持・150実SQLを検証。4209768002はstaff APIでP0061を409/確認message/requires_reviewとして返す。4209768018は代表profileの非NULLだけ保持し既存アバター/住所/LINE/通知optout/ニックネームをNULLで消さない。4209872239はremove coupon正本RPCへmigrationと同じidentity lockを同期し、正本再適用の関数body parityを確認。1761単体/250files合格。以前のreview全ページ取得後の表示を最後1件に絞り見落とした3件も全件分類へ補正、共有DB未適用。

## 2026-10-08 リリース競合の統合

mainの既反映履歴/本人切替/予約全体日時順を保持し、stagingの全本人CID評価RPCと最新評価優先を残して統合。履歴削除の実所有CIDと全本人CID予約の回帰も保持。

顧客QAの先行反映単位（DB/Edge変更なし、2026-10-08再分割）。体験済み履歴は本人の全顧客IDを集約し、再登録時の未体験override解除と手動履歴追加を順序付け、同tick二重操作を抑止。手動履歴の日付変更/削除は実所有IDを使用。予約一覧は全本人IDを集約後に日時降順、認証切替は以前の本人ID/履歴を破棄。既存認証付き履歴RPCのみ使用。顧客identity/email/profile保持と評価の変更は本番main6fの実装へ戻し、本人UID評価RPCが必要なPR967のDB依存群へ分離したため、この単位で解決済みとしない。通常予約・貸切申込の保存/通知契約は変更なし。単体1746/248files、verify、架空API/Authの隔離ブラウザ19件成功。共有環境は読取検証のみ、実予約・送信なし。

### 2026-10-08 通知監査の追加レビュー4点
- 4213950285: 送信前監査失敗をfinish RPCの既知未送信protocolで解放し、誤って不確定配送にしない。
- 4213950293/4213950300: queued・provider未受理failedだけをsentに更新して古い拒否エラーを消す。先行Webhookの状態・詳細を保持。
- 4213950306: 監査行の読取・成功/失敗更新をorganization_idで限定し、固定タグが他組織を指す場合に送信しない。
- 実handlerの外部送信fake回帰15件通過。DBerror/throw/missing、拒否復旧、先行Webhook5状態、他組織監査ID、同一本文・同一idempotency・配送確定順を検証。

### 2026-10-08 最新レビューの履歴・本人評価修正
- 4214162504: 店舗却下候補はシート/日程タブとも削除非表示。0804/RPC正本で却下済み未取り下げ候補を22023拒否し、既存取り下げの再送成功は維持。
- 4214162509: 本人UID全CIDの評価を作品ごと最新1件へ集約（更新日時null最後・CIDで同時刻決定）。複数CID/別UID拒否/解除・実PG rollbackとPGlite226チェックで確認。
- 4214162499: 正規schemaのwithdrawn_atはstage正本に存在し、画面先行PRのDB変更は分離済み。
- 4214162514: 固定payload/キーを23h以内で安全に再試行、期限後に手動確認。Resend公式24h冪等性契約と12並列sink受付1件の証拠があるため、全面的な再リース停止は不採用。
- 通知Edge最新版はstage notify75/worker68、prod149/132。未認証GET405/401、本番人工通知・実顧客QA変更なし。

### 2026-10-08 候補削除の画面先行反映
- 日程シートとPC「他N件」の日程タブに主催者・申込前限定の二段階削除。店舗却下済候補は履歴として保持し、取り下げ操作を非表示。
- この先行リリースはfrontend srcのみ。削除RPC/0802/管理サマリー0803はstaging PR975と本番DBに先行適用済み。DB正本・スキーマ・通知監査の追加修正は全体stagingリリースで継続。
- 最新1756unit/verify、架空API実配信6+4ケース、専用実PG権限・履歴・サマリー除外・rollback検証成功。本番実顧客データのQA操作なし。

## QW-20261008-002 / 貸切キャンセルの追加通知先

- 既存担当GM通知に加え、組織の notification_settings.private_cancellation_channel_id に登録したDiscordチャンネルへ1件作成する。GM未登録でも組織通知は作成し、同じチャンネルがGM宛に含まれる場合は二重作成しない。
- 既存の公演/予約トリガーと同じ永続キュー・世代・重複キーを使い、復活時の旧通知無効化を維持する。追加先は配送時も同じ組織の設定と照合し、メンションなしで送る。
- 回帰：GM+追加先、再実行の重複防止、GMなし、他組織、同一通知先、rollback/reapply、実配送helperの架空通信試験。実予約のキャンセルや試験Discord投稿は行わない。

## 2026-10-11 お客様点検の小さな不具合 9 件（fix/audit-quick-wins）

点検報告書「脱落ポイント点検_2026-10-11」の番号で記録。
- #13 予約完了画面の合計金額に「¥」。#37 人数変更は「最大N名まで変更できます（いまの予約はM名）」に。
- #8 プロフィール登録画面のログアウトは signOut を最大1.5秒だけ待ってトップへ移る（`completeProfile/signOutAndGoHome.ts`）。
- #26 登録完了画面は実際の移動先と秒数を表示（`completeProfile/successRedirect.ts`、2秒・クーポン／トップ／元の画面）。ボタンも同じ移動先へ。
- #27 招待が無効な時は用意済みの文＋「主催者に新しい招待リンクを」案内。#49 参加完了文をグループの進み具合（`privateGroupProgress`）で出し分け。#59 会員にはマイページ貸切タブの案内、ゲストは従来のブックマーク案内。
- #47 migration 20261011150000（rollback 同名）で「予約が確定しました」ベル本文に開催日時。staging 適用済み・rollback 付きトランザクションで本文確認。structure（staging.json・期待 body_md5）更新。本番未適用。
- #6 FAQ の本文は Queens Waltz 組織の `common_faq_items`（DB、設定＞FAQ で編集）が既定文面より優先される。誤字・「前月10日ごろ」・「日付」・「表示がございます」は DB 側の文で、コードには無い。コードの既定文面は実態に合わせて修正し、回答の改行も表示するようにした。画面の文を直すには設定＞FAQ での修正（本番データの変更）が必要。
# 2026-10-12 / 貸切受付入口の staging 同期

- main #1073・#1077の休業・営業時間・募集停止・占有判定を、現在のstagingのカレンダー・リストへ復元。店舗名・チップ・画像比率・過去日の見た目と、作品選択後のDB候補判定を維持。
- 組織IDをClassicViewsの包みから渡し、「すべて」のリストは全表示店を取得。取得失敗は受付を閉じ、クリック時は受付可能店だけを渡す。DB・Edge変更なし。本番公開は別途検証・承認。
- 検証結果はPRに記載。


## main 側の記録（2026-10-12 同期時に見出しのみ転記）
- QW-20261011-002 / 作品の予約サイト公開状態を見やすくする
- QW-20261011-003 / 公開状態欄の承認文字を整理
- QW-20261012-001 / 公開スケジュールと貸切受付の連動

## QW-20261011-001 / 参加者手動追加の権限チェック循環

- 本番の参加者INSERTが42P17で失敗。reservationsのINSERT判定→schedule_eventsのSELECT判定→reservationsへの参照が循環する。マスタ引用作品にも発生し、作品マスタの不整合ではない。
- 手動追加・保存後の保留参加者・デモ追加の共通APIを、認証と対象組織の業務権限を確認するadd_manual_reservationsへ変更。RLSは変更しない。公演の組織・店舗・日時・マスタIDはDBで確定し、顧客の別組織流用を拒否する。従来の管理者手入力の料金・人数の扱いは保持する。
- 外部通信なしのPostgreSQLで同じ循環を再現、スタッフ/顧客/デモ保存と読み戻し・人数集計・未認証/顧客権限/別組織/不正入力/中止/バッチ失敗の拒否・rollback/再適用を検証。API経路の回帰2件、verify成功。本番の実予約を試験追加しない。
- main向け #1045 を 2026-10-12 に staging へ載せ直し。migration は 20261012130000_operator_add_participants（rollback 同名）に改名し staging 適用済み。本番は DB 先行で適用してからリリース。DB先行適用と本番反映の実施状況は案件台帳・PRで確認する。

### 2026-10-13 高負荷対策の競合と接続占有の追加修正

- #1104 反映後のmainを基点に、待機して古い要求を後送する再送制御を即時拒否へ変更。同じ操作の同時送信は1件、失敗制限はlocalStorageとWeb Locksでタブ間・リロード後も共有。本文・認証情報は保存しない。Web Locks非対応/保存不可時は同一タブ制限へ縮退する。
- スタッフ保存APIはRPC開始前に枠を確保、例外を含むfinallyで解放。DBは同じユーザー/公演の並列保存をpg_try_advisory_xact_lockで即時拒否し、Vercel別インスタンス間の競合も拒否。失敗回数のAPIカウンタ自体はインスタンス内の補助策。
- 本番/stagingの現行4関数の定義hash一致を読取確認し、`20261013130001_release_retry_concurrency_no_sleep.sql`でpg_sleep(2)を除去。無効候補のスキップ、認可、予約・料金処理を保持。テーブル/RLS/実顧客データは変更しない。rollbackは適用直前定義4件の復元、予約・回答を保持する。
- 架空PGlite貸切/スタッフ保存回帰、network-none PostgreSQL17の2接続競合・成功・古いexpected拒否・anon拒否・rollback/reapply、外部通信を拒否する実Chromium2タブ/リロード/新旧回答試験を実施。全単体1874件・verify通過。main更新後に必要なゲートを再確認して限定PRを反映する。
- 事前読取計測: 10:57:56〜11:00:19 UTCのrollback増加77（約0.54/秒）。今回の計測で700/秒の継続は未確認。CPUとユーザー体感は別途計測し、rollback頻度だけで完全回復を断定しない。
- DB先行適用完了: staging/prodへ20261013130001の1本だけを既存npm手順で適用。staging既適用745件/prod726件・未適用なし。4関数のsleepなし/既存ACL保持/本文hash一致をread確認。実DBsnapshot更新は4関数と取得metadataだけ（他の構造変更なし）。本番負荷試験・顧客保存・外部連絡は行っていない。
- 追加実測で11:13〜11:15 UTCにスタッフRPCの40001が約85〜100/秒となり、本番4関数へ別経路でsleepが再導入された。差分はsleep/commentのみ（追加済みadvisory lockは維持）。旧直接RPC利用者がAPI/新画面の制限を通らず、古いexpectedを即再送することをログの例外行で特定。
- 130002の互換修正: スタッフ参加/担当の古いexpectedは保存前にsuccess:false・code:40001・最新snapshotを返す。SQL例外を繰り返す旧クライアントを止め、現行APIは409へ変換し未保存を伝える。認可/入力/予約/料金の拒否は維持。4関数の現行止血版と130001版を事前hash照合し、未確認の別変更は拒否。rollbackは今回の適用直前の止血版4関数。
- 互換修正を含む全単体1875件・verify・架空DBのデータ不変/競合/成功/権限/rollback回帰通過。130002のみをstaging→prodに限定適用して追加計測する。
- 130002をstaging/prodに限定適用し、本番727件/未適用なし、4関数sleepなし・ACL保持を再read確認。スタッフRPC本文hashは560ca354cb5989fe0bae21630753cc7dでstage/prod一致。11:25 UTC: 接続23、対象sleep待機0、lock待機0。CPU画面は再ログインが必要だったため認証変更せず、CPU値は未確認。
- 最終回帰は1876単体・verify。汎用APIは既存どおり本文の異なる独立保存を別キーとし、日程回答は明示的な操作単位のキーで新旧/複数タブを保護する。

## 2026-10-22 hotfix: 公開リストの作品画像が細長く切り抜かれる（社長報告「KVがバグってる」）

- 症状: 公開トップのリスト（375px）で作品画像が 28px 幅の枠に入り、カードの高さに合わせて縦に引き伸ばされていた（`self-stretch`）。残席の「開催決定」「残少」が折り返してカードが高くなると、枠が 28×84 などの細い短冊になり、画像が中央の細い帯だけに切り抜かれる。通常の高さでも 28×45（約 0.62）で、作品画像（多くは 3:4 前後、例 1450×2048）の左右が切れていた。
- 修正（ListView のみ）: 枠を作品画像と同じ 3:4 の固定枠（スマホ 32×43、PC 46×61）にし、`self-start` でカードの高さに引き伸ばさない。画像部品 KeyVisualThumb は変更なし（縦長・正方形は中央基準で切り抜き、横長は全体表示）。カードの高さは修正前と同じ（手元の計測で 375px: 49/49/88px、PC はわずかに低くなる程度）。
- カレンダー（CalendarView、PC のみ画像あり）も `w-7 self-stretch` の同じ形だが、今回は触っていない。
- 検証: 手元の再現用 DB（local-repro）に架空の作品 3 件（縦長 1450×2048・横長 1600×900・正方形）と 11/2 の公演を入れ、375px と 1280px で修正前後を撮影。単体テスト `ListView.thumb.test.tsx`。iPhone 実機は未確認。
