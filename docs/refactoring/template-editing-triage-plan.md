# テンプレ編集の交通整理プラン（引き継ぎ）

作成: 2026-06-13 / 更新: 2026-06-13 / ブランチ: staging / 状態: **基盤（台帳＋ダイアログ）実装済み・ボタン配線は1箇所完了/残り**

## 背景・目的（オーナー要望）

メール文面・キャンセル理由などの定型文は、設定画面（メール設定／キャンセル設定）で
店舗ごとに一律編集できる。しかし **「どの画面のどのテンプレを編集しているか」が直感的でなく、
設定を間違える事故が多い**。そこで:

1. テンプレを**使う場所の近くに「テンプレートを編集」ボタン＋編集ダイアログ**を置き、
   その画面が実際に使うテンプレをその場で開けるようにする（編集ミスを構造的に防ぐ）。
2. 設定画面のテンプレ名・並びを「いつ・誰起点で送られるか」が分かるよう交通整理する。

**この作業のあと、リファクタリング（Phase 4-3 の続き、REFACTORING_PLAN.md）に戻る。**

## 確定済みの前提（オーナーと合意）

- ボタンから編集しても設定画面から編集しても、**同じ DB の1か所**（店舗ごと
  `email_settings` の該当カラム）を読み書きするので二重管理にならない。設定画面の
  リストにもそのまま反映される（双方向）。
- ボタン設置は3か所では足りない。**設定のテンプレリストの数（14個）だけ設置箇所がある**
  想定。ただし半分は「自動送信」でスタッフ操作の画面の瞬間が無い（下表参照）。

## 設計方針（共通部品方式）

1. ✅**済** **テンプレ台帳** `src/lib/templateRegistry.ts`。13テンプレ各々の
   `key(= email_settings の列名) / 表示名 / 送信タイミング説明 / カテゴリ /
   使える差し込み変数 / デフォルト文面` を一元管理。`getTemplateConfig(key)` /
   `getTemplateVariables(config)` を提供。設定画面（EmailSettings.tsx）も
   ここを参照するようリファクタ済み（変数説明・デフォルト文面・TEMPLATE_CONFIGS を移管）。
2. ✅**済** **共通編集ダイアログ** `src/components/settings/TemplateEditDialog.tsx`。
   key と storeId を渡すと「送信タイミング: ◯◯」の説明＋使える変数一覧＋本文編集＋保存。
   保存先は設定画面と同じ `email_settings` の該当列（双方向）。`onSaved` で呼び出し元に反映可。
3. ⏳**残** 各画面の「テンプレートを編集」ボタンは台帳の key を渡して上記を開くだけ。
   → 将来「ここにも」が出たら数行で追加できる。**承認パネルの確定メール（private_confirm）は配線済み。**
4. 既存資産: メール本文生成は `src/lib/cancellationEmail.ts`（2026-06-13作成、
   `buildCancellationEmailBody` + `fetchStoreCancellationEmailContext`）に共通化済み。

### ⚠️ ボタン配線時の注意（storeId の文脈）

`TemplateEditDialog` は **storeId を1つ**受け取って `email_settings`（店舗ごと1行）を読み書きする。
そのため、ボタンを置く画面で**「どの店舗の設定か」が一意に決まる**必要がある。
- 承認パネル: `selectedStoreId` が確定している（承認ボタンも store 必須）→ 配線済み・問題なし。
- 却下ダイアログ: 配線済み。送信側（useBookingApproval）が `reservation.store_id` の
  `private_rejection_template` を使うので、ボタンも開く時に `reservations.store_id` を引いて
  **送信側と同じ店舗**を編集対象にした（store_id が無い予約はトーストで弾く）。
- 自動送信組（予約確認・リマインド等）は予約/公演に紐づく確定店舗があるので一意。

## 13テンプレの設置マップ（email_settings、すべて店舗スコープ）

