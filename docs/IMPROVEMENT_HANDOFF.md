# MMQ 全体改善 指示書（Codex 引き継ぎ用）

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
   - **React Query**: グローバル既定が `refetchOnMount:false`＋`staleTime:5分`（`src/AppRoot.tsx:41-55`）。mutation 後に**別画面**のリストを更新するときは `invalidateQueries({queryKey, refetchType:'all'})` を必ず付ける。
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

### - [ ] B7: 公演モーダルの初期化完了前に保存できてしまうレースの恒久修正 🔍（根本原因特定済み 2026-07-02）
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
- [ ] **D-5c: native confirm/alert/prompt 47箇所の段階置換**（1画面系統=1コミット・各コミット🔍）。優先順:
  1. **モーダルの上に OS ダイアログが重なる箇所**（最も目立つ）: EditPlayHistoryDialog.tsx:209 / StoreEditModal.tsx:744 / ContractMaster.tsx:258
  2. **顧客向け画面**: MyPage SettingsPage.tsx:400（アカウント削除）/ CouponsPage.tsx:79 / MyPage/index.tsx:278（手動プレイ履歴の重複確認・昨日追加分）/ PrivateGroupInvite/index.tsx:928,1273 / GroupChatSheets.tsx:566,605 / GroupInviteView.tsx:990 / GroupChat.tsx:1165,1308
  3. **管理画面の残り**: ScheduleModals.tsx:423,442 は window.prompt（臨時会場名入力）なので入力 Dialog 化 / ScheduleManager/index.tsx:298,639,659 / useBookingApproval.ts:648 ほか
- [ ] **D-5d: 2ステップ原則違反の是正**（破壊的操作が素の confirm 1回で実行できてしまう）: アカウント削除（SettingsPage:400・不可逆）/ 貸切グループ削除（GroupChatSheets:566・メンバー/候補日/メッセージ全削除）/ 店舗削除（StoreEditModal:744）/ 期間一括満席化（ScheduleManager/index.tsx:298・対象公演数が可変）→ 影響件数を表示する 2ステップ型 or ConfirmDialog(destructive)＋影響サマリー表示に。D-5c と同一コミットで良い。
- [ ] **D-5e: alert() のエラー通知3箇所** → `showToast.error` に（CouponsPage.tsx:79 / useBookingApproval.ts:731 / StoreEditModal.tsx:147）。トーストは showToast(sonner) で既に統一されているのでそれに乗る。
- [ ] **D-5f（低優先）**: 影響ゼロ・可逆操作の confirm 除去（BasicInfoSectionV2.tsx:135 キービジュアル削除=フォーム state を消すだけ / CharactersSectionV2.tsx:97 キャラクター行削除）。
- [ ] **D-5g（新規モーダルのみ・既存は触らない）**: サイズ指定を size プロップへ寄せる規約の運用開始。既存86箇所の一括変換は**やらない**（見た目が変わるため、D-2 の各ページ改装バッチ内で個別に）。
- ❌ **やらないこと**: 未保存警告（ダーティチェック）の追加。全モーダル未実装だが挙動追加になるためオーナーが明示的に依頼するまで着手しない。🔒公演モーダルには一切触らない。
🔍 置換した画面ごとに「どの操作でどの確認ダイアログが出るか」を報告して実機確認（キャンセル/実行の挙動が変わっていないこと）。

---

## 6. フェーズP: 性能改善（オーナー重点②）

### - [ ] P1: 顧客管理ページのデータ層改修 🔍（最大の体感改善・**UIの見た目は変えない**）
現状: `useCustomerData.ts` が全顧客(1000件ずつ直列)→全予約(100件チャンク直列二重ループ)→全クーポン(同)をDLしてクライアント集計。顧客5,000人なら**約105回の直列クエリ**。さらに全件を仮想化なしで map 描画。
改修（DB→フロントの順）:
1. **サーバ集計 RPC**: `get_org_customers` 拡張 or 新 RPC `get_org_customers_with_stats(p_search, p_sort, p_limit, p_offset)` → 顧客ごとの reservation_count / total_spent / last_visit / visit_count / クーポン残 と `total_count` を返す。org スコープはサーバ側で強制（`api/customers.ts` 経由・requireStaff）。**現行のクライアント集計と同じ数字になること**（platform 顧客 org NULL の扱い含め、現 useCustomerData のフィルタ条件を移植）。
2. **フロント**: 50件/頁のサーバページング＋サーバ検索に置換（先例: `src/hooks/useReservationData.ts:93-104` と EmailLogsSettings）。行展開時の個別 fetch（メモ/クーポン/体験済み）は現状のまま。
3. **UI は現状レイアウトを踏襲**（データ取得層の差し替え＋ページャ追加のみ。ページの見た目再設計は Claude 担当の ADMIN_UI_REDESIGN_PLAN で後日行うため、ここではやらない）。
🔍 顧客管理ページ: 初期表示が速い/検索/ページング/行展開（メモ・クーポン・体験済み操作）/集計値が改修前と一致。

### - [ ] P2: 予約統計の 1000 行キャップ（正確性バグの疑い）
`src/hooks/useReservationStats.ts:38-46` が range/limit 無しの全件 SELECT → PostgREST 既定 max-rows(1000) で**黙って切り捨て**られ、予約1000件超の組織では統計が過少表示の可能性。`count:'exact', head:true` の count クエリ複数本 or 集計 RPC に置換。

