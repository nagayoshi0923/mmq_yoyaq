# テンプレ編集の交通整理プラン（引き継ぎ）

作成: 2026-06-13 / ブランチ: staging / 状態: **設計合意済み・実装未着手**

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

1. **テンプレ台帳**を1ファイルに定義（例 `src/lib/templateRegistry.ts`）。
   14テンプレ各々の `key / 表示名 / いつ・誰起点で送られるかの説明 / 使える差し込み変数 /
   保存先カラム（email_settings.◯◯）/ スコープ(店舗)` を一元管理。
   - 差し込み変数の説明は既に `EmailSettings.tsx` の VARIABLE_DESCRIPTIONS(~L584-618) にあるので流用。
2. **共通編集ダイアログ** `TemplateEditDialog`。台帳の key を渡すと、
   「このテンプレは◯◯の時に送られます」の説明＋使える変数一覧＋本文編集＋保存。
   保存後すぐ呼び出し元に反映。
3. 各画面の「テンプレートを編集」ボタンは台帳の key を渡して上記を開くだけ。
   → 将来「ここにも」が出たら1行で追加できる。
4. 既存資産: メール本文生成は `src/lib/cancellationEmail.ts`（2026-06-13作成、
   `buildCancellationEmailBody` + `fetchStoreCancellationEmailContext`）に共通化済み。

## 14テンプレの設置マップ（email_settings、すべて店舗スコープ）

| カラム | 表示名 | 送られるタイミング | ボタン設置場所（案） |
|---|---|---|---|
| store_cancellation_template | キャンセル操作メール | スタッフが中止・削除・キャンセルした時 | 削除/中止ダイアログ(2/2)・予約者タブのキャンセルダイアログ |
| private_rejection_template | 貸切リクエスト却下メール | 却下ボタンを押した時 | 貸切管理の却下ダイアログ |
| private_confirm_template | 貸切予約確定メール | 貸切を承認した時 | 貸切管理の承認パネル |
| reservation_confirmation_template | 予約確認メール | 客が予約完了（自動） | 公演モーダルの予約者タブ |
| booking_change_template | 予約変更確認メール | 予約内容を変更した時 | 予約編集ダイアログ |
| private_request_template | 貸切リクエスト受付メール | 客が申込（自動） | 貸切管理（カード一覧上部） |
| event_cancellation_template | 公演中止メール | 手動中止系 | 中止ダイアログに統合可 |
| cancellation_template | キャンセル確認メール | **客が自分で**キャンセル（自動） | ―（設定画面のラベル整理で対応） |
| reminder_template | リマインドメール | 前日など自動 | ―（メール設定のリマインド欄が既存） |
| waitlist_notify_template | キャンセル待ち通知メール | 自動 | ―（設定画面） |
| waitlist_registration_template | キャンセル待ち登録完了メール | 自動 | ―（設定画面） |
| performance_cancellation_template | 人数未達中止メール | 前日の自動判定 | ―（設定画面） |
| performance_extension_template | 募集延長メール | 前日の自動判定 | ―（設定画面） |
| private_cancellation_template | 貸切キャンセル確認メール | **下記の決定待ち** | ―（決定次第） |

※「―（設定画面）」の自動送信組は、無理に画面ボタンを置かず**設定画面のラベル交通整理**
（「いつ・誰起点で送られるか」を各テンプレ名に明記＋フロー別グループ化）で対応するのが推奨。

## 🚩 決定待ち（実装前に要確認）

**「貸切キャンセル確認メール」(`private_cancellation_template`) は宙に浮いている。**
2026-06-13 に確認済み: 設定画面で編集できるのに、**どのメール送信関数も参照していない**
（`supabase/functions/_shared/organization-settings.ts` で型定義・取得はされるが、本文を
組む関数のどれも使わない）。実際に貸切をキャンセルした時に送られるのは
「キャンセル操作メール」(`store_cancellation_template`) ＋削除/中止ダイアログで全文編集した本文。

→ オーナー判断: ①設定画面から隠す ／ ②実際の貸切キャンセルで送られるよう配線する ／
③今は触らずそのまま。**この判断を仰いでから着手する。**

## 関連ファイル

- 設定画面: `src/pages/Settings/pages/EmailSettings.tsx`（14テンプレ編集UI・変数説明）、
  `src/pages/Settings/pages/CancellationSettings.tsx`（キャンセルポリシー・料金）
- 消費側の例: `src/lib/cancellationEmail.ts`、`supabase/functions/send-*`、
  `src/pages/PrivateBookingManagement/hooks/useBookingApproval.ts`（却下通知）
- 削除/中止ダイアログ: `src/components/schedule/DeleteEventCancelDialog.tsx`
