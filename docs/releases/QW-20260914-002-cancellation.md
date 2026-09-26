# QW-20260914-002: 貸切キャンセルのDBエラー

Issue: https://github.com/nagayoshi0923/mmq_yoyaq/issues/467

## 原因と修正

9月14日のDiscord原文をGETで確認。本番の11月21日・仮設①店・19時の公演は貸切で、予約はconfirmedのまま（参照のみ）。本番とステージングの関数定義・テーブル列を読み取り、`private_cancellation_reservation_trigger` の変数 `event_id` と実在する `reservations.event_id` の衝突を特定した。貸切予約の取消・削除時の残予約検索で42702が発生し、取消もロールバックされる。

変数を `v_event_id` / `v_org_id` に改名。権限、トリガー、通知キュー、取消と通知登録の原子性は維持する。テーブル・フロント・Edgeの変更はない。旧migrationを改変せず、前進migration `20260914090000` を追加した。

## 検証

- PGlite: 本番と同じevent_id列をfixtureへ追加して旧定義の42702を再現。失敗時の予約と通知の未更新を確認後、修正版を適用して全ケース成功。
- 最終予約取消・checked_in残席・取消と削除の通知重複防止・復元と再取消・別組織GM除外・通知先未設定の記録・transaction rollback・スタッフ参加除外・旧event_idに別公演IDがある場合・予約削除・通常公演の予約取消を確認。
- `npm run test:unit`: 47ファイル・364テスト成功。
- `npm run verify`: セキュリティガード・取消RPC検査・型検査・Lint・ビルド成功。既存Lint警告56件。
- ステージングDB: 9月14日に対象関数のみをtransactionで置換し、同じtransactionでmigration履歴を登録。適用後に定義と履歴をSELECTで確認。無関係な未適用migrationは流していない。
- 本番DBは参照のみ。実予約の取消、Discord/メール送信は実施していない。

ローカル再検証: `PGLITE_MODULE=<PGliteのindex.js絶対パス> node scripts/test-private-cancellation-db.mjs`。PGliteはテスト環境へ別途導入する既存方式を使用。

## 残る反映と画面確認

本番DBへの明示承認後、同じmigrationのみを適用・読み戻し、DB先行でmainへ反映する。Web/Edgeに変更はない。

- 管理画面 → スケジュール → 対象貸切公演 → 予約一覧 → キャンセル: 実際に取消を承認された予約だけで実行し、取消済み表示と再読後の状態を確認する。テスト目的で顧客予約を取り消さない。
- 通知キューの重複がないことと、復元・再取消時の通知世代が分かれることを確認する。画面での実操作は未実施。

## ロールバック

適用前の本番・ステージング関数は268f80adの `supabase/rpcs/private_cancellation_notifications.sql` 内の同関数と同内容。戻す場合は同関数だけをCREATE OR REPLACEで復旧し、他の関数やトリガーを再作成しない。ステージングmigration履歴のrollback列にも旧関数DDLを保存した。復旧は今回の既知エラーを再導入するため、通常は前進修正を選ぶ。