| カラム | 表示名 | 送られるタイミング | ボタン設置場所（案） | 配線 |
|---|---|---|---|---|
| private_confirm_template | 貸切予約確定メール | 貸切を承認した時 | 貸切管理の承認パネル（店舗セレクタ直下） | ✅済 |
| private_rejection_template | 貸切リクエスト却下メール | 却下ボタンを押した時 | 貸切管理の却下ダイアログ（理由ラベル横） | ✅済 |
| store_cancellation_template | 予約者タブキャンセルメール | 予約者タブから予約をキャンセルした時 | 予約者タブのキャンセルダイアログ | ✅済 |
| reservation_confirmation_template | 予約確認メール | 客が予約完了（自動） | 公演モーダルの予約者タブ | ✅済 |
| booking_change_template | 予約変更確認メール | 予約内容を変更した時 | 公演モーダルの予約者タブ | ✅済 |
| private_request_template | 貸切リクエスト受付メール | 客が申込（自動） | 貸切管理（カード一覧上部） | ✅済 |
| event_cancellation_template | 公演中止メール | 手動中止・削除時に予約者へ送る | 削除/中止ダイアログ(2/2)・公演モーダルの予約者タブ | ✅済 |
| cancellation_template | お客様キャンセル確認メール | **客が自分で**キャンセル（自動） | 公演モーダルの予約者タブ | ✅済 |
| reminder_template | リマインドメール | 前日など自動 | 公演モーダルの予約者タブ | ✅済 |
| waitlist_notify_template | キャンセル待ち通知メール | 自動 | 公演モーダルの予約者タブ | ✅済 |
| waitlist_registration_template | キャンセル待ち登録完了メール | 自動 | 公演モーダルの予約者タブ | ✅済 |
| performance_cancellation_template | 人数未達中止メール | 前日の自動判定 | 公演モーダルの予約者タブ | ✅済 |
| performance_extension_template | 募集延長メール | 前日の自動判定 | 公演モーダルの予約者タブ | ✅済 |

※ 自動送信組もオーナー指示で操作画面から開けるようにした。送信直前の専用ダイアログが無いものは、
その機能を扱う管理画面（公演モーダルの予約者タブ / 貸切管理）に「関連テンプレ」として置く。

※ `private_cancellation_template`（貸切キャンセル確認メール）は **2026-06-13 に削除**（下記）。

## ✅ 決定済み: `private_cancellation_template` は削除

**「貸切キャンセル確認メール」(`private_cancellation_template`) は宙に浮いていた。**
2026-06-13 確認: 設定画面で編集できるのに、**どのメール送信関数も参照していなかった**
（型定義・SELECT にあるだけ）。実際に貸切をキャンセルした時に送られるのは
`cancellation_template` / `store_cancellation_template`。

→ **オーナー判断: ①隠す ではなく「使ってないなら消す」（リファクタの方針）= 削除。**
コードからの参照は全削除済み（EmailSettings.tsx の UI・型・SELECT・デフォルト文面関数、
organization-settings.ts の型・SELECT 2箇所）。コミット `94de990c`。

### ⏳ 残: DBカラム `email_settings.private_cancellation_template` の DROP

コードからは消えたが **DBカラムはまだ残っている**。DROP は破壊的なので順序に注意:
1. 上記コード変更を **staging→本番までデプロイ**（現状デプロイ済みコードはまだこの列を SELECT する）。
2. デプロイ完了後に `ALTER TABLE email_settings DROP COLUMN private_cancellation_template;`
   を staging→prod の順で適用（`npm run db:push:*` ではなく直接 SQL でOK）。
   ※デプロイ前に DROP すると現行コードの SELECT が落ちるので厳禁。

## 🔁 構造課題: 「テンプレ ≠ 実際に送られる全文」（2026-06-13 オーナー指摘）

却下メールは **テンプレ `private_rejection_template` の `{rejection_reason}` に、却下ダイアログで
打った文章を差し込む** 方式だった（[send-private-booking-rejection/index.ts](../../supabase/functions/send-private-booking-rejection/index.ts)）。
管理者は送信時に「理由フラグメント」しか見えず、テンプレ側の定型セクションと内容が重複しても
全文を把握できなかった（既定理由がフルの丁寧文で「今後のご検討」バレットと二重化していた）。

→ **方針（オーナー決定）: 却下をキャンセルと同じ「全文編集」方式に統一＋ダイアログに全文プレビュー。**
- キャンセルメールは既に `customEmailBody` で全文を編集→そのまま送信していた（見たまま＝送られる文）。
  却下も同方式に揃えた。
- 却下ダイアログを開くと、テンプレ＋既定理由から**実際に送られる全文**を組み立てて表示・編集できる。
  その全文を `customEmailBody` で送信し、チャット共有本文も同じ全文を使う（再テンプレ化しない）。
- 既定理由を1文に短縮し、テンプレの定型文との重複を解消。
- `TemplateEditDialog` に「送信プレビュー（サンプル値）」を追加し、どのテンプレも“送られる全文”を確認可能に。

### ⚠️ デプロイ順
`send-private-booking-rejection` の `customEmailBody` 対応は**後方互換**（未指定時は従来テンプレ適用）。
フロントは `customEmailBody`＋フォールバック `rejectionReason` の両方を送るので、Edge Function が
未更新でも壊れない。とはいえ理想は Edge Function → フロントの順でデプロイ。

