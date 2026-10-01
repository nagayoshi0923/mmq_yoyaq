# staging QA限定の予約通知停止

## 契約

顧客Aの通常予約→確認→取消を、外部メール送信無しで実認証試験するためのstaging限定guard。既存2Edgeの予約・メール・組織検証後、保存済み予約とDBの固定QA組織/公演/顧客/通知無効を照合し、確認・取消メールをqueue/送信ログ/providerへ渡す前にskipする。任意org停止設定や新認証方式は追加しない。

対象はstaging `lavutzztfqbdndjiwluc`、QA org `bda7cbb7-0d58-4e5c-ab4a-b45d09afdb3e`、通常公演 `ade5cca7-317a-49a3-865a-a8a2fbc046ec`、顧客A `57d39609-5c18-408c-95af-a407f3a37a53`。店舗/作品/QA user/slugはhelper内の固定定数で追加照合する。定員1公演やB/staff、貸切/決済/クーポンをこの試験に含めない。

QAで環境/対象/読取を検証できなければ503で停止する。通常orgには追加SELECTを行わず、既存処理を維持。本番originではQA抑止を適用しない。既存nullable予約作品列は、公演側の作品照合で維持し、新しい値の一括補正はしない。

応答は`success:true, skipped:true, reason:qa_notification_suppressed`。実送信成功ではない。既存画面は保存成功を保持し、通知未確認の案内へ進む。予約RPC/APIやDB保存は変更しない。

## ローカル・CI検証

実ハンドラをローカル依存とprovider mockで実行する14テスト。固定QAの送信/queue/送信ログ0、読取error/例外/不一致の503、偽造client組織/メールの403、通常staging/本番の従来payload/副作用、認証拒否/不在予約/OPTIONSを確認。helperは単独strict tscも実行する。実provider送信や実DB受入の証拠ではない。

## staging配備の限定範囲

ユーザーの明示GO後、専用branchのexact SHA CI/独立検収/verifyを確認して、次の2関数だけをstagingへ配備する。

- send-booking-confirmation
- send-cancellation-confirmation

共通helperはこの2bundleに含める。全関数deploy、main/staging push/merge、本番配備、DB schema/権限/資格情報変更は行わない。既存verify_jwt=falseを保持する。実配備前ソース/版をローカル保管し、配備後source/hash/版/JWTを照合する。配備状態は作業記録へ残し、本書の準備記述だけで配備済みとしない。

## 実受入の前提と終了

親側が保持するcloud顧客Aセッションを使用し、書込み主体を一本化する。今回のguardはブラウザinterceptionに依存しないが、2Edge以外の全通知を止めるものでもない。

保存前にclient/server staging一致、QAのみの公開、待機列/booking email/Discord/募集deadline各0、reminder/募集無効、候補日時NULL、通常公演、クーポン/決済無しを再照合する。前提が崩れたら保存前に止める。待機列0なら取消のnotify-waitlistは送信loop前に終了する。人数変更は変更メールの別guardがないため行わない。

A1名作成→予約1件/残席3/完了番号→マイページ再読込→同じ予約だけ取消→人数0/残席4/取消履歴/外部queue0を確認。予約/顧客/Auth/監査/アプリ内通知の履歴は削除しない。最後にQA公演/作品を非公開、店舗closed、組織inactive/noneへ戻す。実provider到達の試験はしない。

## 復元

失敗時はQA追加操作を止めfixtureを再閉鎖し、保存した配備前の2bundleだけを同じstagingへ戻す。DBの巻戻しは不要。復元も同じverify_jwtを保持しsource/版を読戻す。queueが発生した場合は自動削除・手動再送せず停止して報告する。全staging/別PR/本番を巻戻さない。
