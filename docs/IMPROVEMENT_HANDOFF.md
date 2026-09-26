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

## QW-20260917-001 / 中止公演の募集終了同期（2026-09-27）

- 中止確定と同一トランザクションで、同じ組織・公演の募集中deadlineをcancelled、未送信の追加募集通知をexpiredへ同期する。送信済み履歴・予約・公演内容を保持する。中止解除で募集を自動再開しない。
- migration 20260927014000をstaging・本番へ適用し、本番の既存4件を補正。中止公演のactive募集・未送信追加募集通知は各0件。
- PGliteで既存補正・中止時同期・組織境界・送信履歴保持・中止解除・復元再適用を検証。実stagingでも復元→再適用→ROLLBACK成功。verify成功。全体案件は継続中。
