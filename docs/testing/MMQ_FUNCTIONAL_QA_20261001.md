# 本番後機能QA（ローカル追加パス）

基準本番SHA: `26fdcf8b2ec010c44018fde754cb2b1d5d60f267`（PR #701）。今回の修正は未commit/未push/未配備。
作業ディレクトリ `/tmp/mmq-functional-qa-20261001`。元の未commit変更/保留GMを触らない独立worktree。

## 網羅と保証境界

`MMQ_PAGE_FUNCTION_MATRIX_20261001.csv` は AppRoot認証特別入口＋AdminDashboard の実描画分岐と入口を整理。各行の全操作を試験した意味ではない。従来 `e2e/booking-flow.spec.ts` はタイトル/非空body中心で予約確定・一覧を試験していない。存在しない組織のURL判定や管理リダイレクトのcatchも弱いため、全機能合格の根拠には使わない。

今回の実UI: Chromium、実 `BookingConfirmation` とその顧客入力/送信hook、実 `StaffProfile`、実Button/Input/ConfirmDialog/Toaster。API/Auth/担当永続層/メールのみ明示的モック。専用port5196、proxyなし、ブラウザの外部通信遮断。担当再読込はfixture localStorageで、実DB永続確認ではない。作品一覧→日時選択→providerログイン→MyPage一覧の一続き受入は未完。確定ボタンからマイページ入口の表示まで確認。

## 発見・局所修正

1. 確認メールが error/throw/success=false/skippedでも完了画面が「送信しました」になる既存バグ。通知共通判定を利用し、保存確定を維持してメール未確認・再予約不要と表示。肯定応答も「送信を受け付けました」で到達と区別。
2. 送信hookに同期ロックがなく同一tickに二重起動可能。即時inflightと保存済みrefで保存/送信を1回に限定。保存前失敗の再試行は元の予約番号を維持する。
3. 同時刻重複判定で新予約だけJST、既存予約は端末TZだった。双方JSTへ統一。UTC/JSTで同時刻と離れた時刻を試験。
4. サーバーfinal_price欠落時の完了金額fallbackが旧props料金だった。再取得した計算単価に揃えた（通常server金額優先を維持）。

該当2本体ファイルは c1d3ec39→26fdcf8b の7群リリース差分に存在せず、今回7群由来ではない。baseline worktreeへ新回帰を入れると失敗を再現。価格fallback変更は防御的整合で、欠落しない実API応答の確認は別。

## 試験ケース

ブラウザ19件: 正常確定/表示店舗作品/JST引渡し/server金額、メールfalse/error/throw/skip4件、満席/残席競合事前/公演読取失敗/サーバー競合/保存通信失敗5件、担当登録→再読込→変更/解除、担当保存通信失敗、二重クリック、認証中断時未保存、担当403、担当読取失敗で未保存、全件解除の明示確認と再読込、予約確定後の再読込と重複拒否、電話番号不正。
unit追加6件: 同tick/成功後再送抑止、失敗後予約番号維持、メールfalse、同時刻UTC/JST、非重複UTC/JST、金額fallback。

未検証: 予約導線の戻る/再読込で認証/選択保持、実Auth/provider中断/復帰、実顧客MyPage新規予約読戻し、実残席同時接続、実店舗/作品/価格のcanonical照合、実担当変更/解除のサーバー競合/認可。現行mockではメールやDBへ接続しない。

## 実受入に必要な最小情報/認可

既存README/CI/設定を検索したが、今回使用可能と指定された専用staging顧客/スタッフ・予約可能公演fixture・送信抑止保証は見つからない。CIも localhost Supabase placeholderでAuth受入は行わない。古い資料の「テストアカウント作成」手順は新作成が必要なので実行しない。
必要: staging URL、既存専用customer/staffアカウントの安全な利用経路、専用公演/店舗/作品/担当fixture ID、メール/Discord/providerの送信抑止方法と既存設定の確認、予約の作成/取消と担当変更/復元を許可する具体的fixture範囲。
指定後に予約1件の作成→MyPage読戻し→fixture取消/復元、人数/価格/店舗/日時照合、担当1作品の登録→再ログイン読戻し→解除/復元を限定実施。送信抑止が保証できない場合は作成しない。本番実予約/決済/顧客操作は承認範囲外。

## 再実行

`npm run verify`
`npm run test:unit`
`TZ=UTC npx vitest run src/pages/BookingConfirmation/hooks/bookingDuplicateTimezone.test.ts`
`TZ=Asia/Tokyo npx vitest run src/pages/BookingConfirmation/hooks/bookingDuplicateTimezone.test.ts`
`npx playwright test --config playwright.functional-qa.config.ts`

追加本番反映はこの局所差分のみ別承認。DB/Edge/権限/通知設定変更なし。

## 実測最終結果

- `npm run verify`: 成功（型検査、lint 0 errors/55 warnings、安全ガード、ビルド）。
- unit: 180ファイル / 1,287件成功（本番基準1,281から追加6件）。
- 実UIモック: 19/19成功、pageerrorを失敗扱い、外部通信遮断。正常予約/担当変更のスクリーンショット保存。
- TZ UTC/Asia/Tokyo: 各2/2成功。
- 同じ回帰を未変更の本番SHAで実行: 5件中4失敗/1成功。二重呼出しは3回create、UTCでは同時刻見逃し＋離れた時刻の誤検出、通知失敗区別欠落。
- `git diff --check`: 成功。新CIの専用19件stepはローカル設定で確認、remote CIは未実行。

再読込後はフックの冪等キーが消える既存設計、作成成功後に応答喪失した場合の再照会と再試行前残席チェックの扱い、顧客更新の返却error未評価、時刻競合判定の固定180分と日跨ぎは残る。DB側の重複/定員ロックが最終防御だが今回mockではその実効性を保証しない。新永続方式は追加していない。

モックの reservationApi.create に渡した店舗/日時/価格はclient側意図の検証である。実APIは公演IDからcanonical値を確定するため、今回のモックpayloadだけで実DBの価格・店舗・日時一致を保証しない。