### ✅ 確定・修正済み: 却下時の二重送信＋スタッフ中止/削除の客都合メール（2026-06-13 精査）
**観測は事実だった。** 却下フローは `reservationApi.cancel`（→ `send-cancellation-confirmation`）と
`send-private-booking-rejection` の両方を呼び、お客様にキャンセル確認メールと却下メールの**2通**が
届いていた（別 Edge Function なので idempotency キーでは重複排除されない）。さらに貸切リクエストは
却下時点で schedule_event 未作成のため、1通目は `店舗不明`・日時なし・`cancelledBy:'customer'`（客都合風）の
崩れた文面だった。**この二重送信は今回のPRより前から存在する既存挙動**（`reservationApi.cancel` の
呼び出しは `c670f103`/`d1a6db90` 以前から。今回は理由文字列を変えただけ）。よってデプロイAを先に出しても悪化はしない。

派生で `cancelledBy:'customer'` が全呼び出し元で固定されていたため、**スタッフ起点の公演中止/削除でも
お客様に「予約キャンセル（客都合）」の件名・文面が届いていた**（本文を全文編集した場合は件名のみズレ、
未編集なら本文の枠ごとズレる）。`cancelWithLock` 経路（予約者タブ等）はメール送信しないので影響外。

**対応（2コミット）:**
- `73ce0571` `reservationApi.cancel` に `skipCancellationEmail` を追加し、却下フローから `true`。
  キャンセル確認メールの invoke だけ抑止（DBキャンセル・在庫返却・キャンセル待ち通知は維持）→ 却下メール1通だけに。
- `1e4f282f` `reservationApi.cancel` に `cancelledBy` を追加（既定 `'customer'`）。中止（useEventCancel）・
  削除（useEventDelete）から `'store'` を渡し、公演中止系の件名・文面に。MyPage の顧客自身のキャンセルは既定維持。

※ いずれも**純フロント変更**。`send-cancellation-confirmation` は既に `cancelledBy`/`customEmailBody` 対応済みで
新規DB変更・新規 Edge Function なし → デプロイ順序の追加制約なし（通常のフロントデプロイに乗る）。型/lint/build パス・staging push 済み。

## 変数の「出どころ」をその場で編集（2026-06-13 オーナー要望）

テンプレ編集画面の差し込み変数を、**設定で値を変えられるものはクリックでその場の編集モーダル**を
開けるようにした（設定ページに飛んでリストから探す手間をなくす）。
- `VariableHintChips`（共通）: 変数を青下線リンクで表示。クリックで `VariableSettingDialog` を開く。
- `VariableSettingDialog`（共通）: 会社情報(email_settings) / 却下既定理由(email_settings.private_rejection_reason) /
  キャンセル理由リスト(reservation_settings.organizer_cancel_reasons) をその場編集。store→org フォールバックで読み書き。
- 却下の既定理由は **メール設定 → 貸切予約関連メール**に編集欄を新設＋ `{rejection_reason}` から開ける。
- 送信プレビューは**実際の設定値**（会社情報・却下既定理由）で上書き表示。その場編集すると即反映。

## 実装ログ（staging, 2026-06-13）

- `94de990c` 未使用テンプレ `private_cancellation_template` を削除
- `33ff4790` テンプレ台帳 `src/lib/templateRegistry.ts` を抽出（EmailSettings から移管）
- `54c2daaa` 共通編集ダイアログ `TemplateEditDialog` を追加
- `a6b7bd92` 承認パネルに確定メール（private_confirm）のテンプレ編集ボタンを配線（第1弾）
- `17a2f60d` 却下ダイアログに「却下メールのテンプレを編集」ボタン（第2弾）
- `61df7131` 却下 Edge Function に `customEmailBody` 受け口（後方互換）
- `8611eae6` 却下メールを全文編集方式に統一（中核）
- `96ede0f4` TemplateEditDialog に送信プレビュー（サンプル値）
- `9224fc91` 却下テンプレを store_id 無しでも organization_id で解決
- `02aea4aa` 変数を「設定画面リンク付き」チップに（VariableHintChips）
- `24c67701` 変数リンクをアプリ内遷移＋青下線に
- `370db3de` 貸切却下メールの既定理由を設定で編集可能に（DB列追加・staging適用済み）
- `d7ea3806` 変数クリックでその場の編集モーダル（VariableSettingDialog・遷移廃止）
- `36051218` 送信プレビューに実際の設定値を反映＋その場編集で即反映
- `73ce0571` 却下時のキャンセル確認メール二重送信を抑止（skipCancellationEmail）
- `1e4f282f` スタッフ起点の中止・削除は店舗都合メールにする（cancelledBy:'store'）
- 2026-06-13 予約者タブのキャンセルメール本文ダイアログに `store_cancellation_template` 編集ボタンを配線
- 2026-06-13 中止/削除ダイアログのキャンセル理由欄に `organizer_cancel_reasons` の選択肢を配線
- 2026-06-13 中止/削除ダイアログのテンプレ編集ボタン整理（「公演中止メール」に一本化）