### - [ ] P3: 売上・年間分析のサーバ集計化
`src/pages/SalesManagement/hooks/useAnnualAnalysis.ts:53-103` が 2022年以降の全公演＋全予約をクライアント DL。他タブ同様 `/api/sales` に `type='annual-analysis'` を追加してサーバ集計に。

### - [ ] P5: AdminDashboard チャンクのハブ化解消（顧客ページが管理画面コードを DL している）
実測: `AdminDashboard-*.js`（125.5kB）を **82 チャンクが静的 import**。PublicLayout / ReservationDetailPage（顧客ページ）まで依存し、date-fns ごと全ページに配られている。ルート lazy 化自体は良好（eager ページ import 0）なので、原因は共有ユーティリティが AdminDashboard チャンクに同居していること。
1. `vite.config.ts:44-54` の manualChunks を修正（`vendor-react` 指定が機能せず **33バイトの空チャンク**になっている点も直す）。date-fns / 共有 utils を独立チャンクへ。
2. ビルド後 `dist/assets` で `grep -l "AdminDashboard-" *.js` が顧客系チャンク（PublicLayout 等）から消えることを検収。before/after の初期ロード gzip 合計を報告（現状 約235kB gzip + CSS 126kB）。

### - [ ] P6: 画像最適化の復活 🔍（顧客ページの体感に直結）
`src/utils/imageUtils.ts:40-46` の `getOptimizedImageUrl` が **no-op**（過去 d73de23d で実装→b8d420d0「画像が読み込めなくなる」で撤去）。現在キービジュアル等は**アップロード原寸**を常時配信、srcSet 20行も実質無効。
1. まず Supabase Storage の画像変換（`/storage/v1/render/image/public/...?width=&quality=`）が**現プランで有効か URL 1本を curl で確認**（b8d420d0 の退行原因の切り分け）。
2. 有効なら: storage URL のみ変換対象＋`onError` で原寸フォールバック付きで再実装。`ui/optimized-image.tsx` と ScenarioCard から適用。無効なら: アップロード時サムネイル生成が必要になるため**設計をオーナーに相談**（勝手に進めない）。
🔍 予約トップ・シナリオ詳細で画像が全て表示される＋ DevTools Network で転送サイズ縮小を確認。

### - [ ] P7: リスト全行再レンダーの解消（リファクタ本線と同ファイルを触るため要調整）
1. `src/hooks/useEventOperations.ts`（useCallback 0箇所）のハンドラ束を useCallback 化 → PerformanceCard / TimeSlotCell の既存 React.memo が効くようになる（現在無効化されている）。
2. CustomerRow は P1 改修に内包。ReservationRow（親 ReservationList.tsx:404-415 が配列全体＋setState を全行に直渡し）は行 props を最小化＋memo。
⚠ ScheduleManager / 予約者タブはリファクタ本線（docs/REFACTORING_PLAN.md Phase 5/6）の対象。**着手前にオーナーへ作業順を確認**。

### - [ ] P8: jszip を dynamic import に
`src/pages/ScheduleManager/utils/exportSchedule.ts:2` の静的 import が ScheduleManager チャンク（205kB）に同梱。exceljs / html2canvas と同じ `await import('jszip')` 方式に。

### - [ ] P4: invalidate ヘルパーの導入
invalidateQueries 60箇所中 `refetchType:'all'` は1箇所のみ（既定 refetchOnMount:false のため非アクティブ画面に伝播しない）。`src/lib/queryInvalidation.ts` に `invalidateEverywhere(queryClient, keys)` ヘルパーを作り、**まず新規コードから**使用。既存60箇所の一括置換は挙動変更を伴うためやらない（個別バグ対応時に置換）。

---

## 7. フェーズM: メンテ・掃除台帳（優先度低・随時）

| # | 内容 | 備考 |
|---|---|---|
| M1 | docs/REFACTORING_PLAN.md のクローズ反映 | オーナー実機確認済み（2026-07-02）: 5-1 KitManagementDialog / 4-6 AuthContext / 5-4バッチ2 / 6-3 MyPage → チェックボックスを閉じる。2026-02 の旧チェックリスト群（SECURITY_AUDIT_TODO.md 等）は docs/archive/ へ移動 |
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

**リファクタ本線**（docs/REFACTORING_PLAN.md: GroupChatSheets/GroupInviteView サブ分割 → 親フック化 → 5-4 PerformanceModal）は別トラック。担当をオーナーが決めるまで**このリストからは着手しない**。着手する場合は byte 逐語・1スライス毎実機の規律（同文書冒頭）を厳守。

---

## 8. 検収基準（全タスク共通）

1. `npx tsc --noEmit` / `npm run lint` / `npm run build:fast` / `npm run test:unit` すべて green。
2. コミットメッセージは既存の慣習（`fix(mypage): …` / `refactor(schedule): …` 形式・日本語）に合わせる。
3. 🔍 タスクは push 後に確認手順を報告して停止。オーナー OK 後に次へ。
4. DB タスクは SQL 提示→承認→staging 適用→確認クエリ報告→prod はオーナー判断。
5. この文書のチェックボックス更新を忘れない（進捗の唯一の記録）。