### 中止/削除ダイアログのテンプレ整合（2026-06-13、オーナー判断: 案A）

中止/削除ダイアログに「キャンセル操作メール / 公演中止メール」の編集ボタンが2つ
並んでおり、**「いまどちらが送られるのか」が判別不能**という指摘（オーナー、screenshot）。
コードを精査した結果、状態が矛盾していた:

- **件名**: Edge Function `send-cancellation-confirmation/index.ts:392` で
  `cancelledBy:'store'` のとき「【公演中止】〜」とハードコード。テンプレ無関係。
- **本文プレビュー**: `cancellationEmail.ts` の `fetchStoreCancellationEmailContext` が
  `store_cancellation_template` を読んで組み立てる（→ ダイアログで全文編集 → `customEmailBody` で送信）。
- **Edge Function の本文選択**: `customEmailBody` 優先。未指定時のみ
  `cancelledBy:'store'` で `event_cancellation_template` を参照（プレビューと食い違い）。

**修正方針（オーナー決定: 案A = 公演中止メールに統一）:**
- プレビュー本文の出元を `store_cancellation_template` → `event_cancellation_template` に切替
  （`fetchStoreCancellationEmailContext` に `templateKey` 引数を追加・既定は後方互換）
- 中止/削除ダイアログのボタンは「公演中止メールのテンプレを編集」**1個**に整理
- Edge Function 側は既に `cancelledBy:'store'` → `event_cancellation_template` を選択するので
  プレビュー・送信・件名のすべてが「公演中止メール」起源で一貫

⚠️ **挙動の変化（要周知）:** 既存組織が `store_cancellation_template` をカスタマイズしていた場合、
公演中止/削除ダイアログの**プレビュー初期値が変わる**（編集前に customEmailBody で全文上書きするので
送信そのものは従来から `customEmailBody` 経由で変えられたが、プレビューの源が変わる）。
お客様自身のキャンセル（お客様キャンセル確認メール）や予約者タブからのキャンセル（予約者タブキャンセルメール）は
引き続き `cancellation_template` / `store_cancellation_template` を使う。

※`1e4f282f` までは型チェック・lint・build パス済み。予約者タブ配線は typecheck / 変更ファイル単体 lint /
build パス済み。全体 lint は既存の別ファイルエラー（PerformanceModal / StaffProfile）で失敗。
未デプロイ（staging ブランチにコミット・push のみ）。

## 🚀 デプロイ時の必須作業（順序注意）

1. **DBマイグレーション（prod）**: `npm run db:push:prod` で
   `20260613000000_add_email_settings_private_rejection_reason.sql`（private_rejection_reason 列追加）を適用。
   ※staging は適用済み。フロントが参照するので**フロントより先に**。
2. **Edge Function**: `send-private-booking-rejection`（customEmailBody 対応）は後方互換なのでどちら先でも壊れないが理想は先。
3. **デプロイ後**: 未使用列 `email_settings.private_cancellation_template` を DROP（コードからは既に削除済み）。

## 次の一手（残作業）

1. **設定画面のラベル交通整理**（自動送信組）: テンプレ名に「いつ・誰起点で」を明記＋フロー別グループ化。
   台帳の `description` を充実させれば設定画面とダイアログ両方に効く。
2. **DBカラム DROP**（デプロイ後、上記参照）。
3. ~~**観測の精査**: 却下時のキャンセル確認メール二重送信の有無~~ → ✅完了（上記「確定・修正済み」参照、`73ce0571`/`1e4f282f`）。

## 関連ファイル

- 台帳: `src/lib/templateRegistry.ts`（13テンプレの key/表示名/タイミング/変数/デフォルト文面）
- 共通ダイアログ: `src/components/settings/TemplateEditDialog.tsx`
- 設定画面: `src/pages/Settings/pages/EmailSettings.tsx`（台帳を参照する13テンプレ編集UI）、
  `src/pages/Settings/pages/CancellationSettings.tsx`（キャンセルポリシー・料金）
- 配線済み例: `src/pages/PrivateBookingManagement/index.tsx`（承認パネルのボタン）
- 消費側の例: `src/lib/cancellationEmail.ts`、`supabase/functions/send-*`
- 削除/中止ダイアログ: `src/components/schedule/DeleteEventCancelDialog.tsx`
